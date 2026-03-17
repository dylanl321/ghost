<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="text-center py-6">
      <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-blue-500 mx-auto mb-1" />
      <div class="text-xs text-gray-400">Loading trend...</div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-xs text-red-400 py-2">{{ error }}</div>

    <!-- No data -->
    <div v-else-if="!processedData" class="text-xs text-gray-500 py-2">No trend data available</div>

    <!-- Chart -->
    <div v-else>
      <h4 class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Cost Over Time by Service</h4>
      <v-chart :option="chartOption" :autoresize="true" style="height: 250px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import VChart from 'vue-echarts'

const props = defineProps<{
  accountId: string
  tagKey: string
  tagValue: string
  tagValueLabel?: string
  period?: string
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const rawData = ref<any>(null)

function stripTagPrefix(rawValue: string, tagKey: string): string {
  const idx = rawValue.indexOf('$')
  if (idx !== -1) {
    const prefix = rawValue.substring(0, idx)
    if (prefix === tagKey || prefix === '') {
      return rawValue.substring(idx + 1)
    }
  }
  return rawValue
}

// Periods that benefit from daily granularity
const dailyPeriods = new Set(['last7days', 'last30days', 'thisMonth', 'lastMonth'])

function getGranularity(period: string): 'DAILY' | 'MONTHLY' {
  return dailyPeriods.has(period) ? 'DAILY' : 'MONTHLY'
}

async function fetchData() {
  if (!props.accountId || !props.tagKey || !props.tagValue) return

  loading.value = true
  error.value = null

  try {
    const strippedValue = stripTagPrefix(props.tagValue, props.tagKey)
    const apiPeriod = props.period || 'last90days'
    const response = await $fetch('/api/costs/historical', {
      params: {
        groupBy: 'SERVICE',
        accountIds: props.accountId,
        tagFilter: `${props.tagKey}||${strippedValue}`,
        period: apiPeriod,
        granularity: getGranularity(apiPeriod)
      }
    }) as any

    rawData.value = response?.data || response || null
  } catch (err: any) {
    console.error('Error fetching tag value trend:', err)
    error.value = err.message || 'Failed to load trend data'
  } finally {
    loading.value = false
  }
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

const processedData = computed(() => {
  if (!rawData.value) return null

  const resultsByTime: any[] = rawData.value.resultsByTime || []
  if (!resultsByTime.length) return null

  const serviceMap: Record<string, Record<string, number>> = {}
  const timeKeys: string[] = []
  const isDaily = resultsByTime.length >= 2 &&
    (new Date(resultsByTime[1].TimePeriod?.Start).getTime() - new Date(resultsByTime[0].TimePeriod?.Start).getTime()) < 8 * 86400000

  for (const period of resultsByTime) {
    const timeKey = isDaily
      ? period.TimePeriod?.Start?.substring(0, 10) || ''
      : period.TimePeriod?.Start?.substring(0, 7) || ''
    if (timeKey && !timeKeys.includes(timeKey)) timeKeys.push(timeKey)

    for (const group of (period.Groups || [])) {
      const key = group.Keys?.[0] || 'Unknown'
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      if (!serviceMap[key]) serviceMap[key] = {}
      serviceMap[key][timeKey] = (serviceMap[key][timeKey] || 0) + cost
    }
  }

  const sorted = Object.entries(serviceMap)
    .map(([key, periodCosts]) => ({
      key,
      total: Object.values(periodCosts).reduce((s, c) => s + c, 0),
      periodCosts
    }))
    .sort((a, b) => b.total - a.total)

  return { timeKeys, isDaily, top: sorted.slice(0, 5), rest: sorted.slice(5) }
})

const chartOption = computed(() => {
  if (!processedData.value) return {}

  const { timeKeys, isDaily, top, rest } = processedData.value

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }

  const series: any[] = top.map((item, i) => ({
    name: item.key,
    type: 'line',
    stack: 'total',
    areaStyle: { opacity: 0.3 },
    smooth: !isDaily,
    data: timeKeys.map(k => item.periodCosts[k] || 0),
    lineStyle: { width: 1.5 },
    itemStyle: { color: COLORS[i % COLORS.length] }
  }))

  if (rest.length > 0) {
    const otherData = timeKeys.map(k =>
      rest.reduce((sum, item) => sum + (item.periodCosts[k] || 0), 0)
    )
    series.push({
      name: `Other (${rest.length})`,
      type: 'line',
      stack: 'total',
      areaStyle: { opacity: 0.2 },
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
              result += `${item.marker} ${item.seriesName}: ${formatCurrency(item.value)}<br/>`
            }
          })
        return result
      }
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: { color: '#9ca3af', fontSize: 10 }
    },
    grid: {
      left: '3%', right: '4%', bottom: '15%', top: '5%', containLabel: true
    },
    xAxis: {
      type: 'category',
      data: timeKeys.map(k => {
        if (isDaily) {
          const [y, mo, d] = k.split('-')
          return new Date(+y, +mo - 1, +d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }
        const [y, mo] = k.split('-')
        return new Date(+y, +mo - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      }),
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(156, 163, 175, 0.2)' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#9ca3af', fontSize: 10, formatter: (v: number) => formatCurrency(v) },
      axisLine: { lineStyle: { color: 'rgba(156, 163, 175, 0.2)' } },
      splitLine: { lineStyle: { color: 'rgba(156, 163, 175, 0.05)' } }
    },
    series
  }
})

watch([() => props.accountId, () => props.tagKey, () => props.tagValue, () => props.period], () => {
  fetchData()
}, { immediate: true })
</script>
