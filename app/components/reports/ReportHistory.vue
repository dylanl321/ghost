<template>
  <div>
    <div class="p-6 space-y-4">
    <!-- Filters Bar -->
    <div class="flex items-center justify-between gap-4">
      <!-- Status Filters -->
      <div class="flex items-center gap-2">
        <UButton
          v-for="filter in statusFilters"
          :key="filter.value"
          :color="currentStatusFilter === filter.value ? 'primary' : 'gray'"
          :variant="currentStatusFilter === filter.value ? 'solid' : 'ghost'"
          size="sm"
          @click="currentStatusFilter = filter.value"
        >
          {{ filter.label }}
          <UBadge
            v-if="filter.count !== undefined"
            :color="currentStatusFilter === filter.value ? 'white' : 'gray'"
            size="xs"
            class="ml-1"
          >
            {{ filter.count }}
          </UBadge>
        </UButton>
      </div>

      <!-- Date Range Filter -->
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="dateRange"
          :options="dateRangeOptions"
          size="sm"
          class="w-40"
        />

        <!-- Search -->
        <UInput
          v-model="searchQuery"
          icon="i-heroicons-magnifying-glass"
          placeholder="Search..."
          size="sm"
          class="w-48"
        />
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && recentReports.length === 0" class="py-12 flex flex-col items-center bg-gray-800 rounded-lg border border-gray-700">
      <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-gray-400 mb-3" />
      <p class="text-gray-400">Loading history...</p>
    </div>

    <!-- Table View -->
    <div v-else-if="paginatedReports.length > 0" class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-900/50 border-b border-gray-700">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Report Name</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Executed</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Records</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Duration</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Status</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700">
            <tr
              v-for="report in paginatedReports"
              :key="report.reportId + '-' + report.lastRunTime"
              class="hover:bg-gray-900/30 transition-colors"
            >
              <!-- Report Name -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-document-chart-bar" class="w-4 h-4 text-gray-400" />
                  <div>
                    <div class="text-white font-medium">{{ report.reportName }}</div>
                    <div v-if="report.reportConfig?.format" class="text-xs text-gray-500">
                      {{ report.reportConfig.format.toUpperCase() }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- Executed Time -->
              <td class="px-4 py-3">
                <div class="text-gray-300 text-xs">
                  {{ formatDateTime(report.lastRunTime) }}
                </div>
                <div class="text-gray-500 text-xs">
                  {{ formatRelativeTime(report.lastRunTime) }}
                </div>
              </td>

              <!-- Records Count -->
              <td class="px-4 py-3">
                <div class="text-gray-300 text-xs">
                  {{ formatRecordCount(report) }}
                </div>
              </td>

              <!-- Duration -->
              <td class="px-4 py-3">
                <div class="text-gray-400 text-xs">
                  {{ formatDuration(report) }}
                </div>
              </td>

              <!-- Status -->
              <td class="px-4 py-3">
                <UBadge
                  :color="getStatusColor(report.lastRunStatus)"
                  :icon="getStatusIcon(report.lastRunStatus)"
                  size="xs"
                >
                  {{ report.lastRunStatus || 'Unknown' }}
                </UBadge>
              </td>

              <!-- Actions -->
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UTooltip text="View Details">
                    <UButton
                      icon="i-heroicons-eye"
                      color="gray"
                      variant="ghost"
                      size="xs"
                      @click="viewDetails(report)"
                    />
                  </UTooltip>

                  <UTooltip text="Download Report">
                    <UButton
                      icon="i-heroicons-arrow-down-tray"
                      color="gray"
                      variant="ghost"
                      size="xs"
                      @click="handleDownload(report)"
                      :disabled="report.lastRunStatus !== 'success'"
                    />
                  </UTooltip>

                  <UTooltip text="Re-run Report">
                    <UButton
                      icon="i-heroicons-arrow-path"
                      color="gray"
                      variant="ghost"
                      size="xs"
                      @click="handleRerun(report)"
                    />
                  </UTooltip>

                  <UDropdown :items="getDropdownItems(report)" :ui="{ width: 'w-48' }">
                    <UButton
                      icon="i-heroicons-ellipsis-vertical"
                      color="gray"
                      variant="ghost"
                      size="xs"
                    />
                  </UDropdown>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
        <div class="text-xs text-gray-400">
          Showing {{ ((currentPage - 1) * pageSize) + 1 }} to {{ Math.min(currentPage * pageSize, filteredReports.length) }} of {{ filteredReports.length }} results
        </div>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-heroicons-chevron-left"
            color="gray"
            variant="ghost"
            size="xs"
            :disabled="currentPage === 1"
            @click="currentPage--"
          />
          <span class="text-xs text-gray-400">Page {{ currentPage }} of {{ totalPages }}</span>
          <UButton
            icon="i-heroicons-chevron-right"
            color="gray"
            variant="ghost"
            size="xs"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
          />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
      <UIcon name="i-heroicons-clock" class="w-12 h-12 text-gray-600 mx-auto mb-3" />
      <h3 class="text-sm font-medium text-white mb-1">
        {{ searchQuery || currentStatusFilter !== 'all' ? 'No matching history' : 'No report history yet' }}
      </h3>
      <p class="text-xs text-gray-500">
        {{ searchQuery || currentStatusFilter !== 'all' ? 'Try adjusting your filters' : 'Reports will appear here after they run' }}
      </p>
    </div>
    </div>

    <!-- Execution Details Modal -->
    <ExecutionDetailsModal
      v-model="showDetailsModal"
      :report="selectedReportForDetails"
      @download="handleDownloadFromModal"
    />
  </div>
</template>

<script setup lang="ts">
import type { ScheduledReport } from '~/shared/types/scheduled-reports'

const logger = createLogger('ReportHistory')

const emit = defineEmits<{
  'view-details': [report: ScheduledReport]
}>()

const { reports, loading } = useDatasetReports()

// State
const currentStatusFilter = ref('all')
const dateRange = ref('last-30')
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const showDetailsModal = ref(false)
const selectedReportForDetails = ref<ScheduledReport | null>(null)

// Date Range Options
const dateRangeOptions = [
  { label: 'Last 7 Days', value: 'last-7' },
  { label: 'Last 30 Days', value: 'last-30' },
  { label: 'Last 90 Days', value: 'last-90' },
  { label: 'All Time', value: 'all' }
]

// Status Filters
const statusFilters = computed(() => {
  const withRuns = reports.value.filter(r => !!r.lastRunTime)
  return [
    { label: 'All', value: 'all', count: withRuns.length },
    { label: 'Success', value: 'success', count: withRuns.filter(r => r.lastRunStatus === 'success').length },
    { label: 'Failed', value: 'failed', count: withRuns.filter(r => r.lastRunStatus === 'failed').length }
  ]
})

// Get all reports with run history
const recentReports = computed(() => {
  return reports.value
    .filter(report => !!report.lastRunTime)
    .sort((a, b) => reportTimestamp(b.lastRunTime) - reportTimestamp(a.lastRunTime))
})

// Filtered reports based on status, date range, and search
const filteredReports = computed(() => {
  let filtered = recentReports.value

  // Status filter
  if (currentStatusFilter.value !== 'all') {
    filtered = filtered.filter(r => r.lastRunStatus === currentStatusFilter.value)
  }

  // Date range filter
  if (dateRange.value !== 'all') {
    const days = parseInt(dateRange.value.split('-')[1])
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000)
    filtered = filtered.filter(r => {
      const timestamp = reportTimestamp(r.lastRunTime)
      return timestamp >= cutoff
    })
  }

  // Search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(r =>
      r.reportName.toLowerCase().includes(query) ||
      r.description?.toLowerCase().includes(query)
    )
  }

  return filtered
})

// Paginated reports
const paginatedReports = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredReports.value.slice(start, end)
})

const totalPages = computed(() => {
  return Math.ceil(filteredReports.value.length / pageSize.value)
})

// Reset page when filters change
watch([currentStatusFilter, dateRange, searchQuery], () => {
  currentPage.value = 1
})

// Methods
function formatDateTime(value?: string) {
  if (!value) return 'Not run yet'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatRelativeTime(value?: string) {
  if (!value) return ''
  try {
    const date = new Date(value)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return ''
  } catch {
    return ''
  }
}

function formatRecordCount(report: ScheduledReport): string {
  // This would come from execution metadata if available
  return 'N/A'
}

function formatDuration(report: ScheduledReport): string {
  // This would come from execution metadata if available
  return 'N/A'
}

function getStatusColor(status?: string) {
  const colors = {
    'success': 'green' as const,
    'failed': 'red' as const,
    'running': 'blue' as const
  }
  return colors[status as keyof typeof colors] || 'gray' as const
}

function getStatusIcon(status?: string): string {
  const icons: Record<string, string> = {
    'success': 'i-heroicons-check-circle',
    'failed': 'i-heroicons-x-circle',
    'running': 'i-heroicons-arrow-path'
  }
  return icons[status || ''] || 'i-heroicons-question-mark-circle'
}

async function handleDownload(report: ScheduledReport) {
  const toast = useToast()

  try {
    // Verify we have a reportId and the report has run successfully
    if (!report.reportId) {
      throw new Error('Report ID not found')
    }

    if (!report.lastRunTime) {
      throw new Error('Report has not been executed yet')
    }

    toast.add({
      title: 'Preparing download...',
      description: 'Fetching report from storage',
      icon: 'i-heroicons-arrow-down-tray',
      color: 'blue'
    })

    // For dataset reports, we need the executionId
    // Since we don't have individual execution records in the UI yet,
    // we'll use the reportId and lastRunTime to construct the key
    // This matches the pattern used in the scheduled report execution
    const executionId = `${report.reportId}-${new Date(report.lastRunTime).getTime()}`

    // Call the download endpoint
    const response = await $fetch<{
      presignedUrl: string
      reportSize?: number
      executionTime: string
      duration?: number
    }>(`/api/dataset-reports/${report.reportId}/executions/${executionId}/download`)

    // Open presigned URL in new tab to trigger download
    window.open(response.presignedUrl, '_blank')

    toast.add({
      title: 'Download started',
      description: 'Report download has begun',
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } catch (error: any) {
    logger.error('Failed to download report:', error)

    toast.add({
      title: 'Download failed',
      description: error.data?.message || error.message || 'Failed to download report',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

async function handleRerun(report: ScheduledReport) {
  const toast = useToast()

  try {
    if (!report.reportId) {
      throw new Error('Report ID not found')
    }

    toast.add({
      title: 'Starting report...',
      description: 'Generating fresh report data',
      icon: 'i-heroicons-arrow-path',
      color: 'blue'
    })

    // Call the re-run endpoint
    const response = await $fetch<{
      success: boolean
      message: string
      duration?: number
      executionId?: string
    }>(`/api/dataset-reports/${report.reportId}/run`, {
      method: 'POST'
    })

    if (response.success) {
      toast.add({
        title: 'Report completed',
        description: `Generated in ${response.duration ? Math.round(response.duration / 1000) : 'N/A'}s`,
        icon: 'i-heroicons-check-circle',
        color: 'green'
      })

      // Refresh the reports list to show updated status
      const { fetchReports } = useDatasetReports()
      await fetchReports()
    }
  } catch (error: any) {
    logger.error('Failed to re-run report:', error)

    toast.add({
      title: 'Report failed',
      description: error.data?.message || error.message || 'Failed to execute report',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

function getDropdownItems(report: ScheduledReport) {
  return [
    [{
      label: 'Clone Configuration',
      icon: 'i-heroicons-document-duplicate',
      click: () => logger.info('Clone:', report.reportId)
    }],
    [{
      label: 'View Logs',
      icon: 'i-heroicons-document-text',
      click: () => logger.info('View logs:', report.reportId)
    }]
  ]
}

function reportTimestamp(value?: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function viewDetails(report: ScheduledReport) {
  selectedReportForDetails.value = report
  showDetailsModal.value = true
}

function handleDownloadFromModal() {
  // Trigger download using the existing download handler
  if (selectedReportForDetails.value) {
    handleDownload(selectedReportForDetails.value)
  }
}
</script>

