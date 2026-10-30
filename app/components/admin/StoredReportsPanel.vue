<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        Stored Reports in S3
      </h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        View and manage all reports stored in S3 across the organization
      </p>
    </div>

    <!-- Statistics Cards -->
    <div v-if="stats" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Icon name="i-heroicons-document-text" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Total Files</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.totalFiles }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <Icon name="i-heroicons-circle-stack" class="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Total Size</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatBytes(stats.totalSize) }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Icon name="i-heroicons-calendar-days" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Scheduled Reports</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.byType.scheduled }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <Icon name="i-heroicons-share" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">Shared Reports</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.byType.shared }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Format Breakdown -->
    <div v-if="stats && Object.keys(stats.byFormat).length > 0" class="mb-8">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">
            Reports by Format
          </h3>
        </template>

        <div class="flex gap-6">
          <div v-for="(count, format) in stats.byFormat" :key="format" class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-1 uppercase">{{ format }}</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ count }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Reports Table -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Icon name="i-heroicons-table-cells" class="w-5 h-5 text-gray-400" />
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">
              All Stored Reports
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
          v-for="filter in typeFilters"
          :key="filter.value"
          :color="currentTypeFilter === filter.value ? 'blue' : 'gray'"
          :variant="currentTypeFilter === filter.value ? 'solid' : 'ghost'"
          size="xs"
          @click="currentTypeFilter = filter.value"
        >
          {{ filter.label }}
        </UButton>

        <div class="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

        <UButton
          v-for="filter in formatFilters"
          :key="filter.value"
          :color="currentFormatFilter === filter.value ? 'blue' : 'gray'"
          :variant="currentFormatFilter === filter.value ? 'solid' : 'ghost'"
          size="xs"
          @click="currentFormatFilter = filter.value"
        >
          {{ filter.label }}
        </UButton>
      </div>

      <!-- Loading State -->
      <div v-if="loading && storedReports.length === 0" class="flex flex-col items-center justify-center py-16">
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
          <!-- S3 Key -->
          <template #s3Key-data="{ row }">
            <div class="max-w-md">
              <code class="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                {{ row.s3Key }}
              </code>
            </div>
          </template>

          <!-- Type -->
          <template #type-data="{ row }">
            <UBadge
              :color="row.type === 'scheduled' ? 'purple' : 'orange'"
              variant="soft"
              size="xs"
            >
              {{ row.type }}
            </UBadge>
          </template>

          <!-- Format -->
          <template #format-data="{ row }">
            <UBadge color="gray" variant="soft" size="xs" class="uppercase">
              {{ row.format }}
            </UBadge>
          </template>

          <!-- Size -->
          <template #size-data="{ row }">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ formatBytes(row.size) }}
            </span>
          </template>

          <!-- Last Modified -->
          <template #lastModified-data="{ row }">
            <div class="text-sm">
              <div class="text-gray-900 dark:text-white">{{ formatDate(row.lastModified) }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatTimeAgo(row.lastModified) }}
              </div>
            </div>
          </template>

          <!-- User ID -->
          <template #userId-data="{ row }">
            <div v-if="row.userId" class="flex items-center gap-2">
              <Icon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ row.userId }}</span>
            </div>
            <span v-else class="text-sm text-gray-400 italic">N/A</span>
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
          {{ searchQuery || currentTypeFilter !== 'all' || currentFormatFilter !== 'all'
            ? 'No reports match your filters'
            : 'No reports have been stored yet'
          }}
        </p>
      </div>
    </UCard>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Delete Report
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this report? This action cannot be undone.
          </p>
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <code class="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
              {{ reportToDelete?.s3Key }}
            </code>
          </div>
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
              Delete
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { StoredReport } from '~/composables/useScheduledReports'

const toast = useToast()

const {
  loading,
  error,
  storedReports,
  stats,
  fetchStoredReports,
  getDownloadUrl,
  deleteStoredReport
} = useStoredReportsAdmin()

// Filters
const searchQuery = ref('')
const currentTypeFilter = ref<'all' | 'scheduled' | 'shared'>('all')
const currentFormatFilter = ref<'all' | 'pdf' | 'csv'>('all')

const typeFilters = [
  { label: 'All Types', value: 'all' as const },
  { label: 'Scheduled', value: 'scheduled' as const },
  { label: 'Shared', value: 'shared' as const }
]

const formatFilters = [
  { label: 'All Formats', value: 'all' as const },
  { label: 'PDF', value: 'pdf' as const },
  { label: 'CSV', value: 'csv' as const }
]

// Delete modal
const showDeleteModal = ref(false)
const reportToDelete = ref<StoredReport | null>(null)
const deleting = ref(false)

// Table columns
const columns = [
  { key: 's3Key', label: 'S3 Key', sortable: false },
  { key: 'type', label: 'Type', sortable: true },
  { key: 'format', label: 'Format', sortable: true },
  { key: 'size', label: 'Size', sortable: true },
  { key: 'lastModified', label: 'Last Modified', sortable: true },
  { key: 'userId', label: 'User', sortable: false },
  { key: 'actions', label: '', sortable: false }
]

// Computed
const filteredReports = computed(() => {
  let reports = storedReports.value

  // Type filter
  if (currentTypeFilter.value !== 'all') {
    reports = reports.filter(r => r.type === currentTypeFilter.value)
  }

  // Format filter
  if (currentFormatFilter.value !== 'all') {
    reports = reports.filter(r => r.format === currentFormatFilter.value)
  }

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    reports = reports.filter(r =>
      r.s3Key.toLowerCase().includes(query) ||
      r.userId?.toLowerCase().includes(query) ||
      r.reportId?.toLowerCase().includes(query)
    )
  }

  return reports
})

// Methods
function getRowActions(report: StoredReport) {
  return [
    [{
      label: 'Download',
      icon: 'i-heroicons-arrow-down-tray',
      click: () => handleDownload(report)
    }],
    [{
      label: 'Delete',
      icon: 'i-heroicons-trash',
      click: () => handleDelete(report)
    }]
  ]
}

async function handleDownload(report: StoredReport) {
  try {
    const downloadUrl = await getDownloadUrl(report.s3Key)
    if (downloadUrl) {
      // Open download URL in new tab
      window.open(downloadUrl, '_blank')
      toast.add({
        title: 'Download Started',
        description: 'Your report download has started',
        icon: 'i-heroicons-check-circle',
        color: 'green'
      })
    }
  } catch (err) {
    toast.add({
      title: 'Download Failed',
      description: error.value || 'Failed to generate download URL',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

function handleDelete(report: StoredReport) {
  reportToDelete.value = report
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!reportToDelete.value) return

  deleting.value = true
  try {
    const success = await deleteStoredReport(reportToDelete.value.s3Key)
    if (success) {
      toast.add({
        title: 'Report Deleted',
        description: 'The report has been deleted from S3',
        icon: 'i-heroicons-check-circle',
        color: 'green'
      })
      showDeleteModal.value = false
      reportToDelete.value = null
    } else {
      toast.add({
        title: 'Delete Failed',
        description: error.value || 'Failed to delete report',
        icon: 'i-heroicons-x-circle',
        color: 'red'
      })
    }
  } finally {
    deleting.value = false
  }
}

async function refreshData() {
  await fetchStoredReports()
}

// Date formatting helpers
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// Load data on mount
onMounted(() => {
  refreshData()
})
</script>
