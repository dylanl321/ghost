<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="text-base font-semibold text-gray-900 dark:text-white">Account Risk Ranking</div>
        <UBadge color="gray" variant="soft" size="sm">{{ (accounts || []).length }} accounts</UBadge>
      </div>
    </template>

    <UTable
      :rows="sortedAccounts"
      :columns="columns"
      @select="onRowClick"
      class="cursor-pointer"
    >
      <template #accountName-data="{ row }">
        <div class="font-medium text-gray-900 dark:text-white">{{ row.accountName }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">{{ row.accountId }}</div>
      </template>

      <template #riskScore-data="{ row }">
        <UBadge :color="riskColor(row.riskLevel)" variant="subtle" size="sm">
          {{ row.riskScore }} &mdash; {{ row.riskLevel }}
        </UBadge>
      </template>

      <template #criticalCount-data="{ row }">
        <span :class="row.criticalCount > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'">
          {{ row.criticalCount }}
        </span>
      </template>

      <template #highCount-data="{ row }">
        <span :class="row.highCount > 0 ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-gray-500 dark:text-gray-400'">
          {{ row.highCount }}
        </span>
      </template>
    </UTable>
  </UCard>
</template>

<script setup lang="ts">
import type { AccountRiskEntry } from '#shared/types/security-dashboard'

const props = defineProps<{
  accounts: AccountRiskEntry[]
}>()

const router = useRouter()

const columns = [
  { key: 'accountName', label: 'Account', sortable: true },
  { key: 'riskScore', label: 'Risk Score', sortable: true },
  { key: 'totalFindings', label: 'Total Findings', sortable: true },
  { key: 'criticalCount', label: 'Critical', sortable: true },
  { key: 'highCount', label: 'High', sortable: true },
]

// Already sorted descending by risk score from the API, but keep client-side reactivity
const sortedAccounts = computed(() => [...(props.accounts || [])].sort((a, b) => b.riskScore - a.riskScore))

function riskColor(level: AccountRiskEntry['riskLevel']): 'red' | 'orange' | 'yellow' | 'green' | 'gray' {
  switch (level) {
    case 'CRITICAL': return 'red'
    case 'HIGH': return 'orange'
    case 'MEDIUM': return 'yellow'
    case 'LOW': return 'green'
    default: return 'gray'
  }
}

function onRowClick(row: AccountRiskEntry) {
  // Tab 3 = Security tab on the account detail page
  router.push(`/account/${row.accountId}?tab=3`)
}
</script>
