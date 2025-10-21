<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Generate Shareable Report Link
          </h3>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark-20-solid"
            size="sm"
            @click="close"
          />
        </div>
      </template>

      <!-- Success State - Show Share Link -->
      <div v-if="shareResult && shareResult.success" class="space-y-4">
        <div class="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <Icon name="i-heroicons-check-circle" class="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div>
            <p class="text-sm font-medium text-green-900 dark:text-green-100">
              Report link created successfully!
            </p>
            <p class="text-xs text-green-700 dark:text-green-300 mt-0.5">
              Link expires in 90 days
            </p>
          </div>
        </div>

        <!-- Share Link -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Shareable Link
          </label>
          <div class="flex gap-2">
            <UInput
              :model-value="shareResult.shortUrl"
              readonly
              class="flex-1"
              size="lg"
            />
            <UButton
              icon="i-heroicons-clipboard-document"
              color="primary"
              size="lg"
              @click="copyLink(shareResult.shortUrl!)"
            >
              Copy
            </UButton>
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Anyone with this link can download the report for 90 days
          </p>
        </div>

        <!-- Quick Actions -->
        <div class="flex gap-2 pt-2">
          <UButton
            color="gray"
            variant="soft"
            icon="i-heroicons-arrow-top-right-on-square"
            :to="shareResult.shortUrl"
            target="_blank"
            external
          >
            Open Link
          </UButton>
        </div>
      </div>

      <!-- Loading State -->
      <div v-else-if="isCreating" class="py-8 text-center">
        <Icon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary-600 dark:text-primary-400 mx-auto mb-4 animate-spin" />
        <p class="text-gray-700 dark:text-gray-300 font-medium">
          Generating your report...
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          This may take a few moments
        </p>
      </div>

      <!-- Initial Form State -->
      <div v-else class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Generate a shareable link for the current cost report view. The link will be valid for 90 days.
        </p>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Report Name
          </label>
          <UInput
            v-model="reportName"
            placeholder="e.g., Q4 Cost Summary"
            size="lg"
          />
        </div>

        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
          <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Current View Settings
          </p>
          <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <div class="flex justify-between">
              <span>Timeframe:</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ formatTimeframe(config.timeframe) }}</span>
            </div>
            <div class="flex justify-between">
              <span>Data Mode:</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ formatDataMode(config.dataMode) }}</span>
            </div>
            <div class="flex justify-between">
              <span>Format:</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ config.format.toUpperCase() }}</span>
            </div>
            <div class="flex justify-between">
              <span>Accounts:</span>
              <span class="font-medium text-gray-900 dark:text-white">
                {{ config.accounts?.length || 'All' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Error Display -->
        <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p class="text-sm text-red-700 dark:text-red-300">
            {{ error }}
          </p>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            v-if="!shareResult"
            color="gray"
            variant="soft"
            @click="close"
          >
            Cancel
          </UButton>
          <UButton
            v-if="shareResult && shareResult.success"
            color="gray"
            variant="soft"
            @click="close"
          >
            Done
          </UButton>
          <UButton
            v-if="!shareResult"
            color="primary"
            :loading="isCreating"
            :disabled="!reportName.trim()"
            @click="generateShareLink"
          >
            Generate Link
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { ReportConfig } from '~/shared/types/scheduled-reports'
import type { CreateShareReportResponse } from '~/shared/types/shared-reports'

const props = defineProps<{
  modelValue: boolean
  config: ReportConfig
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { createSharedReport, copyShareLink, isCreating } = useSharedReports()

const reportName = ref('')
const shareResult = ref<CreateShareReportResponse | null>(null)
const error = ref<string | null>(null)

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Reset form when modal opens
watch(isOpen, (open) => {
  if (open) {
    reportName.value = generateDefaultName()
    shareResult.value = null
    error.value = null
  }
})

function generateDefaultName(): string {
  const timeframe = formatTimeframe(props.config.timeframe)
  const mode = props.config.dataMode === 'billable' ? 'Billable' : 'Proforma'
  return `${timeframe} - ${mode} Costs`
}

async function generateShareLink() {
  error.value = null

  const result = await createSharedReport({
    reportName: reportName.value,
    config: props.config
  })

  if (result.success) {
    shareResult.value = result
  } else {
    error.value = result.error || 'Failed to generate share link'
  }
}

function copyLink(url: string) {
  copyShareLink(url)
}

function close() {
  isOpen.value = false
}

function formatTimeframe(timeframe: string): string {
  const map: Record<string, string> = {
    thisMonth: 'This Month',
    lastMonth: 'Last Month',
    last3Months: 'Last 3 Months',
    last6Months: 'Last 6 Months',
    last12Months: 'Last 12 Months',
    yearToDate: 'Year to Date',
    lastYear: 'Last Year'
  }
  return map[timeframe] || timeframe
}

function formatDataMode(mode: string): string {
  return mode === 'billable' ? 'Billable' : 'Proforma'
}
</script>
