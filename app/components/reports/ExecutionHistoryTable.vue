<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Execution History
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Last 30 days of report executions
        </p>
      </div>
      <UButton
        v-if="!hideRefresh"
        icon="i-heroicons-arrow-path"
        color="gray"
        variant="ghost"
        size="sm"
        :loading="loading"
        @click="emit('refresh')"
      >
        Refresh
      </UButton>
    </div>

    <!-- Loading State -->
    <div v-if="loading && executions.length === 0" class="flex flex-col items-center justify-center py-12">
      <Icon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-gray-400 mb-3" />
      <p class="text-sm text-gray-600 dark:text-gray-400">Loading history...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12">
      <Icon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
      <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Failed to Load</h4>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{{ error }}</p>
      <UButton @click="emit('refresh')" color="blue" size="sm">
        Try Again
      </UButton>
    </div>

    <!-- History Table -->
    <div v-else-if="executions.length > 0" class="overflow-x-auto">
      <UTable
        :rows="executions"
        :columns="columns"
        :loading="loading"
      >
        <!-- Status Column -->
        <template #status-data="{ row }">
          <div class="flex items-center gap-2">
            <div :class="['w-2 h-2 rounded-full', statusColor(row.status)]"></div>
            <UBadge
              :color="statusBadgeColor(row.status)"
              variant="soft"
              size="xs"
            >
              {{ row.status }}
            </UBadge>
          </div>
        </template>

        <!-- Execution Time Column -->
        <template #executionTime-data="{ row }">
          <div class="text-sm">
            <div class="text-gray-900 dark:text-white">
              {{ formatDate(row.executionTime) }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ formatTimeAgo(row.executionTime) }}
            </div>
          </div>
        </template>

        <!-- Duration Column -->
        <template #duration-data="{ row }">
          <span v-if="row.duration" class="text-sm text-gray-700 dark:text-gray-300">
            {{ formatDuration(row.duration) }}
          </span>
          <span v-else class="text-sm text-gray-400 italic">N/A</span>
        </template>

        <!-- Emails Column -->
        <template #emails-data="{ row }">
          <div class="text-sm">
            <span v-if="row.emailsSent || row.emailsFailed" class="text-gray-700 dark:text-gray-300">
              <span class="text-green-600 dark:text-green-400">{{ row.emailsSent || 0 }}</span>
              <span v-if="row.emailsFailed" class="text-red-600 dark:text-red-400">
                / {{ row.emailsFailed }} failed
              </span>
            </span>
            <span v-else class="text-gray-400 italic">N/A</span>
          </div>
        </template>

        <!-- Error Column -->
        <template #error-data="{ row }">
          <div v-if="row.error" class="max-w-xs">
            <UTooltip :text="row.error" class="cursor-help">
              <div class="text-sm text-red-600 dark:text-red-400 truncate">
                {{ row.error }}
              </div>
            </UTooltip>
          </div>
          <span v-else class="text-sm text-gray-400">—</span>
        </template>

        <!-- Actions Column -->
        <template #actions-data="{ row }">
          <div class="flex items-center gap-1">
            <UButton
              v-if="row.s3Url"
              icon="i-heroicons-arrow-down-tray"
              color="blue"
              variant="ghost"
              size="xs"
              @click="downloadReport(row.s3Url)"
              title="Download Report"
            />
            <UButton
              v-if="row.emailDelivery"
              icon="i-heroicons-envelope-open"
              color="gray"
              variant="ghost"
              size="xs"
              @click="emit('view-email', row)"
              title="View Email Details"
            >
              View Email
            </UButton>
          </div>
        </template>
      </UTable>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12">
      <Icon name="i-heroicons-clock" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
      <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Execution History</h4>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        This report hasn't been executed yet
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ReportExecution } from '#shared/types/scheduled-reports'

defineProps<{
  executions: ReportExecution[]
  loading?: boolean
  error?: string | null
  hideRefresh?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  'view-email': [execution: ReportExecution]
}>()

const columns = [
  { key: 'status', label: 'Status', sortable: false },
  { key: 'executionTime', label: 'Executed', sortable: true },
  { key: 'duration', label: 'Duration', sortable: false },
  { key: 'emails', label: 'Emails', sortable: false },
  { key: 'error', label: 'Error', sortable: false },
  { key: 'actions', label: '', sortable: false }
]

function statusColor(status: string): string {
  switch (status) {
    case 'success':
      return 'bg-green-500'
    case 'failed':
      return 'bg-red-500'
    case 'running':
      return 'bg-blue-500'
    default:
      return 'bg-gray-400'
  }
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case 'success':
      return 'green'
    case 'failed':
      return 'red'
    case 'running':
      return 'blue'
    default:
      return 'gray'
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

// Download report helper
function downloadReport(url: string) {
  window.open(url, '_blank')
}
</script>
