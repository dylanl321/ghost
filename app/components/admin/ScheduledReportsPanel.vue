<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        Scheduled Reports Management
      </h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Monitor and manage all scheduled reports across the organization
      </p>
    </div>

    <!-- Statistics Cards -->
    <div v-if="statistics" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Icon name="i-heroicons-document-text" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Total Reports</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ statistics.totalReports }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <Icon name="i-heroicons-check-circle" class="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Active Reports</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ statistics.activeReports }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Icon name="i-heroicons-chart-bar" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Success Rate (24h)</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ statistics.recentExecutions.successRate.toFixed(0) }}%</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <Icon name="i-heroicons-clock" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Upcoming (24h)</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ statistics.upcomingRuns.next24h }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Frequency Breakdown -->
    <div v-if="statistics" class="mb-8">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">
            Reports by Frequency
          </h3>
        </template>

        <div class="grid grid-cols-4 gap-4">
          <div class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Daily</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ statistics.reportsByFrequency.daily }}</p>
          </div>
          <div class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Weekly</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ statistics.reportsByFrequency.weekly }}</p>
          </div>
          <div class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Monthly</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ statistics.reportsByFrequency.monthly }}</p>
          </div>
          <div class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Quarterly</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ statistics.reportsByFrequency.quarterly }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Warning for Stuck Reports -->
    <UAlert
      v-if="stuckReportsCount > 0"
      color="orange"
      variant="soft"
      title="Scheduling Issues Detected"
      :description="`${stuckReportsCount} report(s) have incorrect next run times. Click 'Fix Stuck' to resolve.`"
      icon="i-heroicons-exclamation-triangle"
      class="mb-4"
    >
      <template #actions>
        <UButton
          color="orange"
          variant="solid"
          size="xs"
          @click="fixStuckReports"
          :loading="fixingStuck"
        >
          Fix Now
        </UButton>
      </template>
    </UAlert>

    <!-- All Reports Table -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Icon name="i-heroicons-table-cells" class="w-5 h-5 text-gray-400" />
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">
              All Scheduled Reports
            </h3>
            <UBadge v-if="!loading" color="gray" variant="soft">
              {{ filteredReports.length }} total
            </UBadge>
          </div>
          <div class="flex items-center gap-2">
            <UInput
              v-model="searchQuery"
              icon="i-heroicons-magnifying-glass"
              placeholder="Search reports..."
              size="sm"
              class="w-64"
            />
            <UButton
              v-if="pausedReportsCount > 0"
              icon="i-heroicons-play"
              color="green"
              variant="soft"
              size="sm"
              @click="resumeAllPaused"
              :loading="resumingAll"
              :title="`Resume ${pausedReportsCount} paused report(s)`"
            >
              Resume All ({{ pausedReportsCount }})
            </UButton>
            <UButton
              icon="i-heroicons-wrench-screwdriver"
              color="orange"
              variant="soft"
              size="sm"
              @click="fixStuckReports"
              :loading="fixingStuck"
              title="Fix reports with incorrect scheduling"
            >
              Fix Stuck
            </UButton>
            <UButton
              icon="i-heroicons-arrow-path"
              color="gray"
              variant="soft"
              size="sm"
              @click="refreshData"
              :loading="loading"
            >
              Refresh
            </UButton>
          </div>
        </div>
      </template>

      <!-- Filters -->
      <div class="mb-4 flex items-center gap-2">
        <span class="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
        <UButton
          v-for="filter in statusFilters"
          :key="filter.value"
          :color="currentStatusFilter === filter.value ? 'blue' : 'gray'"
          :variant="currentStatusFilter === filter.value ? 'solid' : 'ghost'"
          size="xs"
          @click="currentStatusFilter = filter.value"
        >
          {{ filter.label }}
        </UButton>

        <div class="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

        <UButton
          v-for="filter in frequencyFilters"
          :key="filter.value"
          :color="currentFrequencyFilter === filter.value ? 'blue' : 'gray'"
          :variant="currentFrequencyFilter === filter.value ? 'solid' : 'ghost'"
          size="xs"
          @click="currentFrequencyFilter = filter.value"
        >
          {{ filter.label }}
        </UButton>
      </div>

      <!-- Loading State -->
      <div v-if="loading && allReports.length === 0" class="flex flex-col items-center justify-center py-16">
        <Icon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-gray-400 mb-3" />
        <p class="text-sm text-gray-600 dark:text-gray-400">Loading reports...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-16">
        <Icon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Failed to Load</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{{ error }}</p>
        <UButton @click="refreshData" color="blue" size="sm">
          Try Again
        </UButton>
      </div>

      <!-- Reports Table -->
      <div v-else-if="filteredReports.length > 0" class="overflow-x-auto">
        <UTable
          :rows="filteredReports"
          :columns="columns"
          :loading="loading"
        >
          <!-- Report Name -->
          <template #reportName-data="{ row }">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">{{ row.reportName }}</div>
              <div v-if="row.description" class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                {{ row.description }}
              </div>
            </div>
          </template>

          <!-- Owner -->
          <template #createdBy-data="{ row }">
            <div class="flex items-center gap-2">
              <Icon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ row.createdBy }}</span>
            </div>
          </template>

          <!-- Frequency -->
          <template #frequency-data="{ row }">
            <ScheduleDisplay :schedule="row.schedule" text-class="text-sm text-gray-700 dark:text-gray-300" />
          </template>

          <!-- Next Run -->
          <template #nextRunTime-data="{ row }">
            <div class="text-sm">
              <div class="text-gray-900 dark:text-white">{{ formatDateInTimezone(row.nextRunTime, row.schedule.timezone) }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatTimeAgo(row.nextRunTime) }}
              </div>
            </div>
          </template>

          <!-- Status -->
          <template #status-data="{ row }">
            <ReportStatusBadge :status="row.status" show-icon />
          </template>

          <!-- Last Run -->
          <template #lastRunStatus-data="{ row }">
            <div v-if="row.lastRunTime" class="text-sm">
              <UBadge
                :color="row.lastRunStatus === 'success' ? 'green' : 'red'"
                variant="soft"
                size="xs"
              >
                {{ row.lastRunStatus }}
              </UBadge>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {{ formatTimeAgo(row.lastRunTime) }}
              </div>
            </div>
            <span v-else class="text-sm text-gray-400 italic">Never</span>
          </template>

          <!-- Actions -->
          <template #actions-data="{ row }">
            <UDropdown :items="getRowActions(row)" :popper="{ placement: 'bottom-end' }">
              <UButton
                icon="i-heroicons-ellipsis-vertical"
                color="gray"
                variant="ghost"
                size="xs"
              />
            </UDropdown>
          </template>
        </UTable>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-16">
        <Icon name="i-heroicons-document-text" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Reports Found</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ searchQuery || currentStatusFilter !== 'all' || currentFrequencyFilter !== 'all'
            ? 'No reports match your filters'
            : 'No scheduled reports have been created yet'
          }}
        </p>
      </div>
    </UCard>

    <!-- Run Now Confirmation Modal -->
    <UModal v-model="showRunNowModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Force Execute Report
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            Are you sure you want to force execute <strong>{{ reportToRun?.reportName }}</strong>?
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            This will execute the report immediately and send emails to all configured recipients.
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="gray"
              variant="ghost"
              @click="showRunNowModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="blue"
              :loading="executing"
              @click="confirmRunNow"
            >
              Execute Now
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Execution History Modal -->
    <UModal v-model="showHistoryModal" :ui="{ width: 'sm:max-w-4xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ selectedReport?.reportName }} - Execution History
            </h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark-20-solid"
              size="sm"
              @click="showHistoryModal = false"
            />
          </div>
        </template>

        <ExecutionHistoryTable
          :executions="executions"
          :loading="historyLoading"
          :error="historyError"
          @refresh="loadHistory"
          @view-email="handleViewEmail"
        />
      </UCard>
    </UModal>

    <!-- Email Delivery Modal -->
    <EmailDeliveryModal
      v-model="showEmailModal"
      :execution="selectedExecution"
    />

    <!-- Report Detail Modal -->
    <UModal v-model="showDetailModal" :ui="{ width: 'sm:max-w-2xl' }">
      <UCard v-if="selectedReport">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ selectedReport.reportName }}
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Report Details
              </p>
            </div>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark-20-solid"
              size="sm"
              @click="showDetailModal = false"
            />
          </div>
        </template>

        <div class="space-y-6">
          <!-- Status and Schedule -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
              <div class="mt-1">
                <ReportStatusBadge :status="selectedReport.status" show-icon />
              </div>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Schedule</label>
              <div class="mt-1 text-sm text-gray-900 dark:text-white">
                <ScheduleDisplay :schedule="selectedReport.schedule" />
              </div>
            </div>
          </div>

          <!-- Timing Info -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Next Run</label>
              <div class="mt-1 text-sm text-gray-900 dark:text-white">
                {{ formatDateInTimezone(selectedReport.nextRunTime, selectedReport.schedule.timezone) }}
              </div>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Last Run</label>
              <div class="mt-1 text-sm text-gray-900 dark:text-white">
                {{ selectedReport.lastRunTime ? formatShortDateTime(selectedReport.lastRunTime) : 'Never' }}
              </div>
            </div>
          </div>

          <!-- Recipients -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Recipients</label>
            <div class="mt-2 flex flex-wrap gap-2">
              <UBadge
                v-for="recipient in selectedReport.recipients"
                :key="recipient"
                color="blue"
                variant="soft"
              >
                {{ recipient }}
              </UBadge>
            </div>
          </div>

          <!-- Report Config -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Report Configuration</label>
            <div class="mt-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Timeframe:</span>
                <span class="text-gray-900 dark:text-white">{{ selectedReport.reportConfig.timeframe }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Format:</span>
                <span class="text-gray-900 dark:text-white">{{ selectedReport.reportConfig.format.toUpperCase() }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Data Mode:</span>
                <span class="text-gray-900 dark:text-white">{{ selectedReport.reportConfig.dataMode }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Accounts:</span>
                <span class="text-gray-900 dark:text-white">
                  {{ selectedReport.reportConfig.accounts?.length || 'All' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Stats -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Statistics</label>
            <div class="mt-2 grid grid-cols-3 gap-4">
              <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div class="text-xs text-gray-600 dark:text-gray-400">Total Runs</div>
                <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ selectedReport.runCount }}</div>
              </div>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div class="text-xs text-gray-600 dark:text-gray-400">Created</div>
                <div class="text-sm font-semibold text-gray-900 dark:text-white">
                  {{ new Date(selectedReport.createdAt).toLocaleDateString() }}
                </div>
              </div>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div class="text-xs text-gray-600 dark:text-gray-400">Owner</div>
                <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {{ selectedReport.createdBy.split('@')[0] }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-between">
            <UButton
              color="gray"
              variant="ghost"
              @click="showDetailModal = false"
            >
              Close
            </UButton>
            <div class="flex gap-2">
              <UButton
                color="blue"
                variant="soft"
                icon="i-heroicons-clock"
                @click="handleViewHistory(selectedReport); showDetailModal = false"
              >
                View History
              </UButton>
              <UButton
                color="blue"
                icon="i-heroicons-bolt"
                @click="handleRunNow(selectedReport); showDetailModal = false"
              >
                Execute Now
              </UButton>
            </div>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { ScheduledReport, ReportExecution } from '#shared/types/scheduled-reports'

const logger = createLogger('ScheduledReportsPanel')

const toast = useToast()

const {
  loading,
  error,
  allReports,
  statistics,
  fetchAllReports,
  fetchStatistics,
  runReportNow
} = useScheduledReportsAdmin()

// Use the regular composable for execution history and pause/resume
const { executions, fetchExecutionHistory, togglePause } = useScheduledReports()

// Filters
const searchQuery = ref('')
const currentStatusFilter = ref<'all' | 'active' | 'paused' | 'disabled'>('all')
const currentFrequencyFilter = ref<'all' | 'daily' | 'weekly' | 'monthly' | 'quarterly'>('all')

const statusFilters = [
  { label: 'All Status', value: 'all' as const },
  { label: 'Active', value: 'active' as const },
  { label: 'Paused', value: 'paused' as const }
]

const frequencyFilters = [
  { label: 'All Frequencies', value: 'all' as const },
  { label: 'Daily', value: 'daily' as const },
  { label: 'Weekly', value: 'weekly' as const },
  { label: 'Monthly', value: 'monthly' as const },
  { label: 'Quarterly', value: 'quarterly' as const }
]

// Modals
const showRunNowModal = ref(false)
const showHistoryModal = ref(false)
const showEmailModal = ref(false)
const showDetailModal = ref(false)
const reportToRun = ref<ScheduledReport | null>(null)
const selectedReport = ref<ScheduledReport | null>(null)
const selectedExecution = ref<ReportExecution | null>(null)
const executing = ref(false)
const historyLoading = ref(false)
const historyError = ref<string | null>(null)
const fixingStuck = ref(false)
const resumingAll = ref(false)

// Table columns
const columns = [
  { key: 'reportName', label: 'Report Name', sortable: true },
  { key: 'createdBy', label: 'Owner', sortable: true },
  { key: 'frequency', label: 'Schedule', sortable: false },
  { key: 'nextRunTime', label: 'Next Run', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'lastRunStatus', label: 'Last Run', sortable: false },
  { key: 'actions', label: '', sortable: false }
]

// Computed
const filteredReports = computed(() => {
  let reports = allReports.value

  // Status filter
  if (currentStatusFilter.value !== 'all') {
    reports = reports.filter(r => r.status === currentStatusFilter.value)
  }

  // Frequency filter
  if (currentFrequencyFilter.value !== 'all') {
    reports = reports.filter(r => r.schedule.frequency === currentFrequencyFilter.value)
  }

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    reports = reports.filter(r =>
      r.reportName.toLowerCase().includes(query) ||
      r.createdBy.toLowerCase().includes(query) ||
      r.description?.toLowerCase().includes(query)
    )
  }

  return reports
})

// Count paused reports
const pausedReportsCount = computed(() => {
  return allReports.value.filter(r => r.status === 'paused').length
})

// Detect stuck reports
const stuckReportsCount = computed(() => {
  const now = new Date()
  return allReports.value.filter(report => {
    // Check active and paused reports (paused may have been auto-paused due to issues)
    if (report.status === 'disabled') return false

    const nextRun = new Date(report.nextRunTime)

    // Report is stuck if:
    // 1. Next run is >1 hour in the past
    const hoursBehind = (now.getTime() - nextRun.getTime()) / (1000 * 60 * 60)
    if (hoursBehind > 1) return true

    // 2. Report last ran within 2 hours but next run is still in the past
    // This catches reports that are trying to run repeatedly
    if (report.lastRunTime) {
      const lastRun = new Date(report.lastRunTime)
      const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60)

      // If last run was very recent (< 2 hours) and next run is in past, it's stuck
      if (hoursSinceLastRun < 2 && nextRun < now) return true
    }

    return false
  }).length
})

// Methods
function getRowActions(report: ScheduledReport) {
  return [
    [{
      label: 'View Details',
      icon: 'i-heroicons-eye',
      click: () => handleViewDetails(report)
    }],
    [{
      label: 'Execute Now',
      icon: 'i-heroicons-bolt',
      click: () => handleRunNow(report)
    }, {
      label: 'View History',
      icon: 'i-heroicons-clock',
      click: () => handleViewHistory(report)
    }, {
      label: report.status === 'paused' ? 'Resume' : 'Pause',
      icon: report.status === 'paused' ? 'i-heroicons-play' : 'i-heroicons-pause',
      click: () => handleTogglePause(report)
    }]
  ]
}

function handleViewDetails(report: ScheduledReport) {
  selectedReport.value = report
  showDetailModal.value = true
}

function handleRunNow(report: ScheduledReport) {
  reportToRun.value = report
  showRunNowModal.value = true
}

async function confirmRunNow() {
  if (!reportToRun.value) return

  executing.value = true
  try {
    const success = await runReportNow(reportToRun.value.reportId)
    if (success) {
      toast.add({
        title: 'Report Executed',
        description: 'The report is being generated and will be sent shortly',
        icon: 'i-heroicons-check-circle',
        color: 'green'
      })
      showRunNowModal.value = false
      reportToRun.value = null

      // Refresh data
      setTimeout(() => refreshData(), 2000)
    } else {
      toast.add({
        title: 'Error',
        description: error.value || 'Failed to execute report',
        icon: 'i-heroicons-x-circle',
        color: 'red'
      })
    }
  } finally {
    executing.value = false
  }
}

async function handleViewHistory(report: ScheduledReport) {
  selectedReport.value = report
  showHistoryModal.value = true
  await loadHistory()
}

async function loadHistory() {
  if (!selectedReport.value) return

  historyLoading.value = true
  historyError.value = null
  try {
    await fetchExecutionHistory(selectedReport.value.reportId)
  } catch (err) {
    historyError.value = error.value || 'Failed to load execution history'
  } finally {
    historyLoading.value = false
  }
}

async function refreshData() {
  await Promise.all([
    fetchAllReports(),
    fetchStatistics()
  ])
}

async function fixStuckReports() {
  fixingStuck.value = true

  try {
    const response = await $fetch<{
      success: boolean
      message: string
      data: {
        locksDeleted: number
        reportsChecked: number
        reportsFixed: number
        reportsPaused: number
        errors: string[]
      }
    }>('/api/admin/scheduled-reports/fix-stuck', {
      method: 'POST'
    })

    if (response.success) {
      const { reportsFixed, reportsPaused, locksDeleted, errors } = response.data

      let toastMessage = `Fixed ${reportsFixed} report(s)`
      if (reportsPaused > 0) {
        toastMessage += `, paused ${reportsPaused} for safety`
      }
      if (locksDeleted > 0) {
        toastMessage += `, removed ${locksDeleted} stale lock(s)`
      }

      toast.add({
        title: 'Success',
        description: toastMessage,
        color: 'green',
        timeout: 5000
      })

      if (errors.length > 0) {
        toast.add({
          title: 'Some Errors Occurred',
          description: `${errors.length} error(s) - check console`,
          color: 'orange'
        })
        logger.error('Fix stuck reports errors:', errors)
      }

      // Refresh data to show updated reports
      await refreshData()
    }
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to fix stuck reports',
      color: 'red'
    })
  } finally {
    fixingStuck.value = false
  }
}

function handleViewEmail(execution: ReportExecution) {
  selectedExecution.value = execution
  showEmailModal.value = true
}

/**
 * Toggle pause/resume for a single report
 */
async function handleTogglePause(report: ScheduledReport) {
  const isPaused = report.status === 'paused'
  const action = isPaused ? 'resuming' : 'pausing'

  try {
    const success = await togglePause(report.reportId, !isPaused)

    if (success) {
      toast.add({
        title: 'Success',
        description: `Successfully ${isPaused ? 'resumed' : 'paused'} ${report.reportName}`,
        icon: 'i-heroicons-check-circle',
        color: 'green'
      })

      // Refresh data to show updated status
      await refreshData()
    } else {
      toast.add({
        title: 'Error',
        description: `Failed to ${action} report`,
        icon: 'i-heroicons-x-circle',
        color: 'red'
      })
    }
  } catch (err: any) {
    logger.error(`Error ${action} report:`, err)
    toast.add({
      title: 'Error',
      description: err.message || `Failed to ${action} report`,
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

/**
 * Resume all paused reports
 */
async function resumeAllPaused() {
  resumingAll.value = true

  const pausedReports = allReports.value.filter(r => r.status === 'paused')
  const results = {
    succeeded: 0,
    failed: 0,
    errors: [] as string[]
  }

  // Process all paused reports
  for (const report of pausedReports) {
    try {
      const success = await togglePause(report.reportId, false)
      if (success) {
        results.succeeded++
      } else {
        results.failed++
        results.errors.push(`Failed to resume ${report.reportName}`)
      }
    } catch (err: any) {
      results.failed++
      results.errors.push(`Error resuming ${report.reportName}: ${err.message}`)
    }
  }

  // Show results
  if (results.succeeded > 0) {
    toast.add({
      title: 'Reports Resumed',
      description: `Successfully resumed ${results.succeeded} report(s)${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
      color: results.failed > 0 ? 'orange' : 'green',
      timeout: 5000
    })
  }

  if (results.errors.length > 0) {
    logger.error('Resume errors:', results.errors)
  }

  // Refresh data
  await refreshData()
  resumingAll.value = false
}

const { formatShortDateTime } = useDateFormatter()

function formatDateInTimezone(dateString: string, timezone: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
    timeZoneName: 'short'
  })
}

// Load data on mount
onMounted(() => {
  refreshData()
})
</script>
