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
          Cost Over Time by "{{ tagKey }}"
        </h3>
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

const props = defineProps<{
  accountId: string
  tagKey: string
  tagValueAliases?: Record<string, string>
  period?: string
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const chartData = ref<any>(null)

const periodToApiPeriod: Record<string, string> = {
  thisMonth: 'last30days',
  lastMonth: 'lastMonth',
  last90Days: 'last90days',
  ytd: 'ytd',
  last12Months: 'last12months'
}

async function fetchData() {
  if (!props.tagKey || !props.accountId) return

  loading.value = true
  error.value = null

  try {
    const apiPeriod = periodToApiPeriod[props.period || 'last90Days'] || 'last90days'
    const response = await $fetch('/api/costs/historical', {
      params: {
        groupBy: `TAG:${props.tagKey}`,
        accountIds: props.accountId,
        period: apiPeriod
      }
    }) as any

    chartData.value = response?.data || response || null
  } catch (err: any) {
    console.error('Error fetching tag historical data:', err)
    error.value = err.message || 'Failed to load historical tag data'
  } finally {
    loading.value = false
  }
}

/**
 * Parse an AWS Cost Explorer tag group key — strip "tagKey$" prefix
 * and extract human-readable parts from special values.
 */
function parseTagValue(rawKey: string): string {
  if (!rawKey) return rawKey

  let value = rawKey
  const dollarIdx = rawKey.indexOf('$')
  if (dollarIdx !== -1) {
    const prefix = rawKey.substring(0, dollarIdx)
    if (prefix === props.tagKey || prefix === '') {
      value = rawKey.substring(dollarIdx + 1)
    }
  }

  if (!value) return rawKey

  if (value.startsWith('AssumedRole:')) {
    const parts = value.split(':')
    if (parts.length >= 3) return parts[parts.length - 1]
  }
  if (value.startsWith('AWSService:')) return value.substring('AWSService:'.length)
  if (value.includes(':user/')) return value.split(':user/').pop() || value
  if (value.includes(':role/')) return value.split(':role/').pop() || value

  return value
}

function getDisplayName(rawKey: string): string {
  if (!props.tagValueAliases) return parseTagValue(rawKey)
  return props.tagValueAliases[`${props.tagKey}::${rawKey}`] || parseTagValue(rawKey)
}

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
  const months: string[] = []

  resultsByTime.forEach((period: any) => {
    const month = period.TimePeriod?.Start?.substring(0, 7) || ''
    if (month && !months.includes(month)) months.push(month)

    ;(period.Groups || []).forEach((group: any) => {
      const key = group.Keys?.[0] || 'Unknown'
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      if (!tagValueMap[key]) tagValueMap[key] = {}
      tagValueMap[key][month] = (tagValueMap[key][month] || 0) + cost
    })
  })

  const sorted = Object.entries(tagValueMap)
    .map(([key, monthlyCosts]) => ({
      key,
      displayName: getDisplayName(key),
      total: Object.values(monthlyCosts).reduce((s, c) => s + c, 0),
      monthlyCosts
    }))
    .sort((a, b) => b.total - a.total)

  return { months, sorted, top: sorted.slice(0, 10), rest: sorted.slice(10) }
})

const chartOption = computed(() => {
  if (!processedData.value) return {}

  const { months, top, rest } = processedData.value

  const series: any[] = top.map((item, i) => ({
    name: item.displayName,
    type: 'line',
    smooth: true,
    data: months.map(m => item.monthlyCosts[m] || 0),
    lineStyle: { width: 2 },
    itemStyle: { color: COLORS[i % COLORS.length] }
  }))

  if (rest.length > 0) {
    const otherData = months.map(m =>
      rest.reduce((sum, item) => sum + (item.monthlyCosts[m] || 0), 0)
    )
    series.push({
      name: `Other (${rest.length})`,
      type: 'line',
      smooth: true,
      data: otherData,
      lineStyle: { width: 1, type: 'dashed' },
      itemStyle: { color: '#6b7280' }
    })
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
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
              result += `${item.marker} ${item.seriesName}: ${formatCurrency(item.value)}<br/>`
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
      data: months.map(m => {
        const [y, mo] = m.split('-')
        return new Date(+y, +mo - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      }),
      axisLabel: { color: '#9ca3af' },
      axisLine: { lineStyle: { color: 'rgba(156, 163, 175, 0.2)' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af',
        formatter: (v: number) => formatCurrency(v)
      },
      axisLine: { lineStyle: { color: 'rgba(156, 163, 175, 0.2)' } },
      splitLine: { lineStyle: { color: 'rgba(156, 163, 175, 0.05)' } }
    },
    series
  }
})

function exportTrendCSV() {
  if (!processedData.value) return

  const { months, sorted } = processedData.value
  const escCSV = (v: any) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  const headers = ['Tag Value', 'Display Name', ...months, 'Total']
  const lines = [headers.map(escCSV).join(',')]

  sorted.forEach(item => {
    const row = [
      escCSV(item.key),
      escCSV(item.displayName),
      ...months.map(m => (item.monthlyCosts[m] || 0).toFixed(2)),
      item.total.toFixed(2)
    ]
    lines.push(row.join(','))
  })

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const timestamp = new Date().toISOString().slice(0, 10)
  downloadBlob(blob, `tag-trend-${props.tagKey}-${timestamp}.csv`)
}

watch([() => props.tagKey, () => props.period, () => props.accountId], () => {
  fetchData()
}, { immediate: true })

defineExpose({ processedData })
</script>
