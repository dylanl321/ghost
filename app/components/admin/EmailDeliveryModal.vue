<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-4xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Email Delivery Details
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {{ formatDate(execution?.executionTime) }}
            </p>
          </div>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark-20-solid"
            size="sm"
            @click="close"
          />
        </div>
      </template>

      <div v-if="execution?.emailDelivery" class="space-y-6">
        <!-- Email Subject & Message ID -->
        <div>
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Subject
          </h4>
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <p class="text-sm text-gray-900 dark:text-white font-medium">
              {{ execution.emailDelivery.subject }}
            </p>
          </div>

          <div v-if="execution.emailDelivery.sesMessageId" class="mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <Icon name="i-heroicons-envelope" class="w-4 h-4" />
            <span class="font-mono">{{ execution.emailDelivery.sesMessageId }}</span>
          </div>
        </div>

        <!-- Recipients Table -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
              Recipients ({{ execution.emailDelivery.recipients.length }})
            </h4>
            <div class="flex items-center gap-2 text-xs">
              <UBadge color="green" variant="soft">
                {{ execution.emailDelivery.totalSent }} sent
              </UBadge>
              <UBadge v-if="execution.emailDelivery.totalFailed > 0" color="red" variant="soft">
                {{ execution.emailDelivery.totalFailed }} failed
              </UBadge>
            </div>
          </div>

          <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <UTable
              :rows="execution.emailDelivery.recipients"
              :columns="recipientColumns"
            >
              <!-- Email Column -->
              <template #email-data="{ row }">
                <div class="flex items-center gap-2">
                  <Icon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
                  <span class="text-sm text-gray-900 dark:text-white font-medium">{{ row.email }}</span>
                </div>
              </template>

              <!-- Status Column -->
              <template #status-data="{ row }">
                <UBadge
                  :color="row.status === 'sent' ? 'green' : 'red'"
                  variant="soft"
                  size="xs"
                >
                  {{ row.status }}
                </UBadge>
              </template>

              <!-- Timestamp Column -->
              <template #timestamp-data="{ row }">
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  {{ formatTime(row.timestamp) }}
                </span>
              </template>

              <!-- Error Column -->
              <template #error-data="{ row }">
                <div v-if="row.error" class="max-w-xs">
                  <UTooltip :text="row.error">
                    <span class="text-sm text-red-600 dark:text-red-400 truncate cursor-help">
                      {{ row.error }}
                    </span>
                  </UTooltip>
                </div>
                <span v-else class="text-sm text-gray-400">—</span>
              </template>
            </UTable>
          </div>
        </div>

        <!-- Email Body Preview -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
              Email Body
            </h4>
            <div class="flex gap-2">
              <UButton
                size="xs"
                color="gray"
                :variant="viewMode === 'preview' ? 'solid' : 'ghost'"
                @click="viewMode = 'preview'"
              >
                Preview
              </UButton>
              <UButton
                size="xs"
                color="gray"
                :variant="viewMode === 'rendered' ? 'solid' : 'ghost'"
                @click="viewMode = 'rendered'"
              >
                Rendered
              </UButton>
              <UButton
                size="xs"
                color="gray"
                :variant="viewMode === 'source' ? 'solid' : 'ghost'"
                @click="viewMode = 'source'"
              >
                Source
              </UButton>
            </div>
          </div>

          <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <!-- Text Preview -->
            <div v-if="viewMode === 'preview'" class="p-4 bg-gray-50 dark:bg-gray-800">
              <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {{ execution.emailDelivery.bodyPreview }}...
              </p>
            </div>

            <!-- Rendered HTML -->
            <div v-else-if="viewMode === 'rendered'" class="p-4 bg-white dark:bg-gray-900 max-h-96 overflow-y-auto">
              <div v-html="execution.emailDelivery.htmlBody" />
            </div>

            <!-- HTML Source Code -->
            <div v-else class="p-4 bg-white dark:bg-gray-900 max-h-96 overflow-y-auto">
              <pre class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">{{ execution.emailDelivery.htmlBody }}</pre>
            </div>
          </div>
        </div>

        <!-- Execution Stats -->
        <div class="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Duration</p>
            <p class="text-sm font-semibold text-gray-900 dark:text-white">
              {{ formatDuration(execution.duration) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Report Size</p>
            <p class="text-sm font-semibold text-gray-900 dark:text-white">
              {{ formatBytes(execution.reportSize) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Status</p>
            <UBadge
              :color="execution.status === 'success' ? 'green' : 'red'"
              variant="soft"
            >
              {{ execution.status }}
            </UBadge>
          </div>
        </div>
      </div>

      <!-- No Email Data -->
      <div v-else class="py-12 text-center">
        <Icon name="i-heroicons-envelope-open" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p class="text-gray-600 dark:text-gray-400">
          No email delivery details available for this execution
        </p>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton color="gray" variant="soft" @click="close">
            Close
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { ReportExecution } from '~/shared/types/scheduled-reports'

const props = defineProps<{
  modelValue: boolean
  execution: ReportExecution | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const viewMode = ref<'preview' | 'rendered' | 'source'>('rendered')

const recipientColumns = [
  { key: 'email', label: 'Recipient' },
  { key: 'status', label: 'Status' },
  { key: 'timestamp', label: 'Time' },
  { key: 'error', label: 'Error' }
]

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

function close() {
  isOpen.value = false
}

function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })
}

function formatDuration(ms?: number): string {
  if (!ms) return 'N/A'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function formatBytes(bytes?: number): string {
  if (!bytes) return 'N/A'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>
