<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-3xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-white">Execution Details</h3>
            <p class="text-sm text-gray-400 mt-1">
              {{ report?.reportName }}
            </p>
          </div>
          <UButton
            icon="i-heroicons-x-mark"
            variant="ghost"
            color="gray"
            size="sm"
            @click="close"
          />
        </div>
      </template>

      <div v-if="loading" class="py-12 text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-blue-400 mx-auto mb-3" />
        <p class="text-gray-400">Loading execution details...</p>
      </div>

      <div v-else-if="execution" class="space-y-6">
        <!-- Status Overview -->
        <div class="grid grid-cols-4 gap-4">
          <div class="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">Status</div>
            <UBadge
              :color="getStatusColor(execution.status)"
              :icon="getStatusIcon(execution.status)"
              size="sm"
            >
              {{ execution.status }}
            </UBadge>
          </div>

          <div class="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">Duration</div>
            <div class="text-lg font-semibold text-white">
              {{ formatDuration(execution.duration) }}
            </div>
          </div>

          <div class="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">Report Size</div>
            <div class="text-lg font-semibold text-white">
              {{ formatFileSize(execution.reportSize) }}
            </div>
          </div>

          <div class="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">Downloads</div>
            <div class="text-lg font-semibold text-white">
              {{ execution.downloadCount || 0 }}
            </div>
          </div>
        </div>

        <!-- Execution Time -->
        <div class="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-400" />
            <h4 class="text-sm font-semibold text-white">Execution Time</h4>
          </div>
          <div class="text-sm text-gray-300">
            {{ formatDateTime(execution.executionTime) }}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            {{ formatRelativeTime(execution.executionTime) }}
          </div>
        </div>

        <!-- Error Details (if failed) -->
        <div v-if="execution.status === 'failed' && execution.error" class="bg-red-900/10 rounded-lg p-4 border border-red-800">
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5 text-red-400" />
            <h4 class="text-sm font-semibold text-red-300">Error Details</h4>
          </div>
          <pre class="text-xs text-red-200 bg-red-950/30 rounded p-3 overflow-x-auto">{{ execution.error }}</pre>
        </div>

        <!-- Email Delivery Status -->
        <div v-if="execution.emailDelivery" class="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-heroicons-envelope" class="w-4 h-4 text-gray-400" />
            <h4 class="text-sm font-semibold text-white">Email Delivery</h4>
          </div>

          <!-- Summary -->
          <div class="flex items-center gap-4 mb-4 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-gray-400">Sent:</span>
              <span class="text-green-400 font-medium">{{ execution.emailsSent || 0 }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-400">Failed:</span>
              <span class="text-red-400 font-medium">{{ execution.emailsFailed || 0 }}</span>
            </div>
          </div>

          <!-- Recipient Details -->
          <div v-if="execution.emailDelivery.recipients && execution.emailDelivery.recipients.length > 0" class="space-y-2">
            <div
              v-for="recipient in execution.emailDelivery.recipients"
              :key="recipient.email"
              class="flex items-center justify-between p-2 bg-gray-950/50 rounded border border-gray-700"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="recipient.status === 'sent' ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                  :class="recipient.status === 'sent' ? 'text-green-400' : 'text-red-400'"
                  class="w-4 h-4"
                />
                <span class="text-sm text-gray-300">{{ recipient.email }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500">
                  {{ formatDateTime(recipient.timestamp) }}
                </span>
                <UBadge
                  :color="recipient.status === 'sent' ? 'green' : 'red'"
                  size="xs"
                >
                  {{ recipient.status }}
                </UBadge>
              </div>
            </div>

            <!-- Error messages for failed recipients -->
            <div
              v-for="recipient in execution.emailDelivery.recipients.filter(r => r.status === 'failed' && r.error)"
              :key="recipient.email + '-error'"
              class="ml-6 p-2 bg-red-950/20 rounded border border-red-900/30"
            >
              <div class="text-xs text-red-300">{{ recipient.error }}</div>
            </div>
          </div>
        </div>

        <!-- Storage Information -->
        <div v-if="execution.s3Key" class="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-heroicons-cloud-arrow-down" class="w-4 h-4 text-gray-400" />
            <h4 class="text-sm font-semibold text-white">Storage</h4>
          </div>
          <div class="text-xs text-gray-400 font-mono">
            {{ execution.s3Key }}
          </div>
          <div v-if="execution.expiresAt" class="text-xs text-gray-500 mt-2">
            Expires: {{ formatDateTime(new Date(execution.expiresAt * 1000).toISOString()) }}
          </div>
        </div>
      </div>

      <div v-else class="py-12 text-center">
        <UIcon name="i-heroicons-exclamation-circle" class="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p class="text-gray-400">No execution details found</p>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <UButton
            v-if="execution && execution.status === 'success' && execution.s3Key"
            icon="i-heroicons-arrow-down-tray"
            color="primary"
            @click="handleDownload"
          >
            Download Report
          </UButton>
          <UButton
            color="gray"
            variant="ghost"
            @click="close"
          >
            Close
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { ScheduledReport, ReportExecution } from '~/shared/types/scheduled-reports'

const logger = createLogger('ExecutionDetailsModal')

interface Props {
  modelValue: boolean
  report: ScheduledReport | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'download': [execution: ReportExecution]
}>()

const toast = useToast()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const loading = ref(false)
const execution = ref<ReportExecution | null>(null)

// Load execution details when modal opens
watch(isOpen, async (newValue) => {
  if (newValue && props.report) {
    await loadExecutionDetails()
  } else {
    execution.value = null
  }
})

async function loadExecutionDetails() {
  if (!props.report?.reportId || !props.report?.lastRunTime) {
    return
  }

  loading.value = true
  try {
    // Construct executionId from reportId and lastRunTime
    const executionId = `${props.report.reportId}-${new Date(props.report.lastRunTime).getTime()}`

    // Fetch execution details from API
    const response = await $fetch<ReportExecution>(
      `/api/dataset-reports/${props.report.reportId}/executions/${executionId}`
    )

    execution.value = response
  } catch (error: any) {
    logger.error('Failed to load execution details:', error)

    toast.add({
      title: 'Failed to load details',
      description: error.data?.message || 'Could not fetch execution details',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

function close() {
  isOpen.value = false
}

function handleDownload() {
  if (execution.value) {
    emit('download', execution.value)
  }
}

function getStatusColor(status: string) {
  const colors = {
    'success': 'green' as const,
    'failed': 'red' as const,
    'running': 'blue' as const
  }
  return colors[status as keyof typeof colors] || 'gray' as const
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    'success': 'i-heroicons-check-circle',
    'failed': 'i-heroicons-x-circle',
    'running': 'i-heroicons-arrow-path'
  }
  return icons[status] || 'i-heroicons-question-mark-circle'
}

function formatDateTime(value?: string) {
  if (!value) return 'N/A'
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
    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays < 7) return `${diffDays} days ago`

    return formatDateTime(value)
  } catch {
    return ''
  }
}

function formatDuration(ms?: number): string {
  if (!ms) return 'N/A'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return 'N/A'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}
</script>
