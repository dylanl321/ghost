<template>
  <div class="chart-tabs-container">
    <!-- Tab Navigation -->
    <div class="border-b border-gray-700 mb-4">
      <nav class="-mb-px flex space-x-8" aria-label="Chart Tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            activeTab === tab.id
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300',
            'whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-150'
          ]"
        >
          <Icon v-if="tab.icon" :name="tab.icon" class="w-4 h-4 inline-block mr-1" />
          {{ tab.label }}
          <span 
            v-if="tab.badge"
            class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300"
          >
            {{ tab.badge }}
          </span>
        </button>
      </nav>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Smart Charts Tab -->
      <div v-if="activeTab === 'smart'" class="animate-fadeIn">
        <ChartsRenderer
          :charts="smartCharts"
          :dataset="dataset"
          :show-regression-line="showRegressionLine"
          :selected-accounts="selectedAccounts"
          @toggle-regression-line="$emit('toggle-regression-line')"
        />
      </div>

      <!-- Organizational Overview Tab -->
      <div v-else-if="activeTab === 'organizational'" class="animate-fadeIn">
        <div class="text-gray-400 text-center py-8">
          <OrganizationalCharts />
        </div>
      </div>

      <!-- Trends Tab -->
      <div v-else-if="activeTab === 'trends'" class="animate-fadeIn">
        <HistoricalTrends />
      </div>

      <!-- Data Table Tab -->
      <div v-else-if="activeTab === 'data'" class="animate-fadeIn">
        <CostDataTable
          :dataset="dataset"
          :selected-accounts="selectedAccounts"
          :mode="dataMode"
          :is-loading="smartChartsLoading"
          @refresh="$emit('refresh-data')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import ChartsRenderer from './ChartsRenderer.vue'
import OrganizationalCharts from './OrganizationalCharts.vue'
import HistoricalTrends from './HistoricalTrends.vue'
import CostDataTable from './CostDataTable.vue'
import type { ChartDefinition } from '~/composables/useChartRegistry'

// Props
const props = defineProps<{
  dataset: any
  selectedAccounts: string[]
  smartCharts: ChartDefinition[]
  showRegressionLine: boolean
  smartChartsLoading: boolean
  dataMode?: 'billable' | 'proforma'
}>()

// Emits
const emit = defineEmits<{
  'toggle-regression-line': []
  'tab-changed': [tabId: string]
  'refresh-data': []
}>()

// State
const activeTab = ref('smart')

// Define tabs
const tabs = computed(() => [
  { 
    id: 'smart', 
    label: 'Smart Analysis',
    icon: 'i-heroicons-chart-bar',
    badge: props.selectedAccounts.length > 0 ? `${props.selectedAccounts.length} selected` : 'All accounts'
  },
  { 
    id: 'organizational', 
    label: 'Organizational Overview',
    icon: 'i-heroicons-building-office'
  },
  { 
    id: 'trends', 
    label: 'Historical Trends',
    icon: 'i-heroicons-arrow-trending-up'
  },
  { 
    id: 'data', 
    label: 'Data Table',
    icon: 'i-heroicons-table-cells',
    badge: props.dataMode === 'proforma' ? 'Proforma' : 'Billable'
  }
])


// Watch for tab changes
watch(activeTab, (newTab) => {
  console.log('Tab changed to:', newTab)
  emit('tab-changed', newTab)
})
</script>

<style scoped>
.chart-tabs-container {
  @apply w-full;
}

.tab-content {
  @apply min-h-[400px];
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>