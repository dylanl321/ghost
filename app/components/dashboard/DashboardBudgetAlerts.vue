<template>
  <div v-if="!loading && total > 0" class="flex items-center gap-2.5 px-1 -mb-3">
    <Icon name="i-heroicons-bell-alert" class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
    <span class="text-[11px] text-gray-500 dark:text-gray-400">
      {{ total }} budget alert{{ total !== 1 ? 's' : '' }} this month
    </span>
    <span class="text-[11px] text-gray-400 dark:text-gray-500">&middot;</span>
    <span v-if="bySeverity.critical > 0" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
      <span class="w-1.5 h-1.5 rounded-full bg-red-500" />{{ bySeverity.critical }} critical
    </span>
    <span v-if="bySeverity.escalation > 0" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
      <span class="w-1.5 h-1.5 rounded-full bg-red-400" />{{ bySeverity.escalation }} escalation
    </span>
    <span v-if="bySeverity.warning > 0" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
      <span class="w-1.5 h-1.5 rounded-full bg-yellow-500" />{{ bySeverity.warning }} warning{{ bySeverity.warning !== 1 ? 's' : '' }}
    </span>
    <span v-if="bySeverity.info > 0" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
      <span class="w-1.5 h-1.5 rounded-full bg-blue-400" />{{ bySeverity.info }} info
    </span>
    <NuxtLink
      to="/account/costs?chartTab=budget-health"
      class="text-[11px] text-blue-500 hover:text-blue-400 transition-colors"
    >
      View &rarr;
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  loading: boolean
  total: number
  bySeverity: { critical: number; warning: number; info: number; escalation: number }
}>()
</script>
