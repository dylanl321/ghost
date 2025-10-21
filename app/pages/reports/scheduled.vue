<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Scheduled Reports
          </h1>
          <UButton
            color="blue"
            icon="i-heroicons-plus"
            @click="openCreateModal"
            :disabled="!canCreateMore"
          >
            Create New Report
          </UButton>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Automate cost reports to be delivered to your inbox on a recurring schedule
        </p>
        <div v-if="!canCreateMore" class="mt-2">
          <UAlert
            color="yellow"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            title="Report Limit Reached"
            description="You have reached the maximum number of scheduled reports (10). Delete an existing report to create a new one."
          />
        </div>
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
      <div v-if="loading && reports.length === 0" class="flex flex-col items-center justify-center py-20">
        <Icon name="i-heroicons-arrow-path" class="w-12 h-12 animate-spin text-gray-400 mb-4" />
        <p class="text-gray-600 dark:text-gray-400">Loading your scheduled reports...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-20">
        <Icon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">Failed to Load Reports</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">{{ error }}</p>
        <UButton @click="fetchReports()" color="blue">
          Try Again
        </UButton>
      </div>

      <!-- Reports Grid -->
      <div v-else-if="filteredReports.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
      <div v-else class="text-center py-20">
        <Icon name="i-heroicons-calendar-days" class="w-20 h-20 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {{ currentFilter === 'all' ? 'No Scheduled Reports' : `No ${currentFilter} Reports` }}
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
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
  </div>
</template>

<script setup lang="ts">
import type { ScheduledReport, CreateReportRequest } from '~/shared/types/scheduled-reports'

definePageMeta({
  title: 'Scheduled Reports',
  description: 'Manage your automated cost reports'
})

const toast = useToast()
const { user } = useOidcAuth()
const { isAdmin } = useUserRoles()

const userEmail = computed(() => user.value?.email || '')

const {
  loading,
  error,
  reports,
  executions,
  fetchReports,
  createReport,
  updateReport,
  deleteReport,
  sendTestReport,
  togglePause,
  fetchExecutionHistory
} = useScheduledReports()

// State
const currentFilter = ref<'all' | 'active' | 'paused'>('all')
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
  return isAdmin.value || reports.value.length < 10
})

const filters = computed(() => [
  { label: 'All', value: 'all' as const, count: reports.value.length },
  { label: 'Active', value: 'active' as const, count: reports.value.filter(r => r.status === 'active').length },
  { label: 'Paused', value: 'paused' as const, count: reports.value.filter(r => r.status === 'paused').length }
])

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
    let success = false

    if (editingReport.value) {
      success = await updateReport(editingReport.value.reportId, data)
      if (success) {
        toast.add({
          title: 'Report Updated',
          description: 'Your scheduled report has been updated successfully',
          icon: 'i-heroicons-check-circle',
          color: 'green'
        })
      }
    } else {
      success = await createReport(data)
      if (success) {
        toast.add({
          title: 'Report Created',
          description: 'Your scheduled report has been created successfully',
          icon: 'i-heroicons-check-circle',
          color: 'green'
        })
      }
    }

    if (success) {
      showModal.value = false
      editingReport.value = null
    } else {
      toast.add({
        title: 'Error',
        description: error.value || 'Failed to save report',
        icon: 'i-heroicons-x-circle',
        color: 'red'
      })
    }
  } catch (err) {
    console.error('Error submitting report:', err)
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
      toast.add({
        title: 'Report Deleted',
        description: 'Your scheduled report has been deleted',
        icon: 'i-heroicons-check-circle',
        color: 'green'
      })
      showDeleteModal.value = false
      reportToDelete.value = null
    } else {
      toast.add({
        title: 'Error',
        description: error.value || 'Failed to delete report',
        icon: 'i-heroicons-x-circle',
        color: 'red'
      })
    }
  } finally {
    deleting.value = false
  }
}

async function handleTest(report: ScheduledReport) {
  const success = await sendTestReport(report.reportId)
  if (success) {
    toast.add({
      title: 'Test Report Sent',
      description: 'Check your inbox for the test report',
      icon: 'i-heroicons-paper-airplane',
      color: 'green'
    })
  } else {
    toast.add({
      title: 'Error',
      description: error.value || 'Failed to send test report',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

async function handleTogglePause(report: ScheduledReport) {
  const pause = report.status === 'active'
  const success = await togglePause(report.reportId, pause)
  if (success) {
    toast.add({
      title: pause ? 'Report Paused' : 'Report Resumed',
      description: pause ? 'Your report will not run until resumed' : 'Your report schedule has been resumed',
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } else {
    toast.add({
      title: 'Error',
      description: error.value || 'Failed to update report status',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
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

// Load reports on mount
onMounted(() => {
  fetchReports()
})
</script>
