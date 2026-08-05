<template>
  <div class="chart-tabs-container">
    <!-- Tab Navigation with Show More Toggle -->
    <div class="border-b border-gray-200 dark:border-gray-700 mb-4" data-tour="chart-tabs">
      <div class="flex items-center justify-between mb-2">
        <div class="flex-1" />
        <!-- Show Advanced Charts Toggle -->
        <UButton
          v-if="activeTab === 'smart'"
          :color="props.showAdvancedCharts ? 'blue' : 'gray'"
          :variant="props.showAdvancedCharts ? 'solid' : 'outline'"
          size="xs"
          @click="toggleAdvancedCharts"
        >
          <UIcon name="i-heroicons-adjustments-horizontal" class="w-3 h-3 mr-1" />
          {{ props.showAdvancedCharts ? 'Show Less' : 'Show More Charts' }}
        </UButton>
      </div>
      <nav class="-mb-px flex flex-wrap gap-x-4 lg:gap-x-8 gap-y-1" aria-label="Chart Tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="[
            activeTab === tab.id
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:border-gray-300',
            'whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-150'
          ]"
          @click="activeTab = tab.id"
        >
          <UIcon v-if="tab.icon" :name="tab.icon" class="w-4 h-4 inline-block mr-1" />
          <span class="hidden sm:inline">{{ tab.label }}</span>
          <span class="sm:hidden">{{ tab.shortLabel || tab.label }}</span>
          <UTooltip v-if="tab.badge && tab.badgeTooltip" :text="tab.badgeTooltip">
            <NuxtLink
              :to="tab.badgeLink || '/support/docs?topic=proforma-vs-billable'"
              class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              @click.stop
            >
              {{ tab.badge }}
              <UIcon name="i-heroicons-question-mark-circle" class="w-3 h-3 ml-1" />
            </NuxtLink>
          </UTooltip>
          <span
            v-else-if="tab.badge"
            class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
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
        <!-- Budget Health Summary Cards - surfaced on Smart Analysis for quick KPIs -->
        <BudgetHealthSummaryCards
          :dataset="dataset"
          :data-mode="dataMode"
        />

        <ChartsRenderer
          :charts="smartCharts"
          :dataset="dataset"
          :show-regression-line="showRegressionLine"
          :selected-accounts="selectedAccounts"
          :warnings="warnings"
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

        <!-- AI Cost Analysis -->
        <AiInsightCard
          v-if="costSummaryContext && Object.keys(costSummaryContext).length > 0"
          type="cost-summary"
          title="AI Cost Analysis"
          icon="i-heroicons-sparkles"
          :context="costSummaryContext"
        />
      </div>

      <!-- Organizational Overview Tab -->
      <div v-else-if="activeTab === 'organizational'" class="animate-fadeIn">
        <div class="text-gray-600 dark:text-gray-400 text-center py-8">
          <OrganizationalCharts
            :dataset="dataset"
            :data-mode="dataMode"
          />
        </div>
      </div>

      <!-- Trends Tab -->
      <div v-else-if="activeTab === 'trends'" class="animate-fadeIn">
        <HistoricalTrends
          :selected-accounts="selectedAccounts"
          :data-mode="dataMode"
        />
      </div>

      <!-- Budget Health Tab -->
      <div v-else-if="activeTab === 'budget-health'" class="animate-fadeIn space-y-6">
        <!-- Summary KPI Cards -->
        <BudgetHealthSummaryCards
          :dataset="dataset"
          :data-mode="dataMode"
        />

        <!-- Section: Critical Issues -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-400" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-200">Critical Issues</h3>
          </div>
          <TablesRenderer
            :tables="budgetTables.filter(t => ['severeOverageAccounts', 'budgetOverageAccounts'].includes(t.id))"
            :dataset="dataset"
            :data-mode="dataMode"
            :accounts-list="accountsList"
            :selected-accounts="[]"
          />
        </div>

        <!-- Section: Budget by Project -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <UIcon name="i-heroicons-folder" class="w-5 h-5 text-purple-400" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-200">Budget by Project</h3>
          </div>
          <TablesRenderer
            :tables="budgetTables.filter(t => t.id === 'budgetByProject')"
            :dataset="dataset"
            :data-mode="dataMode"
            :accounts-list="accountsList"
            :selected-accounts="[]"
          />
        </div>

        <!-- Section: Organizational View -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <UIcon name="i-heroicons-building-office-2" class="w-5 h-5 text-blue-400" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-200">Organizational View</h3>
          </div>
          <TablesRenderer
            :tables="budgetTables.filter(t => ['budgetHealthByLOB', 'budgetHealthByDepartment'].includes(t.id))"
            :dataset="dataset"
            :data-mode="dataMode"
            :accounts-list="accountsList"
            :selected-accounts="[]"
          />
        </div>

        <!-- Section: Underutilized & Summary -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <UIcon name="i-heroicons-chart-pie" class="w-5 h-5 text-green-400" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-200">Budget Optimization</h3>
          </div>
          <TablesRenderer
            :tables="budgetTables.filter(t => ['underutilizedBudgets', 'organizationBudgetSummary'].includes(t.id))"
            :dataset="dataset"
            :data-mode="dataMode"
            :accounts-list="accountsList"
            :selected-accounts="[]"
          />
        </div>

        <!-- Section: Budget Alerts -->
        <div id="budget-alerts-section" class="space-y-4" data-tour="budget-alerts">
          <div class="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <UIcon name="i-heroicons-bell-alert" class="w-5 h-5 text-amber-400" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-200">Budget Alerts</h3>
          </div>
          <CostDashboardAlerts :account-ids="selectedAccounts" />
        </div>
      </div>

      <!-- Data Table Tab -->
      <div v-else-if="activeTab === 'data'" class="animate-fadeIn" data-tour="data-table">
        <CostDataTable
          :dataset="dataset"
          :selected-accounts="selectedAccounts"
          :mode="dataMode || 'proforma'"
          :is-loading="smartChartsLoading"
          @refresh="$emit('refresh-data')"
        />
      </div>

      <!-- Forecast Tab -->
      <div v-else-if="activeTab === 'forecast'" class="animate-fadeIn">
        <ForecastDataTable />
      </div>

      <!-- Tag Analysis Tab -->
      <div v-else-if="activeTab === 'tags'" class="animate-fadeIn">
        <TagAnalysisTab
          v-model:tag="selectedTag"
          v-model:tag-view="selectedTagView"
          :selected-accounts="selectedAccounts"
          :selected-timeframe="selectedTimeframe"
          :data-mode="dataMode || 'proforma'"
        />
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
import TagAnalysisTab from './TagAnalysisTab.vue'
import BudgetHealthSummaryCards from './BudgetHealthSummaryCards.vue'
import CostDashboardAlerts from './CostDashboardAlerts.vue'
import type { ChartDefinition } from '~/composables/useChartRegistry'
import { useTableRegistry } from '~/composables/useTableRegistry'
import { useCostScenario } from '~/composables/useCostScenario'
import type { CostTagCreatorView } from '~/utils/cost-tag-workspace'

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
  sidebarTab?: string
  warnings?: string[]
  costSummaryContext?: Record<string, any>
}>()

// Emits
const emit = defineEmits<{
  'toggle-regression-line': []
  'toggle-advanced-charts': []
  'tab-changed': [tabId: string]
  'refresh-data': []
}>()

const selectedTag = defineModel<string | null>('tag', { default: null })
const selectedTagView = defineModel<CostTagCreatorView>('tagView', { default: 'people' })

// State
const activeTab = ref(props.activeTabProp || 'smart')

// Toggle function - emits to parent
const toggleAdvancedCharts = () => {
  emit('toggle-advanced-charts')
}

// Get scenario for table selection -- use actual sidebar tab from parent
const selectedAccountsRef = computed(() => props.selectedAccounts)
const sidebarTabRef = computed(() => props.sidebarTab || 'all')
const { scenario } = useCostScenario({ selectedAccounts: selectedAccountsRef, activeTab: sidebarTabRef })

// Get tables from registry
const selectedTimeframeRef = computed(() => props.selectedTimeframe || 'thisMonth')
const accountsListRef = computed(() => props.accountsList || [])
const { smartTables, budgetTables } = useTableRegistry({ scenario, timeframe: selectedTimeframeRef, accountsList: accountsListRef })

// Define tabs
const tabs = computed(() => [
  {
    id: 'smart',
    label: 'Smart Analysis',
    shortLabel: 'Smart',
    icon: 'i-heroicons-chart-bar',
    badge: props.selectedAccounts.length > 0 ? `${props.selectedAccounts.length} selected` : 'All accounts'
  },
  {
    id: 'organizational',
    label: 'Organizational Overview',
    shortLabel: 'Org',
    icon: 'i-heroicons-building-office'
  },
  {
    id: 'trends',
    label: 'Historical Trends',
    shortLabel: 'Trends',
    icon: 'i-heroicons-arrow-trending-up'
  },
  {
    id: 'budget-health',
    label: 'Budget Health',
    shortLabel: 'Budget',
    icon: 'i-heroicons-heart',
    badge: 'Risk Scoring',
    badgeTooltip: 'Learn about Budget Risk Scores',
    badgeLink: '/support/docs?topic=budget-risk-scoring'
  },
  {
    id: 'data',
    label: 'Data Table',
    shortLabel: 'Data',
    icon: 'i-heroicons-table-cells',
    badge: props.dataMode === 'proforma' ? 'Proforma' : 'Billable',
    badgeTooltip: 'Learn about Billable vs Pro-forma data',
    badgeLink: '/support/docs?topic=proforma-vs-billable'
  },
  {
    id: 'forecast',
    label: 'Forecast Data',
    shortLabel: 'Forecast',
    icon: 'i-heroicons-chart-bar-square'
  },
  {
    id: 'tags',
    label: 'Tag Analysis',
    shortLabel: 'Tags',
    icon: 'i-heroicons-tag',
    badge: props.dataMode === 'proforma' ? 'Estimated' : undefined,
    badgeTooltip: props.dataMode === 'proforma' ? 'Tag costs are estimated from billable distribution' : undefined,
    badgeLink: '/support/docs?topic=cost-tags-guide'
  }
])


// Sync local tab with parent prop changes
watch(() => props.activeTabProp, (newVal) => {
  if (newVal && newVal !== activeTab.value) {
    activeTab.value = newVal
  }
})

// Watch for tab changes
watch(activeTab, (newTab) => {
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
