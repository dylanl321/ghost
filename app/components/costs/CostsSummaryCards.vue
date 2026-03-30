<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Card 1: Total Spend (MTD) -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-gray-600 dark:text-gray-400 text-sm">Total Spend</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(totalSpend) }}</p>
          <p v-if="scenario === 'single-account'" class="text-xs text-gray-400 mt-1">month to date</p>
        </div>
        <UIcon name="i-heroicons-credit-card" class="w-8 h-8 text-gray-400 dark:text-gray-500" />
      </div>
    </div>

    <!-- Card 2: Monthly Budget (single) / Total Accounts (multi) -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div v-if="scenario === 'single-account'">
          <p class="text-gray-600 dark:text-gray-400 text-sm">Monthly Budget</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">
            <span v-if="totalBudget > 0">{{ formatCurrency(totalBudget) }}</span>
            <span v-else class="text-gray-500 text-base">N/A</span>
          </p>
        </div>
        <div v-else>
          <p class="text-gray-600 dark:text-gray-400 text-sm">Total Accounts</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totalAccounts }}</p>
        </div>
        <UIcon
          :name="scenario === 'single-account' ? 'i-heroicons-banknotes' : 'i-heroicons-building-office'"
          class="w-8 h-8 text-gray-400 dark:text-gray-500"
        />
      </div>
    </div>

    <!-- Card 3: Daily Burn Rate (single) / Total Budget (multi) -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div v-if="scenario === 'single-account'">
          <p class="text-gray-600 dark:text-gray-400 text-sm">Daily Burn Rate</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(dailyBurnRate) }}/day</p>
          <p class="text-xs text-gray-400 mt-1">
            {{ budgetRunwayText }}
          </p>
        </div>
        <div v-else>
          <p class="text-gray-600 dark:text-gray-400 text-sm">Total Budget</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">
            <span v-if="totalBudget > 0">{{ formatCurrency(totalBudget) }}</span>
            <span v-else class="text-gray-500 text-base">N/A</span>
          </p>
        </div>
        <UIcon
          :name="scenario === 'single-account' ? 'i-heroicons-fire' : 'i-heroicons-banknotes'"
          class="w-8 h-8 text-gray-400 dark:text-gray-500"
        />
      </div>
    </div>

    <!-- Card 4: Budget Health -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div v-if="totalBudget > 0">
          <p class="text-gray-600 dark:text-gray-400 text-sm">Budget Health</p>
          <p class="text-2xl font-bold" :class="healthColor">
            {{ healthLabel }}
          </p>
          <p class="text-xs mt-1" :class="healthColor">
            {{ utilization }}% utilized
          </p>
        </div>
        <div v-else>
          <p class="text-gray-600 dark:text-gray-400 text-sm">Budget Health</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">
            <span class="text-gray-500 text-base">N/A</span>
          </p>
        </div>
        <UIcon
          name="i-heroicons-heart"
          class="w-8 h-8"
          :class="totalBudget > 0 ? healthIconColor : 'text-gray-400 dark:text-gray-500'"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Scenario } from '~/composables/useCostScenario'

const props = defineProps<{
  totalAccounts: number
  totalBudget: number
  totalSpend: number
  utilization: number
  formatCurrency: (value: number) => string
  scenario?: Scenario
  isHistorical?: boolean
}>()

// Budget health: how much over/under budget
const budgetDelta = computed(() => props.totalBudget - props.totalSpend)

const healthLabel = computed(() => {
  if (budgetDelta.value >= 0) {
    return `${props.formatCurrency(budgetDelta.value)} under`
  }
  return `${props.formatCurrency(Math.abs(budgetDelta.value))} over`
})

// Green <=80%, Amber 80-100%, Red >100%
const healthColor = computed(() => {
  if (props.utilization > 100) return 'text-red-500'
  if (props.utilization > 80) return 'text-amber-500'
  return 'text-green-500'
})

const healthIconColor = computed(() => {
  if (props.utilization > 100) return 'text-red-500'
  if (props.utilization > 80) return 'text-amber-500'
  return 'text-green-500'
})

// Daily burn rate and runway
const dailyBurnRate = computed(() => {
  const now = new Date()
  const dayOfMonth = now.getDate()
  return dayOfMonth > 0 ? props.totalSpend / dayOfMonth : 0
})

const budgetRunwayText = computed(() => {
  if (props.totalBudget <= 0) return ''
  if (budgetDelta.value <= 0) return 'Budget exceeded'
  if (dailyBurnRate.value <= 0) return ''
  const daysOfRunway = Math.round(budgetDelta.value / dailyBurnRate.value)
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const remainingDaysInMonth = lastDay - now.getDate()
  return `~${Math.min(daysOfRunway, remainingDaysInMonth)} days remaining`
})
</script>
