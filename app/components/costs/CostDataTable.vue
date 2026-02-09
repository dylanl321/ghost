<template>
  <div class="space-y-4">
    <!-- Table Controls -->
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-4">
        <UInput
          v-model="searchQuery"
          placeholder="Search accounts..."
          icon="i-heroicons-magnifying-glass"
          class="w-64"
        />
        <USelectMenu
          v-model="selectedColumns"
          :options="columnOptions"
          multiple
          placeholder="Select columns"
          class="w-48"
        >
          <template #label>
            {{ selectedColumns.length }} columns
          </template>
        </USelectMenu>
      </div>
      
      <div class="flex items-center gap-2">
        <UTooltip v-if="canGenerateDetailedReport" text="Generate detailed analytics report with service usage and recommendations">
          <UButton
            icon="i-heroicons-document-chart-bar"
            color="green"
            variant="solid"
            @click="generateDetailedReport"
          >
            Generate Report
          </UButton>
        </UTooltip>
        <UButton
          icon="i-heroicons-document-arrow-down"
          color="purple"
          variant="outline"
          @click="exportToPDFHandler"
        >
          Export PDF
        </UButton>
        <UButton
          icon="i-heroicons-arrow-down-tray"
          color="blue"
          variant="outline"
          @click="exportToCSV"
        >
          Export CSV
        </UButton>
        <UButton
          icon="i-heroicons-arrow-path"
          color="gray"
          variant="ghost"
          @click="refreshData"
          :loading="isLoading"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- Data Table -->
    <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th
                v-for="col in visibleColumns"
                :key="col.key"
                @click="sortBy(col.key)"
                class="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750"
              >
                <div class="flex items-center gap-1">
                  {{ col.label }}
                  <Icon
                    v-if="sortColumn === col.key"
                    :name="sortDirection === 'asc' ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                    class="w-4 h-4"
                  />
                  <UTooltip v-if="col.helpLink" :text="col.helpTooltip || 'Learn more'">
                    <NuxtLink :to="col.helpLink" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" @click.stop>
                      <Icon name="i-heroicons-question-mark-circle" class="w-3.5 h-3.5" />
                    </NuxtLink>
                  </UTooltip>
                  <UTooltip v-else-if="col.helpTooltip" :text="col.helpTooltip">
                    <Icon name="i-heroicons-information-circle" class="w-3.5 h-3.5 text-gray-500" />
                  </UTooltip>
                </div>
              </th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            <tr
              v-for="(row, idx) in paginatedData"
              :key="row.accountId || idx"
              class="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <td
                v-for="col in visibleColumns"
                :key="col.key"
                class="px-4 py-3 text-sm"
                :class="[col.class, { 'opacity-60': row.accountStatus === 'Decommissioned' }]"
              >
                <!-- Special handling for account status column -->
                <span v-if="col.key === 'accountStatus'">
                  <UBadge
                    :color="row.accountStatus === 'Decommissioned' ? 'red' : 'green'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ row.accountStatus || 'Active' }}
                  </UBadge>
                </span>
                <!-- Special handling for risk level column -->
                <span v-else-if="col.key === 'riskLevel'">
                  <UBadge
                    :color="row.riskColor || 'gray'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ row.riskLevel || '-' }}
                  </UBadge>
                </span>
                <!-- Special handling for account name to show if decommissioned -->
                <span v-else-if="col.key === 'accountName'" class="flex items-center gap-2">
                  {{ getNestedValue(row, col.key) || '-' }}
                  <UTooltip v-if="row.accountStatus === 'Decommissioned'" text="This account has been decommissioned">
                    <Icon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-500" />
                  </UTooltip>
                </span>
                <!-- Standard column handling -->
                <span v-else-if="col.format">
                  {{ col.format(getNestedValue(row, col.key)) }}
                </span>
                <span v-else>
                  {{ getNestedValue(row, col.key) || '-' }}
                </span>
              </td>
            </tr>
            <tr v-if="paginatedData.length === 0">
              <td :colspan="visibleColumns.length" class="px-4 py-8 text-center text-gray-500">
                No data available
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <div class="flex justify-between items-center">
      <div class="text-sm text-gray-600 dark:text-gray-400">
        Showing {{ startIndex + 1 }} to {{ endIndex }} of {{ filteredData.length }} entries
        <span v-if="searchQuery" class="ml-2">
          (filtered from {{ tableData.length }} total)
        </span>
      </div>
      
      <div class="flex items-center gap-2">
        <UButton
          icon="i-heroicons-chevron-left"
          color="gray"
          variant="ghost"
          size="sm"
          :disabled="currentPage === 1"
          @click="currentPage--"
        />
        
        <div class="flex items-center gap-1">
          <UButton
            v-for="page in visiblePages"
            :key="page"
            :color="page === currentPage ? 'blue' : 'gray'"
            :variant="page === currentPage ? 'solid' : 'ghost'"
            size="sm"
            @click="currentPage = page"
          >
            {{ page }}
          </UButton>
        </div>
        
        <UButton
          icon="i-heroicons-chevron-right"
          color="gray"
          variant="ghost"
          size="sm"
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        />
        
        <USelectMenu
          v-model="pageSize"
          :options="[10, 25, 50, 100]"
          class="ml-4 w-20"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { NormalizedDataset } from '~/types/costs'
import { usePDFExport } from '~/composables/usePDFExport'
import { useAccountCosts } from '~/composables/useAccountCosts'

const props = defineProps<{
  dataset: NormalizedDataset | null
  selectedAccounts: string[]
  mode: 'billable' | 'proforma'
  isLoading?: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

// Composables
const { fetchAccountDetails } = useAccountCosts()

// Account lookup cache
const accountLookupCache = ref<Map<string, any>>(new Map())

// Get timeframe label for column
const getTimeframeLabel = () => {
  const timeframe = props.dataset?.timeframe
  const labels: Record<string, string> = {
    'thisMonth': 'This Month',
    'lastMonth': 'Last Month',
    'thisQuarter': 'This Quarter',
    'lastQuarter': 'Last Quarter',
    'thisYear': 'This Year',
    'lastYear': 'Last Year',
    'last7days': 'Last 7 Days',
    'last30days': 'Last 30 Days',
    'last90days': 'Last 90 Days',
    'ytd': 'YTD'
  }
  return labels[timeframe || 'thisMonth'] || 'Period'
}

// Column definitions
const availableColumns = computed(() => [
  { key: 'accountId', label: 'Account ID', default: true },
  { key: 'accountName', label: 'Account Name', default: true },
  { key: 'accountStatus', label: 'Account Status', default: true, format: (v: string) => v || 'Active', class: 'text-center' },
  { key: 'actualCost', label: `${getTimeframeLabel()} Cost`, default: true, format: (v: number) => formatCurrency(v, 2), class: 'text-right' },
  { key: 'budgetedCost', label: 'GDMS Forecast', default: true, format: (v: number) => formatCurrency(v, 2), class: 'text-right' },
  { key: 'utilization', label: 'Utilization %', default: true, format: (v: number) => `${v.toFixed(1)}%`, class: 'text-right' },
  { key: 'overagePercent', label: 'Overage %', default: false, format: (v: number) => v > 0 ? `${v.toFixed(1)}%` : '-', class: 'text-right' },
  { key: 'riskScore', label: 'Risk Score', default: true, format: (v: number) => v.toFixed(0), class: 'text-right', helpLink: '/support/docs?topic=budget-risk-scoring', helpTooltip: 'Learn how Risk Scores are calculated' },
  { key: 'riskLevel', label: 'Risk Level', default: true, helpLink: '/support/docs?topic=budget-risk-scoring', helpTooltip: 'Learn about Risk Levels' },
  { key: 'variance', label: 'GDMS Variance', default: true, format: (v: number) => formatCurrency(v, 2), class: 'text-right' },
  { key: 'status', label: 'GDMS Status', default: false },
  { key: 'endOfMonthForecast', label: 'End of Month AWS Projection', default: true, format: (v: number) => formatCurrency(v, 2), class: 'text-right', helpTooltip: 'AWS ML projection for end of current month' },
  { key: 'projectedVsBudget', label: 'Projected vs Budget', default: true, format: (v: number) => formatCurrencyWithSign(v), class: 'text-right', helpTooltip: 'End of Month AWS Projection minus GDMS Forecast (positive = over, negative = under)' },
  { key: 'lastMonthTotal', label: 'Last Month Total', default: true, format: (v: number) => formatCurrency(v, 2), class: 'text-right', helpTooltip: 'Total cost from the previous month' },
  { key: 'ytdTotal', label: 'YTD Total', default: true, format: (v: number) => formatCurrency(v, 2), class: 'text-right', helpTooltip: 'Year-to-date total (Jan 1 - today)' },
  { key: 'fullYearEstimate', label: 'Full Year Estimate', default: true, format: (v: number) => formatCurrency(v, 2), class: 'text-right', helpTooltip: 'Projected full year total (YTD actuals + remaining months forecast)' },
  { key: 'departmentNumber', label: 'Department', default: false },
  { key: 'linesOfBusiness', label: 'Line of Business', default: false },
  { key: 'projectName', label: 'Project', default: false },
  { key: 'environment', label: 'Environment', default: false },
  { key: 'forecastedCost', label: 'Forecast', default: false, format: (v: number) => formatCurrency(v, 2), class: 'text-right' }
])

// State
const searchQuery = ref('')
const selectedColumns = ref(availableColumns.value.filter(c => c.default).map(c => c.key))
const sortColumn = ref('riskScore')
const sortDirection = ref<'asc' | 'desc'>('desc')
const currentPage = ref(1)
const pageSize = ref(25)

// Computed
const columnOptions = computed(() =>
  availableColumns.value.map(col => ({
    label: col.label,
    value: col.key
  }))
)

const visibleColumns = computed(() =>
  availableColumns.value.filter(col => selectedColumns.value.includes(col.key))
)

const canGenerateDetailedReport = computed(() => {
  // Show report button when fewer than 10 accounts are selected (but at least 1)
  return props.selectedAccounts.length > 0 && props.selectedAccounts.length < 10
})

const tableData = computed(() => {
  if (!props.dataset) return []

  const analysis = props.dataset.analysis as any
  const summary = props.dataset.summary as any
  const forecast = props.dataset.forecast as any
  const yearEndForecast = props.dataset.yearEndForecast as any
  const ytdSummary = props.dataset.ytdSummary as any // YTD per-account data
  const lastMonthSummary = props.dataset.lastMonthSummary as any // Last month per-account data

  // Get the correct data based on mode
  let analysisData = analysis?.data || analysis
  let summaryData = summary?.data || summary
  let forecastData = forecast?.data || forecast
  let yearEndForecastData = yearEndForecast?.data || yearEndForecast
  let ytdSummaryData = ytdSummary?.data || ytdSummary
  let lastMonthSummaryData = lastMonthSummary?.data || lastMonthSummary

  if (props.mode === 'proforma') {
    // In proforma mode, data might be nested
    if (analysisData?.proforma) {
      analysisData = analysisData.proforma
    }
    if (summaryData?.proforma) {
      summaryData = summaryData.proforma
    }
    if (forecastData?.proforma) {
      forecastData = forecastData.proforma
    }
    if (yearEndForecastData?.proforma) {
      yearEndForecastData = yearEndForecastData.proforma
    }
    if (ytdSummaryData?.proforma) {
      ytdSummaryData = ytdSummaryData.proforma
    }
    if (lastMonthSummaryData?.proforma) {
      lastMonthSummaryData = lastMonthSummaryData.proforma
    }
  }

  // Extract forecast totals per account (if available)
  const endOfMonthForecastByAccount = new Map<string, number>()

  // Get end of month forecast per account (actual + remainder)
  if (forecastData?.forecast?.total?.Amount) {
    const totalRemainderForecast = parseFloat(forecastData.forecast.total.Amount)
    const currentAccounts = summaryData?.accounts || []
    const totalCurrentCost = currentAccounts.reduce((sum: number, acc: any) => sum + (acc.totalCost || 0), 0)

    // Distribute remainder forecast proportionally and add to current month actual
    currentAccounts.forEach((acc: any) => {
      const currentMonthActual = acc.totalCost || 0
      let remainderForAccount = 0

      if (totalCurrentCost > 0) {
        const proportion = currentMonthActual / totalCurrentCost
        remainderForAccount = totalRemainderForecast * proportion
      }

      // End of month = Current actual + Remainder forecast
      endOfMonthForecastByAccount.set(acc.accountId, currentMonthActual + remainderForAccount)
    })
  }

  // Get YTD totals from ytdSummary API (period=ytd, already includes current month)
  const ytdByAccount = new Map<string, number>()
  const ytdAccounts = ytdSummaryData?.accounts || []

  ytdAccounts.forEach((acc: any) => {
    ytdByAccount.set(acc.accountId, acc.totalCost || 0)
  })

  // Get last month totals from lastMonthSummary API
  const lastMonthByAccount = new Map<string, number>()
  const lastMonthAccounts = lastMonthSummaryData?.accounts || []

  lastMonthAccounts.forEach((acc: any) => {
    lastMonthByAccount.set(acc.accountId, acc.totalCost || 0)
  })

  const currentAccounts = summaryData?.accounts || []

  // Get remaining months forecast per account (not including current month actual)
  const remainingMonthsForecastByAccount = new Map<string, number>()
  if (yearEndForecastData?.forecast?.total?.Amount) {
    const totalRemainingForecast = parseFloat(yearEndForecastData.forecast.total.Amount)
    const totalCurrentCost = currentAccounts.reduce((sum: number, acc: any) => sum + (acc.totalCost || 0), 0)

    // Distribute forecast proportionally
    currentAccounts.forEach((acc: any) => {
      if (totalCurrentCost > 0) {
        const proportion = (acc.totalCost || 0) / totalCurrentCost
        remainingMonthsForecastByAccount.set(acc.accountId, totalRemainingForecast * proportion)
      }
    })
  }

  // Calculate full year estimate: Past months + End of Month + Future months
  // This matches the Year-End Projection graph calculation
  const fullYearEstimateByAccount = new Map<string, number>()
  currentAccounts.forEach((acc: any) => {
    const ytdTotal = ytdByAccount.get(acc.accountId) || 0
    const currentMonthActual = acc.totalCost || 0
    const endOfMonth = endOfMonthForecastByAccount.get(acc.accountId) || currentMonthActual
    const futureMonthsForecast = remainingMonthsForecastByAccount.get(acc.accountId) || 0

    // Full Year = (Past months) + (Current month end-of-month) + (Future months)
    //           = (YTD - current month actual) + (End of month) + (Future months)
    const pastMonthsActual = ytdTotal - currentMonthActual
    fullYearEstimateByAccount.set(acc.accountId, pastMonthsActual + endOfMonth + futureMonthsForecast)
  })

  let rawData: any[] = []

  // Primary source: analysis data with budget info
  if (analysisData?.budgetAnalysis?.byAccount) {
    rawData = analysisData.budgetAnalysis.byAccount.map((item: any) => {
      const cachedAccount = accountLookupCache.value.get(item.accountId)
      const accountStatus = cachedAccount?.enclaveStatus || cachedAccount?.status || 'Active'
      const isDecommissioned = accountStatus === 'Decommissioned' || accountStatus === 'decommissioned'

      const utilization = item.budgetedCost > 0 ? (item.actualCost / item.budgetedCost) * 100 : 0
      const overagePercent = item.budgetedCost > 0 ? Math.max(0, ((item.actualCost - item.budgetedCost) / item.budgetedCost) * 100) : 0
      const overageAmount = Math.max(0, item.actualCost - item.budgetedCost)

      const endOfMonthForecast = endOfMonthForecastByAccount.get(item.accountId) || item.actualCost
      const projectedVsBudget = endOfMonthForecast - (item.budgetedCost || 0)

      return {
        ...item,
        accountName: cachedAccount?.accountName || item.accountName || item.accountId,
        accountStatus: isDecommissioned ? 'Decommissioned' : accountStatus,
        utilization,
        overagePercent,
        overageAmount,
        variance: item.actualCost - item.budgetedCost,
        status: getStatus(item),
        endOfMonthForecast,
        projectedVsBudget,
        lastMonthTotal: lastMonthByAccount.get(item.accountId) || 0,
        ytdTotal: ytdByAccount.get(item.accountId) || item.actualCost,
        fullYearEstimate: fullYearEstimateByAccount.get(item.accountId) || 0
      }
    })
  }
  // Fallback: summary data
  else if (summaryData?.accounts) {
    rawData = summaryData.accounts.map((item: any) => {
      const cachedAccount = accountLookupCache.value.get(item.accountId)
      const accountStatus = cachedAccount?.enclaveStatus || cachedAccount?.status || 'Active'
      const isDecommissioned = accountStatus === 'Decommissioned' || accountStatus === 'decommissioned'

      const totalCost = item.totalCost || 0
      const budget = item.budget || 0
      const utilization = budget > 0 ? (totalCost / budget) * 100 : 0
      const overagePercent = budget > 0 ? Math.max(0, ((totalCost - budget) / budget) * 100) : 0
      const overageAmount = Math.max(0, totalCost - budget)

      const endOfMonthForecast = endOfMonthForecastByAccount.get(item.accountId) || totalCost
      const projectedVsBudget = endOfMonthForecast - budget

      return {
        accountId: item.accountId,
        accountName: cachedAccount?.accountName || item.accountName || item.accountId,
        accountStatus: isDecommissioned ? 'Decommissioned' : accountStatus,
        actualCost: totalCost,
        budgetedCost: budget,
        utilization,
        overagePercent,
        overageAmount,
        variance: totalCost - budget,
        status: budget > 0
          ? (totalCost > budget ? 'over' : totalCost > budget * 0.9 ? 'warning' : 'under')
          : 'no-budget',
        departmentNumber: item.departmentNumber,
        linesOfBusiness: item.linesOfBusiness,
        projectName: item.projectName,
        environment: item.environment,
        endOfMonthForecast,
        projectedVsBudget,
        lastMonthTotal: lastMonthByAccount.get(item.accountId) || 0,
        ytdTotal: ytdByAccount.get(item.accountId) || totalCost,
        fullYearEstimate: fullYearEstimateByAccount.get(item.accountId) || 0
      }
    })
  }

  // Calculate normalized risk scores across all accounts
  if (rawData.length > 0) {
    const maxOveragePercent = Math.max(...rawData.map(a => a.overagePercent), 1)
    const maxOverageAmount = Math.max(...rawData.map(a => a.overageAmount), 1)

    rawData.forEach(account => {
      // Normalize overage percentage (0-100 scale)
      const normalizedPercent = (account.overagePercent / maxOveragePercent) * 100

      // Normalize overage amount (0-100 scale)
      const normalizedAmount = (account.overageAmount / maxOverageAmount) * 100

      // Combined risk score (70% weight on percentage, 30% weight on absolute impact)
      // This balances severity of overage vs financial impact
      const riskScore = (normalizedPercent * 0.7) + (normalizedAmount * 0.3)

      // Determine risk level
      let riskLevel = 'Good'
      let riskColor = 'green'

      if (account.overageAmount === 0 && account.variance <= 0) {
        riskLevel = 'Good'
        riskColor = 'green'
      } else if (riskScore >= 80) {
        riskLevel = 'Critical'
        riskColor = 'red'
      } else if (riskScore >= 60) {
        riskLevel = 'High'
        riskColor = 'orange'
      } else if (riskScore >= 40) {
        riskLevel = 'Medium'
        riskColor = 'yellow'
      } else if (riskScore >= 20) {
        riskLevel = 'Low'
        riskColor = 'blue'
      }

      account.riskScore = riskScore
      account.riskLevel = riskLevel
      account.riskColor = riskColor
    })
  }

  return rawData
})

const filteredData = computed(() => {
  let data = [...tableData.value]
  
  // Apply account filter if accounts are selected
  if (props.selectedAccounts.length > 0) {
    data = data.filter(row => props.selectedAccounts.includes(row.accountId))
  }
  
  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    data = data.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(query)
      )
    )
  }
  
  // Apply sorting
  data.sort((a, b) => {
    const aVal = getNestedValue(a, sortColumn.value)
    const bVal = getNestedValue(b, sortColumn.value)
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection.value === 'asc' ? aVal - bVal : bVal - aVal
    }
    
    const aStr = String(aVal || '')
    const bStr = String(bVal || '')
    return sortDirection.value === 'asc' 
      ? aStr.localeCompare(bStr)
      : bStr.localeCompare(aStr)
  })
  
  return data
})

const totalPages = computed(() => 
  Math.ceil(filteredData.value.length / pageSize.value)
)

const startIndex = computed(() => 
  (currentPage.value - 1) * pageSize.value
)

const endIndex = computed(() => 
  Math.min(startIndex.value + pageSize.value, filteredData.value.length)
)

const paginatedData = computed(() => 
  filteredData.value.slice(startIndex.value, endIndex.value)
)

const visiblePages = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const current = currentPage.value
  
  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    if (current <= 3) {
      for (let i = 1; i <= 5; i++) pages.push(i)
      pages.push(total)
    } else if (current >= total - 2) {
      pages.push(1)
      for (let i = total - 4; i <= total; i++) pages.push(i)
    } else {
      pages.push(1)
      for (let i = current - 1; i <= current + 1; i++) pages.push(i)
      pages.push(total)
    }
  }
  
  return pages
})

// Methods
const getNestedValue = (obj: any, path: string) => {
  return path.split('.').reduce((acc, part) => acc?.[part], obj)
}

const formatCurrencyWithSign = (value: number) => {
  if (typeof value !== 'number') return '-'
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero'
  }).format(value)
  return formatted
}

const getStatus = (item: any) => {
  if (!item.budgetedCost || item.budgetedCost === 0) return 'no-budget'
  const utilization = (item.actualCost / item.budgetedCost) * 100
  if (utilization > 100) return 'over'
  if (utilization > 90) return 'warning'
  return 'under'
}

const sortBy = (column: string) => {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = 'desc'
  }
}

const refreshData = () => {
  emit('refresh')
}

const generateDetailedReport = () => {
  // Get selected accounts data
  const selectedAccountsData = filteredData.value.filter(row => 
    props.selectedAccounts.includes(row.accountId)
  )
  
  if (selectedAccountsData.length === 0) {
    console.warn('No accounts selected for report')
    return
  }
  
  // Calculate summary statistics
  const totalCost = selectedAccountsData.reduce((sum, acc) => sum + (acc.actualCost || 0), 0)
  const totalBudget = selectedAccountsData.reduce((sum, acc) => sum + (acc.budgetedCost || 0), 0)
  const averageCost = totalCost / selectedAccountsData.length
  const averageUtilization = selectedAccountsData.reduce((sum, acc) => sum + (acc.utilization || 0), 0) / selectedAccountsData.length
  
  // Get service analysis
  const serviceAnalysis = getServiceAnalysis()
  const recommendations = generateRecommendations(selectedAccountsData)
  
  // Generate multi-sheet CSV report
  let csvContent = ''
  
  // Sheet 1: Executive Summary
  csvContent += '=== EXECUTIVE SUMMARY ===\n\n'
  csvContent += 'Report Generated,' + new Date().toISOString() + '\n'
  csvContent += 'Data Mode,' + props.mode.toUpperCase() + '\n'
  csvContent += 'Number of Accounts,' + selectedAccountsData.length + '\n'
  csvContent += 'Active Accounts,' + selectedAccountsData.filter(acc => acc.accountStatus !== 'Decommissioned').length + '\n'
  csvContent += 'Decommissioned Accounts,' + selectedAccountsData.filter(acc => acc.accountStatus === 'Decommissioned').length + '\n'
  csvContent += 'Total Cost,' + formatCurrency(totalCost, 2) + '\n'
  csvContent += 'Total GDMS Forecast,' + formatCurrency(totalBudget, 2) + '\n'
  csvContent += 'GDMS Forecast Utilization,' + averageUtilization.toFixed(1) + '%\n'
  csvContent += 'Average Cost per Account,' + formatCurrency(averageCost, 2) + '\n'
  csvContent += 'Over GDMS Forecast Accounts,' + selectedAccountsData.filter(acc => acc.status === 'over').length + '\n'
  csvContent += 'Under GDMS Forecast Accounts,' + selectedAccountsData.filter(acc => acc.status === 'under').length + '\n'
  csvContent += '\n'
  csvContent += '=== FORECAST DATA ===\n\n'
  csvContent += 'Total End of Month AWS Projection,' + formatCurrency(selectedAccountsData.reduce((sum, acc) => sum + (acc.endOfMonthForecast || 0), 0), 2) + '\n'
  csvContent += 'Total YTD,' + formatCurrency(selectedAccountsData.reduce((sum, acc) => sum + (acc.ytdTotal || 0), 0), 2) + '\n'
  csvContent += 'Total Full Year Estimate,' + formatCurrency(selectedAccountsData.reduce((sum, acc) => sum + (acc.fullYearEstimate || 0), 0), 2) + '\n'
  csvContent += '\n\n'
  
  // Sheet 2: Account Details
  csvContent += '=== ACCOUNT DETAILS ===\n\n'
  const accountHeaders = ['Account ID', 'Account Name', 'Account Status', 'Department', 'Line of Business', 'Actual Cost', 'GDMS Forecast', 'Utilization %', 'GDMS Variance', 'GDMS Status', 'End of Month AWS Projection', 'YTD Total', 'Full Year Estimate']
  csvContent += accountHeaders.map(escapeCSV).join(',') + '\n'

  selectedAccountsData.forEach(acc => {
    const row = [
      acc.accountId,
      acc.accountName || '',
      acc.accountStatus || 'Active',
      acc.departmentNumber || '',
      acc.linesOfBusiness || '',
      formatCurrency(acc.actualCost || 0, 2),
      formatCurrency(acc.budgetedCost || 0, 2),
      (acc.utilization || 0).toFixed(1) + '%',
      formatCurrency(acc.variance || 0, 2),
      acc.status || '',
      formatCurrency(acc.endOfMonthForecast || 0, 2),
      formatCurrency(acc.ytdTotal || 0, 2),
      formatCurrency(acc.fullYearEstimate || 0, 2)
    ]
    csvContent += row.map(escapeCSV).join(',') + '\n'
  })
  csvContent += '\n\n'
  
  // Sheet 3: Top Services (if available)
  if (serviceAnalysis && serviceAnalysis.length > 0) {
    csvContent += '=== TOP 20 SERVICES BY COST ===\n\n'
    csvContent += 'Service,Total Cost\n'
    serviceAnalysis.forEach(service => {
      csvContent += escapeCSV(service.service) + ',' + formatCurrency(service.totalCost, 2) + '\n'
    })
    csvContent += '\n\n'
  }
  
  // Sheet 4: Recommendations
  if (recommendations.length > 0) {
    csvContent += '=== RECOMMENDATIONS ===\n\n'
    csvContent += 'Type,Severity,Recommendation,Affected Accounts\n'
    recommendations.forEach(rec => {
      const row = [
        rec.type.replace('-', ' ').toUpperCase(),
        rec.severity.toUpperCase(),
        rec.message,
        rec.accounts.join('; ')
      ]
      csvContent += row.map(escapeCSV).join(',') + '\n'
    })
  }
  
  // Download the comprehensive CSV report
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `detailed-cost-report-${props.mode}-${timestamp}.csv`
  downloadCSV(csvContent, filename)
  
  // Show success notification
  const { $toast } = useNuxtApp()
  if ($toast) {
    $toast.add({
      title: 'Report Generated',
      description: `Detailed report for ${selectedAccountsData.length} accounts has been downloaded`,
      color: 'green',
      timeout: 5000
    })
  }
}

const getServiceAnalysis = () => {
  // Extract service costs if available
  const services = props.dataset?.services as any
  if (!services) return null
  
  const serviceData = services?.data || services
  const serviceMap = new Map<string, number>()
  
  // Aggregate service costs
  if (serviceData?.resultsByTime) {
    serviceData.resultsByTime.forEach((bucket: any) => {
      if (bucket.Groups) {
        bucket.Groups.forEach((g: any) => {
          const serviceName = g.Keys?.[0] || 'Unknown'
          const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
          serviceMap.set(serviceName, (serviceMap.get(serviceName) || 0) + amount)
        })
      }
    })
  }
  
  return Array.from(serviceMap.entries())
    .map(([name, cost]) => ({ service: name, totalCost: cost }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 20) // Top 20 services
}

const generateRecommendations = (accounts: any[]) => {
  const recommendations = []
  
  // Check for underutilized GDMS forecasts
  const underutilized = accounts.filter(acc => acc.utilization < 50)
  if (underutilized.length > 0) {
    recommendations.push({
      type: 'gdms-forecast-optimization',
      severity: 'medium',
      message: `${underutilized.length} account(s) are using less than 50% of GDMS forecast. Consider reallocating forecast.`,
      accounts: underutilized.map(a => a.accountName)
    })
  }
  
  // Check for over-GDMS forecast accounts
  const overBudget = accounts.filter(acc => acc.utilization > 100)
  if (overBudget.length > 0) {
    recommendations.push({
      type: 'gdms-forecast-alert',
      severity: 'high',
      message: `${overBudget.length} account(s) are over GDMS forecast. Review spending immediately.`,
      accounts: overBudget.map(a => a.accountName)
    })
  }
  
  // Check for accounts nearing GDMS forecast limit
  const nearLimit = accounts.filter(acc => acc.utilization >= 90 && acc.utilization <= 100)
  if (nearLimit.length > 0) {
    recommendations.push({
      type: 'gdms-forecast-warning',
      severity: 'medium',
      message: `${nearLimit.length} account(s) are approaching GDMS forecast limit (90-100% utilized).`,
      accounts: nearLimit.map(a => a.accountName)
    })
  }
  
  return recommendations
}

const exportToPDFHandler = async () => {
  const { exportMultiple } = usePDFExport()
  
  // Get filtered data for export
  const dataToExport = filteredData.value
  
  if (dataToExport.length === 0) {
    const { $toast } = useNuxtApp()
    if ($toast) {
      $toast.add({
        title: 'No Data',
        description: 'No data available to export',
        color: 'yellow',
        timeout: 3000
      })
    }
    return
  }
  
  // Prepare summary statistics
  const totalCost = dataToExport.reduce((sum, acc) => sum + (acc.actualCost || 0), 0)
  const totalBudget = dataToExport.reduce((sum, acc) => sum + (acc.budgetedCost || 0), 0)
  const averageUtilization = dataToExport.reduce((sum, acc) => sum + (acc.utilization || 0), 0) / dataToExport.length
  
  const summary = {
    'Report Date': new Date().toLocaleDateString(),
    'Data Mode': props.mode.toUpperCase(),
    'Total Accounts': dataToExport.length,
    'Active Accounts': dataToExport.filter(acc => acc.accountStatus !== 'Decommissioned').length,
    'Decommissioned Accounts': dataToExport.filter(acc => acc.accountStatus === 'Decommissioned').length,
    'Total Actual Cost': formatCurrency(totalCost, 2),
    'Total GDMS Forecast': formatCurrency(totalBudget, 2),
    'Average Utilization': `${averageUtilization.toFixed(1)}%`,
    'Over GDMS Forecast Accounts': dataToExport.filter(acc => acc.status === 'over').length,
    'Under GDMS Forecast Accounts': dataToExport.filter(acc => acc.status === 'under').length,
    'Warning Accounts': dataToExport.filter(acc => acc.status === 'warning').length,
    '': '', // Spacer
    'Total End of Month AWS Projection': formatCurrency(dataToExport.reduce((sum, acc) => sum + (acc.endOfMonthForecast || 0), 0), 2),
    'Total YTD': formatCurrency(dataToExport.reduce((sum, acc) => sum + (acc.ytdTotal || 0), 0), 2),
    'Total Full Year Estimate': formatCurrency(dataToExport.reduce((sum, acc) => sum + (acc.fullYearEstimate || 0), 0), 2)
  }
  
  // Prepare table data
  const tableHeaders = visibleColumns.value.map(col => col.label)
  const tableRows = dataToExport.map(row => 
    visibleColumns.value.map(col => {
      const value = getNestedValue(row, col.key)
      if (col.format && value !== null && value !== undefined) {
        return col.format(value)
      }
      return value || '-'
    })
  )
  
  // Get service analysis if available
  const serviceAnalysis = getServiceAnalysis()
  
  // Generate recommendations
  const recommendations = generateRecommendations(dataToExport)
  
  // Build PDF sections
  const pdfSections = [
    {
      data: summary,
      type: 'data' as const,
      title: 'Executive Summary'
    },
    {
      data: { headers: tableHeaders, rows: tableRows },
      type: 'data' as const,
      title: 'Account Details',
      pageBreak: true
    }
  ]
  
  // Add service analysis if available
  if (serviceAnalysis && serviceAnalysis.length > 0) {
    const serviceHeaders = ['Service', 'Total Cost']
    const serviceRows = serviceAnalysis.slice(0, 20).map(s => [
      s.service,
      formatCurrency(s.totalCost, 2)
    ])
    
    pdfSections.push({
      data: { headers: serviceHeaders, rows: serviceRows },
      type: 'data' as const,
      title: 'Top 20 Services by Cost',
      pageBreak: true
    })
  }
  
  // Add recommendations if any
  if (recommendations.length > 0) {
    const recText = recommendations.map((rec, idx) => 
      `${idx + 1}. [${rec.severity.toUpperCase()}] ${rec.message}\n   Affected: ${rec.accounts.join(', ')}`
    ).join('\n\n')
    
    pdfSections.push({
      data: recText,
      type: 'text' as const,
      title: 'Recommendations',
      pageBreak: true
    })
  }
  
  // Export to PDF
  await exportMultiple(pdfSections, {
    title: 'AWS Cost Analysis Report',
    subtitle: `Generated on ${new Date().toLocaleDateString()} - ${props.mode === 'proforma' ? 'Proforma' : 'Billable'} Data`,
    filename: `cost-report-${props.mode}-${new Date().toISOString().split('T')[0]}.pdf`,
    orientation: dataToExport.length > 10 ? 'landscape' : 'portrait',
    colors: {
      primary: '#1e40af', // Blue instead of orange
      secondary: '#64748b',
      text: '#000000'
    },
    footer: `Page {page} - GHOST Cost Analysis Report`
  })
  
  // Show success notification
  const { $toast } = useNuxtApp()
  if ($toast) {
    $toast.add({
      title: 'PDF Exported',
      description: `Cost report has been exported for ${dataToExport.length} accounts`,
      color: 'green',
      timeout: 5000
    })
  }
}

const exportToCSV = () => {
  // Calculate summary totals
  const totalCost = filteredData.value.reduce((sum, acc) => sum + (acc.actualCost || 0), 0)
  const totalBudget = filteredData.value.reduce((sum, acc) => sum + (acc.budgetedCost || 0), 0)
  const totalEndOfMonth = filteredData.value.reduce((sum, acc) => sum + (acc.endOfMonthForecast || 0), 0)
  const totalYtd = filteredData.value.reduce((sum, acc) => sum + (acc.ytdTotal || 0), 0)
  const totalFullYear = filteredData.value.reduce((sum, acc) => sum + (acc.fullYearEstimate || 0), 0)

  // Build CSV with summary header
  let csvContent = ''

  // Summary section
  csvContent += '=== SUMMARY ===\n'
  csvContent += 'Report Generated,' + new Date().toISOString() + '\n'
  csvContent += 'Data Mode,' + props.mode.toUpperCase() + '\n'
  csvContent += 'Timeframe,' + getTimeframeLabel() + '\n'
  csvContent += 'Total Accounts,' + filteredData.value.length + '\n'
  csvContent += '\n'
  csvContent += 'Total ' + getTimeframeLabel() + ' Cost,' + formatCurrency(totalCost, 2) + '\n'
  csvContent += 'Total GDMS Forecast,' + formatCurrency(totalBudget, 2) + '\n'
  csvContent += 'Total End of Month AWS Projection,' + formatCurrency(totalEndOfMonth, 2) + '\n'
  csvContent += 'Total YTD,' + formatCurrency(totalYtd, 2) + '\n'
  csvContent += 'Total Full Year Estimate,' + formatCurrency(totalFullYear, 2) + '\n'
  csvContent += '\n\n'

  // Account data table
  csvContent += '=== ACCOUNT DATA ===\n\n'
  const headers = visibleColumns.value.map(col => col.label)
  const rows = filteredData.value.map(row =>
    visibleColumns.value.map(col => {
      const value = getNestedValue(row, col.key)
      if (col.format && value !== null && value !== undefined) {
        return col.format(value)
      }
      return value || ''
    })
  )

  csvContent += headers.map(escapeCSV).join(',') + '\n'
  csvContent += rows.map(row => row.map(escapeCSV).join(',')).join('\n')

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().split('T')[0]
  const modeLabel = props.mode === 'proforma' ? 'proforma' : 'billable'
  const filename = `cost-data-${modeLabel}-${timestamp}.csv`

  // Download file
  downloadCSV(csvContent, filename)
}

// Utility functions (reused from csvExport.ts)
const escapeCSV = (value: any): string => {
  if (value === null || value === undefined) return ''
  
  const str = String(value)
  
  // If contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  
  return str
}

const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

// Fetch account details for unknown accounts
const fetchUnknownAccounts = async () => {
  const allData = tableData.value
  const unknownAccounts = allData.filter(item => 
    !item.accountName || item.accountName === item.accountId
  )
  
  // Fetch details for unknown accounts
  for (const account of unknownAccounts) {
    if (!accountLookupCache.value.has(account.accountId)) {
      try {
        const details = await fetchAccountDetails(account.accountId)
        if (details) {
          accountLookupCache.value.set(account.accountId, details)
        }
      } catch (error) {
        console.error(`Failed to fetch details for account ${account.accountId}:`, error)
      }
    }
  }
}

// Watch for dataset changes and fetch unknown accounts
watch(() => props.dataset, async (newDataset) => {
  if (newDataset) {
    await fetchUnknownAccounts()
  }
}, { immediate: true })

// Reset page when filters change
watch([searchQuery, pageSize, () => props.selectedAccounts], () => {
  currentPage.value = 1
})
</script>