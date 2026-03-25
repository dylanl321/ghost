<template>
  <div class="chart-tabs-container">
    <!-- Tab Navigation -->
    <div class="border-b border-gray-700 mb-4">
      <nav class="-mb-px flex space-x-8" aria-label="Chart Tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="handleTabChange(tab.id)"
          :class="[
            activeTab === tab.id
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300',
            'whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-150'
          ]"
        >
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
      <template v-if="activeTab === 'smart'">
        <div v-if="smartChartsLoading" class="text-gray-400 text-center py-8">
          Loading smart charts...
        </div>
        <ChartsRenderer
          v-else
          :charts="smartCharts"
          :dataset="dataset"
          :show-regression-line="showRegressionLine"
          :selected-accounts="selectedAccounts"
          :warnings="warnings"
          @toggle-regression-line="$emit('toggle-regression-line')"
        />
      </template>

      <!-- Organizational Overview Tab -->
      <template v-else-if="activeTab === 'organizational'">
        <OrganizationalCharts />
      </template>

      <!-- Trends Tab -->
      <template v-else-if="activeTab === 'trends'">
        <ChartsRenderer
          :charts="trendCharts"
          :dataset="dataset"
          :show-regression-line="showRegressionLine"
          :selected-accounts="selectedAccounts"
          :warnings="warnings"
          @toggle-regression-line="$emit('toggle-regression-line')"
        />
      </template>

      <!-- Forecast Tab -->
      <template v-else-if="activeTab === 'forecast'">
        <ForecastDataTable />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ChartsRenderer from './ChartsRenderer.vue'
import OrganizationalCharts from './OrganizationalCharts.vue'
import ForecastDataTable from './ForecastDataTable.vue'
import { useChartRegistry } from '~/composables/useChartRegistry'
import type { ChartDefinition } from '~/composables/useChartRegistry'

const logger = createLogger('ChartTabs')

// Props
const props = defineProps<{
  dataset: any
  selectedAccounts: string[]
  smartCharts: ChartDefinition[]
  showRegressionLine: boolean
  smartChartsLoading: boolean
  allChartDefinitions?: Record<string, ChartDefinition>
  warnings?: string[]
}>()

// Emits
const emit = defineEmits<{
  'toggle-regression-line': []
  'tab-changed': [tabId: string]
}>()

// State
const activeTab = ref('smart')

// Define tabs
const tabs = computed(() => {
  const tabList = [
    { 
      id: 'smart', 
      label: 'Smart Analysis',
      badge: props.selectedAccounts.length > 0 ? `${props.selectedAccounts.length} selected` : 'All accounts'
    },
    { 
      id: 'organizational', 
      label: 'Organizational Overview'
    },
    { 
      id: 'trends', 
      label: 'Historical Trends'
    },
    { 
      id: 'forecast', 
      label: 'Forecast Data'
    }
  ]
  
  return tabList
})

// Get registry instance for extractors
const { chartDefinitions } = useChartRegistry({ 
  scenario: ref('all-accounts'),
  timeframe: ref('thisMonth')
})

// Trend charts - computed property
const trendCharts = computed((): ChartDefinition[] => {
  if (!chartDefinitions.value) return []
  
  const trendChartIds = [
    'historicalMonthlyTrend',
    'yearOverYearComparison',
    'costGrowthRate',
    'monthlyHeatmap',
    'budgetVarianceAnalysis',
    'forecastGauge'
  ]
  
  return trendChartIds
    .map(id => chartDefinitions.value[id])
    .filter(Boolean) as ChartDefinition[]
})

// Handle tab changes
const handleTabChange = (tabId: string) => {
  logger.info('Changing tab to:', tabId)
  activeTab.value = tabId
  emit('tab-changed', tabId)
}
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