<template>
  <UCard>
    <template #header>
      <div class="text-lg font-semibold">Top Accounts</div>
    </template>

    <div>
      <NuxtLink v-for="(acct, idx) in sortedAccounts" :key="acct.accountId" :to="`/account/${acct.accountId}`"
        class="block p-4 bg-gray-900 border-t border-gray-800 hover:bg-gray-700 transition-colors duration-200">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <div class="flex gap-3 items-center">
              <div class="text-sm text-gray-400">#{{ idx + 1 }}</div>
              <div class="text-white text-base font-medium truncate">{{ acct.name }}</div>
            </div>

            <div class="text-xs text-gray-400 mb-2">{{ acct.accountId }}</div>
          </div>

          <div class="flex gap-1 items-center">
            <UBadge color="green" variant="solid" size="sm">
              ${{ formatCost(acct.cost) }}
            </UBadge>

            <UIcon name="i-heroicons-chevron-right" />
          </div>
        </div>

        <!-- Progress bar -->
        <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div class="h-full bg-green-500" :style="{ width: acct.percentOfTotal.toFixed(2) + '%' }"/>
        </div>
      </NuxtLink>
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
