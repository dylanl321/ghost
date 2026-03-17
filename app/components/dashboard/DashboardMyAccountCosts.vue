<template>
  <div v-if="userAccounts.length > 0" class="h-full flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-currency-dollar" class="w-5 h-5 text-emerald-500" />
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">My Account Costs</h2>
      </div>
      <div class="text-right">
        <p class="text-xs text-gray-400 dark:text-gray-500">Total MTD</p>
        <p class="text-sm font-bold text-gray-900 dark:text-white">{{ formatCurrency(totalCost, 0) }}</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-2">
      <div v-for="i in 3" :key="i" class="animate-pulse flex items-center gap-3 py-2">
        <div class="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <div class="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>

    <!-- Account list sorted by cost -->
    <div v-else class="space-y-1.5 max-h-[400px] overflow-y-auto">
      <NuxtLink
        v-for="acct in displayedAccounts"
        :key="acct.accountId"
        :to="`/account/${acct.accountId}`"
        class="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div class="min-w-0 flex-shrink-0 w-40">
          <p :class="displayStyle === 'half' ? 'text-xs' : 'text-sm'" class="text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {{ acct.name }}
          </p>
          <p class="text-[11px] text-gray-400 dark:text-gray-500">{{ acct.accountId }}</p>
        </div>
        <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-emerald-500/70 rounded-full transition-all duration-300"
            :style="{ width: `${acct.percent}%` }"
          />
        </div>
        <span class="text-sm font-medium text-gray-900 dark:text-white flex-shrink-0 w-20 text-right">
          {{ formatCurrency(acct.cost, 0) }}
        </span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DisplayStyle } from '#shared/types/dashboard-layout'

const props = defineProps<{
  allAccountCosts?: Record<string, number>
  loading: boolean
  displayStyle?: DisplayStyle
}>()

const userGroupStore = useUserGroupStore()
const enclaveStore = useEnclaveStore()

const userAccounts = computed(() => Object.keys(userGroupStore.myEnclaves))

const sortedAccounts = computed(() => {
  const costs = props.allAccountCosts || {}
  const maxCost = Math.max(...userAccounts.value.map(id => costs[id] || 0), 1)

  return userAccounts.value
    .map(id => {
      const enclave = enclaveStore.enclaves[id]
      return {
        accountId: id,
        name: enclave?.projectName || enclave?.accountName || id,
        cost: costs[id] || 0,
        percent: maxCost > 0 ? ((costs[id] || 0) / maxCost) * 100 : 0,
      }
    })
    .sort((a, b) => b.cost - a.cost)
})

const displayedAccounts = computed(() => {
  if (props.displayStyle === 'half') return sortedAccounts.value.slice(0, 5)
  return sortedAccounts.value.slice(0, 10)
})

const totalCost = computed(() =>
  sortedAccounts.value.reduce((sum, a) => sum + a.cost, 0)
)
</script>
