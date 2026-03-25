<template>
  <div>
    <div :class="['grid gap-4', gridClass]">
    <!-- Month to Date -->
    <div v-if="isCardVisible('mtdSpend')" class="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 overflow-hidden">
      <div class="absolute top-0 left-0 w-1 h-full bg-blue-500" />
      <template v-if="loading">
        <div class="animate-pulse space-y-2">
          <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>
      </template>
      <template v-else>
        <div class="flex justify-between items-start mb-1">
          <div class="flex items-center gap-1.5">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Month to Date</p>
            <UBadge v-if="isScoped" color="primary" variant="subtle" size="xs">{{ scopeLabel }}</UBadge>
          </div>
          <UTooltip v-if="monthToDateTrend !== null" text="vs same period last month">
            <span class="text-xs font-semibold" :class="monthToDateTrend > 0 ? 'text-red-500' : 'text-green-500'">
              {{ monthToDateTrend > 0 ? '+' : '' }}{{ formatNumber(monthToDateTrend, 1) }}%
            </span>
          </UTooltip>
        </div>
        <p class="text-xl font-bold text-gray-900 dark:text-white mb-2">{{ animatedMtd }}</p>
        <ClientOnly>
          <div class="space-y-1">
            <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
              <div class="bg-blue-500 h-1.5 rounded-full transition-all duration-500" :style="{ width: `${monthProgressPercent}%` }" />
            </div>
            <div class="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
              <span>Day {{ currentDayOfMonth }}</span>
              <span>{{ monthProgressPercent }}% of month</span>
            </div>
          </div>
        </ClientOnly>
      </template>
    </div>

    <!-- Forecasted Cost -->
    <div v-if="isCardVisible('forecastedCost')" class="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 overflow-hidden">
      <div class="absolute top-0 left-0 w-1 h-full" :class="
        projectedSpend > budgetHealth.totalBudget && budgetHealth.totalBudget > 0 ? 'bg-red-500' :
        projectedSpend > budgetHealth.totalBudget * 0.9 && budgetHealth.totalBudget > 0 ? 'bg-yellow-500' :
        'bg-purple-500'" />
      <template v-if="loading">
        <div class="animate-pulse space-y-2">
          <div class="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </template>
      <template v-else>
        <div class="flex justify-between items-start mb-1">
          <UTooltip text="AWS Cost Explorer ML forecast">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Forecast
              <span v-if="isScoped" class="text-[9px] font-normal normal-case">(Org)</span>
            </p>
          </UTooltip>
          <UTooltip v-if="projectedSpend !== 0 && projectedSpendTrend !== null" text="vs last month total">
            <span class="text-xs font-semibold" :class="projectedSpendTrend > 0 ? 'text-red-500' : 'text-green-500'">
              {{ projectedSpendTrend > 0 ? '+' : '' }}{{ formatNumber(projectedSpendTrend, 1) }}%
            </span>
          </UTooltip>
        </div>
        <p v-if="projectedSpend !== 0" class="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {{ animatedForecast }}
        </p>
        <p v-else class="text-sm text-gray-400 dark:text-gray-500 mb-2">Not enough data</p>
        <div v-if="budgetHealth.totalBudget > 0 && projectedSpend > 0" class="space-y-0.5">
          <div class="flex justify-between text-[10px]">
            <span class="text-gray-400 dark:text-gray-500">vs Budget</span>
            <span class="font-medium" :class="projectedSpend > budgetHealth.totalBudget ? 'text-red-500' : 'text-green-500'">
              {{ projectedSpend > budgetHealth.totalBudget ? '+' : '' }}{{ formatCurrency(projectedSpend - budgetHealth.totalBudget, 0) }}
            </span>
          </div>
          <div class="flex justify-between text-[10px]">
            <span class="text-gray-400 dark:text-gray-500">Days left</span>
            <span class="font-medium text-gray-600 dark:text-gray-300">{{ daysRemainingInMonth }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Previous Month -->
    <div v-if="isCardVisible('previousMonth')" class="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 overflow-hidden">
      <div class="absolute top-0 left-0 w-1 h-full bg-gray-400" />
      <template v-if="loading">
        <div class="animate-pulse space-y-2">
          <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </template>
      <template v-else>
        <div class="flex justify-between items-start mb-1">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Previous Month
            <span v-if="scope === 'mine'" class="text-[9px] font-normal normal-case">(Org)</span>
          </p>
        </div>
        <p class="text-xl font-bold text-gray-900 dark:text-white mb-2">{{ animatedPrevMonth }}</p>
        <div v-if="mtdTotal > 0" class="space-y-0.5">
          <div class="flex justify-between text-[10px]">
            <span class="text-gray-400 dark:text-gray-500">Avg/day</span>
            <span class="font-medium text-gray-600 dark:text-gray-300">{{ formatCurrency(previousMonthSpend / previousMonthDays, 0) }}</span>
          </div>
          <div v-if="currentPaceVsPrevious !== null" class="flex justify-between text-[10px]">
            <span class="text-gray-400 dark:text-gray-500">Current pace</span>
            <span class="font-medium" :class="currentPaceVsPrevious > 0 ? 'text-red-500' : 'text-green-500'">
              {{ currentPaceVsPrevious > 0 ? '+' : '' }}{{ formatNumber(currentPaceVsPrevious, 1) }}%
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- Active Accounts -->
    <div v-if="isCardVisible('activeAccounts')" class="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 overflow-hidden">
      <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
      <template v-if="loading">
        <div class="animate-pulse space-y-2">
          <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </template>
      <template v-else>
        <div class="flex justify-between items-start mb-1">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active Accounts</p>
          <UTooltip :text="`${budgetHealth.accountsWithBudget} with budgets`">
            <UBadge color="blue" variant="soft" size="xs">{{ budgetHealth.accountsWithBudget }}</UBadge>
          </UTooltip>
        </div>
        <p class="text-xl font-bold text-gray-900 dark:text-white mb-2">{{ animatedActiveAccounts }}</p>
        <div v-if="effectiveMtdTotal > 0 && effectiveActiveAccounts > 0" class="flex justify-between text-[10px]">
          <span class="text-gray-400 dark:text-gray-500">Avg cost/acct</span>
          <span class="font-medium text-gray-600 dark:text-gray-300">{{ formatCurrency(effectiveMtdTotal / effectiveActiveAccounts, 0) }}</span>
        </div>
      </template>
    </div>

    <!-- Budget Health -->
    <div v-if="isCardVisible('budgetHealth')" class="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 overflow-hidden">
      <div class="absolute top-0 left-0 w-1 h-full" :class="
        !hasBudgetData ? 'bg-gray-400' :
        budgetHealth.burnRateVsBudget > 10 ? 'bg-red-500' :
        budgetHealth.burnRateVsBudget > 0 ? 'bg-yellow-500' :
        'bg-green-500'" />
      <template v-if="loading">
        <div class="animate-pulse space-y-2">
          <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </template>
      <template v-else>
        <div class="flex justify-between items-start mb-1">
          <UTooltip text="Burn rate vs budget (excl. day 1 savings plan)">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Budget Health</p>
          </UTooltip>
          <UTooltip
            v-if="hasBudgetData && budgetHealth.accountsOverBudget > 0"
            :text="`${budgetHealth.accountsOverBudget} of ${budgetHealth.accountsWithBudget} over budget`">
            <UBadge color="red" variant="soft" size="xs">{{ budgetHealth.accountsOverBudget }} over</UBadge>
          </UTooltip>
        </div>

        <template v-if="hasBudgetData">
          <p class="text-xl font-bold mb-2" :class="
            budgetHealth.burnRateVsBudget > 10 ? 'text-red-500' :
            budgetHealth.burnRateVsBudget > 0 ? 'text-yellow-500' :
            'text-green-500'">
            {{ animatedBurnRate }}
          </p>
          <div class="space-y-0.5">
            <div class="flex justify-between text-[10px]">
              <span class="text-gray-400 dark:text-gray-500">Actual</span>
              <span class="font-medium text-gray-600 dark:text-gray-300">{{ formatCurrency(budgetHealth.actualDailyBurnRate, 0) }}/day</span>
            </div>
            <div class="flex justify-between text-[10px]">
              <span class="text-gray-400 dark:text-gray-500">Budget</span>
              <span class="font-medium text-gray-600 dark:text-gray-300">{{ formatCurrency(budgetHealth.expectedDailyBudgetRate, 0) }}/day</span>
            </div>
          </div>
        </template>
        <template v-else>
          <p class="text-sm text-gray-400 dark:text-gray-500 mb-1">No budget data</p>
          <p class="text-[10px] text-gray-400 dark:text-gray-500">Set budgets in Account Details</p>
        </template>

        <NuxtLink
          v-if="hasBudgetData"
          to="/account/costs?chartTab=budget-health"
          class="block text-[10px] text-blue-500 hover:text-blue-400 font-medium mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 transition-colors"
        >
          View Details →
        </NuxtLink>
      </template>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MetricCardId } from '#shared/types/dashboard-layout'
import { useCountUp } from '~/composables/useCountUp'

const props = defineProps<{
  loading: boolean
  mtdTotal: number
  projectedSpend: number
  previousMonthSpend: number
  activeAccounts: number
  monthToDateTrend: number | null
  projectedSpendTrend: number | null
  currentPaceVsPrevious: number | null
  monthProgressPercent: number
  currentDayOfMonth: number
  daysRemainingInMonth: number
  previousMonthDays: number
  budgetHealth: {
    totalBudget: number
    accountsOverBudget: number
    actualDailyBurnRate: number
    expectedDailyBudgetRate: number
    burnRateVsBudget: number
    projectedMonthlySpend: number
    accountsWithBudget: number
  }
  hasBudgetData: boolean
  visibleCards: Record<MetricCardId, boolean>
  visibleCount: number
  userMtdTotal?: number
  userActiveAccounts?: number
}>()

const { scope, isScoped, scopeLabel } = useDashboardScope()

// Scoped values: switch between org and user data for MTD and Active Accounts
const effectiveMtdTotal = computed(() =>
  scope.value === 'mine' && props.userMtdTotal != null ? props.userMtdTotal : props.mtdTotal
)
const effectiveActiveAccounts = computed(() =>
  scope.value === 'mine' && props.userActiveAccounts != null ? props.userActiveAccounts : props.activeAccounts
)

function isCardVisible(id: MetricCardId): boolean {
  return props.visibleCards[id] ?? true
}

// Animated counters
const mtdTarget = computed(() => effectiveMtdTotal.value)
const { formattedValue: animatedMtd } = useCountUp(mtdTarget, { formatter: (n) => formatCurrency(n, 0) })

const forecastTarget = computed(() => props.projectedSpend)
const { formattedValue: animatedForecast } = useCountUp(forecastTarget, { formatter: (n) => formatCurrency(n, 0) })

const prevMonthTarget = computed(() => props.previousMonthSpend)
const { formattedValue: animatedPrevMonth } = useCountUp(prevMonthTarget, { formatter: (n) => formatCurrency(n, 0) })

const activeTarget = computed(() => effectiveActiveAccounts.value)
const { formattedValue: animatedActiveAccounts } = useCountUp(activeTarget, { formatter: (n) => String(Math.round(n)) })

const burnRateTarget = computed(() => props.budgetHealth.burnRateVsBudget)
const { formattedValue: animatedBurnRate } = useCountUp(burnRateTarget, { formatter: (n) => `${n > 0 ? '+' : ''}${formatNumber(n, 1)}%` })

const gridClass = computed(() => {
  const count = props.visibleCount
  if (count <= 2) return 'grid-cols-1 sm:grid-cols-2'
  if (count <= 3) return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
  return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-5'
})
</script>
