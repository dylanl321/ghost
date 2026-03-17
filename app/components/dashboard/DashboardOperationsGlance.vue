<template>
  <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden">
    <div class="flex items-center gap-2 mb-4">
      <UIcon name="i-heroicons-signal" class="w-5 h-5 text-indigo-500" />
      <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Operations Glance</h2>
    </div>

    <div v-if="loading || pipelineLoading" class="flex gap-3">
      <div v-for="i in 4" :key="i" class="animate-pulse h-10 flex-1 bg-gray-100 dark:bg-gray-800 rounded-lg" />
    </div>

    <div v-else :class="displayStyle === 'half' ? 'grid grid-cols-2 gap-3' : 'flex flex-wrap gap-3'">
      <NuxtLink to="/admin/pipelines" class="group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
        :class="pipelineHealthColor">
        <UIcon name="i-heroicons-server-stack" class="w-4 h-4" />
        <span class="text-sm font-medium">Pipeline: {{ pipelineHealthPercent }}%</span>
      </NuxtLink>

      <NuxtLink to="/admin/budget-alerts" class="group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
        :class="alertColor">
        <UIcon name="i-heroicons-bell-alert" class="w-4 h-4" />
        <span class="text-sm font-medium">{{ budgetAlertCount }} Alert{{ budgetAlertCount !== 1 ? 's' : '' }}</span>
      </NuxtLink>

      <NuxtLink to="/account/explorer" class="group flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
        <UIcon name="i-heroicons-building-office-2" class="w-4 h-4" />
        <span class="text-sm font-medium">{{ activeAccounts }} Accounts</span>
      </NuxtLink>

      <NuxtLink v-if="failedRuns > 0" to="/admin/pipelines" class="group flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
        <UIcon name="i-heroicons-x-circle" class="w-4 h-4" />
        <span class="text-sm font-medium">{{ failedRuns }} Failed Run{{ failedRuns !== 1 ? 's' : '' }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DisplayStyle } from '#shared/types/dashboard-layout'

const props = withDefaults(defineProps<{
  displayStyle?: DisplayStyle
  budgetAlertCount: number
  activeAccounts: number
  loading: boolean
}>(), { displayStyle: 'full' })

const pipelineLoading = ref(true)
const pipelineHealthPercent = ref(0)
const failedRuns = ref(0)

const pipelineHealthColor = computed(() => {
  const p = pipelineHealthPercent.value
  if (p >= 90) return 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30'
  if (p >= 70) return 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
  return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30'
})

const alertColor = computed(() => {
  if (props.budgetAlertCount === 0) return 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30'
  if (props.budgetAlertCount <= 3) return 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
  return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30'
})

onMounted(async () => {
  try {
    const res = await $fetch<{ success: boolean; data: any }>('/api/pipelines/global-summary')
    if (res.success && res.data) {
      const total = res.data.totalPipelines || 0
      const healthy = res.data.healthyPipelines || res.data.successCount || 0
      pipelineHealthPercent.value = total > 0 ? Math.round((healthy / total) * 100) : 100
      failedRuns.value = res.data.failedCount || res.data.failedPipelines || 0
    }
  } catch {
    pipelineHealthPercent.value = 100
    failedRuns.value = 0
  } finally {
    pipelineLoading.value = false
  }
})
</script>
