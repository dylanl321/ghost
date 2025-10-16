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
        <ExportButton
          :loading="isExporting"
          @export="handleExport"
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

const modelMode = defineModel<DataMode>('mode', { default: 'billable' })
const modelSelectedTimeframe = defineModel<string>('selectedTimeframe')
const modelSelectedView = defineModel<string>('selectedView')

const modeOptions = [
  { label: 'Billable', value: 'billable' },
  { label: 'Proforma', value: 'proforma' }
]

const isExporting = ref(false)

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
</script>


