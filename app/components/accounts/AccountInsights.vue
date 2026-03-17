<template>
  <div class="h-full flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
    <div class="flex justify-between items-center p-5">
      <div class="text-sm font-semibold text-gray-900 dark:text-white">Top Accounts</div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-600 dark:text-gray-400">{{ showProforma ? 'Proforma' : 'Billable' }}</span>
        <UToggle
          v-model="showProforma"
          @update:model-value="handleToggle"
        />
        <UTooltip text="Learn about Billable vs Pro-forma data">
          <NuxtLink to="/support/docs?topic=proforma-vs-billable" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
            <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4" />
          </NuxtLink>
        </UTooltip>
      </div>
    </div>

    <CenteredLoadingSpinner v-if="props.loading" />
    <div v-else class="flex-1 overflow-hidden flex flex-col">
      <div class="flex-1 overflow-y-auto max-h-[400px]">
        <NuxtLink v-for="(acct, idx) in displayedAccounts" :key="acct.accountId" :to="`/account/${acct.accountId}`"
          class="block p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
          <div class="flex items-center justify-between flex-wrap lg:flex-nowrap gap-y-2">
            <div class="flex flex-col">
              <div class="flex gap-3 items-center">
                <div class="text-sm text-gray-500 dark:text-gray-400">#{{ idx + 1 }}</div>
                <div class="text-gray-900 dark:text-white text-base font-medium text-wrap">{{ acct.name }}</div>
              </div>

              <div class="text-xs text-gray-600 dark:text-gray-400">{{ acct.accountId }}</div>
            </div>

            <div class="flex gap-1 items-center">
              <UBadge color="green" variant="solid" size="sm">
                ${{ formatCost(acct.cost) }}
              </UBadge>

              <UIcon name="i-heroicons-chevron-right" />
            </div>
          </div>

          <!-- Progress bar -->
          <div class="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mt-2">
            <div class="h-full bg-green-500" :style="{ width: acct.percentOfTotal.toFixed(2) + '%' }"/>
          </div>
        </NuxtLink>
      </div>
      <NuxtLink v-if="sortedAccounts.length > 5" to="/account/costs"
        class="block text-center py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-blue-500 hover:text-blue-400 font-medium transition-colors">
        View All {{ sortedAccounts.length }} Accounts →
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  loading: boolean
  topAccounts: {
    accountId: string
    name: string
    cost: number
    percentOfTotal: number
  }[]
}>()

const emit = defineEmits<{
  toggleProforma: [value: boolean]
}>()

const showProforma = ref(true) // Default to proforma

const sortedAccounts = computed(() =>
  [...props.topAccounts].sort((a, b) => b.cost - a.cost)
)

const displayedAccounts = computed(() => sortedAccounts.value.slice(0, 5))

function formatCost(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function handleToggle(value: boolean) {
  emit('toggleProforma', value)
}
</script>
