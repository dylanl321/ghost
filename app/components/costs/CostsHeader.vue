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
        <div class="flex items-center gap-1">
          <div class="w-32">
            <USelectMenu
              v-model="modelMode"
              :options="modeOptions"
              value-attribute="value"
              option-attribute="label"
              size="xs"
            />
          </div>
          <UTooltip text="Learn about Billable vs Pro-forma data">
            <NuxtLink to="/support/docs?topic=proforma-vs-billable" class="text-gray-400 hover:text-gray-300">
              <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4" />
            </NuxtLink>
          </UTooltip>
        </div>
        <UTooltip text="View your scheduled reports">
          <NuxtLink to="/profile?section=scheduled-reports">
            <UButton color="white" variant="ghost" icon="i-heroicons-calendar-days">
              My Reports
            </UButton>
          </NuxtLink>
        </UTooltip>
        <ExportButton
          :loading="isExporting"
          :enable-schedule="true"
          @export="handleExport"
          @schedule="openScheduleModal"
        />
        <ShareButton
          :selected-accounts="selectedAccounts"
          :selected-timeframe="modelSelectedTimeframe"
          :selected-view="modelSelectedView"
          :active-tab="activeTab"
          :data-mode="modelMode"
        />
        <CostSettings />
        <UButton color="white" variant="ghost" icon="i-heroicons-arrow-path" @click="$emit('refresh')">
          Refresh
        </UButton>
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

// Schedule functionality
const { user } = useOidcAuth()
const { isAdmin } = useUserRoles()
const toast = useToast()

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
    return
  }

  isExporting.value = true

  try {
    const { useCostExport } = await import('~/composables/useCostExport')
    const { exportCostData } = useCostExport(props.dataset)

    await exportCostData(format, {
      includeServices: true,
      includeHistorical: true,
      includeForecast: true
    })
  } catch (error) {
    console.error('Export failed:', error)
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


