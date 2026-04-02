<template>
  <div class="space-y-4 mt-4">
    <!-- Utilization Classification -->
    <UCard>
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Utilization Classification</div>
          <UBadge v-if="utilization?.classification" :color="classificationColor" variant="soft" size="lg">
            {{ utilization.classification }}
          </UBadge>
          <span v-else class="text-sm text-gray-400">No utilization data available</span>
        </div>
        <div v-if="utilization?.potentialMonthlySavings" class="text-right">
          <div class="text-xs text-gray-500 dark:text-gray-400">Potential Savings</div>
          <div class="text-lg font-bold text-green-600 dark:text-green-400">${{ utilization.potentialMonthlySavings.toFixed(2) }}/mo</div>
        </div>
      </div>
    </UCard>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- CPU Metrics -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">CPU Utilization</span>
          </div>
        </template>
        <div v-if="cpuMetrics" class="space-y-3">
          <div class="grid grid-cols-3 gap-3">
            <div class="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ cpuMetrics.avg.toFixed(1) }}%</div>
              <div class="text-xs text-gray-500">Average</div>
            </div>
            <div class="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ cpuMetrics.max.toFixed(1) }}%</div>
              <div class="text-xs text-gray-500">Max</div>
            </div>
            <div class="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ cpuMetrics.min.toFixed(1) }}%</div>
              <div class="text-xs text-gray-500">Min</div>
            </div>
          </div>
          <!-- Simple bar chart -->
          <div v-if="cpuDailyValues.length" class="flex items-end gap-0.5 h-20">
            <div
              v-for="(val, idx) in cpuDailyValues"
              :key="idx"
              class="flex-1 rounded-t transition-all"
              :class="val > 80 ? 'bg-red-400' : val > 50 ? 'bg-yellow-400' : 'bg-green-400'"
              :style="{ height: `${Math.max(val, 2)}%` }"
              :title="`${val.toFixed(1)}%`"
            />
          </div>
          <div v-if="cpuDailyValues.length" class="text-xs text-gray-400 text-center">Last {{ cpuDailyValues.length }} days</div>
        </div>
        <div v-else class="text-sm text-gray-400 text-center py-6">CloudWatch metrics not available</div>
      </UCard>

      <!-- Network Metrics -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-signal" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Network I/O</span>
          </div>
        </template>
        <div v-if="networkMetrics" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Network In</div>
              <div class="text-lg font-semibold text-blue-600 dark:text-blue-400">{{ formatBytes(networkMetrics.inTotal) }}</div>
              <div class="text-xs text-gray-500">avg {{ formatBytes(networkMetrics.inAvg) }}/day</div>
            </div>
            <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Network Out</div>
              <div class="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{{ formatBytes(networkMetrics.outTotal) }}</div>
              <div class="text-xs text-gray-500">avg {{ formatBytes(networkMetrics.outAvg) }}/day</div>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-400 text-center py-6">Network metrics not available</div>
      </UCard>
    </div>

    <!-- Alarms -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-bell-alert" class="w-4 h-4 text-gray-400" />
          <span class="font-semibold text-sm">CloudWatch Alarms</span>
          <template v-if="health?.alarms">
            <UBadge v-if="health.alarms.inAlarm > 0" color="red" variant="soft" size="xs">{{ health.alarms.inAlarm }} in alarm</UBadge>
            <UBadge v-if="health.alarms.ok > 0" color="green" variant="soft" size="xs">{{ health.alarms.ok }} OK</UBadge>
          </template>
        </div>
      </template>
      <div v-if="health?.alarms?.alarms?.length" class="space-y-2">
        <div v-for="alarm in health.alarms.alarms" :key="alarm.name" class="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
          <UBadge :color="alarm.state === 'ALARM' ? 'red' : alarm.state === 'OK' ? 'green' : 'gray'" variant="soft" size="xs">{{ alarm.state }}</UBadge>
          <div class="flex-1 min-w-0">
            <div class="text-sm text-gray-900 dark:text-white truncate">{{ alarm.name }}</div>
            <div class="text-xs text-gray-500">{{ alarm.metricName }}</div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400 text-center py-4">No alarms configured</div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  utilization: any | null
  health: any | null
  instance: any
}>()

const classificationColor = computed(() => {
  const c = props.utilization?.classification
  const map: Record<string, string> = { unused: 'red', 'patching-only': 'orange', underutilized: 'yellow', 'right-sized': 'green', 'insufficient-data': 'gray' }
  return map[c] || 'gray'
})

const cpuMetrics = computed(() => {
  const cpu = props.utilization?.metrics?.cpu
  if (!cpu?.dailyValues?.length) return null
  const values = cpu.dailyValues.map((d: any) => d.average ?? d.value ?? d)
  return {
    avg: values.reduce((a: number, b: number) => a + b, 0) / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
  }
})

const cpuDailyValues = computed(() => {
  const cpu = props.utilization?.metrics?.cpu
  if (!cpu?.dailyValues?.length) return []
  return cpu.dailyValues.map((d: any) => d.average ?? d.value ?? d).slice(-14)
})

const networkMetrics = computed(() => {
  const netIn = props.utilization?.metrics?.networkIn
  const netOut = props.utilization?.metrics?.networkOut
  if (!netIn && !netOut) return null
  const inValues = netIn?.dailyValues?.map((d: any) => d.sum ?? d.value ?? d) || []
  const outValues = netOut?.dailyValues?.map((d: any) => d.sum ?? d.value ?? d) || []
  return {
    inTotal: inValues.reduce((a: number, b: number) => a + b, 0),
    inAvg: inValues.length ? inValues.reduce((a: number, b: number) => a + b, 0) / inValues.length : 0,
    outTotal: outValues.reduce((a: number, b: number) => a + b, 0),
    outAvg: outValues.length ? outValues.reduce((a: number, b: number) => a + b, 0) / outValues.length : 0,
  }
})

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
</script>
