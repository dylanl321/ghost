<template>
  <div>
    <div class="mb-2 flex items-center justify-between gap-3">
      <h4 class="text-xs font-semibold text-gray-600 dark:text-gray-400">Account Contributions</h4>
      <span v-if="sortedAccounts.length" class="text-[11px] text-gray-500 dark:text-gray-400">
        Showing {{ paginationStart + 1 }}-{{ paginationEnd }} of {{ sortedAccounts.length }}
      </span>
    </div>

    <div v-if="!accounts.length" class="text-xs text-gray-500 py-2">No account contributions available</div>

    <div v-else class="divide-y divide-blue-200 dark:divide-blue-800 border-y border-blue-200 dark:border-blue-800">
      <div v-for="account in paginatedAccounts" :key="account.accountId">
        <button
          type="button"
          class="w-full grid grid-cols-[1rem_minmax(0,1fr)_5.5rem_3.5rem] items-center gap-2 py-2 text-xs hover:bg-blue-100/60 dark:hover:bg-blue-900/30 transition-colors"
          @click="toggleAccount(account.accountId)"
        >
          <UIcon
            :name="expandedAccountId === account.accountId ? 'i-heroicons-chevron-down-20-solid' : 'i-heroicons-chevron-right-20-solid'"
            class="w-3 h-3 text-gray-400"
          />
          <span class="min-w-0 text-left">
            <span class="block truncate font-medium text-gray-900 dark:text-gray-100">{{ account.accountName || account.accountId }}</span>
            <span v-if="account.accountName" class="block text-[10px] text-gray-500 dark:text-gray-400">{{ account.accountId }}</span>
          </span>
          <span class="text-right font-mono text-gray-900 dark:text-gray-100">{{ formatCostValue(displayCost(account)) }}</span>
          <span class="text-right text-gray-500 dark:text-gray-400">{{ accountShare(account).toFixed(1) }}%</span>
        </button>

        <div v-if="expandedAccountId === account.accountId" class="pl-5 pb-3 space-y-3">
          <TagValueServiceBreakdown
            :account-id="account.accountId"
            :tag-key="tagKey"
            :tag-values="account.rawValues"
            :period="period"
          />
          <TagValueTrend
            :account-id="account.accountId"
            :tag-key="tagKey"
            :tag-values="account.rawValues"
            :tag-value-label="tagValueLabel"
            :period="period"
          />
        </div>
      </div>
    </div>
    <div v-if="sortedAccounts.length > pageSize" class="mt-3 flex justify-end">
      <UPagination v-model="currentPage" :total="sortedAccounts.length" :page-count="pageSize" size="xs" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TagValueAccountCost } from '~~/shared/types/cost-tags'
import { formatCostValue } from '~/utils/cost-filters'

const props = withDefaults(defineProps<{
  accounts: TagValueAccountCost[]
  tagKey: string
  tagValue: string
  tagValueLabel?: string
  period?: string
  dataMode?: 'billable' | 'proforma'
  proformaAvailable?: boolean
}>(), {
  tagValueLabel: '',
  period: 'last90days',
  dataMode: 'billable',
  proformaAvailable: false
})

const expandedAccountId = ref<string | null>(null)
const currentPage = ref(1)
const pageSize = 20

function displayCost(account: TagValueAccountCost): number {
  if (props.dataMode === 'proforma' && props.proformaAvailable && account.estimatedProformaCost !== undefined) {
    return account.estimatedProformaCost
  }
  return account.billableCost
}

const sortedAccounts = computed(() =>
  [...props.accounts].sort((a, b) => displayCost(b) - displayCost(a))
)

const totalCost = computed(() => sortedAccounts.value.reduce((sum, account) => sum + displayCost(account), 0))
const paginationStart = computed(() => (currentPage.value - 1) * pageSize)
const paginationEnd = computed(() => Math.min(paginationStart.value + pageSize, sortedAccounts.value.length))
const paginatedAccounts = computed(() => sortedAccounts.value.slice(paginationStart.value, paginationEnd.value))

function accountShare(account: TagValueAccountCost): number {
  return totalCost.value > 0 ? (displayCost(account) / totalCost.value) * 100 : 0
}

function toggleAccount(accountId: string) {
  expandedAccountId.value = expandedAccountId.value === accountId ? null : accountId
}

watch(() => [props.tagKey, props.tagValue, props.accounts], () => {
  expandedAccountId.value = null
  currentPage.value = 1
})
</script>
