<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <!-- Header -->
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin/costs')" class="mb-4">
        Back to Cost Management
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <UIcon name="i-heroicons-scale" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Financial Metrics</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Plan vs actual spend for finance-tracked departments.
      </p>
    </div>

    <!-- Error -->
    <UAlert
      v-if="error"
      color="red"
      variant="subtle"
      icon="i-heroicons-exclamation-triangle"
      title="Failed to load financial data"
      :description="errorMessage"
      class="mb-6"
    />

    <!-- Loading skeleton -->
    <template v-if="pending">
      <div class="flex items-center justify-between mb-6 border-b border-gray-200 dark:border-gray-700 pb-0">
        <div class="flex gap-1">
          <div v-for="i in 3" :key="i" class="px-5 py-2.5 w-24 h-9 bg-gray-100 dark:bg-gray-800 rounded-t-md animate-pulse" />
        </div>
        <div class="w-24 h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-2" />
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div v-for="i in 3" :key="i" class="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
      </div>
      <div class="h-80 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse mb-6" />
      <div class="h-48 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
    </template>

    <template v-else-if="departments.length">
      <!-- Tabs row with year dropdown on the right -->
      <div class="flex items-center justify-between mb-6 border-b border-gray-200 dark:border-gray-700 pb-0">
        <div class="flex gap-1">
          <button
            v-for="(tab, i) in tabs"
            :key="tab"
            @click="activeTab = i"
            class="px-5 py-2.5 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-px"
            :class="activeTab === i
              ? 'border-purple-500 text-purple-600 dark:text-purple-400 bg-white dark:bg-gray-900'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'"
          >
            {{ tab }}
          </button>
        </div>
        <div class="flex items-center gap-2 pb-2">
          <UBadge v-if="selectedYear !== currentYear" color="amber" variant="subtle" size="sm">
            Viewing {{ selectedYear }}
          </UBadge>
          <USelectMenu v-model="selectedYear" :options="yearOptions" class="w-24" size="sm" />
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-arrow-path"
            size="sm"
            :loading="pending"
            @click="() => refresh()"
          />
        </div>
      </div>

      <!-- ── OVERVIEW TAB ── -->
      <template v-if="activeTab === 0">
        <!-- Grand summary cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <!-- Plan card -->
          <UCard>
            <div class="flex items-center gap-3 mb-4">
              <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
              <span class="text-base font-semibold text-gray-900 dark:text-white">Total Plan</span>
            </div>
            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{{ formatCurrency(grandBudget, 0) }}</div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">budgeted spend across all departments for {{ selectedYear }}</div>
          </UCard>

          <!-- Actual card -->
          <UCard>
            <div class="flex items-center gap-3 mb-4">
              <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-orange-500 dark:text-orange-400 flex-shrink-0" />
              <span class="text-base font-semibold text-gray-900 dark:text-white">Total Actual</span>
            </div>
            <div class="text-2xl font-bold text-orange-500 dark:text-orange-400 tabular-nums">{{ formatCurrency(grandActual, 0) }}</div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">real charges billed to date across all departments</div>
          </UCard>

          <!-- Variance card -->
          <UCard>
            <div class="flex items-center gap-3 mb-4">
              <UIcon
                :name="grandVariance > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'"
                class="w-5 h-5 flex-shrink-0"
                :class="grandVariance > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'"
              />
              <span class="text-base font-semibold text-gray-900 dark:text-white">YTD Variance</span>
            </div>
            <div class="text-2xl font-bold tabular-nums" :class="grandVariance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
              {{ grandVariance > 0 ? '+' : '' }}{{ formatCurrency(grandVariance, 0) }}
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ grandVariance > 0 ? 'over plan — actual exceeds budget' : 'under plan — spending below budget' }}</div>
          </UCard>
        </div>

        <!-- Overview secondary metrics -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <!-- Burn rate -->
          <UCard>
            <div class="flex items-center gap-3 mb-3">
              <UIcon name="i-heroicons-fire" class="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
              <span class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Monthly Burn Rate</span>
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{{ formatCurrency(grandBurnRate, 0) }}</div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">average actual spend per month so far this year</div>
          </UCard>

          <!-- Forecast to year-end -->
          <UCard>
            <div class="flex items-center gap-3 mb-3">
              <UIcon name="i-heroicons-flag" class="w-5 h-5 flex-shrink-0"
                :class="grandForecast > grandBudget ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'"
              />
              <span class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Forecast to Year-End</span>
            </div>
            <div class="text-2xl font-bold tabular-nums"
              :class="grandForecast > grandBudget ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
            >{{ formatCurrency(grandForecast, 0) }}</div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">projected year-end total based on current burn rate · {{ grandForecast > grandBudget ? '+' : '' }}{{ formatCurrency(grandForecast - grandBudget, 0) }} vs full-year plan</div>
          </UCard>

        </div>

        <!-- Overview charts: side-by-side -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Actual Spend by Department</h2>
                <UBadge color="gray" variant="soft" size="sm">{{ selectedYear }}</UBadge>
              </div>
            </template>
            <VChart :option="overviewChartOption" class="h-64" autoresize />
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Cumulative YTD Spend by Department</h2>
                <UBadge color="gray" variant="soft" size="sm">{{ selectedYear }}</UBadge>
              </div>
            </template>
            <VChart :option="overviewYtdChartOption" class="h-64" autoresize />
          </UCard>
        </div>

        <!-- Department summary table with sparklines -->
        <UCard>
          <template #header>
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">Department Summary</h2>
          </template>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead>
                <tr class="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th class="px-4 py-3">Department</th>
                  <th class="px-4 py-3">Trend</th>
                  <th class="px-4 py-3 text-right">YTD Plan</th>
                  <th class="px-4 py-3 text-right">YTD Actual</th>
                  <th class="px-4 py-3 text-right">YTD Variance</th>
                  <th class="px-4 py-3 w-6"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr
                  v-for="d in departments"
                  :key="d.department"
                  class="text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                  @click="activeTab = departments.indexOf(d) + 1"
                >
                  <td class="px-4 py-3 font-medium">{{ d.department }}</td>
                  <td class="px-4 py-3">
                    <VChart :option="sparklineOption(d)" class="h-8 w-24" autoresize />
                  </td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ formatCurrency(d.budgetTotal, 0) }}</td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ formatCurrency(d.actualTotal, 0) }}</td>
                  <td
                    class="px-4 py-3 text-right font-medium tabular-nums"
                    :class="d.variance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                  >
                    {{ d.variance > 0 ? '+' : '' }}{{ formatCurrency(d.variance, 0) }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </template>

      <!-- ── DEPARTMENT TAB ── -->
      <template v-else>
        <div v-if="activeDept">
          <!-- Department summary — At a Glance -->
          <div class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">At a Glance</div>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
            <!-- Plan card -->
            <UCard class="md:col-span-1">
              <div class="flex items-center gap-3 mb-3">
                <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                <span class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">YTD Plan</span>
              </div>
              <div class="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {{ formatCurrency(Object.values(resolvedMonthlyPlan).reduce((s, v) => s + v, 0) || activeDept.budgetTotal, 0) }}
              </div>
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">total budgeted spend for this department in {{ selectedYear }}</div>
            </UCard>

            <!-- Actual card -->
            <UCard class="md:col-span-1">
              <div class="flex items-center gap-3 mb-3">
                <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-orange-500 dark:text-orange-400 flex-shrink-0" />
                <span class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">YTD Actual</span>
              </div>
              <div class="text-2xl font-bold text-orange-500 dark:text-orange-400 tabular-nums">
                {{ formatCurrency(activeDept.actualTotal, 0) }}
              </div>
              <div class="flex items-center gap-1 mt-1">
                <UIcon
                  :name="deptMoMChange && deptMoMChange.change > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'"
                  class="w-3 h-3 flex-shrink-0"
                  :class="deptMoMChange && deptMoMChange.change > 0 ? 'text-red-400' : 'text-emerald-400'"
                  v-if="deptMoMChange"
                />
                <span class="text-xs text-gray-400 dark:text-gray-500">
                  {{ deptMoMChange ? (deptMoMChange.change > 0 ? '+' : '') + deptMoMChange.pct.toFixed(1) + '% vs last month' : 'real charges billed to this department to date' }}
                </span>
              </div>
            </UCard>

            <!-- Biggest swing card -->
            <UCard class="md:col-span-2">
              <div class="flex items-center gap-3 mb-3">
                <UIcon name="i-heroicons-bolt"
                  class="w-5 h-5 flex-shrink-0"
                  :class="biggestVarianceAccount && biggestVarianceAccount.variance > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'"
                />
                <span class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Highest Monthly Variance</span>
              </div>
              <template v-if="biggestVarianceAccount">
                <div class="text-2xl font-bold tabular-nums mb-1"
                  :class="biggestVarianceAccount.variance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                >
                  {{ biggestVarianceAccount.variance > 0 ? '+' : '' }}{{ formatCurrency(biggestVarianceAccount.variance, 0) }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate" :title="biggestVarianceAccount.name">{{ biggestVarianceAccount.name }}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500">{{ biggestVarianceAccount.category !== biggestVarianceAccount.name ? biggestVarianceAccount.category + ' · ' : '' }}{{ formatMonth(biggestVarianceAccount.month) }}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">largest single-month spend jump or drop across all accounts</div>
              </template>
              <div v-else class="text-sm text-gray-400 dark:text-gray-500">—</div>
            </UCard>
          </div>

          <!-- Department secondary metrics — Detail Metrics -->
          <div class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Detail Metrics</div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <!-- Plan attainment -->
            <UCard>
              <div class="flex items-center gap-3 mb-3">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5 flex-shrink-0"
                  :class="deptPlanAttainment !== null && deptPlanAttainment > 100 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'"
                />
                <span class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Plan Attainment</span>
              </div>
              <div class="text-2xl font-bold tabular-nums mb-1"
                :class="deptPlanAttainment !== null && deptPlanAttainment > 100 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
              >{{ deptPlanAttainment !== null ? deptPlanAttainment.toFixed(1) + '%' : '—' }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500">YTD actual as % of plan</div>
            </UCard>

            <!-- Top cost driver -->
            <UCard>
              <div class="flex items-center gap-3 mb-3">
                <UIcon name="i-heroicons-arrow-up-circle" class="w-5 h-5 text-purple-500 dark:text-purple-400 flex-shrink-0" />
                <span class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Top Cost Driver</span>
              </div>
              <template v-if="deptTopCostDriver">
                <div class="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{{ formatCurrency(deptTopCostDriver.actual, 0) }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate mt-1" :title="deptTopCostDriver.name">{{ deptTopCostDriver.name }}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">highest spend account this year</div>
              </template>
              <div v-else class="text-2xl font-bold text-gray-300 dark:text-gray-600">—</div>
            </UCard>

            <!-- Plan overruns — month dot grid -->
            <UCard>
              <div class="flex items-center gap-3 mb-3">
                <UIcon name="i-heroicons-calendar" class="w-5 h-5 flex-shrink-0"
                  :class="deptMonthsOverPlan > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'"
                />
                <span class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Plan Overruns</span>
              </div>
              <div class="text-2xl font-bold tabular-nums mb-2"
                :class="deptMonthsOverPlan > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
              >{{ deptMonthsOverPlan }} <span class="text-sm font-normal text-gray-400 dark:text-gray-500">/ {{ deptMonthsWithData.length }}</span></div>
              <!-- Month dot grid — fixed 12-column row, one dot per month -->
              <div class="grid grid-cols-12 gap-0.5 mb-1">
                <div
                  v-for="m in activeDept.monthly"
                  :key="m.month"
                  class="w-5 h-5 rounded-sm flex items-center justify-center"
                  :class="m.actual === 0
                    ? 'bg-gray-100 dark:bg-gray-700'
                    : m.actual > (resolvedMonthlyPlan[m.month] ?? m.budget)
                      ? 'bg-red-100 dark:bg-red-900/40'
                      : 'bg-emerald-100 dark:bg-emerald-900/40'"
                  :title="formatMonthShort(m.month) + ': ' + (m.actual === 0 ? 'no data' : m.actual > (resolvedMonthlyPlan[m.month] ?? m.budget) ? 'over plan' : 'under plan')"
                >
                  <span class="text-[9px] font-semibold leading-none"
                    :class="m.actual === 0
                      ? 'text-gray-300 dark:text-gray-600'
                      : m.actual > (resolvedMonthlyPlan[m.month] ?? m.budget)
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-emerald-500 dark:text-emerald-400'"
                  >{{ formatMonthShort(m.month).charAt(0) }}</span>
                </div>
              </div>
              <div class="text-xs text-gray-400 dark:text-gray-500">months where actual spend exceeded the plan</div>
            </UCard>

            <!-- Forecast to year-end -->
            <UCard>
              <div class="flex items-center gap-3 mb-3">
                <UIcon name="i-heroicons-flag" class="w-5 h-5 flex-shrink-0"
                  :class="deptForecast > deptFullYearPlan ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'"
                />
                <span class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Forecast to Year-End</span>
              </div>
              <div class="text-2xl font-bold tabular-nums"
                :class="deptForecast > deptFullYearPlan ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
              >{{ formatCurrency(deptForecast, 0) }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">projected year-end total based on current burn rate · {{ deptForecast > deptFullYearPlan ? '+' : '' }}{{ formatCurrency(deptForecast - deptFullYearPlan, 0) }} vs full-year plan</div>
            </UCard>
          </div>

          <!-- Charts: side-by-side -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <!-- Monthly bar chart -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Plan vs Actual by Month</h2>
                  <div class="flex items-center gap-2">
                    <template v-if="editingPlan">
                      <UButton color="green" variant="soft" size="xs" icon="i-heroicons-check" :loading="planOverridesLoading" @click="savePlan">Save</UButton>
                      <UButton color="gray" variant="ghost" size="xs" @click="cancelEditPlan">Cancel</UButton>
                    </template>
                    <template v-else>
                      <UButton color="blue" variant="soft" size="xs" icon="i-heroicons-pencil-square" @click="startEditPlan">Edit Plan</UButton>
                      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-down-tray" size="xs" @click="exportCSV">Export CSV</UButton>
                    </template>
                  </div>
                </div>
              </template>

              <VChart :option="deptBarChartOption" class="h-64" autoresize @click="onBarClick" />

              <!-- Month drill-down -->
              <div v-if="selectedMonth" class="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{{ formatMonth(selectedMonth) }} — Cost by Category</span>
                  <button class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="selectedMonth = null">✕ Close</button>
                </div>
                <div class="space-y-3">
                  <div v-for="row in monthDrillDown" :key="row.name">
                    <!-- Category row -->
                    <div class="flex items-center gap-3">
                      <div class="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-orange-400" />
                      <span class="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-1 truncate">{{ row.name }}</span>
                      <span class="text-sm tabular-nums font-medium text-gray-900 dark:text-white">{{ formatCurrency(row.actual, 0) }}</span>
                      <div class="w-24 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
                        <div class="h-full bg-orange-400 rounded-full" :style="{ width: row.pct + '%' }" />
                      </div>
                      <span class="text-xs text-gray-400 w-8 text-right flex-shrink-0">{{ row.pct }}%</span>
                    </div>
                    <!-- Account rows -->
                    <div v-if="row.accounts.length" class="ml-4 mt-1 space-y-1 border-l border-gray-100 dark:border-gray-700 pl-3">
                      <div v-for="acct in row.accounts" :key="acct.accountId" class="flex items-center gap-3">
                        <span class="font-mono text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{{ acct.accountId }}</span>
                        <span class="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{{ acct.name }}</span>
                        <span class="text-xs tabular-nums text-gray-700 dark:text-gray-300 flex-shrink-0">{{ formatCurrency(acct.actual, 0) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Plan input row -->
              <div v-if="editingPlan" class="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                <div v-if="planSaveError" class="mb-2 text-xs text-red-500 dark:text-red-400">{{ planSaveError }}</div>
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Monthly Plan Values</div>
                <div class="overflow-x-auto">
                  <div class="flex gap-2 min-w-max">
                    <div v-for="m in activeDept.monthly" :key="m.month" class="flex flex-col gap-1 w-24">
                      <label class="text-xs text-gray-400 text-center whitespace-nowrap">{{ formatMonth(m.month) }}</label>
                      <input
                        v-model="planDraft[m.month]"
                        type="number"
                        min="0"
                        class="w-full text-xs text-center border border-gray-200 dark:border-gray-600 rounded px-1 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Cumulative YTD chart -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Cumulative YTD Plan vs Actual</h2>
                  <div class="flex items-center gap-2">
                    <template v-if="editingPlan">
                      <UButton color="green" variant="soft" size="xs" icon="i-heroicons-check" :loading="planOverridesLoading" @click="savePlan">Save</UButton>
                      <UButton color="gray" variant="ghost" size="xs" @click="cancelEditPlan">Cancel</UButton>
                    </template>
                    <template v-else>
                      <UButton color="blue" variant="soft" size="xs" icon="i-heroicons-pencil-square" @click="startEditPlan">Edit Plan</UButton>
                    </template>
                  </div>
                </div>
              </template>
              <VChart :option="deptYtdChartOption" class="h-64" autoresize />
              <!-- Plan input row -->
              <div v-if="editingPlan" class="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                <div v-if="planSaveError" class="mb-2 text-xs text-red-500 dark:text-red-400">{{ planSaveError }}</div>
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Monthly Plan Values</div>
                <div class="overflow-x-auto">
                  <div class="flex gap-2 min-w-max">
                    <div v-for="m in activeDept.monthly" :key="m.month" class="flex flex-col gap-1 w-24">
                      <label class="text-xs text-gray-400 text-center whitespace-nowrap">{{ formatMonth(m.month) }}</label>
                      <input
                        v-model="planDraft[m.month]"
                        type="number"
                        min="0"
                        class="w-full text-xs text-center border border-gray-200 dark:border-gray-600 rounded px-1 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Category breakdown: compact list rows -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white">Cost Breakdown</h2>
                <span class="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                  <span class="text-orange-500 dark:text-orange-400 font-medium">{{ formatCurrency(activeDept.actualTotal, 0) }}</span>
                  <span class="mx-1">of</span>
                  <span class="text-blue-600 dark:text-blue-400 font-medium">{{ formatCurrency(activeDept.budgetTotal, 0) }}</span>
                  <span class="ml-1">plan</span>
                </span>
              </div>
            </template>
            <div class="divide-y divide-gray-100 dark:divide-gray-700/60">
              <div v-for="cat in activeDept.categories" :key="cat.name" class="py-4">
                <!-- Category header -->
                <div class="flex items-start gap-3">
                  <div class="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5"
                    :class="cat.ytdActual > cat.ytdBudget && cat.ytdBudget > 0 ? 'bg-red-400' : 'bg-emerald-400'"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold text-sm text-gray-900 dark:text-white">{{ cat.name }}</div>
                    <div v-if="cat.note" class="text-xs text-gray-400 italic mt-0.5">{{ cat.note }}</div>
                    <!-- Stats row -->
                    <div class="mt-2 text-sm">
                      <span class="text-xs text-gray-500 dark:text-gray-400 mr-1">Actual</span>
                      <span class="font-semibold text-orange-500 dark:text-orange-400 tabular-nums">{{ formatCurrency(cat.ytdActual, 0) }}</span>
                    </div>
                    <!-- Account list toggle -->
                    <div v-if="cat.accounts?.length" class="mt-3">
                      <button
                        class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 select-none transition-colors"
                        @click.stop="toggleAccountList(activeDept.department + ':' + cat.name)"
                      >
                        <UIcon
                          :name="expandedAccountLists.has(activeDept.department + ':' + cat.name) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                          class="w-3 h-3 flex-shrink-0"
                        />
                        {{ cat.accounts.length }} account{{ cat.accounts.length === 1 ? '' : 's' }}
                      </button>
                      <div v-if="expandedAccountLists.has(activeDept.department + ':' + cat.name)" class="mt-1 space-y-0.5">
                        <div v-for="acct in cat.accounts" :key="acct.accountId">
                          <button
                            class="w-full flex items-center gap-2 py-1.5 px-2 ml-4 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                            @click="toggleAccount(activeDept.department + ':' + cat.name + ':' + acct.accountId)"
                          >
                            <UIcon
                              :name="expandedAccounts.has(activeDept.department + ':' + cat.name + ':' + acct.accountId) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                              class="w-3 h-3 text-gray-400 flex-shrink-0"
                            />
                            <span class="font-mono text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{{ acct.accountId }}</span>
                            <span class="text-gray-700 dark:text-gray-300 truncate flex-1 text-left">{{ acct.name }}</span>
                            <span class="text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0">{{ formatCurrency(acct.ytdActual, 0) }}</span>
                          </button>
                          <div
                            v-if="expandedAccounts.has(activeDept.department + ':' + cat.name + ':' + acct.accountId)"
                            class="ml-10 mt-1 mb-2 overflow-x-auto"
                          >
                            <table class="text-xs text-gray-500 dark:text-gray-400">
                              <thead>
                                <tr>
                                  <th
                                    v-for="m in Object.keys(acct.monthlyActuals).sort()"
                                    :key="m"
                                    class="px-2 py-0.5 text-right font-normal whitespace-nowrap"
                                  >{{ formatMonth(m) }}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td
                                    v-for="m in Object.keys(acct.monthlyActuals).sort()"
                                    :key="m"
                                    class="px-2 py-0.5 text-right tabular-nums whitespace-nowrap"
                                    :class="(acct.monthlyActuals[m] || 0) > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'"
                                  >{{ formatCurrency(acct.monthlyActuals[m] || 0, 0) }}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </template>
    </template>

    <!-- Empty -->
    <div v-else-if="!pending" class="text-center py-24 text-gray-500 dark:text-gray-400">
      No data available for {{ selectedYear }}.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { formatCurrency } from '~/utils/formatters'

echarts.use([BarChart, LineChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer])

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'costs.budget_vs_actual',
  title: 'Financial Metrics',
  description: 'Plan vs actual spend for finance-tracked departments'
})

interface MonthlyPoint { month: string; budget: number; actual: number }
interface AccountRow { accountId: string; name: string; ytdBudget: number; ytdActual: number; ytdVariance: number; monthlyActuals: Record<string, number> }
interface CategoryRow { name: string; ytdBudget: number; ytdActual: number; ytdVariance: number; note?: string; accounts: AccountRow[] }
interface DepartmentResult {
  department: string
  budgetTotal: number
  actualTotal: number
  variance: number
  variancePercent: number
  monthly: MonthlyPoint[]
  categories: CategoryRow[]
}

const currentYear = new Date().getFullYear()
const selectedYear = ref<number>(currentYear)
const yearOptions = [currentYear, currentYear - 1, currentYear - 2]

const activeTab = ref(0)
const expandedAccountLists = ref(new Set<string>())
const expandedAccounts = ref(new Set<string>())
const selectedMonth = ref<string | null>(null)

function toggleAccount(key: string) {
  if (expandedAccounts.value.has(key)) {
    expandedAccounts.value.delete(key)
  } else {
    expandedAccounts.value.add(key)
  }
}

// ── Manual plan overrides — stored in DynamoDB via API ──
const planOverrides = ref<Record<string, Record<string, number>>>({})
const planOverridesLoading = ref(false)
const planSaveError = ref<string | null>(null)
const editingPlan = ref(false)
const planDraft = ref<Record<string, string>>({})

async function loadPlanOverrides(dept: string, year: number) {
  if (planOverrides.value[dept] !== undefined) return
  try {
    const res = await $fetch<{ data: { monthlyValues: Record<string, number> } }>(
      `/api/costs/financial-plan-overrides?department=${dept}&year=${year}`
    )
    planOverrides.value = { ...planOverrides.value, [dept]: res?.data?.monthlyValues || {} }
  } catch {
    planOverrides.value = { ...planOverrides.value, [dept]: {} }
  }
}

// Reload overrides when year changes
watch(selectedYear, () => { planOverrides.value = {} })

function startEditPlan() {
  const dept = activeDept.value
  if (!dept) return
  const overrides = planOverrides.value[dept.department] || {}
  const draft: Record<string, string> = {}
  for (const m of dept.monthly) {
    const val = overrides[m.month] ?? m.budget
    draft[m.month] = String(Math.round(val))
  }
  planDraft.value = draft
  editingPlan.value = true
}

async function savePlan() {
  const dept = activeDept.value
  if (!dept) return
  planOverridesLoading.value = true
  planSaveError.value = null
  const overrides: Record<string, number> = {}
  for (const [month, raw] of Object.entries(planDraft.value)) {
    const n = parseFloat(String(raw).replace(/[^0-9.-]/g, ''))
    overrides[month] = isNaN(n) ? 0 : n
  }
  try {
    await $fetch('/api/costs/financial-plan-overrides', {
      method: 'PUT',
      body: { department: dept.department, year: selectedYear.value, monthlyValues: overrides }
    })
    planOverrides.value = { ...planOverrides.value, [dept.department]: overrides }
    editingPlan.value = false
  } catch (err: any) {
    planSaveError.value = err?.data?.message || err?.message || 'Failed to save plan values.'
  } finally {
    planOverridesLoading.value = false
  }
}

function cancelEditPlan() {
  editingPlan.value = false
  planDraft.value = {}
  planSaveError.value = null
}

// Resolved monthly plan values for the active dept (overrides take precedence)
const resolvedMonthlyPlan = computed<Record<string, number>>(() => {
  const dept = activeDept.value
  if (!dept) return {}
  const overrides = planOverrides.value[dept.department] || {}
  const result: Record<string, number> = {}
  for (const m of dept.monthly) {
    result[m.month] = overrides[m.month] ?? m.budget
  }
  return result
})

function toggleAccountList(key: string) {
  if (expandedAccountLists.value.has(key)) {
    expandedAccountLists.value.delete(key)
  } else {
    expandedAccountLists.value.add(key)
  }
}

function onBarClick(params: any) {
  const dept = activeDept.value
  if (!dept) return
  // params.dataIndex maps to dept.monthly index
  const month = dept.monthly[params.dataIndex]?.month
  if (!month) return
  selectedMonth.value = selectedMonth.value === month ? null : month
}

// Per-category + per-account actual spend for the selected month
const monthDrillDown = computed(() => {
  const dept = activeDept.value
  const month = selectedMonth.value
  if (!dept || !month) return []
  const rows = dept.categories.map(cat => {
    const accounts = cat.accounts
      .map(acct => ({ accountId: acct.accountId, name: acct.name, actual: acct.monthlyActuals[month] || 0 }))
      .filter(a => a.actual > 0)
      .sort((a, b) => b.actual - a.actual)
    const actual = accounts.reduce((s, a) => s + a.actual, 0)
    return { name: cat.name, actual, accounts }
  }).filter(r => r.actual > 0).sort((a, b) => b.actual - a.actual)
  const total = rows.reduce((s, r) => s + r.actual, 0)
  return rows.map(r => ({ ...r, pct: total > 0 ? Math.round((r.actual / total) * 100) : 0 }))
})

const query = computed(() => ({ year: String(selectedYear.value) }))

const { data, pending, error, refresh } = await useFetch('/api/costs/budget-vs-actual', {
  query,
  watch: [selectedYear]
})

const departments = computed<DepartmentResult[]>(() => (data.value as any)?.data?.departments || [])
const months = computed<string[]>(() => (data.value as any)?.data?.months || [])

const tabs = computed(() => ['Overview', ...departments.value.map(d => d.department)])

const activeDept = computed<DepartmentResult | null>(() => {
  if (activeTab.value === 0) return null
  return departments.value[activeTab.value - 1] ?? null
})

// Load overrides for the active dept whenever it changes (client-side only)
if (import.meta.client) {
  watch(activeDept, async (dept) => {
    selectedMonth.value = null
    if (dept) await loadPlanOverrides(dept.department, selectedYear.value)
  }, { immediate: true })
}

const grandBudget = computed(() => departments.value.reduce((s, d) => s + d.budgetTotal, 0))
const grandActual = computed(() => departments.value.reduce((s, d) => s + d.actualTotal, 0))
const grandVariance = computed(() => grandActual.value - grandBudget.value)
const grandVariancePct = computed(() => grandBudget.value > 0 ? (grandVariance.value / grandBudget.value) * 100 : 0)

// ── Overview metrics ──

// Months with actual data across all depts combined
const grandMonthsWithData = computed(() => {
  const monthTotals = new Map<string, number>()
  for (const d of departments.value) {
    for (const m of d.monthly) {
      if (m.actual > 0) monthTotals.set(m.month, (monthTotals.get(m.month) || 0) + m.actual)
    }
  }
  return [...monthTotals.entries()].sort(([a], [b]) => a.localeCompare(b))
})

// Burn rate: average monthly actual across months that have data
const grandBurnRate = computed(() => {
  const months = grandMonthsWithData.value
  if (!months.length) return 0
  return grandActual.value / months.length
})

// Forecast: YTD actual + burn rate × remaining months in year
const grandForecast = computed(() => {
  const months = grandMonthsWithData.value
  if (!months.length) return 0
  const lastMonth = months[months.length - 1][0]
  const lastMonthNum = parseInt(lastMonth.split('-')[1])
  const remaining = 12 - lastMonthNum
  return grandActual.value + grandBurnRate.value * remaining
})

// ── Department metrics ──

// Months with actual data for active dept
const deptMonthsWithData = computed(() => {
  const dept = activeDept.value
  if (!dept) return []
  return dept.monthly.filter(m => m.actual > 0)
})

// Burn rate for active dept
const deptBurnRate = computed(() => {
  const months = deptMonthsWithData.value
  if (!months.length) return 0
  return activeDept.value!.actualTotal / months.length
})

// Forecast to year-end for active dept
const deptForecast = computed(() => {
  const dept = activeDept.value
  if (!dept || !deptMonthsWithData.value.length) return 0
  const lastMonth = deptMonthsWithData.value[deptMonthsWithData.value.length - 1].month
  const lastMonthNum = parseInt(lastMonth.split('-')[1])
  const remaining = 12 - lastMonthNum
  return dept.actualTotal + deptBurnRate.value * remaining
})

// Plan attainment: YTD actual as % of YTD plan (months with data only)
const deptPlanAttainment = computed(() => {
  const dept = activeDept.value
  if (!dept) return null
  const dataMonths = deptMonthsWithData.value.map(m => m.month)
  if (!dataMonths.length) return null
  const ytdPlan = dataMonths.reduce((s, m) => s + (resolvedMonthlyPlan.value[m] ?? 0), 0)
  if (ytdPlan === 0) return null
  return (dept.actualTotal / ytdPlan) * 100
})

// Month-over-month change: last two months with data
const deptMoMChange = computed(() => {
  const months = deptMonthsWithData.value
  if (months.length < 2) return null
  const curr = months[months.length - 1]
  const prev = months[months.length - 2]
  const change = curr.actual - prev.actual
  const pct = prev.actual > 0 ? (change / prev.actual) * 100 : 0
  return { change, pct, currMonth: curr.month, prevMonth: prev.month }
})

// Top cost driver: account with highest YTD actual in active dept
const deptTopCostDriver = computed(() => {
  const dept = activeDept.value
  if (!dept) return null
  let top: { name: string; accountId: string; category: string; actual: number } | null = null
  for (const cat of dept.categories) {
    for (const acct of cat.accounts) {
      if (!top || acct.ytdActual > top.actual) {
        top = { name: acct.name, accountId: acct.accountId, category: cat.name, actual: acct.ytdActual }
      }
    }
  }
  return top
})

// Full-year plan total for active dept (overrides take precedence over API budget)
const deptFullYearPlan = computed(() => {
  const dept = activeDept.value
  if (!dept) return 0
  const total = Object.values(resolvedMonthlyPlan.value).reduce((s, v) => s + v, 0)
  return total || dept.budgetTotal
})

// Months over plan: count of months where actual > plan
const deptMonthsOverPlan = computed(() => {
  const dept = activeDept.value
  if (!dept) return 0
  return dept.monthly.filter(m => m.actual > 0 && m.actual > (resolvedMonthlyPlan.value[m.month] ?? m.budget)).length
})

const ytdLabel = computed(() => {
  let last = ''
  for (const d of departments.value) {
    for (const m of d.monthly) {
      if (m.actual > 0 && m.month > last) last = m.month
    }
  }
  return last ? formatMonth(last) : String(selectedYear.value)
})

const errorMessage = computed(() => {
  const e: any = error.value
  return e?.data?.message || e?.message || 'An unexpected error occurred.'
})

function formatMonth(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${monthNames[m - 1]} ${y}`
}

function formatMonthShort(isoDate: string): string {
  const m = parseInt(isoDate.split('-')[1])
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return monthNames[m - 1]
}

// Synthetic account IDs that should not appear in variance ranking
// (payer/rollup accounts already rolled into category-level values)
const SYNTHETIC_ACCOUNT_IDS = new Set(['205950196477', '266632029214'])

// Biggest month-to-month variance account for the active department
const biggestVarianceAccount = computed(() => {
  const dept = activeDept.value
  if (!dept) return null
  let topAccount: { name: string; accountId: string; category: string; month: string; variance: number } | null = null
  let topAbs = 0
  for (const cat of dept.categories || []) {
    for (const acct of cat.accounts || []) {
      if (SYNTHETIC_ACCOUNT_IDS.has(acct.accountId)) continue
      const months = Object.keys(acct.monthlyActuals).sort()
      for (let i = 1; i < months.length; i++) {
        const prev = acct.monthlyActuals[months[i - 1]] || 0
        const curr = acct.monthlyActuals[months[i]] || 0
        if (prev === 0 && curr === 0) continue
        const variance = curr - prev
        if (Math.abs(variance) > topAbs) {
          topAbs = Math.abs(variance)
          topAccount = { name: acct.name, accountId: acct.accountId, category: cat.name, month: months[i], variance }
        }
      }
    }
  }
  return topAccount
})

// Colour palette
const DEPT_COLORS: Record<string, string> = {
  DE158: '#6366f1',
  DT509: '#f28e2b',
}
const PLAN_COLOR = '#94a3b8'

// Overview: one smooth line per department, actuals only
const overviewChartOption = computed(() => {
  const monthSet = new Set<string>()
  for (const d of departments.value) d.monthly.forEach(m => monthSet.add(m.month))
  const allMonths = [...monthSet].sort()
  const labels = allMonths.map(formatMonthShort)

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const idx = params[0]?.dataIndex ?? 0
        const label = allMonths[idx] ? formatMonth(allMonths[idx]) : (params[0]?.axisValue || '')
        let html = `<div style="font-weight:600;margin-bottom:6px">${label}</div>`
        for (const p of params) {
          if (p.value == null) continue
          html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
            <span style="color:#94a3b8">${p.seriesName}</span>
            <span style="margin-left:auto;padding-left:24px;font-weight:600">${formatCurrency(p.value, 0)}</span>
          </div>`
        }
        return html
      }
    },
    legend: {
      data: departments.value.map(d => d.department),
      top: 0,
      textStyle: { color: '#94a3b8', fontSize: 11 }
    },
    grid: { left: '1%', right: '2%', bottom: '3%', top: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatCurrency(v, { compact: true }), color: '#94a3b8', fontSize: 10 },
      splitLine: { show: false }
    },
    series: departments.value.map(d => {
      const color = DEPT_COLORS[d.department] || '#64748b'
      const monthlyMap = new Map(d.monthly.map(m => [m.month, m.actual]))
      const lastIdx = (() => {
        for (let i = allMonths.length - 1; i >= 0; i--) {
          if ((monthlyMap.get(allMonths[i]) || 0) > 0) return i
        }
        return -1
      })()
      return {
        name: d.department,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color, width: 2.5 },
        itemStyle: { color },
        areaStyle: { color, opacity: 0.06 },
        connectNulls: false,
        data: allMonths.map((m, i) => i <= lastIdx ? Math.round(monthlyMap.get(m) || 0) : null)
      }
    })
  }
})

// Sparkline for department summary table rows
function sparklineOption(d: DepartmentResult) {
  const color = DEPT_COLORS[d.department] || '#64748b'
  const values = d.monthly.map(m => Math.round(m.actual))
  return {
    animation: false,
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, data: d.monthly.map(m => m.month) },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { color, width: 1.5 },
      areaStyle: { color, opacity: 0.08 },
      data: values
    }]
  }
}

// Department: grouped bar chart (Plan vs Actual per month)
const deptBarChartOption = computed(() => {
  if (!activeDept.value) return {}
  const monthly = activeDept.value.monthly
  const labels = monthly.map(m => formatMonthShort(m.month))

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const label = params[0]?.axisValue || ''
        const plan = params.find((p: any) => p.seriesName === 'Plan')?.value ?? 0
        const actual = params.find((p: any) => p.seriesName === 'Actual')?.value ?? 0
        const variance = actual - plan
        const vColor = variance > 0 ? '#f87171' : '#34d399'
        const vSign = variance > 0 ? '+' : ''
        return `<div style="font-weight:600;margin-bottom:4px">${label}</div>
          <div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#4e79a7"></span><span style="color:#94a3b8">Plan</span><span style="margin-left:auto;padding-left:16px;font-weight:600">${formatCurrency(plan, 0)}</span></div>
          <div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f28e2b"></span><span style="color:#94a3b8">Actual</span><span style="margin-left:auto;padding-left:16px;font-weight:600">${formatCurrency(actual, 0)}</span></div>
          <div style="border-top:1px solid #e2e8f0;margin-top:4px;padding-top:4px;color:${vColor};font-weight:600">Variance ${vSign}${formatCurrency(variance, 0)}</div>`
      }
    },
    legend: { data: ['Plan', 'Actual'], top: 0, textStyle: { color: '#94a3b8', fontSize: 11 } },
    grid: { left: '1%', right: '2%', bottom: '3%', top: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#94a3b8', fontSize: 11, interval: 0 },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { formatter: (v: number) => formatCurrency(v, { compact: true }), color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }
    },
    series: [
      { name: 'Plan',   type: 'bar', barMaxWidth: 32, itemStyle: { color: '#4e79a7', borderRadius: [3,3,0,0] }, data: monthly.map(m => Math.round(resolvedMonthlyPlan.value[m.month] ?? m.budget)) },
      { name: 'Actual', type: 'bar', barMaxWidth: 32, itemStyle: { color: '#f28e2b', borderRadius: [3,3,0,0] }, data: monthly.map(m => Math.round(m.actual)) }
    ]
  }
})

// Overview: cumulative YTD actuals per department (area lines)
const overviewYtdChartOption = computed(() => {
  const monthSet = new Set<string>()
  for (const d of departments.value) d.monthly.forEach(m => monthSet.add(m.month))
  const allMonths = [...monthSet].sort()
  const labels = allMonths.map(formatMonthShort)

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const idx = params[0]?.dataIndex ?? 0
        const label = allMonths[idx] ? formatMonth(allMonths[idx]) : (params[0]?.axisValue || '')
        let html = `<div style="font-weight:600;margin-bottom:6px">${label}</div>`
        for (const p of params) {
          if (p.value == null) continue
          html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
            <span style="color:#94a3b8">${p.seriesName}</span>
            <span style="margin-left:auto;padding-left:24px;font-weight:600">${formatCurrency(p.value, 0)}</span>
          </div>`
        }
        return html
      }
    },
    legend: { data: departments.value.map(d => d.department), top: 0, textStyle: { color: '#94a3b8', fontSize: 11 } },
    grid: { left: '1%', right: '2%', bottom: '3%', top: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatCurrency(v, { compact: true }), color: '#94a3b8', fontSize: 10 },
      splitLine: { show: false }
    },
    series: departments.value.map(d => {
      const color = DEPT_COLORS[d.department] || '#64748b'
      const monthlyMap = new Map(d.monthly.map(m => [m.month, m.actual]))
      let running = 0
      const lastIdx = (() => {
        for (let i = allMonths.length - 1; i >= 0; i--) {
          if ((monthlyMap.get(allMonths[i]) || 0) > 0) return i
        }
        return -1
      })()
      const data: (number | null)[] = []
      for (let i = 0; i < allMonths.length; i++) {
        if (i > lastIdx) { data.push(null); continue }
        running += monthlyMap.get(allMonths[i]) || 0
        data.push(Math.round(running))
      }
      return {
        name: d.department,
        type: 'bar',
        barMaxWidth: 32,
        itemStyle: { color, borderRadius: [3, 3, 0, 0] },
        data
      }
    })
  }
})

// Department: cumulative YTD area chart (Plan vs Actual)
const deptYtdChartOption = computed(() => {
  if (!activeDept.value) return {}
  const monthly = activeDept.value.monthly
  const labels = monthly.map(m => formatMonthShort(m.month))
  const color = DEPT_COLORS[activeDept.value.department] || '#6366f1'

  let runPlan = 0
  let runActual = 0
  const planData: number[] = []
  const actualData: (number | null)[] = []

  const lastActualIdx = (() => {
    for (let i = monthly.length - 1; i >= 0; i--) {
      if (monthly[i].actual > 0) return i
    }
    return -1
  })()

  for (let i = 0; i < monthly.length; i++) {
    const m = monthly[i]
    runPlan += resolvedMonthlyPlan.value[m.month] ?? m.budget
    planData.push(Math.round(runPlan))
    if (i > lastActualIdx) {
      actualData.push(null)
    } else {
      runActual += m.actual
      actualData.push(Math.round(runActual))
    }
  }

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const label = params[0]?.axisValue || ''
        const plan = params.find((p: any) => p.seriesName === 'Plan')?.value ?? 0
        const actual = params.find((p: any) => p.seriesName === 'Actual')?.value ?? 0
        const variance = actual - plan
        const vColor = variance > 0 ? '#f87171' : '#34d399'
        const vSign = variance > 0 ? '+' : ''
        return `<div style="font-weight:600;margin-bottom:4px">${label}</div>
          <div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:2px;border-top:2px dashed #94a3b8;margin-top:4px"></span><span style="color:#94a3b8">Plan</span><span style="margin-left:auto;padding-left:16px;font-weight:600">${formatCurrency(plan, 0)}</span></div>
          <div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span><span style="color:#94a3b8">Actual</span><span style="margin-left:auto;padding-left:16px;font-weight:600">${formatCurrency(actual, 0)}</span></div>
          <div style="border-top:1px solid #e2e8f0;margin-top:4px;padding-top:4px;color:${vColor};font-weight:600">Variance ${vSign}${formatCurrency(variance, 0)}</div>`
      }
    },
    legend: { data: ['Plan', 'Actual'], top: 0, textStyle: { color: '#94a3b8', fontSize: 11 } },
    grid: { left: '1%', right: '2%', bottom: '3%', top: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#94a3b8', fontSize: 11, interval: 0 },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { formatter: (v: number) => formatCurrency(v, { compact: true }), color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }
    },
    series: [
      {
        name: 'Plan',
        type: 'bar',
        barMaxWidth: 32,
        itemStyle: { color: '#4e79a7', borderRadius: [3, 3, 0, 0] },
        data: planData
      },
      {
        name: 'Actual',
        type: 'bar',
        barMaxWidth: 32,
        itemStyle: { color, borderRadius: [3, 3, 0, 0] },
        data: actualData
      }
    ]
  }
})

// Export the active department's categories + accounts to CSV
function exportCSV() {
  const dept = activeDept.value
  if (!dept) return

  const rows: string[][] = []
  const monthLabels = months.value.map(formatMonth)

  // Header
  rows.push(['Category', 'Account ID', 'Account Name', 'YTD Plan', 'YTD Actual', 'YTD Variance', ...monthLabels])

  for (const cat of dept.categories) {
    // Category summary row
    rows.push([cat.name, '', '', String(cat.ytdBudget.toFixed(2)), String(cat.ytdActual.toFixed(2)), String(cat.ytdVariance.toFixed(2)), ...months.value.map(() => '')])
    // Account rows
    for (const acct of cat.accounts || []) {
      const monthlyVals = months.value.map(m => String((acct.monthlyActuals[m] || 0).toFixed(2)))
      rows.push([cat.name, acct.accountId, acct.name, String(acct.ytdBudget.toFixed(2)), String(acct.ytdActual.toFixed(2)), String(acct.ytdVariance.toFixed(2)), ...monthlyVals])
    }
  }

  const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${dept.department}-budget-vs-actual-${selectedYear.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
