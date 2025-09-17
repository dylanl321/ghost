<template>
  <UCard>
    <template #header>
      <div class="text-lg font-semibold">Top Accounts</div>
    </template>

    <div class="space-y-4">
      <div v-for="(acct, idx) in sortedAccounts" :key="acct.accountId" class="p-4 bg-gray-900 rounded-xl">
        <!-- Rank -->
        <div class="text-sm text-gray-400 mb-1">#{{ idx + 1 }}</div>

        <!-- Project name + cost -->
        <div class="flex items-center justify-between mb-2">
          <div class="text-white text-base font-medium truncate">{{ acct.name }}</div>
          <UBadge color="green" variant="solid" class="text-sm">
            ${{ formatCost(acct.cost) }}
          </UBadge>
        </div>

        <!-- Account ID -->
        <div class="text-xs text-gray-400 mb-2">{{ acct.accountId }}</div>

        <!-- Progress bar -->
        <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-green-500"
            :style="{ width: acct.percentOfTotal.toFixed(2) + '%' }"
          />
        </div>
        <div class="text-xs text-gray-400 mt-1">{{ acct.percentOfTotal.toFixed(1) }}%</div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { UCard, UBadge } from '#components'

const props = defineProps<{
  topAccounts: {
    accountId: string
    name: string
    cost: number
    trend: string
    percentOfTotal: number
  }[]
}>()

const sortedAccounts = computed(() =>
  [...props.topAccounts].sort((a, b) => b.cost - a.cost)
)

function formatCost(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
</script>
