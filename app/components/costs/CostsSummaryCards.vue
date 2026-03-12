<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
    <!-- Card 0: Budget Alerts -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-gray-600 dark:text-gray-400 text-sm">Budget Alerts</p>
          <template v-if="isHistorical">
            <p class="text-2xl font-bold text-gray-400">N/A</p>
            <p class="text-xs text-gray-400 mt-1">Current month only</p>
          </template>
          <template v-else>
            <p class="text-2xl font-bold" :class="alertsColorClass">{{ alertsCount }}</p>
            <p class="text-xs mt-1" :class="alertsColorClass">
              {{ alertsSummaryText }}
            </p>
          </template>
        </div>
        <UIcon
          name="i-heroicons-bell-alert"
          class="w-8 h-8"
          :class="isHistorical ? 'text-gray-400' : alertsColorClass"
        />
      </div>
      <UButton
        v-if="!isHistorical"
        variant="link"
        size="xs"
        color="blue"
        @click="$emit('view-alerts')"
      >
        View details &rarr;
      </UButton>
    </div>

    <!-- Card 1: Accounts or Budget Remaining (scenario-aware) -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div v-if="scenario === 'single-account' && totalBudget > 0">
          <p class="text-gray-600 dark:text-gray-400 text-sm">Budget Remaining</p>
          <p class="text-2xl font-bold" :class="budgetRemaining >= 0 ? 'text-green-500' : 'text-red-500'">
            {{ formatCurrency(Math.abs(budgetRemaining)) }}
          </p>
          <p class="text-xs mt-1" :class="budgetRemaining >= 0 ? 'text-green-400' : 'text-red-400'">
            {{ budgetRemaining >= 0 ? 'under budget' : 'over budget' }}
          </p>
        </div>
        <div v-else>
          <p class="text-gray-600 dark:text-gray-400 text-sm">Total Accounts</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totalAccounts }}</p>
        </div>
        <UIcon
          :name="scenario === 'single-account' && totalBudget > 0 ? 'i-heroicons-calculator' : 'i-heroicons-building-office'"
          class="w-8 h-8"
          :class="scenario === 'single-account' && totalBudget > 0 ? (budgetRemaining >= 0 ? 'text-green-500' : 'text-red-500') : 'text-blue-500'"
        />
      </div>
    </div>

    <!-- Card 2: Budget or Burn Rate (scenario-aware) -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div v-if="scenario === 'single-account' && totalBudget > 0">
          <p class="text-gray-600 dark:text-gray-400 text-sm">Daily Burn Rate</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(dailyBurnRate) }}</p>
          <p class="text-xs text-gray-400 mt-1">
            {{ budgetRunwayDays >= 0 ? `~${budgetRunwayDays} days remaining` : 'Budget exceeded' }}
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
          :name="scenario === 'single-account' && totalBudget > 0 ? 'i-heroicons-fire' : 'i-heroicons-banknotes'"
          class="w-8 h-8"
          :class="scenario === 'single-account' && totalBudget > 0 ? 'text-orange-500' : (totalBudget > 0 ? 'text-green-500' : 'text-gray-600')"
        />
      </div>
    </div>

    <!-- Card 3: Total Spend -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-gray-600 dark:text-gray-400 text-sm">Total Spend</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(totalSpend) }}</p>
        </div>
        <UIcon name="i-heroicons-credit-card" class="w-8 h-8 text-orange-500" />
      </div>
    </div>

    <!-- Card 4: Variance (replaces plain Utilization for richer insight) -->
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div v-if="totalBudget > 0">
          <p class="text-gray-600 dark:text-gray-400 text-sm">Budget Variance</p>
          <p class="text-2xl font-bold" :class="varianceColor">
            {{ varianceSign }}{{ formatCurrency(Math.abs(variance)) }}
          </p>
          <p class="text-xs mt-1" :class="varianceColor">
            {{ utilization }}% utilized
          </p>
        </div>
        <div v-else>
          <p class="text-gray-600 dark:text-gray-400 text-sm">Utilization</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">
            <span class="text-gray-500 text-base">N/A</span>
          </p>
        </div>
        <UIcon
          name="i-heroicons-arrow-trending-up"
          class="w-8 h-8"
          :class="totalBudget > 0 ? varianceIconColor : 'text-gray-600'"
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
  alertsCount?: number
  alertsBySeverity?: { critical: number; warning: number; info: number; escalation: number }
  isHistorical?: boolean
}>()

defineEmits<{
  'view-alerts': []
}>()

// Alert card computeds
const alertsColorClass = computed(() => {
  const sev = props.alertsBySeverity
  if (!sev || props.alertsCount === 0) return 'text-green-500'
  if (sev.critical > 0 || sev.escalation > 0) return 'text-red-500'
  if (sev.warning > 0) return 'text-amber-500'
  return 'text-green-500'
})

const alertsSummaryText = computed(() => {
  if (!props.alertsCount || props.alertsCount === 0) return 'No alerts this month'
  const sev = props.alertsBySeverity!
  const parts: string[] = []
  if (sev.critical > 0) parts.push(`${sev.critical} critical`)
  if (sev.escalation > 0) parts.push(`${sev.escalation} escalation`)
  if (sev.warning > 0) parts.push(`${sev.warning} warning${sev.warning !== 1 ? 's' : ''}`)
  if (sev.info > 0) parts.push(`${sev.info} info`)
  return parts.join(' · ')
})

// Derived insights
const budgetRemaining = computed(() => props.totalBudget - props.totalSpend)
const variance = computed(() => props.totalBudget - props.totalSpend)
const varianceSign = computed(() => variance.value >= 0 ? '' : '-')

const dailyBurnRate = computed(() => {
  const now = new Date()
  const dayOfMonth = now.getDate()
  return dayOfMonth > 0 ? props.totalSpend / dayOfMonth : 0
})

const budgetRunwayDays = computed(() => {
  if (dailyBurnRate.value <= 0 || budgetRemaining.value <= 0) return budgetRemaining.value <= 0 ? -1 : 999
  const daysOfRunway = Math.round(budgetRemaining.value / dailyBurnRate.value)
  // Cap at remaining days in the current month
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const remainingDaysInMonth = lastDay - now.getDate()
  return Math.min(daysOfRunway, remainingDaysInMonth)
})

const varianceColor = computed(() => {
  if (variance.value > 0) return 'text-green-500'
  if (variance.value < 0) return 'text-red-500'
  return 'text-gray-400'
})

const varianceIconColor = computed(() => {
  if (variance.value > 0) return 'text-green-500'
  if (variance.value < 0) return 'text-red-500'
  return 'text-gray-600'
})
</script>
