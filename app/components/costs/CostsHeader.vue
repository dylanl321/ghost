<template>
  <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 md:p-5 pt-0 md:pt-0" data-tour="costs-header">
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-2">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Cost Analytics</h1>
          <p class="text-gray-600 dark:text-gray-300 text-sm">Monitor and analyze account spending</p>
        </div>
        <UTooltip text="Learn how to use the Cost Dashboard">
          <NuxtLink to="/support/docs?topic=cost-dashboard-guide" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
            <UIcon name="i-heroicons-question-mark-circle" class="w-5 h-5" />
          </NuxtLink>
        </UTooltip>
        <UTooltip text="Start guided tour">
          <UButton
            color="blue"
            variant="soft"
            size="xs"
            icon="i-heroicons-sparkles"
            @click="emitStartTour"
          >
            Tour
          </UButton>
        </UTooltip>
        <!-- Alert severity badges -->
        <button
          v-if="alertsCount && alertsCount > 0"
          class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          @click="emit('view-alerts')"
        >
          <UIcon name="i-heroicons-bell-alert" class="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          <span v-if="alertsBySeverity?.critical" class="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
            {{ alertsBySeverity.critical }} critical
          </span>
          <span v-if="alertsBySeverity?.escalation" class="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
            {{ alertsBySeverity.escalation }} escalation
          </span>
          <span v-if="alertsBySeverity?.warning" class="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            {{ alertsBySeverity.warning }} warning
          </span>
          <span v-if="alertsBySeverity?.info" class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
            {{ alertsBySeverity.info }} info
          </span>
        </button>
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        <!-- Data Mode Selector -->
        <div class="w-32" data-tour="costs-mode">
          <USelectMenu
            v-model="modelMode"
            :options="modeOptions"
            value-attribute="value"
            option-attribute="label"
            size="xs"
          />
        </div>

        <!-- Reports Menu -->
        <UDropdown :items="reportsMenuItems" :popper="{ placement: 'bottom-end' }" data-tour="export-button">
          <UButton
            color="gray"
            variant="ghost"
            :icon="isExporting ? 'i-heroicons-arrow-path' : 'i-heroicons-document-text'"
            trailing-icon="i-heroicons-chevron-down"
            :loading="isExporting"
          >
            {{ isExporting ? 'Exporting...' : 'Reports' }}
          </UButton>
        </UDropdown>

        <!-- Help Menu -->
        <span data-tour="costs-help">
          <UDropdown :items="helpMenuItems" :popper="{ placement: 'bottom-end' }">
            <UButton color="gray" variant="ghost" icon="i-heroicons-question-mark-circle" aria-label="Help" />
          </UDropdown>
        </span>

        <!-- Filter Presets -->
        <FilterPresets
          :selected-accounts="selectedAccounts"
          :timeframe="modelSelectedTimeframe || ''"
          :data-mode="modelMode"
          view-by=""
          :active-tab="activeTab"
          @load="(preset: any) => emit('load-preset', preset)"
        />

        <!-- Settings -->
        <CostSettings />

        <!-- Refresh -->
        <UTooltip text="Refresh data">
          <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-path" aria-label="Refresh data" @click="$emit('refresh')" />
        </UTooltip>
      </div>
    </div>

    <div class="flex flex-wrap gap-3 mt-3 items-center">
      <div class="w-full sm:w-64 md:w-72" data-tour="costs-timeframe">
        <USelectMenu
          v-model="modelSelectedTimeframe"
          :options="timeframeOptions"
          placeholder="Time Period"
          value-attribute="value"
          option-attribute="label"
        />
      </div>

      <!-- View By Selector -->
      <div class="flex items-center gap-1" data-tour="costs-view-by">
        <span class="text-xs text-gray-500 dark:text-gray-400 mr-1">View:</span>
        <div class="inline-flex rounded-md shadow-sm">
          <UButton
            size="xs"
            :color="modelViewBy === 'LINKED_ACCOUNT' ? 'blue' : 'gray'"
            :variant="modelViewBy === 'LINKED_ACCOUNT' ? 'solid' : 'ghost'"
            @click="setViewBy('LINKED_ACCOUNT')"
          >
            Account
          </UButton>
          <UButton
            size="xs"
            :color="modelViewBy === 'SERVICE' ? 'blue' : 'gray'"
            :variant="modelViewBy === 'SERVICE' ? 'solid' : 'ghost'"
            @click="setViewBy('SERVICE')"
          >
            Service
          </UButton>
          <UButton
            size="xs"
            :color="modelViewBy === 'REGION' ? 'blue' : 'gray'"
            :variant="modelViewBy === 'REGION' ? 'solid' : 'ghost'"
            @click="setViewBy('REGION')"
          >
            Region
          </UButton>
        </div>
      </div>
    </div>

    <!-- Share Link Modal -->
    <UModal v-model="showShareLinkModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard
        :ui="{
          ring: '',
          divide: 'divide-y divide-gray-200 dark:divide-gray-700',
          body: { base: 'p-0', padding: '' },
          header: { base: 'py-4 px-6', background: 'bg-white dark:bg-gray-900' },
          footer: { base: 'py-4 px-6', background: 'bg-white dark:bg-gray-900' }
        }"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Share Interactive View</h3>
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
              <p class="text-sm text-gray-600 dark:text-gray-400">Creating share link...</p>
            </div>
          </div>

          <!-- Success State -->
          <div v-else-if="generatedShareUrl && !shareError" class="space-y-4">
            <div class="flex items-center gap-2 text-green-400">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5" />
              <span class="text-sm font-medium">Share link created successfully!</span>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Share URL</label>
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

            <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-200">
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
            <p class="text-sm text-gray-700 dark:text-gray-300">
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
      :user-email="String(user?.claims?.email || '')"
      @submit="handleScheduleSubmit"
      @open-advanced="handleOpenAdvanced"
    />

    <ReportFormModal
      v-model="showAdvancedModal"
      :initial-config="advancedInitialConfig"
      :is-admin="isAdmin"
      :user-email="String(user?.claims?.email || '')"
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
import type { ExportFormat } from '#shared/types/export'
import ExportButton from '~/components/shared/ExportButton.vue'

const logger = createLogger('CostsHeader')

const emit = defineEmits<{ (e: 'refresh'): void; (e: 'start-tour'): void; (e: 'view-alerts'): void; (e: 'load-preset', preset: { selectedAccounts: string[]; timeframe: string; dataMode: string; viewBy: string; activeTab: string }): void }>()

const props = defineProps<{
  timeframeOptions: Array<{ label: string, value: string }>,
  selectedAccounts: string[],
  activeTab: string,
  dataset?: NormalizedDataset | null,
  alertsCount?: number,
  alertsBySeverity?: { critical: number, escalation: number, warning: number, info: number }
}>()

const modelMode = defineModel<DataMode>('mode', { default: 'proforma' })
const modelSelectedTimeframe = defineModel<string>('selectedTimeframe')
const modelViewBy = defineModel<string>('viewBy', { default: 'LINKED_ACCOUNT' })

const modeOptions = [
  { label: 'Billable', value: 'billable' },
  { label: 'Proforma', value: 'proforma' }
]

function setViewBy(value: string) {
  modelViewBy.value = value
}

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

function emitStartTour() {
  emit('start-tour')
}

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
  },
  {
    label: 'Export as BOM',
    icon: 'i-heroicons-document-duplicate',
    click: () => handleBomExport(),
    disabled: isExporting.value
  },
  {
    label: 'Proforma vs Billable Comparison',
    icon: 'i-heroicons-scale',
    click: () => handleProformaBillableExport(),
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
        includeForecast: false
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
const helpMenuItems = computed(() => [[
  {
    label: 'Start Guided Tour',
    icon: 'i-heroicons-sparkles',
    click: emitStartTour
  },
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
]])

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
/**
 * Generate share URL
 */
async function generateShareUrl() {
  shareLoading.value = true
  shareError.value = ''

  try {
    // Build clean URL from state instead of route.fullPath
    // Avoids Vue Router's default JSON array encoding
    const params = new URLSearchParams()

    if (props.selectedAccounts.length > 0) {
      // Use 'account' (singular) for single account, 'accounts' (plural) for multiple
      if (props.selectedAccounts.length === 1) {
        params.set('account', props.selectedAccounts[0])
      } else {
        params.set('accounts', props.selectedAccounts.join(','))
      }
    }
    if (modelSelectedTimeframe.value) {
      params.set('timeframe', modelSelectedTimeframe.value)
    }
    if (props.activeTab) {
      params.set('tab', props.activeTab)
    }
    if (modelMode.value) {
      params.set('mode', modelMode.value)
    }

    const originalUrl = `/account/costs?${params.toString()}`

    const response = await $fetch('/api/shortlinks', {
      method: 'POST',
      body: {
        originalUrl,
        pagePath: '/account/costs',
        configData: {
          selectedAccounts: props.selectedAccounts,
          timeframe: modelSelectedTimeframe.value,
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
    logger.error('Failed to generate share link:', error)
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
    logger.error('Failed to copy to clipboard:', error)
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
  return user.value.claims?.email || user.value.claims?.preferred_username || ''
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

/**
 * Handle export button click
 */
async function handleExport(format: ExportFormat) {
  // Prevent double execution
  if (isExporting.value) {
    return
  }

  if (!props.dataset) {
    logger.warn('No dataset available for export')
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
    xlsx: 'Excel',
    json: 'JSON'
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
      includeForecast: true
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
    logger.error('Export failed:', error)
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
 * Handle Proforma vs Billable Comparison Export
 */
async function handleProformaBillableExport() {
  // Prevent double execution
  if (isExporting.value) {
    return
  }

  isExporting.value = true

  // Show loading toast
  toast.add({
    title: 'Generating Comparison Report',
    description: 'Creating Proforma vs Billable comparison report...',
    icon: 'i-heroicons-arrow-path',
    timeout: 0,
    id: 'proforma-billable-export-progress'
  })

  try {
    const { useProformaBillableExport } = await import('~/composables/useProformaBillableExport')
    const { fetchProformaBillableData } = useProformaBillableExport()

    // Fetch comparison data
    const comparisonData = await fetchProformaBillableData()

    // Create Excel export
    const { createProformaBillableComparisonSheets } = await import('#shared/utils/cost-sheet-builders')
    const { exportData } = useDataExport()

    const sheets = createProformaBillableComparisonSheets(comparisonData)

    const config = {
      title: 'Proforma vs Billable Cost Comparison',
      subtitle: `${new Date().getFullYear() - 1} Actual + ${new Date().getFullYear()} Forecast`,
      metadata: {
        generatedBy: `${user.value?.claims?.name || 'User'} via GHOST Cost Dashboard`,
        timestamp: new Date().toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        }),
        timeframe: `${new Date().getFullYear() - 1} (Actual) + ${new Date().getFullYear()} (Forecast)`,
        scope: 'Organization-Wide',
        filters: {
          'Report Type': 'Proforma vs Billable Comparison',
          'Years': `${new Date().getFullYear() - 1} + ${new Date().getFullYear()}`
        }
      },
      sheets,
      options: {
        filename: `proforma-vs-billable-${new Date().toISOString().split('T')[0]}`,
        includeMetadata: true,
        xlsx: {
          autoWidth: true,
          freezeHeader: true,
          showGridlines: true
        }
      }
    }

    await exportData(config, 'xlsx')

    // Success toast
    toast.remove('proforma-billable-export-progress')
    toast.add({
      title: 'Export Complete',
      description: 'Proforma vs Billable comparison report downloaded successfully',
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } catch (error) {
    logger.error('Proforma vs Billable export failed:', error)
    toast.remove('proforma-billable-export-progress')
    toast.add({
      title: 'Export Failed',
      description: 'An error occurred while generating the comparison report',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  } finally {
    isExporting.value = false
  }
}

/**
 * Handle BOM export
 */
async function handleBomExport() {
  // Prevent double execution
  if (isExporting.value) {
    return
  }

  if (!props.dataset) {
    logger.warn('No dataset available for BOM export')
    toast.add({
      title: 'Export Error',
      description: 'No data available for export',
      icon: 'i-heroicons-exclamation-circle',
      color: 'red'
    })
    return
  }

  // Check if accounts are selected
  if (!props.selectedAccounts || props.selectedAccounts.length === 0) {
    toast.add({
      title: 'No Accounts Selected',
      description: 'Please select at least one account to export BOM',
      icon: 'i-heroicons-exclamation-circle',
      color: 'yellow'
    })
    return
  }

  isExporting.value = true

  // Show loading toast
  const exportType = props.selectedAccounts.length === 1 ? 'BOM file' : 'BOM files (ZIP)'
  toast.add({
    title: 'Generating BOM Export',
    description: `Creating ${exportType}...`,
    icon: 'i-heroicons-arrow-path',
    timeout: 0,
    id: 'bom-export-progress'
  })

  try {
    const { useBomExport } = await import('~/composables/useBomExport')
    const { exportBom } = useBomExport(props.dataset)

    await exportBom()

    // Success toast
    toast.remove('bom-export-progress')
    toast.add({
      title: 'BOM Export Complete',
      description: `${exportType} downloaded successfully`,
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } catch (error) {
    logger.error('BOM export failed:', error)
    toast.remove('bom-export-progress')
    toast.add({
      title: 'BOM Export Failed',
      description: error instanceof Error ? error.message : 'An error occurred while generating the BOM export',
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
    includeForecast: true
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


