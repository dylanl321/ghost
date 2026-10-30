<template>
  <div
    class="flex items-center justify-between p-2 rounded cursor-pointer text-sm"
    :class="selected ? 'bg-blue-50 dark:bg-blue-900/40 ring-1 ring-inset ring-blue-200 dark:ring-blue-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
    @click="$emit('toggle', accountKey)"
  >
    <div class="flex items-center gap-2 min-w-0">
      <input
        type="checkbox"
        :checked="selected"
        class="w-3 h-3 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded"
        @change="$emit('toggle', accountKey)"
        @click.stop
      >
      <div class="min-w-0 flex-1">
        <div class="text-gray-900 dark:text-gray-200 truncate" :class="showBoldName ? 'font-medium' : ''">
          {{ account.accountName || account.projectName || account.name || account.pepCloudRecordName || account.pepEnvironmentName || account.accountAlias || 'Unnamed Account' }}
        </div>
        <div class="text-xs text-gray-600 dark:text-gray-400">
          {{ account.accountId || account.awsStandardAccountID || account.awsCommercialAccountID }}
        </div>
      </div>
    </div>
    <!-- Spend first: it is what the list is sorted by -->
    <div class="text-right ml-2 flex flex-col space-y-0.5 items-end tabular-nums">
      <UTooltip text="Spend for the selected period">
        <div class="text-xs font-medium text-gray-900 dark:text-gray-100">
          {{ formatCurrency(spend) }}
        </div>
      </UTooltip>
      <UTooltip text="Monthly budget">
        <div class="text-[11px] text-gray-500 dark:text-gray-400">
          {{ budget > 0 ? `${formatCurrency(budget)} budget` : 'No budget' }}
        </div>
      </UTooltip>
      <UTooltip v-if="showUtilization && budget > 0" text="Utilization">
        <div class="text-xs" :class="utilizationColorClass">
          {{ utilizationFormatted }}
        </div>
      </UTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  account: any
  accountKey: string
  selected: boolean
  budget: number
  spend: number
  formatCurrency: (value: number) => string
  showUtilization?: boolean
  showBoldName?: boolean
}>(), {
  showUtilization: true,
  showBoldName: false
})

defineEmits<{
  toggle: [accountKey: string]
}>()

const utilization = computed(() => {
  if (props.budget === 0) return 0
  return (props.spend / props.budget) * 100
})

// Normalize to 1 decimal place everywhere
const utilizationFormatted = computed(() => `${utilization.value.toFixed(1)}%`)

const utilizationColorClass = computed(() => {
  if (props.budget === 0) return 'text-gray-500 dark:text-gray-400'
  if (utilization.value > 100) return 'text-red-600 dark:text-red-400'
  if (utilization.value > 90) return 'text-amber-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
})
</script>
