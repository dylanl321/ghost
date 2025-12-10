<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Generate Shareable Dataset Report
            </h3>
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

      <!-- Success State - Show Share Link -->
      <div v-if="shareResult && shareResult.success" class="space-y-4">
        <div class="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <UIcon name="i-heroicons-check-circle" class="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div>
            <p class="text-sm font-medium text-green-900 dark:text-green-100">
              Report link created successfully!
            </p>
            <p class="text-xs text-green-700 dark:text-green-300 mt-0.5">
              Report available for 90 days
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
            Anyone with this link can download the report (available for 90 days)
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
          <UButton
            color="gray"
            variant="ghost"
            @click="reset"
          >
            Create Another
          </UButton>
        </div>
      </div>

      <!-- Loading State -->
      <div v-else-if="isCreating" class="py-8 text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-primary-600 dark:text-primary-400 mx-auto mb-4 animate-spin" />
        <p class="text-gray-700 dark:text-gray-300 font-medium">
          Generating your dataset report...
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          This may take a few moments
        </p>
      </div>

      <!-- Error State -->
      <div v-else-if="shareResult && !shareResult.success" class="space-y-4">
        <div class="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <UIcon name="i-heroicons-exclamation-circle" class="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div>
            <p class="text-sm font-medium text-red-900 dark:text-red-100">
              Failed to create share link
            </p>
            <p class="text-xs text-red-700 dark:text-red-300 mt-0.5">
              {{ shareResult.error }}
            </p>
          </div>
        </div>
        <UButton
          color="gray"
          variant="soft"
          @click="reset"
          block
        >
          Try Again
        </UButton>
      </div>

      <!-- Initial Form State -->
      <div v-else class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Generate a shareable link for the current dataset report configuration. The report will be available for 90 days.
        </p>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Report Name
          </label>
          <UInput
            v-model="reportName"
            placeholder="e.g., Q4 Security Findings"
            size="lg"
          />
        </div>

        <!-- Current Configuration Summary -->
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
          <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Report Configuration
          </p>
          <div class="flex flex-wrap gap-2">
            <UBadge color="blue" variant="soft" size="xs">
              {{ config.accounts.length }} account{{ config.accounts.length !== 1 ? 's' : '' }}
            </UBadge>
            <UBadge
              v-for="dataset in enabledDatasets"
              :key="dataset"
              color="purple"
              variant="soft"
              size="xs"
            >
              {{ formatDatasetName(dataset) }}
            </UBadge>
            <UBadge color="gray" variant="soft" size="xs">
              {{ config.format.toUpperCase() }}
            </UBadge>
            <UBadge v-if="config.enableAI" color="green" variant="soft" size="xs">
              AI Insights
            </UBadge>
          </div>
        </div>
      </div>

      <template v-if="!shareResult" #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="gray"
            variant="ghost"
            @click="close"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="isCreating"
            :disabled="!reportName || isCreating"
            @click="createShareLink"
          >
            Generate Link
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { DatasetReportConfig } from '#shared/types/dataset-reports'

interface Props {
  modelValue: boolean
  config: DatasetReportConfig
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const toast = useToast()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const reportName = ref('')
const isCreating = ref(false)
const shareResult = ref<{
  success: boolean
  shareId?: string
  shortUrl?: string
  error?: string
} | null>(null)

const enabledDatasets = computed(() => {
  return Object.keys(props.config.datasets)
    .filter(key => (props.config.datasets as any)[key]?.enabled)
})

function formatDatasetName(dataset: string): string {
  const names: Record<string, string> = {
    config: 'Config',
    securityHub: 'Security Hub',
    cloudtrail: 'CloudTrail',
    entraUsers: 'Entra Users'
  }
  return names[dataset] || dataset
}

async function createShareLink() {
  isCreating.value = true

  try {
    const response = await $fetch('/api/dataset-reports/share', {
      method: 'POST',
      body: {
        reportName: reportName.value,
        config: props.config
      }
    })

    shareResult.value = response

    if (response.success) {
      toast.add({
        title: 'Share link created!',
        description: 'Report link is ready to share',
        color: 'green'
      })
    }
  } catch (error: any) {
    shareResult.value = {
      success: false,
      error: error.data?.message || error.message || 'Failed to create share link'
    }

    toast.add({
      title: 'Failed to create share link',
      description: shareResult.value.error,
      color: 'red'
    })
  } finally {
    isCreating.value = false
  }
}

function copyLink(url: string) {
  navigator.clipboard.writeText(url)
  toast.add({
    title: 'Link copied!',
    description: 'Share link copied to clipboard',
    color: 'green'
  })
}

function reset() {
  shareResult.value = null
  reportName.value = ''
}

function close() {
  isOpen.value = false
  // Reset after animation completes
  setTimeout(reset, 300)
}

// Set default report name when opened
watch(isOpen, (newValue) => {
  if (newValue && !reportName.value) {
    const datasets = enabledDatasets.value.map(formatDatasetName).join(' + ')
    reportName.value = `${datasets} Report`
  }
})
</script>
