<template>
  <UCard class="h-full flex flex-col">
    <template #header>
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-chart-bar" class="text-blue-500" />
          <div class="text-sm font-semibold text-gray-900 dark:text-white">Instance Utilization</div>
        </div>
        <UBadge v-if="!loading && flaggedCount > 0" color="yellow" variant="soft">
          {{ flaggedCount }} flagged
        </UBadge>
        <UBadge v-else-if="!loading && data" color="green" variant="soft">
          All clear
        </UBadge>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />

    <div v-else-if="error" class="text-center text-red-500 dark:text-red-400 py-6 text-sm">
      <UIcon name="i-heroicons-exclamation-triangle" class="mr-1" />
      Failed to load utilization data
    </div>

    <div v-else-if="!data || data.summary.totalInstances === 0" class="text-center text-gray-600 dark:text-gray-400 py-8">
      No instances found
    </div>

    <div v-else class="space-y-4">
      <!-- Summary Bar -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button
          v-for="cat in categories"
          :key="cat.key"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-full transition-colors"
          :class="[
            cat.bgClass,
            activeFilter === cat.key ? 'ring-2 ring-offset-1 ring-blue-400' : '',
            cat.count === 0 ? 'opacity-50' : 'cursor-pointer'
          ]"
          :disabled="cat.count === 0"
          @click="cat.count > 0 && toggleFilter(cat.key)"
        >
          <span class="font-bold" :class="cat.textClass">{{ cat.count }}</span>
          <span class="text-gray-600 dark:text-gray-400">{{ cat.label }}</span>
        </button>
      </div>

      <!-- Savings Callout -->
      <div
        v-if="data.summary.totalPotentialMonthlySavings > 0"
        class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-currency-dollar" class="text-green-600 dark:text-green-400" />
          <span class="text-sm text-green-800 dark:text-green-300">Potential Savings</span>
        </div>
        <div class="text-right">
          <span class="text-lg font-bold text-green-700 dark:text-green-300">
            ${{ formatNumber(data.summary.totalPotentialMonthlySavings) }}/mo
          </span>
          <span class="text-xs text-green-600 dark:text-green-400 ml-1">
            (${{ formatNumber(data.summary.totalPotentialMonthlySavings * 12) }}/yr)
          </span>
        </div>
      </div>

      <!-- Instance List -->
      <div v-if="displayInstances.length > 0" class="space-y-1">
        <div class="max-h-[500px] overflow-y-auto space-y-1">
          <div
            v-for="inst in displayInstances"
            :key="inst.instanceId"
            class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <!-- Compact Row (always visible) -->
            <button
              class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
              @click="toggleExpand(inst.instanceId)"
            >
              <!-- Classification Badge -->
              <UBadge
                :color="classificationColor(inst.classification)"
                variant="soft"
                size="xs"
                class="flex-shrink-0 w-[80px] justify-center"
              >
                {{ classificationLabel(inst.classification) }}
              </UBadge>

              <!-- Instance Name + ID + Owner -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {{ inst.instanceName || inst.instanceId }}
                  </span>
                  <span v-if="inst.instanceName" class="text-[10px] text-gray-400 font-mono flex-shrink-0">
                    {{ inst.instanceId }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-gray-500 font-mono">{{ inst.instanceType }}</span>
                  <span v-if="inst.owner" class="text-[10px] text-blue-500 truncate">{{ inst.owner }}</span>
                </div>
              </div>

              <!-- Sparkline (only for instances with max CPU data) -->
              <div v-if="inst.maxCpuDailyValues && inst.maxCpuDailyValues.length > 1" class="flex-shrink-0" style="width: 80px; height: 24px;">
                <VChart :option="sparklineOptions(inst)" :init-options="{ width: 80, height: 24 }" :autoresize="false" />
              </div>

              <!-- Activity Summary -->
              <div class="flex-shrink-0 text-right w-[70px]">
                <div v-if="inst.totalDaysMonitored > 0" class="text-[10px] leading-tight">
                  <span class="font-mono" :class="cpuColor(inst.metrics?.maxCpuPercent ?? 0)">
                    {{ inst.activeDaysCount }}/{{ inst.totalDaysMonitored }}d
                  </span>
                  <span class="text-gray-500 block">active</span>
                </div>
                <div v-else class="text-[10px] text-gray-400">—</div>
              </div>

              <!-- Monthly Cost -->
              <div class="flex-shrink-0 text-right w-[60px]">
                <span v-if="inst.monthlyEstimate" class="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  ${{ inst.monthlyEstimate.toFixed(0) }}/mo
                </span>
                <span v-else class="text-xs text-gray-400">—</span>
              </div>

              <!-- Chevron -->
              <UIcon
                :name="expandedIds.has(inst.instanceId) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                class="flex-shrink-0 text-gray-400 w-4 h-4"
              />
            </button>

            <!-- Expanded Detail Card -->
            <div
              v-if="expandedIds.has(inst.instanceId)"
              class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 px-4 py-3 space-y-3"
            >
              <!-- Key Activity Metrics -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-900 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                  <div class="text-[10px] uppercase tracking-wide text-gray-500">Last Active</div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-white">
                    {{ inst.lastActiveDate ? formatShortDate(inst.lastActiveDate) : 'No activity' }}
                  </div>
                  <div v-if="inst.lastActiveDate" class="text-[10px] text-gray-500">
                    {{ daysAgo(inst.lastActiveDate) }} days ago
                  </div>
                </div>
                <div class="bg-white dark:bg-gray-900 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                  <div class="text-[10px] uppercase tracking-wide text-gray-500">Active Days</div>
                  <div class="text-sm font-semibold" :class="inst.activeDaysCount === 0 ? 'text-red-500' : inst.activeDaysCount < 3 ? 'text-yellow-500' : 'text-green-500'">
                    {{ inst.activeDaysCount }} of {{ inst.totalDaysMonitored }}
                  </div>
                  <div class="text-[10px] text-gray-500">
                    {{ inst.totalDaysMonitored > 0 ? Math.round((inst.activeDaysCount / inst.totalDaysMonitored) * 100) : 0 }}% of monitored period
                  </div>
                </div>
                <div class="bg-white dark:bg-gray-900 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                  <div class="text-[10px] uppercase tracking-wide text-gray-500">Launched</div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-white">
                    {{ inst.launchTime ? formatShortDate(inst.launchTime) : 'Unknown' }}
                  </div>
                  <div v-if="inst.launchTime" class="text-[10px] text-gray-500">
                    {{ instanceAge(inst.launchTime) }}
                  </div>
                </div>
                <div class="bg-white dark:bg-gray-900 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                  <div class="text-[10px] uppercase tracking-wide text-gray-500">Monthly Cost</div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-white">
                    {{ inst.monthlyEstimate ? `$${inst.monthlyEstimate.toFixed(2)}` : 'N/A' }}
                  </div>
                  <div v-if="inst.monthlyEstimate" class="text-[10px] text-gray-500">
                    ${{ formatNumber(inst.monthlyEstimate * 12) }}/year
                  </div>
                </div>
              </div>

              <!-- Owner / Project / Schedule row -->
              <div v-if="inst.owner || inst.project || inst.schedule || inst.patchGroup" class="flex flex-wrap gap-2">
                <UBadge v-if="inst.owner" color="blue" variant="soft" size="xs">
                  Owner: {{ inst.owner }}
                </UBadge>
                <UBadge v-if="inst.project" color="purple" variant="soft" size="xs">
                  Project: {{ inst.project }}
                </UBadge>
                <UBadge v-if="inst.schedule" color="green" variant="soft" size="xs">
                  Schedule: {{ inst.schedule }}
                </UBadge>
                <UBadge v-if="inst.patchGroup" color="orange" variant="soft" size="xs">
                  Patch Group: {{ inst.patchGroup }}
                </UBadge>
              </div>

              <!-- Larger CPU Chart -->
              <div v-if="inst.maxCpuDailyValues && inst.maxCpuDailyValues.length > 1">
                <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Peak CPU Over {{ inst.metrics?.lookbackDays || 14 }} Days
                </div>
                <div class="h-[80px] bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 p-1">
                  <VChart :option="detailChartOptions(inst)" :init-options="{ height: 72 }" :autoresize="true" class="w-full h-full" />
                </div>
              </div>

              <!-- Network I/O Chart -->
              <div v-if="inst.networkDailyValues && inst.networkDailyValues.length > 1">
                <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Network I/O Over {{ inst.metrics?.lookbackDays || 14 }} Days
                </div>
                <div class="h-[80px] bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 p-1">
                  <VChart :option="networkChartOptions(inst)" :init-options="{ height: 72 }" :autoresize="true" class="w-full h-full" />
                </div>
              </div>

              <!-- Explanation -->
              <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {{ inst.explanation }}
              </div>

              <!-- Evidence / Key Facts -->
              <div v-if="inst.evidence && inst.evidence.length > 0">
                <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Evidence</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                  <div
                    v-for="(item, idx) in inst.evidence"
                    :key="idx"
                    class="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5"
                  >
                    <span class="text-gray-400 mt-0.5">&#8226;</span>
                    <span>{{ item }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Show All / Show Flagged Toggle -->
        <div v-if="nonFlaggedCount > 0" class="pt-2 text-center">
          <button
            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            @click="showAll = !showAll"
          >
            {{ showAll
              ? `Show flagged only (${flaggedCount})`
              : `Show all ${data.summary.totalInstances} instances (${nonFlaggedCount} more)`
            }}
          </button>
        </div>
      </div>

      <!-- All Clear Message -->
      <div v-else-if="flaggedCount === 0" class="text-center py-4">
        <UIcon name="i-heroicons-check-circle" class="text-green-500 text-2xl mb-1" />
        <div class="text-sm text-gray-600 dark:text-gray-400">All instances appear well-utilized</div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'

echarts.use([LineChart, GridComponent, TooltipComponent])

interface Props {
  accountId: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'loaded', data: Record<string, any>): void
}>()

const colorMode = useColorMode()
const loading = ref(true)
const error = ref(false)
const data = ref<any>(null)
const activeFilter = ref<string | null>(null)
const expandedIds = reactive(new Set<string>())
const showAll = ref(false)

type Classification = 'unused' | 'patching-only' | 'underutilized' | 'right-sized' | 'insufficient-data'

const categories = computed(() => {
  if (!data.value) return []
  const s = data.value.summary
  return [
    { key: 'unused', label: 'Unused', count: s.unused, bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-600 dark:text-red-400' },
    { key: 'patching-only', label: 'Patching Only', count: s.patchingOnly, bgClass: 'bg-orange-100 dark:bg-orange-900/30', textClass: 'text-orange-600 dark:text-orange-400' },
    { key: 'underutilized', label: 'Underutilized', count: s.underutilized, bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', textClass: 'text-yellow-600 dark:text-yellow-400' },
    { key: 'right-sized', label: 'Right-sized', count: s.rightSized, bgClass: 'bg-green-100 dark:bg-green-900/30', textClass: 'text-green-600 dark:text-green-400' },
    { key: 'insufficient-data', label: 'No Data', count: s.insufficientData, bgClass: 'bg-gray-100 dark:bg-gray-800/50', textClass: 'text-gray-600 dark:text-gray-400' }
  ]
})

const flaggedCount = computed(() => {
  if (!data.value) return 0
  const s = data.value.summary
  return s.unused + s.patchingOnly + s.underutilized
})

const nonFlaggedCount = computed(() => {
  if (!data.value) return 0
  const s = data.value.summary
  return s.rightSized + s.insufficientData
})

const displayInstances = computed(() => {
  if (!data.value?.instances) return []
  const all: any[] = data.value.instances

  // Active category filter takes priority
  if (activeFilter.value) {
    return all.filter((i: any) => i.classification === activeFilter.value)
  }

  // Default: show flagged only, unless showAll is toggled
  if (showAll.value) return all
  return all.filter((i: any) =>
    ['unused', 'patching-only', 'underutilized'].includes(i.classification)
  )
})

function toggleFilter(key: string) {
  activeFilter.value = activeFilter.value === key ? null : key
}

function toggleExpand(id: string) {
  if (expandedIds.has(id)) {
    expandedIds.delete(id)
  } else {
    expandedIds.add(id)
  }
}

function classificationColor(classification: Classification): string {
  const colors: Record<Classification, string> = {
    'unused': 'red',
    'patching-only': 'orange',
    'underutilized': 'yellow',
    'right-sized': 'green',
    'insufficient-data': 'gray'
  }
  return colors[classification] || 'gray'
}

function classificationLabel(classification: Classification): string {
  const labels: Record<Classification, string> = {
    'unused': 'Unused',
    'patching-only': 'Patch Only',
    'underutilized': 'Underutilized',
    'right-sized': 'Right-sized',
    'insufficient-data': 'No Data'
  }
  return labels[classification] || classification
}

function cpuColor(cpu: number): string {
  if (cpu < 5) return 'text-red-500'
  if (cpu < 15) return 'text-yellow-500'
  return 'text-green-500'
}

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return 'Unknown' }
}

function daysAgo(dateStr: string): number {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  } catch { return 0 }
}

function instanceAge(launchTime: string): string {
  try {
    const launch = new Date(launchTime)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - launch.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 30) return `${diffDays} days old`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months old`
    const years = Math.floor(diffDays / 365)
    const months = Math.floor((diffDays % 365) / 30)
    return months > 0 ? `${years}y ${months}m old` : `${years}y old`
  } catch { return '' }
}

// Sparkline chart options (compact inline — uses daily max CPU)
function sparklineOptions(inst: any) {
  const isDark = colorMode.value === 'dark'
  const values = inst.maxCpuDailyValues || []
  const peakCpu = inst.metrics?.maxCpuPercent ?? 0
  const lineColor = peakCpu < 5 ? '#ef4444' : peakCpu < 15 ? '#eab308' : '#22c55e'

  return {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { type: 'category', show: false, data: values.map((_: any, i: number) => i) },
    yAxis: { type: 'value', show: false, min: 0 },
    series: [{
      type: 'line',
      data: values,
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 1.5, color: lineColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: lineColor + '40' },
          { offset: 1, color: lineColor + '05' }
        ])
      }
    }],
    tooltip: { show: false },
    animation: false
  }
}

// Detail chart options (expanded view — uses daily max CPU)
function detailChartOptions(inst: any) {
  const isDark = colorMode.value === 'dark'
  const values = inst.maxCpuDailyValues || []
  const timestamps = inst.cpuDailyTimestamps || []
  const peakCpu = inst.metrics?.maxCpuPercent ?? 0
  const lineColor = peakCpu < 5 ? '#ef4444' : peakCpu < 15 ? '#eab308' : '#22c55e'
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  const labels = timestamps.map((t: string) => {
    try {
      const d = new Date(t)
      return `${d.getMonth() + 1}/${d.getDate()}`
    } catch { return '' }
  })

  return {
    grid: { top: 8, right: 8, bottom: 20, left: 30 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 9, color: textColor, interval: Math.max(0, Math.floor(labels.length / 5) - 1) },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { fontSize: 9, color: textColor, formatter: '{value}%' },
      splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
    },
    series: [{
      type: 'line',
      data: values,
      smooth: true,
      symbol: 'circle',
      symbolSize: 3,
      lineStyle: { width: 2, color: lineColor },
      itemStyle: { color: lineColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: lineColor + '30' },
          { offset: 1, color: lineColor + '05' }
        ])
      }
    }],
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        return `${p.name}: <b>${p.value?.toFixed(1)}%</b> Peak CPU`
      },
      textStyle: { fontSize: 11 }
    },
    animation: false
  }
}

// Network I/O chart options (expanded view — daily total bytes in+out)
function networkChartOptions(inst: any) {
  const isDark = colorMode.value === 'dark'
  const values = (inst.networkDailyValues || []) as number[]
  const timestamps = (inst.networkDailyTimestamps || []) as string[]
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  // Determine scale: show in KB or MB
  const maxVal = values.length > 0 ? Math.max(...values) : 0
  const useMB = maxVal >= 1_048_576
  const scaledValues = values.map((v: number) => useMB ? v / 1_048_576 : v / 1024)
  const unit = useMB ? 'MB' : 'KB'

  // Color based on average daily traffic vs idle threshold (5 MB/day)
  const avgPerDay = values.length > 0 ? values.reduce((s: number, v: number) => s + v, 0) / values.length : 0
  const lineColor = avgPerDay < 5_000_000 ? '#ef4444' : avgPerDay < 50_000_000 ? '#3b82f6' : '#22c55e'

  const labels = timestamps.map((t: string) => {
    try {
      const d = new Date(t)
      return `${d.getMonth() + 1}/${d.getDate()}`
    } catch { return '' }
  })

  return {
    grid: { top: 8, right: 8, bottom: 20, left: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 9, color: textColor, interval: Math.max(0, Math.floor(labels.length / 5) - 1) },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { fontSize: 9, color: textColor, formatter: `{value} ${unit}` },
      splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
    },
    series: [{
      type: 'line',
      data: scaledValues,
      smooth: true,
      symbol: 'circle',
      symbolSize: 3,
      lineStyle: { width: 2, color: lineColor },
      itemStyle: { color: lineColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: lineColor + '30' },
          { offset: 1, color: lineColor + '05' }
        ])
      }
    }],
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        return `${p.name}: <b>${p.value?.toFixed(1)} ${unit}</b>`
      },
      textStyle: { fontSize: 11 }
    },
    animation: false
  }
}

const fetchUtilization = async () => {
  loading.value = true
  error.value = false
  expandedIds.clear()
  showAll.value = false
  activeFilter.value = null

  try {
    const response = await fetch(`/api/instances/utilization?environment=govcloud&accountIds=${props.accountId}`)
    const json = await response.json()
    if (json.success && json.data) {
      data.value = json.data
      // Emit utilization map for InstancesTable badges
      const utilizationMap: Record<string, any> = {}
      for (const inst of json.data.instances) {
        utilizationMap[inst.instanceId] = {
          classification: inst.classification,
          reasons: inst.classificationReasons || []
        }
      }
      emit('loaded', utilizationMap)
    } else {
      error.value = true
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchUtilization()
})

watch(() => props.accountId, () => {
  fetchUtilization()
})
</script>
