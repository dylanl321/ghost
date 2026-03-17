<template>
  <ClientOnly>
    <template v-if="isAdmin">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-amber-500" />
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Admin Overview</h2>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <DashboardAlertsCard />
        <DashboardPipelineCard />
        <DashboardFeedbackCard />
      </div>
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
defineProps<{
  isAdmin: boolean
}>()
</script>
