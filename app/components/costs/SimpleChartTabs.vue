<template>
  <div class="chart-tabs-container">
    <!-- Tab Navigation with Show More Toggle -->
    <div class="border-b border-gray-700 mb-4" data-tour="chart-tabs">
      <div class="flex items-center justify-between mb-2">
        <div class="flex-1"></div>
        <!-- Show Advanced Charts Toggle -->
        <UButton
          v-if="activeTab === 'smart'"
          :color="props.showAdvancedCharts ? 'blue' : 'gray'"
          :variant="props.showAdvancedCharts ? 'solid' : 'outline'"
          size="xs"
          @click="toggleAdvancedCharts"
        >
          <Icon name="i-heroicons-adjustments-horizontal" class="w-3 h-3 mr-1" />
          {{ props.showAdvancedCharts ? 'Show Less' : 'Show More Charts' }}
        </UButton>
      </div>
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
          <UTooltip v-if="tab.badge && tab.badgeTooltip" :text="tab.badgeTooltip">
            <NuxtLink
              :to="tab.badgeLink || '/support/docs?topic=proforma-vs-billable'"
              class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              @click.stop
            >
              {{ tab.badge }}
              <UIcon name="i-heroicons-question-mark-circle" class="w-3 h-3 ml-1" />
            </NuxtLink>
          </UTooltip>
          <span
            v-else-if="tab.badge"
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
      <div v-if="activeTab === 'smart'" class="animate-fadeIn space-y-6">
        <ChartsRenderer
          :charts="smartCharts"
          :dataset="dataset"
          :show-regression-line="showRegressionLine"
          :selected-accounts="selectedAccounts"
          @toggle-regression-line="$emit('toggle-regression-line')"
        />

        <!-- Smart Analysis Tables -->
        <TablesRenderer
          :tables="smartTables"
          :dataset="dataset"
          :data-mode="dataMode"
          :accounts-list="accountsList"
          :selected-accounts="selectedAccounts"
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

      <!-- Budget Health Tab -->
      <div v-else-if="activeTab === 'budget-health'" class="animate-fadeIn">
        <TablesRenderer
          :tables="budgetTables"
          :dataset="dataset"
          :data-mode="dataMode"
          :accounts-list="accountsList"
          :selected-accounts="[]"
        />
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

      <!-- Forecast Tab -->
      <div v-else-if="activeTab === 'forecast'" class="animate-fadeIn">
        <ForecastDataTable />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import ChartsRenderer from './ChartsRenderer.vue'
import TablesRenderer from './TablesRenderer.vue'
import OrganizationalCharts from './OrganizationalCharts.vue'
import HistoricalTrends from './HistoricalTrends.vue'
import CostDataTable from './CostDataTable.vue'
import ForecastDataTable from './ForecastDataTable.vue'
import type { ChartDefinition } from '~/composables/useChartRegistry'
import { useTableRegistry } from '~/composables/useTableRegistry'
import { useCostScenario } from '~/composables/useCostScenario'

// Props
const props = defineProps<{
  dataset: any
  selectedAccounts: string[]
  smartCharts: ChartDefinition[]
  showRegressionLine: boolean
  smartChartsLoading: boolean
  dataMode?: 'billable' | 'proforma'
  activeTabProp?: string
  selectedTimeframe?: string
  accountsList?: any[]
  showAdvancedCharts?: boolean
}>()

// Emits
const emit = defineEmits<{
  'toggle-regression-line': []
  'toggle-advanced-charts': []
  'tab-changed': [tabId: string]
  'refresh-data': []
}>()

// State
const activeTab = ref(props.activeTabProp || 'smart')

// Toggle function - emits to parent
const toggleAdvancedCharts = () => {
  emit('toggle-advanced-charts')
}

// Get scenario for table selection
const selectedAccountsRef = computed(() => props.selectedAccounts)
const activeTabRef = ref('all') // This would come from parent if needed
const { scenario } = useCostScenario({ selectedAccounts: selectedAccountsRef, activeTab: activeTabRef })

// Get tables from registry
const selectedTimeframeRef = computed(() => props.selectedTimeframe || 'thisMonth')
const accountsListRef = computed(() => props.accountsList || [])
const { smartTables, budgetTables } = useTableRegistry({ scenario, timeframe: selectedTimeframeRef, accountsList: accountsListRef })

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
    id: 'budget-health',
    label: 'Budget Health',
    icon: 'i-heroicons-heart',
    badge: 'Risk Scoring',
    badgeTooltip: 'Learn about Budget Risk Scores',
    badgeLink: '/support/docs?topic=budget-risk-scoring'
  },
  {
    id: 'data',
    label: 'Data Table',
    icon: 'i-heroicons-table-cells',
    badge: props.dataMode === 'proforma' ? 'Proforma' : 'Billable',
    badgeTooltip: 'Learn about Billable vs Pro-forma data',
    badgeLink: '/support/docs?topic=proforma-vs-billable'
  },
  {
    id: 'forecast',
    label: 'Forecast Data',
    icon: 'i-heroicons-chart-bar-square'
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