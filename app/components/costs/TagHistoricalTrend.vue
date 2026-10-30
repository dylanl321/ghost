<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
      <div class="text-sm text-gray-400">Loading historical tag trends...</div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-900/20 border border-red-700 rounded-lg p-4">
      <div class="text-sm text-red-400">{{ error }}</div>
    </div>

    <!-- No data -->
    <div v-else-if="!chartData" class="py-8 text-center">
      <UIcon name="i-heroicons-chart-bar" class="w-8 h-8 text-gray-400 mx-auto mb-2" />
      <p class="text-sm text-gray-500 dark:text-gray-400">No historical data available for this tag</p>
    </div>

    <!-- Chart -->
    <div v-else class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {{ isPeopleView ? 'People Cost Over Time' : `Cost Over Time by "${tagKey}"` }}
        </h3>
        <span class="text-xs text-gray-500 dark:text-gray-400">Billable Net Unblended</span>
        <UTooltip text="Export trend data as CSV">
          <UButton
            icon="i-heroicons-arrow-down-tray"
            color="gray"
            variant="ghost"
            size="xs"
            @click="exportTrendCSV"
          />
        </UTooltip>
      </div>
      <v-chart :option="chartOption" :autoresize="true" style="height: 350px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import VChart from 'vue-echarts'
import { downloadBlob } from '~/utils/export/export-utils'
import { isCreatedByTag, normalizeCostTagIdentity } from '~~/shared/utils/cost-tag-identities'

const logger = createLogger('TagHistoricalTrend')

const props = withDefaults(defineProps<{
  accountIds: string[]
  tagKey: string
  tagValueAliases?: Record<string, string>
  period?: string
  creatorView?: 'people' | 'all'
}>(), {
  creatorView: 'all'
})

const loading = ref(false)
const error = ref<string | null>(null)
const chartData = ref<any>(null)

// Periods that benefit from daily granularity
const dailyPeriods = new Set(['last7days', 'last30days', 'thisMonth', 'lastMonth'])

function getGranularity(period: string): 'DAILY' | 'MONTHLY' {
  return dailyPeriods.has(period) ? 'DAILY' : 'MONTHLY'
}

async function fetchData() {
  if (!props.tagKey) return

  loading.value = true
  error.value = null

  try {
    const apiPeriod = props.period || 'last90days'
    const params: Record<string, string> = {
      groupBy: `TAG:${props.tagKey}`,
      period: apiPeriod,
      granularity: getGranularity(apiPeriod),
      metric: 'NetUnblendedCost'
    }
    if (props.accountIds.length > 0) params.accountIds = props.accountIds.join(',')

    const response = await $fetch('/api/costs/historical', {
      params
    }) as any

    chartData.value = response?.data || response || null
  } catch (err: any) {
    logger.error('Error fetching tag historical data:', err)
    error.value = err.message || 'Failed to load historical tag data'
  } finally {
    loading.value = false
  }
}

const isPeopleView = computed(() => isCreatedByTag(props.tagKey) && props.creatorView === 'people')

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

// Parsed and sorted data for both chart and export
const processedData = computed(() => {
  if (!chartData.value) return null

  const resultsByTime: any[] = chartData.value.resultsByTime || []
  if (!resultsByTime.length) return null

  const tagValueMap: Record<string, Record<string, number>> = {}
  const displayNames: Record<string, string> = {}
  const timeKeys: string[] = []
  // Detect granularity from data: if start dates differ by ~1 day, it's DAILY
  const isDaily = resultsByTime.length >= 2 &&
    (new Date(resultsByTime[1].TimePeriod?.Start).getTime() - new Date(resultsByTime[0].TimePeriod?.Start).getTime()) < 8 * 86400000

  resultsByTime.forEach((period: any) => {
    const timeKey = isDaily
      ? period.TimePeriod?.Start?.substring(0, 10) || ''
      : period.TimePeriod?.Start?.substring(0, 7) || ''
    if (timeKey && !timeKeys.includes(timeKey)) timeKeys.push(timeKey)

    ;(period.Groups || []).forEach((group: any) => {
      const rawKey = group.Keys?.[0] || 'Unknown'
      const identity = normalizeCostTagIdentity(rawKey, props.tagKey)
      if (isPeopleView.value && !identity.isPerson) return
      const key = identity.groupKey
      const metric = chartData.value.costMetric || 'NetUnblendedCost'
      const cost = parseFloat(group.Metrics?.[metric]?.Amount || '0')
      if (!tagValueMap[key]) tagValueMap[key] = {}
      tagValueMap[key][timeKey] = (tagValueMap[key][timeKey] || 0) + cost
      displayNames[key] = props.tagValueAliases?.[`${props.tagKey}::${key}`]
        || props.tagValueAliases?.[`${props.tagKey}::${rawKey}`]
        || displayNames[key]
        || identity.displayName
    })
  })

  const sorted = Object.entries(tagValueMap)
    .map(([key, periodCosts]) => ({
      key,
      displayName: displayNames[key] || key,
      total: Object.values(periodCosts).reduce((s, c) => s + c, 0),
      periodCosts
    }))
    .sort((a, b) => b.total - a.total)

  if (sorted.length === 0) return null

  return { timeKeys, isDaily, sorted, top: sorted.slice(0, 10), rest: sorted.slice(10) }
})

const chartOption = computed(() => {
  if (!processedData.value) return {}

  const { timeKeys, isDaily, top, rest } = processedData.value

  const series: any[] = top.map((item, i) => ({
    name: item.displayName,
    type: 'line',
    smooth: !isDaily,
    data: timeKeys.map(k => item.periodCosts[k] || 0),
    lineStyle: { width: 2 },
    itemStyle: { color: COLORS[i % COLORS.length] }
  }))

  if (rest.length > 0) {
    const otherData = timeKeys.map(k =>
      rest.reduce((sum, item) => sum + (item.periodCosts[k] || 0), 0)
    )
    series.push({
      name: `Other (${rest.length})`,
      type: 'line',
      smooth: !isDaily,
      data: otherData,
      lineStyle: { width: 1, type: 'dashed' },
      itemStyle: { color: '#6b7280' }
    })
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let result = `<b>${params[0].axisValue}</b><br/>`
        params
          .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
          .forEach((item: any) => {
            if (item.value > 0) {
              result += `${item.marker} ${item.seriesName}: ${formatCostValue(item.value)}<br/>`
            }
          })
        return result
      }
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: { color: '#9ca3af', fontSize: 11 }
    },
    grid: {
      left: '3%', right: '4%', bottom: '15%', containLabel: true
    },
    xAxis: {
      type: 'category',
      data: timeKeys.map(k => {
        if (isDaily) {
          const [y = '1970', mo = '01', d = '01'] = k.split('-')
          return new Date(+y, +mo - 1, +d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }
        const [y = '1970', mo = '01'] = k.split('-')
        return new Date(+y, +mo - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      }),
      axisLabel: { color: '#9ca3af' },
      axisLine: { lineStyle: { color: 'rgba(156, 163, 175, 0.2)' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af',
        formatter: (v: number) => formatCostValue(v)
      },
      axisLine: { lineStyle: { color: 'rgba(156, 163, 175, 0.2)' } },
      splitLine: { lineStyle: { color: 'rgba(156, 163, 175, 0.05)' } }
    },
    series
  }
})

function exportTrendCSV() {
  if (!processedData.value) return

  const { timeKeys, sorted } = processedData.value
  const escCSV = (v: any) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  const headers = ['Tag Value', 'Display Name', ...timeKeys, 'Total']
  const lines = [headers.map(escCSV).join(',')]

  sorted.forEach(item => {
    const row = [
      escCSV(item.key),
      escCSV(item.displayName),
      ...timeKeys.map(k => (item.periodCosts[k] || 0).toFixed(2)),
      item.total.toFixed(2)
    ]
    lines.push(row.join(','))
  })

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const timestamp = new Date().toISOString().slice(0, 10)
  downloadBlob(blob, `tag-trend-${props.tagKey}-${timestamp}.csv`)
}

watch([() => props.tagKey, () => props.period, () => props.accountIds.join(',')], () => {
  fetchData()
}, { immediate: true })

defineExpose({ processedData })
</script>
