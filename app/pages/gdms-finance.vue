<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <!-- Header -->
    <div class="mb-6">
<div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <UIcon name="i-heroicons-scale" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">GDMS Finance</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        AWS IT account spend tracked by GDMS Finance.
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
        <!-- Overview charts: side-by-side -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Plan vs Actual by Department</h2>
                <div class="flex items-center gap-2">
                  <UButton
                    size="xs"
                    :color="overviewFullYear ? 'purple' : 'gray'"
                    :variant="overviewFullYear ? 'soft' : 'ghost'"
                    icon="i-heroicons-calendar"
                    @click="overviewFullYear = !overviewFullYear"
                  >Full Year</UButton>
                  <UBadge color="gray" variant="soft" size="sm">{{ selectedYear }}</UBadge>
                </div>
              </div>
            </template>
            <VChart :option="overviewChartOption" class="h-64" autoresize />
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Cumulative YTD Plan vs Actual</h2>
                <div class="flex items-center gap-2">
                  <UButton
                    size="xs"
                    :color="overviewFullYear ? 'purple' : 'gray'"
                    :variant="overviewFullYear ? 'soft' : 'ghost'"
                    icon="i-heroicons-calendar"
                    @click="overviewFullYear = !overviewFullYear"
                  >Full Year</UButton>
                  <UBadge color="gray" variant="soft" size="sm">{{ selectedYear }}</UBadge>
                </div>
              </div>
            </template>
            <VChart :option="overviewYtdChartOption" class="h-64" autoresize />
          </UCard>
        </div>

        <!-- Grand summary metrics: 2×3 grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total Plan</div>
            <div class="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">{{ formatCurrency(grandBudget, 0) }}</div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">YTD budgeted spend across all departments for {{ selectedYear }}</div>
          </UCard>
          <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total Actual</div>
            <div class="text-lg font-bold text-orange-500 dark:text-orange-400 tabular-nums">{{ formatCurrency(grandActual, 0) }}</div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">YTD real charges billed to date across all departments</div>
          </UCard>
          <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">YTD Variance</div>
            <div class="text-lg font-bold tabular-nums" :class="grandVariance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
              {{ grandVariance > 0 ? '+' : '' }}{{ formatCurrency(grandVariance, 0) }}
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ grandVariance > 0 ? 'YTD over plan — actual exceeds budget' : 'YTD under plan — spending below budget' }}</div>
          </UCard>
          <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Monthly Burn Rate</div>
            <div class="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{{ formatCurrency(grandBurnRate, 0) }}</div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">Average YTD actual spend per month across all departments</div>
          </UCard>
          <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Forecast to Year-End</div>
            <div class="text-lg font-bold tabular-nums" :class="grandForecast > grandBudget ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
              {{ formatCurrency(grandForecast, 0) }}
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ grandMonthsWithData.length }} of 12 months elapsed ({{ Math.round(grandMonthsWithData.length / 12 * 100) }}% of year)</div>
          </UCard>
          <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Projected Variance</div>
            <div class="text-lg font-bold tabular-nums" :class="grandForecast > grandBudget ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
              {{ grandForecast > grandBudget ? '+' : '' }}{{ formatCurrency(grandForecast - grandBudget, 0) }}
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">Projected year-end variance vs full-year plan</div>
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
                  <th class="px-4 py-3">Actual Spend Trend</th>
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
                  class="text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group"
                  :title="`View ${d.department} details`"
                  @click="activeTab = departments.indexOf(d) + 1"
                >
                  <td class="px-4 py-3 font-medium">{{ d.department }}</td>
                  <td class="px-4 py-3">
                    <VChart :option="sparklineOption(d)" class="h-8 w-24" autoresize />
                  </td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ formatCurrency(resolvedDeptPlan(d), 0) }}</td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ formatCurrency(deptVisibleActual(d), 0) }}</td>
                  <td
                    class="px-4 py-3 text-right font-medium tabular-nums"
                    :class="(deptVisibleActual(d) - resolvedDeptPlan(d)) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                  >
                    {{ (deptVisibleActual(d) - resolvedDeptPlan(d)) > 0 ? '+' : '' }}{{ formatCurrency(deptVisibleActual(d) - resolvedDeptPlan(d), 0) }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-300 transition-colors" />
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
          <!-- Monthly summary table (spreadsheet-style) -->
          <UCard class="mb-4">
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Monthly Plan vs Actual — {{ activeDept.department }}</h2>
                  <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Plan and actual spend by invoicing month. Cumulative actual stops at the last month with data.</p>
                </div>
                <div class="flex flex-col items-end gap-1">
                  <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-down-tray" size="xs" :loading="excelExporting" :disabled="excelExporting" @click="exportExcel">
                    {{ excelExporting ? 'Generating…' : 'Export Excel' }}
                  </UButton>
                  <span v-if="excelExportError" class="text-xs text-red-500">{{ excelExportError }}</span>
                </div>
              </div>
            </template>
            <div class="overflow-x-auto">
              <table class="w-full text-xs tabular-nums">
                <thead>
                  <tr class="border-b border-gray-200 dark:border-gray-700">
                    <th class="py-2 pr-4 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"></th>
                    <th
                      v-for="m in activeDept.monthly"
                      :key="m.month"
                      class="py-2 px-3 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                    >{{ formatMonthShort(m.month) }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
                  <tr>
                    <td class="py-2 pr-4 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">Plan By Month</td>
                    <td
                      v-for="m in activeDept.monthly"
                      :key="m.month"
                      class="py-2 px-3 text-right text-blue-600 dark:text-blue-400"
                    >{{ formatCurrency(resolvedMonthlyPlan[m.month] ?? m.budget, 0) }}</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4 font-semibold text-orange-500 dark:text-orange-400 whitespace-nowrap">Actual By Month</td>
                    <td
                      v-for="m in activeDept.monthly"
                      :key="m.month"
                      class="py-2 px-3 text-right"
                      :class="visibleActual(m) > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-gray-300 dark:text-gray-600'"
                    >{{ visibleActual(m) > 0 ? formatCurrency(visibleActual(m), 0) : '—' }}</td>
                  </tr>
                  <tr class="border-t border-gray-200 dark:border-gray-600">
                    <td class="py-2 pr-4 font-semibold text-blue-400 dark:text-blue-500 whitespace-nowrap">Plan (Cumulative)</td>
                    <td
                      v-for="(m, i) in activeDept.monthly"
                      :key="m.month"
                      class="py-2 px-3 text-right text-blue-400 dark:text-blue-500"
                    >{{ formatCurrency(activeDept.monthly.slice(0, i + 1).reduce((s, p) => s + (resolvedMonthlyPlan[p.month] ?? p.budget), 0), 0) }}</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4 font-semibold text-orange-400 dark:text-orange-500 whitespace-nowrap">Actual (Cumulative)</td>
                    <td
                      v-for="(m, i) in activeDept.monthly"
                      :key="m.month"
                      class="py-2 px-3 text-right"
                      :class="activeDept.monthly.slice(0, i + 1).every(p => visibleActual(p) > 0) ? 'text-orange-400 dark:text-orange-500' : 'text-gray-300 dark:text-gray-600'"
                    >{{ activeDept.monthly.slice(0, i + 1).every(p => visibleActual(p) > 0) ? formatCurrency(activeDept.monthly.slice(0, i + 1).reduce((s, p) => s + visibleActual(p), 0), 0) : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <!-- Charts: side-by-side -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <!-- Monthly bar chart -->
            <UCard>
              <template #header>
                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Plan vs Actual by Month</h2>
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
            </UCard>

            <!-- Cumulative YTD chart -->
            <UCard>
              <template #header>
                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Cumulative YTD Plan vs Actual</h2>
              </template>
              <VChart :option="deptYtdChartOption" class="h-64" autoresize />
            </UCard>
          </div>

          <!-- Metrics strip -->
          <div class="grid grid-cols-3 gap-3 mb-6">
            <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
              <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Forecast to Year-End</div>
              <div class="text-lg font-bold tabular-nums" :class="deptForecast > deptFullYearPlan ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">{{ formatCurrency(deptForecast, 0) }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">Full-year plan: {{ formatCurrency(deptFullYearPlan, 0) }}</div>
            </UCard>
            <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
              <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Top Cost Driver</div>
              <template v-if="deptTopCostDriver">
                <div class="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{{ formatCurrency(deptTopCostDriver.actual, 0) }}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate" :title="deptTopCostDriver.name">{{ deptTopCostDriver.name }}</div>
                <div class="text-xs text-gray-300 dark:text-gray-600 mt-1">Highest YTD actual spend across all accounts in this department</div>
              </template>
              <template v-else>
                <div class="text-lg font-bold text-gray-400 dark:text-gray-500">—</div>
              </template>
            </UCard>
            <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
              <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Highest Monthly Variance</div>
              <template v-if="biggestVarianceAccount">
                <div class="text-lg font-bold tabular-nums" :class="biggestVarianceAccount.variance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">{{ biggestVarianceAccount.variance > 0 ? '+' : '' }}{{ formatCurrency(biggestVarianceAccount.variance, 0) }}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate" :title="biggestVarianceAccount.name">{{ biggestVarianceAccount.name }} · {{ formatMonth(biggestVarianceAccount.month) }}</div>
                <div class="text-xs text-gray-300 dark:text-gray-600 mt-1">Largest YTD month-over-month swing across all accounts</div>
              </template>
              <template v-else>
                <div class="text-lg font-bold text-gray-400 dark:text-gray-500">—</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">No variance data</div>
              </template>
            </UCard>
          </div>

          <!-- Category breakdown: compact list rows -->
          <UCard>
            <template #header>
              <h2 class="text-base font-semibold text-gray-900 dark:text-white">Cost Breakdown</h2>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Individual accounts sorted by largest YTD variance</p>
            </template>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200 dark:border-gray-700">
                    <th class="py-2 pr-4 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-xs">Category</th>
                    <th class="py-2 px-4 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-xs">YTD Plan</th>
                    <th class="py-2 px-4 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-xs">YTD Actual</th>
                    <th class="py-2 px-4 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-xs">YTD Variance</th>
                    <th class="py-2 pl-4 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-xs">AI Variance Summary</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
                  <!-- Totals row -->
                  <tr class="bg-gray-50 dark:bg-gray-800/40 font-semibold">
                    <td class="py-3 pr-4 text-gray-900 dark:text-white">Total IT {{ activeDept.department }} AWS</td>
                    <td class="py-3 px-4 text-right tabular-nums text-blue-600 dark:text-blue-400">{{ formatCurrency(resolvedDeptPlan(activeDept), 0) }}</td>
                    <td class="py-3 px-4 text-right tabular-nums text-orange-500 dark:text-orange-400">{{ formatCurrency(deptVisibleActual(activeDept), 0) }}</td>
                    <td class="py-3 px-4 text-right tabular-nums"
                      :class="deptVisibleActual(activeDept) > resolvedDeptPlan(activeDept) ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                    >{{ formatCurrency(deptVisibleActual(activeDept) - resolvedDeptPlan(activeDept), 0) }}</td>
                    <td class="py-3 pl-4"></td>
                  </tr>
                  <!-- Category rows -->
                  <tr v-for="cat in activeDept.categories.filter(c => c.name !== 'Secret Cloud')" :key="cat.name">
                    <td class="py-3 pr-4">
                      <div class="flex items-center gap-2">
                        <div class="w-1 h-4 rounded-full flex-shrink-0"
                          :class="cat.ytdActual > cat.ytdBudget && cat.ytdBudget > 0 ? 'bg-red-400' : 'bg-emerald-400'"
                        />
                        <button
                          class="text-left text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          @click.stop="toggleAccountList(activeDept.department + ':' + cat.name)"
                        >
                          {{ cat.name }}
                          <UIcon
                            v-if="cat.accounts?.length"
                            :name="expandedAccountLists.has(activeDept.department + ':' + cat.name) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                            class="w-3 h-3 inline ml-1 text-gray-400"
                          />
                        </button>
                      </div>
                      <!-- Expanded accounts -->
                      <div v-if="expandedAccountLists.has(activeDept.department + ':' + cat.name) && cat.accounts?.length" class="mt-2 space-y-0.5">
                        <!-- Plan methodology note -->
                        <div v-if="cat.name === 'Enterprise Support'" class="ml-4 mb-1.5 flex items-start gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                          <UIcon name="i-heroicons-information-circle" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>Plan value is hardcoded at $56,900/month — a fixed Finance estimate proportional to overall AWS spend.</span>
                        </div>
                        <div v-else-if="cat.name === 'GDMS-DevOrg'" class="ml-4 mb-1.5 flex items-start gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                          <UIcon name="i-heroicons-information-circle" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>Plan value is hardcoded at $10,000/month — GDMS-DevOrg does not have a per-account PEP budget breakdown.</span>
                        </div>
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
                            <span v-if="acct.pepExpectedSpend !== undefined" class="text-purple-500 dark:text-purple-400 tabular-nums flex-shrink-0 text-xs">PEP {{ formatCurrency(acct.pepExpectedSpend, 0) }}</span>
                            <span class="text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0">{{ formatCurrency(acct.ytdActual, 0) }}</span>
                          </button>
                          <div
                            v-if="expandedAccounts.has(activeDept.department + ':' + cat.name + ':' + acct.accountId)"
                            class="ml-10 mt-1 mb-2 overflow-x-auto"
                          >
                            <table class="text-xs text-gray-500 dark:text-gray-400">
                              <thead>
                                <tr>
                                  <th class="px-2 py-0.5 text-left font-normal whitespace-nowrap text-gray-400 dark:text-gray-500"></th>
                                  <th
                                    v-for="m in Object.keys(acct.monthlyActuals).sort().filter(m => m <= ytdCutoff)"
                                    :key="m"
                                    class="px-2 py-0.5 text-right font-normal whitespace-nowrap"
                                  >{{ formatMonth(m) }}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td class="px-2 py-0.5 text-left whitespace-nowrap text-gray-400 dark:text-gray-500">Actual</td>
                                  <td
                                    v-for="m in Object.keys(acct.monthlyActuals).sort().filter(m => m <= ytdCutoff)"
                                    :key="m"
                                    class="px-2 py-0.5 text-right tabular-nums whitespace-nowrap"
                                    :class="visibleMonthActual(m, acct.monthlyActuals[m] || 0) > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'"
                                  >{{ formatCurrency(visibleMonthActual(m, acct.monthlyActuals[m] || 0), 0) }}</td>
                                </tr>
                                <tr v-if="acct.pepExpectedSpend !== undefined">
                                  <td class="px-2 py-0.5 text-left whitespace-nowrap text-purple-500 dark:text-purple-400">PEP Expected</td>
                                  <td
                                    v-for="m in Object.keys(acct.monthlyActuals).sort().filter(m => m <= ytdCutoff)"
                                    :key="m"
                                    class="px-2 py-0.5 text-right tabular-nums whitespace-nowrap text-purple-500 dark:text-purple-400"
                                  >{{ formatCurrency((acct.pepMonthlyExpected?.[m] ?? 0), 0) }}</td>
                                </tr>
                                <tr v-if="acct.pepExpectedSpend !== undefined">
                                  <td class="px-2 py-0.5 text-left whitespace-nowrap text-gray-400 dark:text-gray-500">Variance</td>
                                  <td
                                    v-for="m in Object.keys(acct.monthlyActuals).sort().filter(m => m <= ytdCutoff)"
                                    :key="m"
                                    class="px-2 py-0.5 text-right tabular-nums whitespace-nowrap"
                                    :class="visibleMonthActual(m, acct.monthlyActuals[m] || 0) - (acct.pepMonthlyExpected?.[m] ?? 0) > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                                  >{{ formatCurrency(visibleMonthActual(m, acct.monthlyActuals[m] || 0) - (acct.pepMonthlyExpected?.[m] ?? 0), 0) }}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-4 text-right tabular-nums text-blue-600 dark:text-blue-400">{{ formatCurrency(cat.ytdBudget, 0) }}</td>
                    <td class="py-3 px-4 text-right tabular-nums text-orange-500 dark:text-orange-400">{{ formatCurrency(cat.ytdActual, 0) }}</td>
                    <td class="py-3 px-4 text-right tabular-nums"
                      :class="cat.ytdActual > cat.ytdBudget && cat.ytdBudget > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                    >{{ formatCurrency(cat.ytdActual - cat.ytdBudget, 0) }}</td>
                    <td class="py-3 pl-4 text-xs text-gray-400 dark:text-gray-500 italic max-w-xs">
                      <span v-if="varianceInsights[activeDept.department + ':' + cat.name]?.loading" class="inline-flex items-center gap-1 text-gray-300 dark:text-gray-600">
                        <span class="animate-pulse">Analyzing…</span>
                      </span>
                      <span v-else-if="varianceInsights[activeDept.department + ':' + cat.name]?.insight">
                        {{ varianceInsights[activeDept.department + ':' + cat.name].insight }}
                      </span>
                      <span v-else class="text-gray-300 dark:text-gray-600">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
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
  title: 'GDMS Finance',
  description: 'Plan vs actual spend for finance-tracked departments'
})

interface MonthlyPoint { month: string; budget: number; actual: number }
interface AccountRow { accountId: string; name: string; ytdBudget: number; ytdActual: number; ytdVariance: number; monthlyActuals: Record<string, number>; pepExpectedSpend?: number; pepMonthlyExpected?: Record<string, number> }
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

// Current month key in CE format (YYYY-MM-01). Months after this are not yet complete
// and should not display actuals.
const now = new Date()
const ytdCutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

// July 2026 actuals are Finance-confirmed (Secret Cloud hardcoded values included).
// Show the current month rather than waiting for month-end close.
const displayCutoff = ytdCutoff

// Returns the actual for a monthly point, or 0 if the month is beyond the display cutoff.
function visibleActual(m: MonthlyPoint): number {
  return m.month <= displayCutoff ? m.actual : 0
}
// Same for a raw month key + value pair (e.g. monthlyActuals records).
function visibleMonthActual(month: string, actual: number): number {
  return month <= displayCutoff ? actual : 0
}
const yearOptions = [currentYear, currentYear - 1, currentYear - 2]

const activeTab = ref(0)
const expandedAccountLists = ref(new Set<string>())
const expandedAccounts = ref(new Set<string>())
const selectedMonth = ref<string | null>(null)

// Overview chart view toggle: false = truncated to last month with data, true = full year
const overviewFullYear = ref(false)

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

// Override-aware YTD plan total for any department — capped to displayCutoff so it matches actuals
function resolvedDeptPlan(d: DepartmentResult): number {
  const overrides = planOverrides.value[d.department] || {}
  return d.monthly.reduce((s, m) => m.month <= displayCutoff ? s + (overrides[m.month] ?? m.budget) : s, 0)
}

// Visible actual total for a department — sums only months at or before ytdCutoff
function deptVisibleActual(d: DepartmentResult): number {
  return d.monthly.reduce((s, m) => s + visibleActual(m), 0)
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
      .map(acct => ({ accountId: acct.accountId, name: acct.name, actual: visibleMonthActual(month, acct.monthlyActuals[month] || 0) }))
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

// Load overrides for the active dept whenever it changes (client-side only).
// Also pre-load all depts so the overview table has accurate override-aware plan/variance.
if (import.meta.client) {
  watch(activeDept, async (dept) => {
    selectedMonth.value = null
    if (dept) await loadPlanOverrides(dept.department, selectedYear.value)
  }, { immediate: true })

  watch([departments, selectedYear], async ([depts]) => {
    await Promise.all(depts.map(d => loadPlanOverrides(d.department, selectedYear.value)))
  }, { immediate: true })
}

const grandBudget = computed(() => departments.value.reduce((s, d) => s + resolvedDeptPlan(d), 0))
const grandActual = computed(() => departments.value.reduce((s, d) => s + d.monthly.reduce((ms, m) => ms + visibleActual(m), 0), 0))
const grandVariance = computed(() => grandActual.value - grandBudget.value)
const grandVariancePct = computed(() => grandBudget.value > 0 ? (grandVariance.value / grandBudget.value) * 100 : 0)

// ── Overview metrics ──

// Months with actual data across all depts combined (capped to ytdCutoff)
const grandMonthsWithData = computed(() => {
  const monthTotals = new Map<string, number>()
  for (const d of departments.value) {
    for (const m of d.monthly) {
      if (visibleActual(m) > 0) monthTotals.set(m.month, (monthTotals.get(m.month) || 0) + visibleActual(m))
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

// Last month key (YYYY-MM-01) that has any visible actual data across all departments
const overviewLastDataMonth = computed(() => {
  let last = ''
  for (const d of departments.value) {
    for (const m of d.monthly) {
      if (visibleActual(m) > 0 && m.month > last) last = m.month
    }
  }
  return last
})

// ── Department metrics ──

// Months with actual data for active dept (capped to ytdCutoff)
const deptMonthsWithData = computed(() => {
  const dept = activeDept.value
  if (!dept) return []
  return dept.monthly.filter(m => visibleActual(m) > 0)
})

// Burn rate for active dept
const deptBurnRate = computed(() => {
  const months = deptMonthsWithData.value
  if (!months.length) return 0
  return deptVisibleActual(activeDept.value!) / months.length
})

// Forecast to year-end for active dept
const deptForecast = computed(() => {
  const dept = activeDept.value
  if (!dept || !deptMonthsWithData.value.length) return 0
  const lastMonth = deptMonthsWithData.value[deptMonthsWithData.value.length - 1].month
  const lastMonthNum = parseInt(lastMonth.split('-')[1])
  const remaining = 12 - lastMonthNum
  return deptVisibleActual(dept) + deptBurnRate.value * remaining
})

// Plan attainment: YTD actual as % of YTD plan (months with data only)
const deptPlanAttainment = computed(() => {
  const dept = activeDept.value
  if (!dept) return null
  const dataMonths = deptMonthsWithData.value.map(m => m.month)
  if (!dataMonths.length) return null
  const ytdPlan = dataMonths.reduce((s, m) => s + (resolvedMonthlyPlan.value[m] ?? 0), 0)
  if (ytdPlan === 0) return null
  const ytdActual = dept.monthly.reduce((s, m) => s + visibleActual(m), 0)
  return (ytdActual / ytdPlan) * 100
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
  return dept.monthly.filter(m => visibleActual(m) > 0 && visibleActual(m) > (resolvedMonthlyPlan.value[m.month] ?? m.budget)).length
})

const ytdLabel = computed(() => {
  let last = ''
  for (const d of departments.value) {
    for (const m of d.monthly) {
      if (visibleActual(m) > 0 && m.month > last) last = m.month
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
      const months = Object.keys(acct.monthlyActuals).sort().filter(m => m <= ytdCutoff)
      for (let i = 1; i < months.length; i++) {
        const prev = visibleMonthActual(months[i - 1], acct.monthlyActuals[months[i - 1]] || 0)
        const curr = visibleMonthActual(months[i], acct.monthlyActuals[months[i]] || 0)
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

// Colour palette — one blue, one orange used consistently across every chart
const PLAN_COLOR = '#4a7ca8'
const ACTUAL_COLOR = '#f28e2b' // orange
// Overview: DE158 = orange, DT509 = blue (same two shades, nothing else)
const DEPT_COLORS: Record<string, string> = {
  DE158: '#f28e2b',
  DT509: '#4a7ca8',
}

// Overview: grouped bars — one plan + one actual bar per department per month
const overviewChartOption = computed(() => {
  const monthSet = new Set<string>()
  for (const d of departments.value) d.monthly.forEach(m => monthSet.add(m.month))
  const allMonthsFull = [...monthSet].sort()
  const cutoff = overviewLastDataMonth.value
  const allMonths = overviewFullYear.value || !cutoff
    ? allMonthsFull
    : allMonthsFull.filter(m => m <= cutoff)
  const labels = allMonths.map(formatMonthShort)

  // Plan bars are the same hue as the dept but desaturated/lighter
  const PLAN_TINTS: Record<string, string> = {
    DE158: '#f9c88a',  // light orange
    DT509: '#93b8d6',  // light blue
  }

  const legendNames: string[] = []
  const series: any[] = []

  for (const d of departments.value) {
    const actualColor = DEPT_COLORS[d.department] || ACTUAL_COLOR
    const planColor = PLAN_TINTS[d.department] || '#cbd5e1'
    const overrides = planOverrides.value[d.department] || {}
    const actualMap = new Map(d.monthly.map(m => [m.month, visibleActual(m)]))

    const planName = `${d.department} Plan`
    const actualName = `${d.department} Actual`
    legendNames.push(planName, actualName)

    series.push({
      name: planName,
      type: 'bar',
      barMaxWidth: 28,
      itemStyle: { color: planColor, borderRadius: [3, 3, 0, 0] },
      data: allMonths.map(m => {
        const point = d.monthly.find(p => p.month === m)
        return point ? Math.round(overrides[m] ?? point.budget) : null
      })
    })

    series.push({
      name: actualName,
      type: 'bar',
      barMaxWidth: 28,
      itemStyle: { color: actualColor, borderRadius: [3, 3, 0, 0] },
      data: allMonths.map(m => {
        const val = actualMap.get(m)
        return (val && val > 0) ? Math.round(val) : null
      })
    })
  }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const idx = params[0]?.dataIndex ?? 0
        const label = allMonths[idx] ? formatMonth(allMonths[idx]) : (params[0]?.axisValue || '')
        let html = `<div style="font-weight:600;margin-bottom:6px">${label}</div>`
        for (const d of departments.value) {
          const color = DEPT_COLORS[d.department] || ACTUAL_COLOR
          const planP = params.find(p => p.seriesName === `${d.department} Plan`)
          const actualP = params.find(p => p.seriesName === `${d.department} Actual`)
          const plan = planP?.value ?? null
          const actual = actualP?.value ?? null
          if (plan == null && actual == null) continue
          const variance = actual != null && plan != null ? actual - plan : null
          const vColor = variance != null ? (variance > 0 ? '#f87171' : '#34d399') : ''
          const vSign = variance != null && variance > 0 ? '+' : ''
          html += `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #f1f5f9;font-weight:600;color:${color}">${d.department}</div>`
          if (plan != null) html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${PLAN_TINTS[d.department] || '#cbd5e1'}"></span><span style="color:#94a3b8">Plan</span><span style="margin-left:auto;padding-left:24px;font-weight:600">${formatCurrency(plan, 0)}</span></div>`
          if (actual != null) html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color}"></span><span style="color:#94a3b8">Actual</span><span style="margin-left:auto;padding-left:24px;font-weight:600">${formatCurrency(actual, 0)}</span></div>`
          if (variance != null) html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;color:${vColor};font-weight:600"><span style="width:10px"></span><span>Variance</span><span style="margin-left:auto;padding-left:24px">${vSign}${formatCurrency(variance, 0)}</span></div>`
        }
        return html
      }
    },
    legend: {
      data: legendNames,
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
      min: 0,
      axisLabel: { formatter: (v: number) => formatCurrency(v, { compact: true }), color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }
    },
    series
  }
})

// Overview: cumulative YTD — plan (dashed line) + actual (bars) per department
const overviewYtdChartOption = computed(() => {
  const monthSet = new Set<string>()
  for (const d of departments.value) d.monthly.forEach(m => monthSet.add(m.month))
  const allMonthsFull = [...monthSet].sort()
  const cutoff = overviewLastDataMonth.value
  const allMonths = overviewFullYear.value || !cutoff
    ? allMonthsFull
    : allMonthsFull.filter(m => m <= cutoff)
  const labels = allMonths.map(formatMonthShort)

  const PLAN_TINTS: Record<string, string> = { DE158: '#f9c88a', DT509: '#93b8d6' }
  const legendNames: string[] = []
  const series: any[] = []

  for (const d of departments.value) {
    const actualColor = DEPT_COLORS[d.department] || ACTUAL_COLOR
    const planColor = PLAN_TINTS[d.department] || '#cbd5e1'
    const overrides = planOverrides.value[d.department] || {}
    const actualMap = new Map(d.monthly.map(m => [m.month, visibleActual(m)]))
    const lastActualIdx = (() => {
      for (let i = allMonths.length - 1; i >= 0; i--) {
        if ((actualMap.get(allMonths[i]) || 0) > 0) return i
      }
      return -1
    })()

    const planName = `${d.department} Plan`
    const actualName = `${d.department} Actual`
    legendNames.push(planName, actualName)

    let runPlan = 0
    series.push({
      name: planName,
      type: 'bar',
      barMaxWidth: 28,
      itemStyle: { color: planColor, borderRadius: [3, 3, 0, 0] },
      data: allMonths.map(m => {
        const point = d.monthly.find(p => p.month === m)
        if (!point) return null
        runPlan += overrides[m] ?? point.budget
        return Math.round(runPlan)
      })
    })

    let runActual = 0
    const actualData: (number | null)[] = []
    for (let i = 0; i < allMonths.length; i++) {
      if (i > lastActualIdx) { actualData.push(null); continue }
      runActual += actualMap.get(allMonths[i]) || 0
      actualData.push(Math.round(runActual))
    }
    series.push({
      name: actualName,
      type: 'bar',
      barMaxWidth: 28,
      itemStyle: { color: actualColor, borderRadius: [3, 3, 0, 0] },
      data: actualData
    })
  }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const idx = params[0]?.dataIndex ?? 0
        const label = allMonths[idx] ? formatMonth(allMonths[idx]) : (params[0]?.axisValue || '')
        let html = `<div style="font-weight:600;margin-bottom:6px">${label}</div>`
        for (const d of departments.value) {
          const color = DEPT_COLORS[d.department] || ACTUAL_COLOR
          const planP = params.find(p => p.seriesName === `${d.department} Plan`)
          const actualP = params.find(p => p.seriesName === `${d.department} Actual`)
          const plan = planP?.value ?? null
          const actual = actualP?.value ?? null
          if (plan == null && actual == null) continue
          const variance = actual != null && plan != null ? actual - plan : null
          const vColor = variance != null ? (variance > 0 ? '#f87171' : '#34d399') : ''
          const vSign = variance != null && variance > 0 ? '+' : ''
          html += `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #f1f5f9;font-weight:600;color:${color}">${d.department}</div>`
          if (plan != null) html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${PLAN_TINTS[d.department] || '#cbd5e1'}"></span><span style="color:#94a3b8">Plan (cum.)</span><span style="margin-left:auto;padding-left:24px;font-weight:600">${formatCurrency(plan, 0)}</span></div>`
          if (actual != null) html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color}"></span><span style="color:#94a3b8">Actual (cum.)</span><span style="margin-left:auto;padding-left:24px;font-weight:600">${formatCurrency(actual, 0)}</span></div>`
          if (variance != null) html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;color:${vColor};font-weight:600"><span style="width:10px"></span><span>Variance</span><span style="margin-left:auto;padding-left:24px">${vSign}${formatCurrency(variance, 0)}</span></div>`
        }
        return html
      }
    },
    legend: { data: legendNames, top: 0, textStyle: { color: '#94a3b8', fontSize: 11 } },
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
      min: 0,
      axisLabel: { formatter: (v: number) => formatCurrency(v, { compact: true }), color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }
    },
    series
  }
})

// Sparkline for department summary table rows
function sparklineOption(d: DepartmentResult) {
  const color = DEPT_COLORS[d.department] || ACTUAL_COLOR
  const withData = d.monthly.filter(m => visibleActual(m) > 0)
  return {
    animation: false,
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, data: withData.map(m => m.month) },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { color, width: 1.5 },
      areaStyle: { color, opacity: 0.08 },
      data: withData.map(m => Math.round(visibleActual(m)))
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
          <div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${PLAN_COLOR}"></span><span style="color:#94a3b8">Plan</span><span style="margin-left:auto;padding-left:16px;font-weight:600">${formatCurrency(plan, 0)}</span></div>
          <div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${ACTUAL_COLOR}"></span><span style="color:#94a3b8">Actual</span><span style="margin-left:auto;padding-left:16px;font-weight:600">${formatCurrency(actual, 0)}</span></div>
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
      { name: 'Plan',   type: 'bar', barMaxWidth: 32, itemStyle: { color: PLAN_COLOR, borderRadius: [3,3,0,0] }, data: monthly.map(m => Math.round(resolvedMonthlyPlan.value[m.month] ?? m.budget)) },
      { name: 'Actual', type: 'bar', barMaxWidth: 32, itemStyle: { color: ACTUAL_COLOR, borderRadius: [3,3,0,0] }, data: monthly.map(m => Math.round(visibleActual(m))) }
    ]
  }
})


// Department: cumulative YTD area chart (Plan vs Actual)
const deptYtdChartOption = computed(() => {
  if (!activeDept.value) return {}
  const monthly = activeDept.value.monthly
  const labels = monthly.map(m => formatMonthShort(m.month))
  const color = ACTUAL_COLOR

  let runPlan = 0
  let runActual = 0
  const planData: number[] = []
  const actualData: (number | null)[] = []

  const lastActualIdx = (() => {
    for (let i = monthly.length - 1; i >= 0; i--) {
      if (visibleActual(monthly[i]) > 0) return i
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
      runActual += visibleActual(m)
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
        itemStyle: { color: PLAN_COLOR, borderRadius: [3, 3, 0, 0] },
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


// ── AI variance driver insights ──
interface InsightState { loading: boolean; insight: string | null }
const varianceInsights = ref<Record<string, InsightState>>({})

async function loadVarianceInsights(dept: DepartmentResult) {
  const uncached = dept.categories.filter(cat => !varianceInsights.value[dept.department + ':' + cat.name])
  if (!uncached.length) return

  // Mark all as loading up front, then fire all fetches in parallel
  for (const cat of uncached) {
    varianceInsights.value[dept.department + ':' + cat.name] = { loading: true, insight: null }
  }

  await Promise.all(uncached.map(async (cat) => {
    const key = dept.department + ':' + cat.name

    const topAccount = cat.accounts.reduce<{ name: string; ytdActual: number } | null>((top, a) => {
      return !top || a.ytdActual > top.ytdActual ? { name: a.name, ytdActual: a.ytdActual } : top
    }, null)

    const monthlyActuals: Record<string, number> = {}
    for (const acct of cat.accounts) {
      for (const [m, v] of Object.entries(acct.monthlyActuals)) {
        if (m > displayCutoff || v <= 0) continue
        monthlyActuals[m] = (monthlyActuals[m] || 0) + v
      }
    }

    try {
      const res = await $fetch<{ data: { insight: string } }>('/api/ai/insights', {
        method: 'POST',
        body: {
          type: 'variance-driver',
          context: {
            categoryName: cat.name,
            department: dept.department,
            ytdBudget: cat.ytdBudget,
            ytdActual: cat.ytdActual,
            accountCount: cat.accounts.length,
            monthlyActuals,
            topAccount
          }
        }
      })
      varianceInsights.value[key] = { loading: false, insight: res?.data?.insight || null }
    } catch {
      varianceInsights.value[key] = { loading: false, insight: null }
    }
  }))
}

if (import.meta.client) {
  watch(activeDept, (dept) => {
    if (dept) loadVarianceInsights(dept)
  }, { immediate: true })
}

const excelExporting = ref(false)
const excelExportError = ref<string | null>(null)

async function exportExcel() {
  excelExporting.value = true
  excelExportError.value = null
  try {
    const buf = await $fetch<ArrayBuffer>(`/api/costs/budget-vs-actual-export?year=${selectedYear.value}`, {
      responseType: 'arrayBuffer'
    })
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `IT-AWS-Cost-Tracking-${selectedYear.value}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: any) {
    excelExportError.value = err?.data?.message || err?.message || 'Export failed'
  } finally {
    excelExporting.value = false
  }
}

</script>
