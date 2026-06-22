<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <!-- Header -->
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin/costs')" class="mb-4">
        Back to Cost Management
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Icon name="i-heroicons-scale" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Budget vs Actual by Department</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Compare budgeted (pro forma) spend against actual (billable) spend for finance-tracked departments.
      </p>
    </div>

    <!-- Controls -->
    <div class="flex flex-wrap items-end gap-4 mb-6">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
        <USelectMenu
          v-model="selectedDepartment"
          :options="departmentOptions"
          value-attribute="value"
          option-attribute="label"
          class="w-56"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Year</label>
        <USelectMenu v-model="selectedYear" :options="yearOptions" class="w-32" />
      </div>
      <UButton
        color="primary"
        icon="i-heroicons-arrow-path"
        :loading="pending"
        @click="() => refresh()"
      >
        Refresh
      </UButton>
    </div>

    <!-- Error -->
    <UAlert
      v-if="error"
      color="red"
      variant="subtle"
      icon="i-heroicons-exclamation-triangle"
      title="Failed to load budget vs actual data"
      :description="errorMessage"
      class="mb-6"
    />

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-24">
      <Icon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin" />
    </div>

    <template v-else-if="departments.length">
      <!-- Summary cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <UCard>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Budgeted (Pro Forma)</div>
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {{ formatCurrency(grandBudget, 0) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Actual (Billable)</div>
          <div class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {{ formatCurrency(grandActual, 0) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-gray-600 dark:text-gray-400">Variance (Actual − Budget)</div>
          <div
            class="text-2xl font-bold mt-1"
            :class="grandVariance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'"
          >
            {{ formatCurrency(grandVariance, 0) }}
            <span class="text-base font-medium">({{ grandVariancePct.toFixed(1) }}%)</span>
          </div>
        </UCard>
      </div>

      <!-- Grouped bar chart -->
      <UCard class="mb-8">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Budget vs Actual by Department</h2>
            <UBadge color="gray" variant="soft" size="sm">{{ selectedYear }}</UBadge>
          </div>
        </template>
        <VChart :option="chartOption" class="h-96" autoresize />
      </UCard>

      <!-- Detail table -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Department Detail</h2>
        </template>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr class="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th class="px-4 py-3">Department</th>
                <th class="px-4 py-3 text-right">Budgeted</th>
                <th class="px-4 py-3 text-right">Actual</th>
                <th class="px-4 py-3 text-right">Variance</th>
                <th class="px-4 py-3 text-right">Variance %</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="d in departments" :key="d.department" class="text-sm text-gray-900 dark:text-gray-100">
                <td class="px-4 py-3 font-medium">{{ d.department }}</td>
                <td class="px-4 py-3 text-right">{{ formatCurrency(d.budgetTotal, 0) }}</td>
                <td class="px-4 py-3 text-right">{{ formatCurrency(d.actualTotal, 0) }}</td>
                <td
                  class="px-4 py-3 text-right font-medium"
                  :class="d.variance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'"
                >
                  {{ formatCurrency(d.variance, 0) }}
                </td>
                <td
                  class="px-4 py-3 text-right"
                  :class="d.variance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'"
                >
                  {{ d.variancePercent.toFixed(1) }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </template>

    <!-- Empty -->
    <div v-else class="text-center py-24 text-gray-500 dark:text-gray-400">
      No data available for the selected department and year.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, TitleComponent, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer])

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  // Resolved by auth-permission as can('costs.budget_vs_actual'); granted to
  // Administrator + Finance roles in app/config/roles.ts.
  permission: 'costs.budget_vs_actual',
  title: 'Budget vs Actual by Department',
  description: 'Compare budgeted vs actual spend for finance-tracked departments'
})

interface MonthlyPoint { month: string; budget: number; actual: number }
interface DepartmentResult {
  department: string
  budgetTotal: number
  actualTotal: number
  variance: number
  variancePercent: number
  monthly: MonthlyPoint[]
}

const currentYear = new Date().getFullYear()
const selectedYear = ref<number>(currentYear)
const yearOptions = [currentYear, currentYear - 1, currentYear - 2]

const selectedDepartment = ref<string>('all')
const departmentOptions = [
  { label: 'All Departments', value: 'all' },
  { label: 'DE158', value: 'DE158' },
  { label: 'DT509', value: 'DT509' }
]

const query = computed(() => {
  const q: Record<string, string> = { year: String(selectedYear.value) }
  if (selectedDepartment.value && selectedDepartment.value !== 'all') {
    q.department = selectedDepartment.value
  }
  return q
})

const { data, pending, error, refresh } = await useFetch('/api/costs/budget-vs-actual', {
  query,
  // refetch when the controls change
  watch: [selectedYear, selectedDepartment]
})

const departments = computed<DepartmentResult[]>(() => (data.value as any)?.data?.departments || [])

const grandBudget = computed(() => departments.value.reduce((s, d) => s + d.budgetTotal, 0))
const grandActual = computed(() => departments.value.reduce((s, d) => s + d.actualTotal, 0))
const grandVariance = computed(() => grandActual.value - grandBudget.value)
const grandVariancePct = computed(() => (grandBudget.value > 0 ? (grandVariance.value / grandBudget.value) * 100 : 0))

const errorMessage = computed(() => {
  const e: any = error.value
  return e?.data?.message || e?.message || 'An unexpected error occurred.'
})

const chartOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    valueFormatter: (v: number) => formatCurrency(v, 0)
  },
  legend: { data: ['Budgeted', 'Actual'], top: 0 },
  grid: { left: '3%', right: '4%', bottom: '3%', top: 40, containLabel: true },
  xAxis: { type: 'category', data: departments.value.map(d => d.department) },
  yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatCurrency(v, 0) } },
  series: [
    {
      name: 'Budgeted',
      type: 'bar',
      itemStyle: { color: '#3b82f6' },
      data: departments.value.map(d => Math.round(d.budgetTotal))
    },
    {
      name: 'Actual',
      type: 'bar',
      itemStyle: { color: '#22c55e' },
      data: departments.value.map(d => Math.round(d.actualTotal))
    }
  ]
}))
</script>
