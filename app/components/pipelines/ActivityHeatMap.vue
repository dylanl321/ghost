<template>
  <UCard>
    <template #header>
      <h3 class="font-semibold">Pipeline Activity</h3>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="!heatMapData || heatMapData.length === 0" class="text-center py-8 text-gray-400">
      No activity data available
    </div>
    <div v-else class="space-y-4">
      <!-- Activity summary boxes -->
      <div class="space-y-2">
        <div
          v-for="(item, index) in recentDays.slice(0, 10)"
          :key="index"
          class="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
        >
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="flex-shrink-0">
              <div class="text-xs text-gray-400">{{ formatDate(item.date) }}</div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex gap-1 h-6 items-center">
                <!-- Success bar -->
                <div
                  v-if="item.successful > 0"
                  class="h-full bg-green-500 rounded"
                  :style="{ width: `${getBarWidth(item.successful, item.total)}%` }"
                  :title="`${item.successful} successful`"
                ></div>
                <!-- Failure bar -->
                <div
                  v-if="item.failed > 0"
                  class="h-full bg-red-500 rounded"
                  :style="{ width: `${getBarWidth(item.failed, item.total)}%` }"
                  :title="`${item.failed} failed`"
                ></div>
              </div>
            </div>
            <div class="flex-shrink-0 text-right">
              <div class="text-sm font-semibold text-white">{{ item.total }}</div>
              <div class="text-xs text-gray-400">runs</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Activity stats -->
      <div class="border-t border-gray-700 pt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="text-gray-400">Most Active Day</div>
          <div class="text-white font-semibold">{{ mostActiveDay }}</div>
        </div>
        <div>
          <div class="text-gray-400">Peak Runs</div>
          <div class="text-white font-semibold">{{ peakRuns }}</div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface HeatMapItem {
  date: string
  total: number
  successful: number
  failed: number
}

const props = defineProps<{
  heatMapData: HeatMapItem[]
  loading: boolean
}>()

// Get recent days sorted by date descending
const recentDays = computed(() => {
  if (!props.heatMapData?.length) return []
  return [...props.heatMapData]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30) // Last 30 days
})

// Find the most active day
const mostActiveDay = computed(() => {
  if (!recentDays.value.length) return 'N/A'
  const max = recentDays.value.reduce((prev, curr) =>
    curr.total > prev.total ? curr : prev
  )
  return formatDate(max.date)
})

const peakRuns = computed(() => {
  if (!recentDays.value.length) return 0
  return Math.max(...recentDays.value.map(d => d.total))
})

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Calculate bar width as percentage
function getBarWidth(value: number, total: number): number {
  if (total === 0) return 0
  return Math.max((value / total) * 100, 5) // Minimum 5% width for visibility
}
</script>
