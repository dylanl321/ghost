<template>
  <div class="flex flex-col h-screen overflow-hidden bg-gray-900">
    <!-- Beta Banner -->
    <div class="bg-yellow-900/20 border-b border-yellow-700/50 px-6 py-2 flex-shrink-0">
      <div class="flex items-center justify-center gap-2 text-sm">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-yellow-500" />
        <span class="text-yellow-200">
          <strong>Beta Feature:</strong> Dataset Reports is currently in beta. Some features may not work as expected.
        </span>
      </div>
    </div>

    <!-- Top Menu Bar -->
    <div class="bg-gray-800 border-b border-gray-700 px-6 py-3 flex-shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="text-xl font-bold text-white">Dataset Reports</h1>
          <UBadge color="yellow" variant="soft" size="xs">BETA</UBadge>
          <UTooltip text="Learn how to create and manage AWS dataset reports">
            <NuxtLink to="/support/docs?topic=dataset-reports" class="text-gray-400 hover:text-gray-300">
              <UIcon name="i-heroicons-question-mark-circle" class="w-5 h-5" />
            </NuxtLink>
          </UTooltip>
        </div>

        <!-- Action Menu -->
        <div class="flex items-center gap-2">
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-clock"
            size="sm"
            @click="showHistoryModal = true"
          >
            History
          </UButton>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-calendar-days"
            size="sm"
            @click="showSchedulesModal = true"
          >
            Schedules ({{ activeSchedules }})
          </UButton>
          <div class="border-l border-gray-700 h-6 mx-2" />
          <UButton
            color="gray"
            variant="outline"
            icon="i-heroicons-bookmark"
            size="sm"
            @click="handleSaveQuery"
            :disabled="!hasAnyDatasetSelected"
          >
            Save Query
          </UButton>
          <UButton
            color="blue"
            icon="i-heroicons-play"
            size="sm"
            @click="handleRunNow"
            :disabled="!canRunQuery"
          >
            Run Report
          </UButton>
          <UButton
            color="gray"
            variant="outline"
            icon="i-heroicons-arrow-down-tray"
            size="sm"
            @click="handleExport"
            :disabled="!hasPreviewData"
          >
            Export
          </UButton>
          <UButton
            color="gray"
            variant="outline"
            icon="i-heroicons-calendar"
            size="sm"
            @click="openCreateModal"
            :disabled="!canCreateMore || !hasAnyDatasetSelected"
          >
            Schedule
          </UButton>
        </div>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <!-- Left Sidebar - Account Selector & Query Builder -->
      <div class="w-96 bg-gray-800 border-r border-gray-700 flex flex-col overflow-hidden">
        <!-- Sidebar Header -->
        <div class="px-4 py-3 border-b border-gray-700">
          <h2 class="text-sm font-semibold text-white">Query Builder</h2>
          <p class="text-xs text-gray-400 mt-1">Configure your dataset report parameters</p>
        </div>

        <!-- Scrollable Sidebar Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-6">

          <!-- Account Selection -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-white">Accounts</h3>
              <UBadge v-if="selectedAccounts.length > 0" color="blue" variant="soft" size="xs">
                {{ selectedAccounts.length }} selected
              </UBadge>
            </div>
            <DatasetAccountSelector v-model="selectedAccounts" />
          </div>

          <!-- Dataset Selection -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-white">Datasets</h3>
              <UBadge v-if="selectedDatasetsCount > 0" color="blue" variant="soft" size="xs">
                {{ selectedDatasetsCount }} selected
              </UBadge>
            </div>

            <div class="space-y-2">
              <div
                v-for="dataset in datasetOptions"
                :key="dataset.key"
                :class="[
                  'p-3 rounded-lg border cursor-pointer transition-all',
                  queryBuilder.datasets[dataset.key].enabled
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-600 bg-gray-900/50'
                ]"
                @click="toggleDataset(dataset.key)"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon :name="dataset.icon" class="w-4 h-4 text-gray-400" />
                    <div>
                      <div class="text-sm font-medium text-white">{{ dataset.label }}</div>
                      <div class="text-xs text-gray-400">{{ dataset.description }}</div>
                    </div>
                  </div>
                  <UToggle :model-value="queryBuilder.datasets[dataset.key].enabled" size="sm" />
                </div>
              </div>
            </div>
          </div>

          <!-- Filters for Selected Datasets -->
          <div v-if="hasAnyDatasetSelected" class="space-y-3">
            <h3 class="text-sm font-semibold text-white">Filters</h3>

            <!-- AWS Config Filters -->
            <div v-if="queryBuilder.datasets.config.enabled" class="p-3 rounded-lg bg-gray-900/50 border border-gray-700">
              <div class="flex items-center gap-2 mb-3">
                <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 text-gray-400" />
                <h4 class="text-xs font-semibold text-white">AWS Config</h4>
              </div>
              <ConfigFilters v-model="queryBuilder.datasets.config.filters" />
            </div>

            <!-- Security Hub Filters -->
            <div v-if="queryBuilder.datasets.securityHub.enabled" class="p-3 rounded-lg bg-gray-900/50 border border-gray-700">
              <div class="flex items-center gap-2 mb-3">
                <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-gray-400" />
                <h4 class="text-xs font-semibold text-white">Security Hub</h4>
              </div>
              <SecurityHubFilters v-model="queryBuilder.datasets.securityHub.filters" />
            </div>

            <!-- CloudTrail Filters -->
            <div v-if="queryBuilder.datasets.cloudtrail.enabled" class="p-3 rounded-lg bg-gray-900/50 border border-gray-700">
              <div class="flex items-center gap-2 mb-3">
                <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-gray-400" />
                <h4 class="text-xs font-semibold text-white">CloudTrail</h4>
              </div>
              <CloudTrailFilters v-model="queryBuilder.datasets.cloudtrail.filters" />
            </div>
          </div>

          <!-- Output Format -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-white">Output Format</h3>
            <div class="flex gap-2">
              <UButton
                v-for="format in formats"
                :key="format.value"
                :color="outputFormat === format.value ? 'blue' : 'gray'"
                :variant="outputFormat === format.value ? 'solid' : 'soft'"
                size="xs"
                @click="outputFormat = format.value"
              >
                <UIcon :name="format.icon" class="w-3 h-3 mr-1" />
                {{ format.label }}
              </UButton>
            </div>
          </div>

          <!-- AI Insights Toggle -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-white">AI Insights</h3>
                <p class="text-xs text-gray-400">Include AI-generated summary</p>
              </div>
              <UToggle v-model="enableAI" size="sm" />
            </div>
          </div>
        </div>

        <!-- Sidebar Footer -->
        <div class="px-4 py-3 border-t border-gray-700 bg-gray-900/50">
          <div class="flex items-center justify-between text-xs text-gray-400">
            <span>Query Status:</span>
            <span v-if="canRunQuery" class="text-green-500">Ready to run</span>
            <span v-else class="text-yellow-500">Select accounts & datasets</span>
          </div>
        </div>
      </div>

      <!-- Main Preview Area -->
      <div class="flex-1 flex flex-col overflow-hidden bg-gray-900">
        <!-- Preview Header -->
        <div class="px-6 py-3 border-b border-gray-700 bg-gray-800/50">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-white">Query Preview</h2>
              <p class="text-xs text-gray-400 mt-1">
                <span v-if="!hasAnyDatasetSelected">Select datasets to preview query results</span>
                <span v-else-if="previewLoading">Loading preview...</span>
                <span v-else-if="hasPreviewData">Showing preview of {{ previewRowCount }} records</span>
                <span v-else>Run query to see results</span>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="hasPreviewData"
                color="gray"
                variant="ghost"
                icon="i-heroicons-arrow-path"
                size="xs"
                @click="refreshPreview"
              >
                Refresh
              </UButton>
              <USelectMenu
                v-if="hasPreviewData"
                v-model="previewLimit"
                :options="[10, 25, 50, 100]"
                size="xs"
                class="w-20"
              >
                <template #label>
                  {{ previewLimit }} rows
                </template>
              </USelectMenu>
            </div>
          </div>
        </div>

        <!-- Preview Content -->
        <div class="flex-1 overflow-auto p-6">
          <!-- Empty State - No Datasets Selected -->
          <div v-if="!hasAnyDatasetSelected" class="flex flex-col items-center justify-center h-full text-center">
            <UIcon name="i-heroicons-table-cells" class="w-16 h-16 text-gray-700 mb-4" />
            <h3 class="text-lg font-semibold text-white mb-2">Build Your Query</h3>
            <p class="text-sm text-gray-400 max-w-md mb-6">
              Select accounts and datasets from the sidebar to build your report query. You'll see a preview of the results here.
            </p>
            <div class="flex flex-col gap-3 text-xs text-gray-500">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-gray-600" />
                <span>Select one or more AWS accounts</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-gray-600" />
                <span>Choose datasets (Config, Security Hub, CloudTrail)</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-gray-600" />
                <span>Apply filters to refine your results</span>
              </div>
            </div>
          </div>

          <!-- Loading State -->
          <div v-else-if="previewLoading" class="flex flex-col items-center justify-center h-full">
            <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 animate-spin text-gray-600 mb-4" />
            <p class="text-sm text-gray-400">Generating preview...</p>
          </div>

          <!-- Preview Data -->
          <div v-else-if="hasPreviewData" class="space-y-4">
            <!-- Query Summary -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div class="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div class="text-xs text-gray-400 mb-1">Accounts</div>
                <div class="text-2xl font-bold text-white">{{ selectedAccounts.length || 'All' }}</div>
              </div>
              <div class="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div class="text-xs text-gray-400 mb-1">Datasets</div>
                <div class="text-2xl font-bold text-white">{{ selectedDatasetsCount }}</div>
              </div>
              <div class="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div class="text-xs text-gray-400 mb-1">Total Records</div>
                <div class="text-2xl font-bold text-white">{{ previewRowCount.toLocaleString() }}</div>
              </div>
              <div class="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div class="text-xs text-gray-400 mb-1">Est. Size</div>
                <div class="text-2xl font-bold text-white">{{ estimatedSize }}</div>
              </div>
            </div>

            <!-- Preview Table -->
            <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="bg-gray-900/50">
                    <tr>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Dataset</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Account</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Region</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Resource/Event</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Details</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-700">
                    <tr v-for="(row, idx) in previewData" :key="idx" class="hover:bg-gray-900/30">
                      <td class="px-4 py-3 text-white">
                        <UBadge :color="getDatasetColor(row.dataset)" variant="soft" size="xs">
                          {{ row.dataset }}
                        </UBadge>
                      </td>
                      <td class="px-4 py-3 text-gray-300">
                        <div class="text-xs font-mono">{{ row.accountId }}</div>
                        <div class="text-xs text-gray-500">{{ row.accountName }}</div>
                      </td>
                      <td class="px-4 py-3 text-gray-400 text-xs">{{ row.region }}</td>
                      <td class="px-4 py-3 text-gray-300 max-w-md truncate">{{ row.resource }}</td>
                      <td class="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{{ row.details }}</td>
                      <td class="px-4 py-3 text-gray-400 text-xs">
                        {{ formatDateTime(row.timestamp) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- No Results State -->
          <div v-else class="flex flex-col items-center justify-center h-full text-center">
            <UIcon name="i-heroicons-magnifying-glass" class="w-16 h-16 text-gray-700 mb-4" />
            <h3 class="text-lg font-semibold text-white mb-2">Run Query to See Results</h3>
            <p class="text-sm text-gray-400 max-w-md mb-6">
              Click "Run Report" in the top menu to execute your query and preview the results here.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <DatasetReportFormModal
      v-model="showModal"
      :report="selectedReport"
      @saved="handleSaved"
    />

    <!-- Schedules Modal -->
    <UModal v-model="showSchedulesModal" fullscreen>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Scheduled Reports</h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showSchedulesModal = false" />
          </div>
        </template>

        <div class="space-y-4">
          <div class="flex items-center gap-2 mb-4">
            <UButton
              v-for="filter in filters"
              :key="filter.value"
              :color="currentFilter === filter.value ? 'blue' : 'gray'"
              :variant="currentFilter === filter.value ? 'solid' : 'ghost'"
              size="xs"
              @click="currentFilter = filter.value"
            >
              {{ filter.label }}
              <UBadge v-if="filter.count !== undefined" :color="currentFilter === filter.value ? 'white' : 'gray'" size="xs" class="ml-1">
                {{ filter.count }}
              </UBadge>
            </UButton>
          </div>

          <div v-if="filteredReports.length > 0" class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DatasetReportCard
              v-for="report in filteredReports"
              :key="report.reportId"
              :report="report"
              @edit="handleEdit"
              @delete="handleDelete"
              @test="handleTest"
              @toggle-pause="handleTogglePause"
              @view-history="handleViewHistory"
            />
          </div>

          <div v-else class="text-center py-12">
            <UIcon name="i-heroicons-calendar" class="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p class="text-sm text-gray-400">No scheduled reports yet</p>
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- History Modal -->
    <UModal v-model="showHistoryModal" fullscreen>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Report History</h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showHistoryModal = false" />
          </div>
        </template>

        <div v-if="loading && recentReports.length === 0" class="py-12 flex flex-col items-center">
          <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-gray-400 mb-3" />
          <p class="text-gray-400">Loading history...</p>
        </div>

        <div v-else-if="recentReports.length > 0" class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div
            v-for="report in recentReports"
            :key="report.reportId"
            class="p-4 rounded-lg border border-gray-700 bg-gray-900/50"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1">
                <h3 class="text-sm font-semibold text-white">{{ report.reportName }}</h3>
                <p class="text-xs text-gray-400 mt-1">{{ formatDateTime(report.lastRunTime) }}</p>
              </div>
              <UBadge
                :color="{
                  success: 'green',
                  failed: 'red',
                  running: 'blue'
                }[report.lastRunStatus || 'running'] || 'gray'"
                variant="soft"
                size="xs"
              >
                {{ report.lastRunStatus }}
              </UBadge>
            </div>
            <div class="mt-3 flex gap-2">
              <UButton size="xs" color="blue" variant="soft" icon="i-heroicons-eye" @click="handleViewHistory(report)">
                View
              </UButton>
              <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-arrow-down-tray">
                Download
              </UButton>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-12">
          <UIcon name="i-heroicons-clock" class="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p class="text-sm text-gray-400">No report history yet</p>
        </div>
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-red-500" />
            <h3 class="text-lg font-semibold">Delete Dataset Report</h3>
          </div>
        </template>

        <p class="text-gray-700 dark:text-gray-300 mb-4">
          Are you sure you want to delete <strong>{{ reportToDelete?.reportName }}</strong>?
          This action cannot be undone.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showDeleteModal = false">Cancel</UButton>
            <UButton color="red" :loading="deleting" @click="confirmDelete">Delete</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { ReportExecution, ScheduledReport } from '~/shared/types/scheduled-reports'

const { fetchReports, reports, loading, error, fetchExecutionHistory } = useDatasetReports()

// State
const showModal = ref(false)
const showDeleteModal = ref(false)
const showHistoryModal = ref(false)
const showSchedulesModal = ref(false)
const selectedReport = ref<ScheduledReport | null>(null)
const reportToDelete = ref<ScheduledReport | null>(null)
const currentFilter = ref('all')
const deleting = ref(false)

// Query Builder State
const selectedAccounts = ref<string[]>([])
const outputFormat = ref('pdf')
const enableAI = ref(false)
const queryBuilder = ref({
  datasets: {
    config: {
      enabled: false,
      filters: {}
    },
    securityHub: {
      enabled: false,
      filters: {}
    },
    cloudtrail: {
      enabled: false,
      filters: {}
    }
  }
})

// Preview State
const previewLoading = ref(false)
const previewData = ref<any[]>([])
const previewLimit = ref(25)
const previewRowCount = ref(0)

// Constants
const MAX_REPORTS = 10

const formats = [
  { value: 'pdf', label: 'PDF', icon: 'i-heroicons-document' },
  { value: 'xlsx', label: 'Excel', icon: 'i-heroicons-table-cells' },
  { value: 'json', label: 'JSON', icon: 'i-heroicons-code-bracket' }
]

const datasetOptions = [
  {
    key: 'config',
    label: 'AWS Config',
    description: 'Resource configurations',
    icon: 'i-heroicons-cog-6-tooth'
  },
  {
    key: 'securityHub',
    label: 'Security Hub',
    description: 'Security findings',
    icon: 'i-heroicons-shield-check'
  },
  {
    key: 'cloudtrail',
    label: 'CloudTrail',
    description: 'API activity logs',
    icon: 'i-heroicons-document-text'
  }
]

// Computed
const canCreateMore = computed(() => reports.value.length < MAX_REPORTS)
const activeSchedules = computed(() => reports.value.filter(r => r.status === 'active').length)
const filters = computed(() => [
  { label: 'All', value: 'all', count: reports.value.length },
  { label: 'Active', value: 'active', count: reports.value.filter(r => r.status === 'active').length },
  { label: 'Paused', value: 'paused', count: reports.value.filter(r => r.status === 'paused').length }
])
const filteredReports = computed(() => {
  if (currentFilter.value === 'all') return reports.value
  return reports.value.filter(r => r.status === currentFilter.value)
})
const recentReports = computed(() => {
  return reports.value
    .filter(report => !!report.lastRunTime)
    .sort((a, b) => reportTimestamp(b.lastRunTime) - reportTimestamp(a.lastRunTime))
    .slice(0, 10)
})

const hasAnyDatasetSelected = computed(() => {
  return Object.values(queryBuilder.value.datasets).some((ds: any) => ds.enabled)
})

const selectedDatasetsCount = computed(() => {
  return Object.values(queryBuilder.value.datasets).filter((ds: any) => ds.enabled).length
})

const canRunQuery = computed(() => {
  return hasAnyDatasetSelected.value && (selectedAccounts.value.length > 0 || true)
})

const hasPreviewData = computed(() => previewData.value.length > 0)

const estimatedSize = computed(() => {
  const sizeInMB = previewRowCount.value * 0.002
  if (sizeInMB < 1) return `${Math.round(sizeInMB * 1024)} KB`
  return `${sizeInMB.toFixed(1)} MB`
})

// Methods
function toggleDataset(key: string) {
  const dataset = queryBuilder.value.datasets[key as keyof typeof queryBuilder.value.datasets]
  if (dataset) {
    dataset.enabled = !dataset.enabled
  }
}

function getDatasetColor(dataset: string) {
  const colors: Record<string, string> = {
    'Config': 'blue',
    'SecurityHub': 'red',
    'CloudTrail': 'green'
  }
  return colors[dataset] || 'gray'
}

function openCreateModal() {
  selectedReport.value = null
  showModal.value = true
}

function handleEdit(report: ScheduledReport) {
  selectedReport.value = report
  showModal.value = true
}

function handleDelete(report: ScheduledReport) {
  reportToDelete.value = report
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!reportToDelete.value) return

  deleting.value = true
  try {
    const { deleteReport } = useDatasetReports()
    await deleteReport(reportToDelete.value.reportId)
    await fetchReports()
    showDeleteModal.value = false
    reportToDelete.value = null
  } catch (err: any) {
    console.error('Failed to delete report:', err)
  } finally {
    deleting.value = false
  }
}

async function handleTest(report: ScheduledReport) {
  try {
    const { sendTestReport } = useDatasetReports()
    await sendTestReport(report.reportId)
  } catch (err: any) {
    console.error('Failed to send test report:', err)
  }
}

async function handleTogglePause(report: ScheduledReport) {
  try {
    const { togglePause } = useDatasetReports()
    const newStatus = report.status === 'active' ? 'paused' : 'active'
    await togglePause(report.reportId, newStatus === 'paused')
    await fetchReports()
  } catch (err: any) {
    console.error('Failed to toggle pause:', err)
  }
}

async function handleViewHistory(report: ScheduledReport) {
  // TODO: Implement view history details
  console.log('View history for:', report.reportId)
}

function handleSaved() {
  showModal.value = false
  selectedReport.value = null
  fetchReports()
}

async function handleRunNow() {
  previewLoading.value = true
  try {
    const response = await $fetch<{
      success: boolean
      data: {
        previewData: any[]
        totalRecords: number
        previewLimit: number
        estimatedSize: number
        query: any
      }
    }>('/api/dataset-reports/preview', {
      method: 'POST',
      body: {
        accountIds: selectedAccounts.value,
        reportConfig: {
          format: outputFormat.value,
          enableAI: enableAI.value,
          datasets: queryBuilder.value.datasets
        }
      }
    })

    if (response.success) {
      previewData.value = response.data.previewData
      previewRowCount.value = response.data.totalRecords
    } else {
      throw new Error('Failed to fetch preview data')
    }
  } catch (err: any) {
    console.error('Failed to run query:', err)
    // Show error to user
    previewData.value = []
    previewRowCount.value = 0
  } finally {
    previewLoading.value = false
  }
}

function refreshPreview() {
  handleRunNow()
}

function handleSaveQuery() {
  // TODO: Implement save query functionality
  console.log('Saving query:', queryBuilder.value)
}

function handleExport() {
  // TODO: Implement export functionality
  console.log('Exporting data with format:', outputFormat.value)
}

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

function reportTimestamp(value?: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

// Load reports on mount
onMounted(() => {
  fetchReports()
})
</script>
