<template>
  <div class="space-y-6">
    <!-- Summary Cards -->
    <div v-if="!loading && overview" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Spend -->
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0 p-2 rounded-lg bg-blue-500/10">
            <UIcon name="i-heroicons-currency-dollar" class="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p class="text-sm text-gray-400">Month-to-Date Spend</p>
            <p class="text-2xl font-semibold">{{ formatCurrency(overview.summary.totalSpend) }}</p>
          </div>
        </div>
      </UCard>

      <!-- Total Budget -->
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0 p-2 rounded-lg bg-green-500/10">
            <UIcon name="i-heroicons-chart-bar" class="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p class="text-sm text-gray-400">Total Budget</p>
            <p class="text-2xl font-semibold">{{ formatCurrency(overview.summary.totalBudget) }}</p>
            <p v-if="overview.summary.budgetUtilization" class="text-xs text-gray-500">
              {{ overview.summary.budgetUtilization.toFixed(1) }}% utilized
            </p>
          </div>
        </div>
      </UCard>

      <!-- Critical Accounts -->
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0 p-2 rounded-lg" :class="overview.summary.criticalAccounts > 0 ? 'bg-red-500/10' : 'bg-gray-500/10'">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6" :class="overview.summary.criticalAccounts > 0 ? 'text-red-400' : 'text-gray-400'" />
          </div>
          <div>
            <p class="text-sm text-gray-400">Critical Accounts</p>
            <div class="flex items-center gap-2">
              <p class="text-2xl font-semibold" :class="overview.summary.criticalAccounts > 0 ? 'text-red-400' : ''">
                {{ overview.summary.criticalAccounts }}
              </p>
              <UBadge v-if="overview.summary.criticalAccounts > 0" color="red" variant="subtle" size="xs">
                Needs attention
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Alerts This Month -->
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0 p-2 rounded-lg bg-purple-500/10">
            <UIcon name="i-heroicons-bell-alert" class="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p class="text-sm text-gray-400">Alerts This Month</p>
            <p class="text-2xl font-semibold">{{ overview.summary.totalAlerts }}</p>
            <p class="text-xs text-gray-500">
              {{ overview.summary.deliverySuccessRate.toFixed(1) }}% delivery rate
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Alert Level Breakdown -->
    <UCard v-if="!loading && overview">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="text-lg font-semibold">Alert Level Breakdown</div>
          <USelect v-model="selectedMonth" :options="monthOptions" class="w-40" />
        </div>
      </template>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="text-center p-4 bg-blue-500/10 rounded-lg">
          <p class="text-3xl font-bold text-blue-400">{{ overview.summary.alertsByLevel.INFO }}</p>
          <p class="text-sm text-gray-400">INFO</p>
        </div>
        <div class="text-center p-4 bg-yellow-500/10 rounded-lg">
          <p class="text-3xl font-bold text-yellow-400">{{ overview.summary.alertsByLevel.WARNING }}</p>
          <p class="text-sm text-gray-400">WARNING</p>
        </div>
        <div class="text-center p-4 bg-red-500/10 rounded-lg">
          <p class="text-3xl font-bold text-red-400">{{ overview.summary.alertsByLevel.CRITICAL }}</p>
          <p class="text-sm text-gray-400">CRITICAL</p>
        </div>
        <div class="text-center p-4 bg-purple-500/10 rounded-lg">
          <p class="text-3xl font-bold text-purple-400">{{ overview.summary.alertsByLevel.ESCALATION }}</p>
          <p class="text-sm text-gray-400">ESCALATION</p>
        </div>
      </div>
    </UCard>

    <!-- Accounts Table -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-3">
            <div class="text-lg font-semibold">All Accounts</div>
            <UBadge color="emerald" variant="subtle">{{ filteredAccounts.length }} accounts</UBadge>
          </div>
          <div class="flex items-center gap-3">
            <UInput
              v-model="searchQuery"
              placeholder="Search accounts..."
              icon="i-heroicons-magnifying-glass"
              class="w-64"
            />
            <USelect v-model="statusFilter" :options="statusFilterOptions" class="w-36" />
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-arrow-path"
              :loading="loading"
              @click="fetchOverview"
            >
              Refresh
            </UButton>
          </div>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin" />
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center justify-center py-12 text-center">
        <UIcon name="i-heroicons-exclamation-circle" class="w-12 h-12 text-red-500 mb-4" />
        <p class="text-gray-400 mb-4">{{ error }}</p>
        <UButton color="gray" @click="fetchOverview">Try Again</UButton>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredAccounts.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <UIcon name="i-heroicons-building-office-2" class="w-12 h-12 text-gray-500 mb-4" />
        <p class="text-gray-400">No accounts found matching your criteria</p>
      </div>

      <!-- Accounts Table -->
      <UTable
        v-else
        :rows="paginatedAccounts"
        :columns="columns"
        class="min-w-full"
        :sort="{ column: 'currentSpend', direction: 'desc' }"
      >
        <!-- Account Name Column -->
        <template #accountName-data="{ row }">
          <NuxtLink
            :to="`/account/${row.accountId}`"
            class="text-blue-400 hover:text-blue-300 hover:underline"
          >
            {{ row.accountName }} - {{ row.accountId }}
          </NuxtLink>
        </template>

        <!-- Alert Status Column (OK / Exceeded) with Popover -->
        <template #alertStatus-data="{ row }">
          <UPopover v-if="row.alertsThisMonth > 0 || row.hasOverspend" mode="hover">
            <div class="flex items-center gap-1.5 cursor-pointer">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-yellow-400" />
              <span class="text-yellow-400 hover:underline">Exceeded ({{ row.alertsThisMonth }})</span>
            </div>
            <template #panel>
              <div class="p-3 min-w-[280px] max-w-[350px]">
                <div class="text-sm font-semibold mb-2 text-gray-200">Recent Alerts</div>
                <div v-if="row.recentAlerts && row.recentAlerts.length > 0" class="space-y-2">
                  <div
                    v-for="alert in row.recentAlerts"
                    :key="alert.alertId"
                    class="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
                    @click="viewAlertDetails(row.accountId, alert.alertId)"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <UBadge :color="getLevelColor(alert.level)" variant="subtle" size="xs">
                        {{ alert.level }}
                      </UBadge>
                      <span class="text-xs text-gray-400">{{ formatAlertDate(alert.createdAt) }}</span>
                    </div>
                    <div class="text-xs text-gray-300">
                      {{ alert.type }} - {{ formatCurrency(alert.actualSpend) }} / {{ formatCurrency(alert.budget) }}
                    </div>
                  </div>
                </div>
                <div v-else class="text-sm text-gray-400">No recent alerts available</div>
                <div v-if="row.alertsThisMonth > 5" class="mt-2 pt-2 border-t border-gray-700">
                  <NuxtLink
                    :to="`/account/${row.accountId}?tab=alerts`"
                    class="text-xs text-blue-400 hover:underline"
                  >
                    View all {{ row.alertsThisMonth }} alerts
                  </NuxtLink>
                </div>
              </div>
            </template>
          </UPopover>
          <div v-else class="flex items-center gap-1.5">
            <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-400" />
            <span class="text-green-400">OK</span>
          </div>
        </template>

        <!-- Health Column -->
        <template #health-data="{ row }">
          <div class="flex items-center gap-1.5">
            <UIcon
              :name="getHealthIcon(row.status)"
              class="w-4 h-4"
              :class="getHealthIconColor(row.status)"
            />
            <span :class="getHealthTextColor(row.status)">{{ getHealthLabel(row.status) }}</span>
          </div>
        </template>

        <!-- Budget Column -->
        <template #budget-data="{ row }">
          <span v-if="row.budget">{{ formatCurrency(row.budget) }}</span>
          <span v-else class="text-gray-500">-</span>
        </template>

        <!-- Current Spend Column -->
        <template #currentSpend-data="{ row }">
          <span>{{ formatCurrency(row.currentSpend) }}</span>
        </template>

        <!-- Forecast Column -->
        <template #forecastedSpend-data="{ row }">
          <span v-if="row.forecastedSpend">{{ formatCurrency(row.forecastedSpend) }}</span>
          <span v-else class="text-gray-500">-</span>
        </template>

        <!-- Utilization Progress Bar Column -->
        <template #budgetUtilization-data="{ row }">
          <div v-if="row.budget && row.budget > 0" class="w-24">
            <UProgress
              :value="Math.min(row.budgetUtilization || 0, 100)"
              :color="getBudgetUtilizationColor(row.budgetUtilization)"
              size="sm"
            />
          </div>
          <span v-else class="text-gray-500">-</span>
        </template>
      </UTable>

      <!-- Pagination -->
      <div v-if="filteredAccounts.length > 0" class="flex justify-end items-center mt-4">
        <UPagination
          v-model="page"
          :page-count="pageCount"
          :total="filteredAccounts.length"
        />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

const emit = defineEmits<{
  (e: 'view-account', accountId: string): void
}>()

// State
const loading = ref(false)
const error = ref<string | null>(null)
const overview = ref<any>(null)

// Filters
const searchQuery = ref('')
const statusFilter = ref('all')
const selectedMonth = ref(getCurrentMonth())

// Pagination
const page = ref(1)
const pageCount = 20

// Filter options
const statusFilterOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
  { label: 'Healthy', value: 'healthy' },
]

const monthOptions = computed(() => {
  const months = []
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleString('default', { month: 'long', year: 'numeric' })
    months.push({ label, value })
  }
  return months
})

// Table columns - matching the reference design
const columns = [
  { key: 'accountName', label: 'Account', sortable: true },
  { key: 'alertStatus', label: 'Alert Status', sortable: true },
  { key: 'health', label: 'Health', sortable: true },
  { key: 'budget', label: 'Budget', sortable: true },
  { key: 'currentSpend', label: 'Spend MTD', sortable: true },
  { key: 'forecastedSpend', label: 'Forecast', sortable: true },
  { key: 'budgetUtilization', label: 'Utilization', sortable: true },
]

// Computed
const filteredAccounts = computed(() => {
  if (!overview.value?.accounts) return []

  return overview.value.accounts.filter((account: any) => {
    // Search filter
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      const matchesSearch =
        account.accountName?.toLowerCase().includes(query) ||
        account.accountId?.includes(query) ||
        account.linesOfBusiness?.toLowerCase().includes(query)
      if (!matchesSearch) return false
    }

    // Status filter
    if (statusFilter.value !== 'all' && account.status !== statusFilter.value) {
      return false
    }

    return true
  })
})

const paginatedAccounts = computed(() => {
  const start = (page.value - 1) * pageCount
  return filteredAccounts.value.slice(start, start + pageCount)
})

// Methods
function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'critical':
      return 'red'
    case 'warning':
      return 'yellow'
    case 'healthy':
      return 'green'
    default:
      return 'gray'
  }
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'INFO':
      return 'blue'
    case 'WARNING':
      return 'yellow'
    case 'CRITICAL':
      return 'red'
    case 'ESCALATION':
      return 'purple'
    default:
      return 'gray'
  }
}

function getBudgetUtilizationColor(utilization: number | null): string {
  if (!utilization) return 'gray'
  if (utilization >= 100) return 'red'
  if (utilization >= 80) return 'yellow'
  return 'green'
}

function getHealthIcon(status: string): string {
  switch (status) {
    case 'critical':
      return 'i-heroicons-x-circle'
    case 'warning':
      return 'i-heroicons-exclamation-circle'
    case 'healthy':
    default:
      return 'i-heroicons-check-circle'
  }
}

function getHealthIconColor(status: string): string {
  switch (status) {
    case 'critical':
      return 'text-red-400'
    case 'warning':
      return 'text-yellow-400'
    case 'healthy':
    default:
      return 'text-green-400'
  }
}

function getHealthTextColor(status: string): string {
  switch (status) {
    case 'critical':
      return 'text-red-400'
    case 'warning':
      return 'text-yellow-400'
    case 'healthy':
    default:
      return 'text-green-400'
  }
}

function getHealthLabel(status: string): string {
  switch (status) {
    case 'critical':
      return 'Critical'
    case 'warning':
      return 'Warning'
    case 'healthy':
    default:
      return 'Healthy'
  }
}

function formatAlertDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function viewAlertDetails(accountId: string, alertId: string) {
  // Navigate to account alerts tab with the specific alert
  navigateTo(`/account/${accountId}?tab=alerts&alertId=${alertId}`)
}

async function fetchOverview() {
  loading.value = true
  error.value = null

  try {
    const res = await $fetch<{ success: boolean; data: any }>('/api/admin/budget-alerts/overview', {
      query: {
        month: selectedMonth.value,
        includeCosts: 'true',
        includeForecasts: 'true',
      },
    })

    if (res.success && res.data) {
      overview.value = res.data
    } else {
      throw new Error('Failed to fetch overview')
    }
  } catch (err: any) {
    console.error('Failed to fetch budget alerts overview:', err)
    error.value = err.message || 'Failed to load budget alerts overview'
  } finally {
    loading.value = false
  }
}

// Reset page when filters change
watch([searchQuery, statusFilter], () => {
  page.value = 1
})

// Refetch when month changes
watch(selectedMonth, () => {
  page.value = 1
  fetchOverview()
})

// Load on mount
onMounted(() => {
  fetchOverview()
})
</script>
