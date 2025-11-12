<template>
  <div class="bg-gray-900 border-b border-gray-700 p-4 md:p-5 pt-0 md:pt-0">
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-2">
        <div>
          <h1 class="text-2xl font-bold text-white">Cost Analytics</h1>
          <p class="text-gray-300 text-sm">Monitor and analyze account spending</p>
        </div>
        <UTooltip text="Learn how to use the Cost Dashboard">
          <NuxtLink to="/support/docs?topic=cost-dashboard-guide" class="text-gray-400 hover:text-gray-300">
            <UIcon name="i-heroicons-question-mark-circle" class="w-5 h-5" />
          </NuxtLink>
        </UTooltip>
      </div>
      <div class="flex gap-2 items-center">
        <!-- Data Mode Selector -->
        <div class="w-32">
          <USelectMenu
            v-model="modelMode"
            :options="modeOptions"
            value-attribute="value"
            option-attribute="label"
            size="xs"
          />
        </div>

        <!-- Reports Menu -->
        <UDropdown :items="reportsMenuItems" :popper="{ placement: 'bottom-end' }">
          <UButton
            color="white"
            variant="ghost"
            :icon="isExporting ? 'i-heroicons-arrow-path' : 'i-heroicons-document-text'"
            trailing-icon="i-heroicons-chevron-down"
            :loading="isExporting"
          >
            {{ isExporting ? 'Exporting...' : 'Reports' }}
          </UButton>
        </UDropdown>

        <!-- Help Menu -->
        <UDropdown :items="helpMenuItems" :popper="{ placement: 'bottom-end' }">
          <UButton color="white" variant="ghost" icon="i-heroicons-question-mark-circle" />
        </UDropdown>

        <!-- Settings -->
        <CostSettings />

        <!-- Refresh -->
        <UTooltip text="Refresh data">
          <UButton color="white" variant="ghost" icon="i-heroicons-arrow-path" @click="$emit('refresh')" />
        </UTooltip>
      </div>
    </div>

    <div class="flex flex-wrap gap-3 mt-3">
      <div class="w-full sm:w-64 md:w-72">
        <USelectMenu
          v-model="modelSelectedTimeframe"
          :options="timeframeOptions"
          placeholder="Time Period"
          value-attribute="value"
          option-attribute="label"
        />
      </div>
      <div class="w-full sm:w-64 md:w-72">
        <USelectMenu
          v-model="modelSelectedView"
          :options="viewOptions"
          placeholder="Select View"
          value-attribute="value"
          option-attribute="label"
        />
      </div>
    </div>

    <!-- Share Link Modal -->
    <UModal v-model="showShareLinkModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard
        :ui="{
          ring: '',
          divide: 'divide-y divide-gray-700',
          body: { base: 'p-0', padding: '' },
          header: { base: 'py-4 px-6', background: 'bg-gray-900' },
          footer: { base: 'py-4 px-6', background: 'bg-gray-900' }
        }"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">Share Interactive View</h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark-20-solid"
              size="sm"
              @click="showShareLinkModal = false"
            />
          </div>
        </template>

        <div class="p-6 space-y-4">
          <!-- Loading State -->
          <div v-if="shareLoading" class="flex items-center justify-center py-8">
            <div class="text-center">
              <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
              <p class="text-sm text-gray-400">Creating share link...</p>
            </div>
          </div>

          <!-- Success State -->
          <div v-else-if="generatedShareUrl && !shareError" class="space-y-4">
            <div class="flex items-center gap-2 text-green-400">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5" />
              <span class="text-sm font-medium">Share link created successfully!</span>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-300">Share URL</label>
              <div class="flex gap-2">
                <UInput
                  :model-value="generatedShareUrl"
                  readonly
                  class="flex-1"
                />
                <UButton
                  color="blue"
                  variant="solid"
                  icon="i-heroicons-clipboard-document"
                  size="sm"
                  @click="copyShareUrl"
                >
                  {{ shareCopied ? 'Copied!' : 'Copy' }}
                </UButton>
              </div>
            </div>

            <div class="bg-blue-900/20 border border-blue-700 rounded-lg p-3 text-xs text-blue-200">
              Link expires in 30 days and includes current view settings, selected accounts, and filters.
            </div>
          </div>

          <!-- Error State -->
          <div v-else-if="shareError" class="space-y-4">
            <div class="flex items-center gap-2 text-red-400">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
              <span class="text-sm font-medium">Failed to create share link</span>
            </div>

            <div class="bg-red-900/20 border border-red-700 rounded-lg p-3">
              <p class="text-xs text-red-200">{{ shareError }}</p>
            </div>
          </div>

          <!-- Initial State -->
          <div v-else class="space-y-4">
            <p class="text-sm text-gray-300">
              Create a shareable link that includes your current view settings, selected accounts, and filters.
            </p>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="gray"
              variant="ghost"
              @click="showShareLinkModal = false"
            >
              Close
            </UButton>
            <UButton
              v-if="!generatedShareUrl && !shareLoading"
              color="blue"
              variant="solid"
              @click="generateShareUrl"
            >
              Create Share Link
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Schedule Modals -->
    <SimpleScheduleModal
      v-model="showSimpleModal"
      :config="currentConfig"
      :is-admin="isAdmin"
      :user-email="userEmail"
      @submit="handleScheduleSubmit"
      @open-advanced="handleOpenAdvanced"
    />

    <ReportFormModal
      v-model="showAdvancedModal"
      :initial-config="advancedInitialConfig"
      :is-admin="isAdmin"
      :user-email="user?.email"
      @submit="handleScheduleSubmit"
    />

    <!-- Share Report Modal -->
    <ShareReportModal
      v-model="showShareReportModal"
      :config="currentConfig"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { DataMode } from '~/types/costs'
import type { NormalizedDataset } from '~/types/costs'
import type { ExportFormat } from '~/shared/types/export'
import ExportButton from '~/components/shared/ExportButton.vue'

const props = defineProps<{
  timeframeOptions: Array<{ label: string, value: string }>,
  viewOptions: Array<{ label: string, value: string }>,
  selectedAccounts: string[],
  activeTab: string,
  dataset?: NormalizedDataset | null
}>()

const modelMode = defineModel<DataMode>('mode', { default: 'proforma' })
const modelSelectedTimeframe = defineModel<string>('selectedTimeframe')
const modelSelectedView = defineModel<string>('selectedView')

const modeOptions = [
  { label: 'Billable', value: 'billable' },
  { label: 'Proforma', value: 'proforma' }
]

const isExporting = ref(false)
const showShareReportModal = ref(false)
const showShareLinkModal = ref(false)
const shareLoading = ref(false)
const generatedShareUrl = ref('')
const shareError = ref('')
const shareCopied = ref(false)

// Schedule functionality
const { user } = useOidcAuth()
const { isAdmin } = useUserRoles()
const toast = useToast()

// Reports menu items
const reportsMenuItems = computed(() => [[
  {
    label: 'Export as PDF',
    icon: 'i-heroicons-document',
    click: () => handleExport('pdf'),
    disabled: isExporting.value
  },
  {
    label: 'Export as CSV',
    icon: 'i-heroicons-table-cells',
    click: () => handleExport('csv'),
    disabled: isExporting.value
  },
  {
    label: 'Export as Excel',
    icon: 'i-heroicons-document-chart-bar',
    click: () => handleExport('xlsx'),
    disabled: isExporting.value
  }
], [
  {
    label: 'Schedule Report',
    icon: 'i-heroicons-calendar-days',
    click: openScheduleModal
  },
  {
    label: 'Generate Shareable Link',
    icon: 'i-heroicons-link',
    click: openShareLinkModal
  },
  {
    label: 'Generate One-Time Report',
    icon: 'i-heroicons-document-arrow-down',
    click: () => {
      // Capture current page state before opening modal
      currentConfig.value = captureViewState({
        selectedAccounts: props.selectedAccounts,
        timeframe: modelSelectedTimeframe.value,
        dataMode: modelMode.value,
        format: 'pdf',
        includeServices: true,
        includeHistorical: true,
        includeProjections: false
      })
      showShareReportModal.value = true
    }
  }
], [
  {
    label: 'My Scheduled Reports',
    icon: 'i-heroicons-queue-list',
    to: '/profile?section=scheduled-reports'
  }
]])

// Help menu items
const helpMenuItems = [[
  {
    label: 'Cost Dashboard Guide',
    icon: 'i-heroicons-book-open',
    to: '/support/docs?topic=cost-dashboard-guide'
  },
  {
    label: 'Billable vs Pro-forma',
    icon: 'i-heroicons-information-circle',
    to: '/support/docs?topic=proforma-vs-billable'
  },
  {
    label: 'Reports Guide',
    icon: 'i-heroicons-document-text',
    to: '/support/docs?topic=reports-guide'
  }
]]

/**
 * Open share link modal
 */
function openShareLinkModal() {
  showShareLinkModal.value = true
  generatedShareUrl.value = ''
  shareError.value = ''
  shareCopied.value = false
}

/**
 * Generate share URL
 */
async function generateShareUrl() {
  shareLoading.value = true
  shareError.value = ''

  try {
    // Build the current route URL
    const route = useRoute()
    const originalUrl = route.fullPath

    // Create the short link with the correct API structure
    const response = await $fetch('/api/shortlinks', {
      method: 'POST',
      body: {
        originalUrl,
        pagePath: '/account/costs',
        configData: {
          selectedAccounts: props.selectedAccounts,
          timeframe: modelSelectedTimeframe.value,
          view: modelSelectedView.value,
          tab: props.activeTab,
          dataMode: modelMode.value
        },
        description: 'Cost Analytics Share Link',
        expiresInDays: 30
      }
    })

    if (response && typeof response === 'object' && 'data' in response) {
      generatedShareUrl.value = (response.data as any).shortUrl as string
      toast.add({
        title: 'Share Link Created',
        description: 'Your shareable link is ready',
        icon: 'i-heroicons-check-circle',
        color: 'green'
      })
    } else {
      throw new Error('Invalid response from server')
    }
  } catch (error: any) {
    console.error('Failed to generate share link:', error)
    shareError.value = error.message || 'Failed to create share link'
    toast.add({
      title: 'Share Link Failed',
      description: 'Could not create shareable link',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  } finally {
    shareLoading.value = false
  }
}

/**
 * Copy share URL to clipboard
 */
async function copyShareUrl() {
  if (!generatedShareUrl.value) return

  try {
    await navigator.clipboard.writeText(generatedShareUrl.value)
    shareCopied.value = true

    toast.add({
      title: 'Link Copied',
      description: 'Share link copied to clipboard',
      icon: 'i-heroicons-clipboard-document-check',
      color: 'green'
    })

    setTimeout(() => {
      shareCopied.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    toast.add({
      title: 'Copy Failed',
      description: 'Could not copy link to clipboard',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

// Extract user email from claims
const userEmail = computed(() => {
  if (!user.value) return ''
  return user.value.email || user.value.claims?.email || user.value.claims?.preferred_username || ''
})

const {
  showSimpleModal,
  showAdvancedModal,
  currentConfig,
  advancedInitialConfig,
  openScheduleModal: openSchedule,
  handleOpenAdvanced,
  captureViewState
} = useScheduleFromView()

const {
  createReport
} = useScheduledReports()

defineEmits<{ (e: 'refresh'): void }>()

/**
 * Handle export button click
 */
async function handleExport(format: ExportFormat) {
  // Prevent double execution
  if (isExporting.value) {
    return
  }

  if (!props.dataset) {
    console.warn('No dataset available for export')
    toast.add({
      title: 'Export Error',
      description: 'No data available for export',
      icon: 'i-heroicons-exclamation-circle',
      color: 'red'
    })
    return
  }

  isExporting.value = true

  // Show loading toast
  const formatLabels: Record<ExportFormat, string> = {
    pdf: 'PDF',
    csv: 'CSV',
    xlsx: 'Excel'
  }

  toast.add({
    title: 'Generating Export',
    description: `Creating ${formatLabels[format]} file...`,
    icon: 'i-heroicons-arrow-path',
    timeout: 0,
    id: 'export-progress'
  })

  try {
    const { useCostExport } = await import('~/composables/useCostExport')
    const { exportCostData } = useCostExport(props.dataset)

    await exportCostData(format, {
      includeServices: true,
      includeHistorical: true,
      includeProjections: true
    })

    // Success toast
    toast.remove('export-progress')
    toast.add({
      title: 'Export Complete',
      description: `${formatLabels[format]} file downloaded successfully`,
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } catch (error) {
    console.error('Export failed:', error)
    toast.remove('export-progress')
    toast.add({
      title: 'Export Failed',
      description: 'An error occurred while generating the export',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  } finally {
    isExporting.value = false
  }
}

/**
 * Open schedule modal with current cost view configuration
 */
function openScheduleModal() {
  const config = captureViewState({
    selectedAccounts: props.selectedAccounts,
    timeframe: modelSelectedTimeframe.value,
    dataMode: modelMode.value,
    format: 'pdf',
    includeServices: true,
    includeHistorical: true,
    includeProjections: true
  })
  openSchedule(config)
}

/**
 * Handle schedule submission
 */
async function handleScheduleSubmit(data: any) {
  const success = await createReport(data)
  if (success) {
    toast.add({
      title: 'Report Scheduled',
      description: 'Your cost report has been scheduled successfully',
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
    showSimpleModal.value = false
  } else {
    toast.add({
      title: 'Error',
      description: 'Failed to schedule report',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}
</script>


