<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Card 1: Total Spend (MTD) -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-gray-600 dark:text-gray-400 text-sm">Total Spend</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(totalSpend) }}</p>
          <p v-if="periodWindow" class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ periodWindow.label === 'year to date' ? 'year to date' : `${periodWindow.label} to date` }}</p>
        </div>
        <UIcon name="i-heroicons-credit-card" class="w-8 h-8 text-gray-400 dark:text-gray-500" />
      </div>
    </div>

    <!-- Card 2: Monthly Budget (single) / Total Accounts (multi) -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div v-if="scenario === 'single-account'">
          <p class="text-gray-600 dark:text-gray-400 text-sm">{{ timeframe && timeframe !== 'thisMonth' ? 'Period Budget' : 'Monthly Budget' }}</p>
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
        <div v-if="scenario === 'single-account' && periodWindow">
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
            {{ utilization }}% used<template v-if="elapsedPercent !== null"> · {{ elapsedPercent }}% of {{ periodWindow?.label === 'year to date' ? 'period' : periodWindow?.label }} elapsed</template>
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

import { getCurrentPeriodWindow } from '~/utils/cost-period'

const props = defineProps<{
  totalAccounts: number
  totalBudget: number
  totalSpend: number
  utilization: number
  formatCurrency: (value: number) => string
  scenario?: Scenario
  isHistorical?: boolean
  timeframe?: string
}>()

// Budget window for This Month / This Quarter / Year-to-Date; null for historical views
const periodWindow = computed(() => getCurrentPeriodWindow(props.timeframe || 'thisMonth'))

// Share of the budget window that has cost data (Cost Explorer reports through yesterday)
const elapsedPercent = computed(() => {
  const window = periodWindow.value
  if (!window || window.totalDays === 0) return null
  return Math.round((window.observedDays / window.totalDays) * 100)
})

// Budget health: how much over/under budget
const budgetDelta = computed(() => props.totalBudget - props.totalSpend)

const healthLabel = computed(() => {
  if (budgetDelta.value >= 0) {
    return `${props.formatCurrency(budgetDelta.value)} under`
  }
  return `${props.formatCurrency(Math.abs(budgetDelta.value))} over`
})

// Red over budget; amber when spending runs more than 10 points ahead of the
// share of the period elapsed (on pace to overrun); green otherwise.
// A flat 80% threshold flagged every account late in the month and none early.
const healthTone = computed(() => {
  if (props.utilization > 100) return 'red'
  const pace = elapsedPercent.value
  if (pace === null) return props.utilization > 80 ? 'amber' : 'green'
  return props.utilization > pace + 10 ? 'amber' : 'green'
})
const healthColor = computed(() => ({ red: 'text-red-500', amber: 'text-amber-500', green: 'text-green-500' })[healthTone.value])
const healthIconColor = healthColor

// Daily burn rate over the days that have data. Dividing by today's date
// counted today, which Cost Explorer has not reported yet.
const dailyBurnRate = computed(() => {
  const days = periodWindow.value?.observedDays || 0
  return days > 0 ? props.totalSpend / days : 0
})

const budgetRunwayText = computed(() => {
  const window = periodWindow.value
  if (props.totalBudget <= 0 || !window) return ''
  if (budgetDelta.value <= 0) return 'Budget exceeded'
  if (dailyBurnRate.value <= 0) return ''
  const daysOfRunway = Math.floor(budgetDelta.value / dailyBurnRate.value)
  const daysLeft = window.totalDays - window.observedDays
  return daysOfRunway >= daysLeft
    ? 'On pace to stay within budget'
    : `At this rate the budget runs out in ~${daysOfRunway} days`
})
</script>
