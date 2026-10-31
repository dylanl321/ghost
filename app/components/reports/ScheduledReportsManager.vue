<template>
  <div>
    <!-- Limit Warning -->
    <div v-if="!canCreateMore" :class="card ? 'mb-4' : 'mb-6'">
      <UAlert
        color="yellow"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        title="Report Limit Reached"
        :description="`You have reached the maximum number of scheduled reports (${REPORT_LIMIT}). Delete an existing report to create a new one.`"
      />
    </div>

    <!-- Tabs/Filters -->
    <div class="mb-6">
      <div class="flex items-center gap-2">
        <UButton
          v-for="filter in filters"
          :key="filter.value"
          :color="currentFilter === filter.value ? 'blue' : 'gray'"
          :variant="currentFilter === filter.value ? 'solid' : 'ghost'"
          size="sm"
          @click="currentFilter = filter.value"
        >
          {{ filter.label }}
          <UBadge v-if="filter.count !== undefined" :color="currentFilter === filter.value ? 'white' : 'gray'" size="xs" class="ml-2">
            {{ filter.count }}
          </UBadge>
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && reports.length === 0" class="flex flex-col items-center justify-center" :class="card ? 'py-12' : 'py-20'">
      <Icon name="i-heroicons-arrow-path" class="animate-spin text-gray-400" :class="card ? 'w-10 h-10 mb-3' : 'w-12 h-12 mb-4'" />
      <p class="text-gray-600 dark:text-gray-400" :class="{ 'text-sm': card }">Loading your scheduled reports...</p>
    </div>

    <!-- Error State (list fetch only; failed actions are reported with a toast) -->
    <div v-else-if="listError" class="text-center" :class="card ? 'py-12' : 'py-20'">
      <Icon name="i-heroicons-exclamation-triangle" class="text-red-500 mx-auto" :class="card ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-4'" />
      <h3 class="font-semibold text-gray-900 dark:text-white mb-2" :class="card ? 'text-lg' : 'text-xl'">Failed to Load Reports</h3>
      <p class="text-gray-600 dark:text-gray-400" :class="card ? 'text-sm mb-4' : 'mb-6'">{{ listError }}</p>
      <UButton @click="loadReports" color="blue" :size="card ? 'sm' : undefined">
        Try Again
      </UButton>
    </div>

    <!-- Reports Grid -->
    <div v-else-if="filteredReports.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" :class="card ? 'gap-4' : 'gap-6'">
      <ReportCard
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

    <!-- Empty State -->
    <div v-else class="text-center" :class="card ? 'py-12' : 'py-20'">
      <Icon name="i-heroicons-calendar-days" class="text-gray-300 dark:text-gray-600 mx-auto" :class="card ? 'w-16 h-16 mb-3' : 'w-20 h-20 mb-4'" />
      <h3 class="font-semibold text-gray-900 dark:text-white mb-2" :class="card ? 'text-lg' : 'text-xl'">
        {{ currentFilter === 'all' ? 'No Scheduled Reports' : `No ${currentFilter} Reports` }}
      </h3>
      <p class="text-gray-600 dark:text-gray-400" :class="card ? 'text-sm mb-4' : 'mb-6'">
        {{ currentFilter === 'all'
          ? 'Get started by creating your first automated cost report'
          : 'Create a new report or change the filter to see your other reports'
        }}
      </p>
      <UButton
        v-if="currentFilter === 'all'"
        @click="openCreateModal"
        color="blue"
        icon="i-heroicons-plus"
        :size="card ? 'sm' : undefined"
      >
        Create Your First Report
      </UButton>
    </div>

    <!-- Create/Edit Modal -->
    <ReportFormModal
      v-model="showModal"
      :editing-report="editingReport"
      :is-admin="isAdmin"
      :user-email="userEmail"
      @submit="handleSubmit"
    />

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
        />
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Delete Scheduled Report
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete <strong>{{ reportToDelete?.reportName }}</strong>?
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            This action cannot be undone. The report will stop running and all schedule data will be removed.
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="gray"
              variant="ghost"
              @click="showDeleteModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="red"
              :loading="deleting"
              @click="confirmDelete"
            >
              Delete Report
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { ScheduledReport, CreateReportRequest } from '#shared/types/scheduled-reports'

/**
 * Scheduled reports list with create, edit, delete, test, pause and history.
 * Used by /reports/scheduled and the profile Scheduled Reports tab; each keeps its own header
 * and opens the create modal through the exposed openCreateModal / canCreateMore.
 * `card` switches to the tighter spacing used inside the profile card.
 */
withDefaults(defineProps<{
  card?: boolean
}>(), {
  card: false
})

const REPORT_LIMIT = 10

const logger = createLogger('ScheduledReportsManager')

const toast = useToast()
const { user } = useOidcAuth()
const { isAdmin } = useUserRoles()

const userEmail = computed(() => user.value?.email || '')

const {
  loading,
  error,
  reports,
  fetchReports,
  createReport,
  updateReport,
  deleteReport,
  sendTestReport,
  togglePause
} = useScheduledReports()

// History uses its own instance so a failed history load cannot replace the report list with an error
const {
  error: historyFetchError,
  executions,
  fetchExecutionHistory
} = useScheduledReports()

// State
const currentFilter = ref<'all' | 'active' | 'paused'>('all')
const listError = ref<string | null>(null)
const showModal = ref(false)
const showHistoryModal = ref(false)
const showDeleteModal = ref(false)
const editingReport = ref<ScheduledReport | null>(null)
const selectedReport = ref<ScheduledReport | null>(null)
const reportToDelete = ref<ScheduledReport | null>(null)
const deleting = ref(false)
const historyLoading = ref(false)
const historyError = ref<string | null>(null)

// Computed
const filteredReports = computed(() => {
  if (currentFilter.value === 'all') return reports.value
  return reports.value.filter(r => r.status === currentFilter.value)
})

const canCreateMore = computed(() => {
  return isAdmin.value || reports.value.length < REPORT_LIMIT
})

const filters = computed(() => [
  { label: 'All', value: 'all' as const, count: reports.value.length },
  { label: 'Active', value: 'active' as const, count: reports.value.filter(r => r.status === 'active').length },
  { label: 'Paused', value: 'paused' as const, count: reports.value.filter(r => r.status === 'paused').length }
])

// The composable shares one error ref between the list and every action, so only a
// failed list fetch should show the full-page error state
async function loadReports() {
  await fetchReports()
  listError.value = error.value
}

function showError(fallback: string) {
  toast.add({
    title: 'Error',
    description: error.value || fallback,
    icon: 'i-heroicons-x-circle',
    color: 'red'
  })
}

function showSuccess(title: string, description: string, icon = 'i-heroicons-check-circle') {
  toast.add({ title, description, icon, color: 'green' })
}

// Methods
function openCreateModal() {
  editingReport.value = null
  showModal.value = true
}

function handleEdit(report: ScheduledReport) {
  editingReport.value = report
  showModal.value = true
}

async function handleSubmit(data: CreateReportRequest) {
  try {
    const isEdit = !!editingReport.value
    const success = isEdit
      ? await updateReport(editingReport.value!.reportId, data)
      : await createReport(data)

    if (success) {
      showSuccess(
        isEdit ? 'Report Updated' : 'Report Created',
        isEdit ? 'Your scheduled report has been updated successfully' : 'Your scheduled report has been created successfully'
      )
      showModal.value = false
      editingReport.value = null
    } else {
      showError('Failed to save report')
    }
  } catch (err) {
    logger.error('Error submitting report:', err)
  }
}

function handleDelete(report: ScheduledReport) {
  reportToDelete.value = report
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!reportToDelete.value) return

  deleting.value = true
  try {
    const success = await deleteReport(reportToDelete.value.reportId)
    if (success) {
      showSuccess('Report Deleted', 'Your scheduled report has been deleted')
      showDeleteModal.value = false
      reportToDelete.value = null
    } else {
      showError('Failed to delete report')
    }
  } finally {
    deleting.value = false
  }
}

async function handleTest(report: ScheduledReport) {
  const success = await sendTestReport(report.reportId)
  if (success) {
    showSuccess('Test Report Sent', 'Check your inbox for the test report', 'i-heroicons-paper-airplane')
  } else {
    showError('Failed to send test report')
  }
}

async function handleTogglePause(report: ScheduledReport) {
  const pause = report.status === 'active'
  const success = await togglePause(report.reportId, pause)
  if (success) {
    showSuccess(
      pause ? 'Report Paused' : 'Report Resumed',
      pause ? 'Your report will not run until resumed' : 'Your report schedule has been resumed'
    )
  } else {
    showError('Failed to update report status')
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
    // fetchExecutionHistory reports failures through its error ref rather than throwing
    await fetchExecutionHistory(selectedReport.value.reportId)
    historyError.value = historyFetchError.value
  } finally {
    historyLoading.value = false
  }
}

defineExpose({ openCreateModal, canCreateMore })

onMounted(loadReports)
</script>
