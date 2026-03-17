<template>
  <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-blue-500" />
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Pipeline Activity</h2>
      </div>
      <NuxtLink to="/admin/pipelines" class="text-xs text-blue-500 hover:text-blue-400 transition-colors">
        View All →
      </NuxtLink>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="animate-pulse space-y-3">
      <div class="flex justify-between"><div class="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded" /><div class="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded" /></div>
      <div class="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full" />
      <div class="space-y-2"><div class="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" /><div class="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" /></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-4">
      <p class="text-xs text-gray-400">Unable to load pipeline data</p>
    </div>

    <!-- Data -->
    <div v-else-if="summary" class="space-y-3">
      <!-- Key metrics -->
      <div class="grid grid-cols-3 gap-3">
        <div class="text-center">
          <p class="text-lg font-bold text-gray-900 dark:text-white">{{ summary.totalRuns }}</p>
          <p class="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Runs</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-bold" :class="summary.successRate >= 90 ? 'text-green-500' : summary.successRate >= 70 ? 'text-yellow-500' : 'text-red-500'">
            {{ summary.successRate.toFixed(0) }}%
          </p>
          <p class="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Success</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-bold" :class="summary.failedRuns > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'">{{ summary.failedRuns }}</p>
          <p class="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Failed</p>
        </div>
      </div>

      <!-- Success rate bar -->
      <div>
        <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
          <div
            class="h-2 rounded-full transition-all duration-500"
            :class="summary.successRate >= 90 ? 'bg-green-500' : summary.successRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'"
            :style="{ width: `${Math.min(summary.successRate, 100)}%` }"
          />
        </div>
      </div>

      <!-- Extra details -->
      <div class="space-y-1 text-[11px]">
        <div class="flex justify-between text-gray-500 dark:text-gray-400">
          <span>Active accounts</span>
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ summary.uniqueAccounts }}</span>
        </div>
        <div class="flex justify-between text-gray-500 dark:text-gray-400">
          <span>Resource changes</span>
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ summary.totalChanges.toLocaleString() }}</span>
        </div>
        <div class="flex justify-between text-gray-500 dark:text-gray-400">
          <span>Avg duration</span>
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ formatDuration(summary.avgDuration) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface DashboardPipelineSummary {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  successRate: number
  avgDuration: number
  uniqueAccounts: number
  totalChanges: number
}

const { fetchPipelineSummary } = usePipelineData()

const summary = ref<DashboardPipelineSummary | null>(null)
const loading = ref(true)
const error = ref(false)

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

onMounted(async () => {
  try {
    const data = await fetchPipelineSummary(30)
    if (data?.summary) {
      const s = data.summary
      summary.value = {
        totalRuns: s.totalRuns || 0,
        successfulRuns: s.successfulRuns || 0,
        failedRuns: s.failedRuns || 0,
        successRate: typeof s.successRate === 'number' ? s.successRate : 0,
        avgDuration: s.avgDuration || 0,
        uniqueAccounts: s.uniqueAccounts || 0,
        totalChanges: s.totalChanges || 0
      }
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>
