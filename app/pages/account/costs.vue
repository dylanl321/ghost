<template>
  <div class="flex h-full min-h-0 bg-gray-50 dark:bg-gray-950">
    <!-- Sidebar -->
    <div class="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 h-full min-h-0 flex flex-col overflow-hidden" data-tour="account-selector">
      <div class="flex-1 bg-white dark:bg-gray-900 flex flex-col min-h-0">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Account Selector</h2>
          <UButton 
            size="xs" 
            variant="ghost" 
            color="gray"
            icon="i-heroicons-arrow-path"
            :loading="isLoading"
            @click="refreshData"
          />
        </div>

        <!-- Selected Accounts Indicator -->
        <div v-if="selectedAccounts.length > 0" class="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <UPopover mode="hover" :popper="{ placement: 'bottom-start', offsetDistance: 4 }">
            <button
              class="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
            >
              <Icon name="i-heroicons-check-circle" class="w-3.5 h-3.5 text-blue-400" />
              <span class="font-medium">{{ selectedAccounts.length }} account{{ selectedAccounts.length !== 1 ? 's' : '' }} selected</span>
              <Icon name="i-heroicons-chevron-down" class="w-3 h-3 text-gray-500 dark:text-gray-400 ml-auto" />
            </button>

            <template #panel>
              <div class="p-2 w-72 max-h-64 overflow-y-auto">
                <div class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Selected Accounts</div>
                <div class="space-y-1">
                  <div
                    v-for="account in displayedSelectedAccounts"
                    :key="getAccountKey(account)"
                    class="flex items-center justify-between gap-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded text-xs group"
                  >
                    <div class="flex-1 min-w-0">
                      <div class="text-gray-900 dark:text-gray-200 truncate font-medium">
                        {{ formatAccountDisplayName(account) }}
                      </div>
                      <div class="text-gray-600 dark:text-gray-400 text-[10px] truncate">
                        {{ account.accountId || account.awsStandardAccountID }}
                      </div>
                    </div>
                    <button
                      class="flex-shrink-0 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      @click.stop="toggleAccount(getAccountKey(account))"
                    >
                      <Icon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div v-if="remainingSelectedCount > 0" class="px-2 py-1 text-xs text-blue-400">
                    +{{ remainingSelectedCount }} more selected
                  </div>
                </div>

                <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <UButton
                    size="xs"
                    color="gray"
                    variant="ghost"
                    block
                    @click="clearSelection"
                  >
                    Clear All Selections
                  </UButton>
                </div>
              </div>
            </template>
          </UPopover>
        </div>

        <!-- Search -->
        <div class="p-3 border-b border-gray-200 dark:border-gray-700" data-tour="account-search">
          <UInput
            v-model="searchTerm"
            :placeholder="searchPlaceholder"
            icon="i-heroicons-magnifying-glass"
            size="sm"
          >
            <template #trailing>
              <div class="flex items-center gap-1">
                <!-- Search scope indicator -->
                <UTooltip v-if="searchTerm" :text="searchScopeTooltip">
                  <UBadge 
                    :color="searchScope === 'global' ? 'blue' : 'gray'" 
                    size="xs" 
                    variant="soft"
                    class="cursor-pointer"
                    @click="toggleSearchScope"
                  >
                    {{ searchScope === 'global' ? 'All' : 'Tab' }}
                  </UBadge>
                </UTooltip>
                
                <UButton
                  v-show="searchTerm !== ''"
                  color="gray"
                  variant="link"
                  size="2xs"
                  icon="i-heroicons-x-mark-20-solid"
                  :padded="false"
                  @click="clearSearch"
                />
              </div>
            </template>
          </UInput>
          
          <!-- Search info when active -->
          <div v-if="searchTerm && searchResults.total > 0" class="mt-2 text-xs text-gray-600 dark:text-gray-400">
            <span v-if="searchScope === 'global'">
              Found {{ searchResults.total }} results across all categories
              <span v-if="searchResults.tabSpecific > 0">
                ({{ searchResults.tabSpecific }} in {{ getTabLabel(activeTab) }})
              </span>
            </span>
            <span v-else>
              Found {{ searchResults.tabSpecific }} results in {{ getTabLabel(activeTab) }}
              <button 
                v-if="searchResults.total > searchResults.tabSpecific"
                class="ml-1 text-blue-400 hover:text-blue-300 underline" 
                @click="searchScope = 'global'"
              >
                ({{ searchResults.total - searchResults.tabSpecific }} more in other tabs)
              </button>
            </span>
          </div>
          
          <!-- No results message -->
          <div v-if="searchTerm && searchResults.total === 0" class="mt-2 text-xs text-gray-600 dark:text-gray-400">
            No results found. <button class="text-blue-400 hover:text-blue-300 underline" @click="searchScope = 'global'">Search all tabs?</button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="border-b border-gray-200 dark:border-gray-700" data-tour="account-tabs">
          <div class="flex">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1"
              :class="{
                'text-blue-400 border-blue-400 bg-blue-900/20': activeTab === tab.id,
                'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600': activeTab !== tab.id
              }"
              @click="activeTab = tab.id"
            >
              <Icon :name="tab.icon" class="w-3 h-3" />
              <span class="leading-none">{{ tab.label }}</span>
            </button>
          </div>
        </div>

        <!-- Tabbed Content -->
        <div class="flex-1 overflow-y-auto min-h-0">
          
          <!-- All Accounts Tab -->
          <div v-if="activeTab === 'all'" class="p-3">
            <div class="mb-3 flex justify-between items-center">
              <span class="text-sm text-gray-900 dark:text-gray-300">All Accounts ({{ sortedFilteredAccounts.length }})</span>
              <div class="flex gap-1 items-center">
                <!-- Sort Popover -->
                <UPopover mode="hover" :popper="{ placement: 'bottom-start' }">
                  <UTooltip :text="`Sort: ${sortOptions.find(opt => opt.value === accountSortBy)?.label || 'Total Cost'}`" :popper="{ placement: 'top' }">
                    <UButton 
                      size="xs" 
                      variant="ghost" 
                      :color="accountSortBy !== 'cost' ? 'blue' : 'gray'"
                      :icon="sortOptions.find(opt => opt.value === accountSortBy)?.icon || 'i-heroicons-bars-arrow-down'"
                      class="p-1"
                    />
                  </UTooltip>
                  
                  <template #panel="{ close }">
                    <div class="p-2 w-44">
                      <div class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Sort by</div>
                      <div class="space-y-1">
                        <button
                          v-for="option in sortOptions"
                          :key="option.value"
                          class="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          :class="{ 
                            'bg-blue-900/50 text-blue-300': accountSortBy === option.value,
                            'text-gray-700 dark:text-gray-300': accountSortBy !== option.value
                          }"
                          @click="accountSortBy = option.value as 'cost' | 'name' | 'budget' | 'utilization'; close()"
                        >
                          <Icon :name="option.icon" class="w-3 h-3" />
                          <span>{{ option.label }}</span>
                          <Icon 
                            v-if="accountSortBy === option.value"
                            name="i-heroicons-check" 
                            class="w-3 h-3 ml-auto text-blue-400" 
                          />
                        </button>
                      </div>
                    </div>
                  </template>
                </UPopover>
                
                <UButton size="xs" variant="ghost" color="gray" @click="selectAll">
                  Select All
                </UButton>
                <UButton size="xs" variant="ghost" color="gray" @click="clearSelection">
                  Clear
                </UButton>
              </div>
            </div>
            
            <div class="space-y-1">
              <SidebarAccountItem
                v-for="account in sortedFilteredAccounts"
                :key="getAccountKey(account)"
                :account="account"
                :account-key="getAccountKey(account)"
                :selected="selectedAccounts.includes(getAccountKey(account))"
                :budget="getBudget(account)"
                :spend="getSpend(account)"
                :format-currency="formatCurrency"
                :show-utilization="accountSortBy === 'utilization'"
                :show-bold-name="true"
                @toggle="toggleAccount"
              />
            </div>
          </div>

          <!-- Lines of Business Tab -->
          <SidebarGroupList
            v-else-if="activeTab === 'lob'"
            :groups="lobGroups"
            :expanded-groups="expandedGroups"
            :selected-accounts="selectedAccounts"
            :format-currency="formatCurrency"
            group-type="lob"
            label="Lines of Business"
            default-icon="i-heroicons-briefcase"
            default-icon-color="text-blue-400"
            :get-account-key="getAccountKey"
            :get-budget="getBudget"
            :get-spend="getSpend"
            @toggle-group="handleToggleGroup"
            @select-group="handleSelectGroup"
            @toggle-account="toggleAccount"
          />

          <!-- Departments Tab -->
          <SidebarGroupList
            v-else-if="activeTab === 'dept'"
            :groups="departmentGroups"
            :expanded-groups="expandedGroups"
            :selected-accounts="selectedAccounts"
            :format-currency="formatCurrency"
            group-type="department"
            label="Departments"
            default-icon="i-heroicons-building-office"
            default-icon-color="text-green-400"
            :get-account-key="getAccountKey"
            :get-budget="getBudget"
            :get-spend="getSpend"
            @toggle-group="handleToggleGroup"
            @select-group="handleSelectGroup"
            @toggle-account="toggleAccount"
          />

          <!-- Smart Groupings Tab -->
          <SidebarGroupList
            v-else-if="activeTab === 'smart'"
            :groups="smartGroups"
            :expanded-groups="expandedGroups"
            :selected-accounts="selectedAccounts"
            :format-currency="formatCurrency"
            group-type="smart"
            label="Smart Groupings"
            :get-account-key="getAccountKey"
            :get-budget="getBudget"
            :get-spend="getSpend"
            @toggle-group="handleToggleGroup"
            @select-group="handleSelectGroup"
            @toggle-account="toggleAccount"
          />


        </div>

        <!-- Selection Summary -->
        <div class="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-700 dark:text-gray-300">
                {{ selectedAccounts.length === 0 ? `Showing all ${accountsWithCosts.length} accounts` : `${selectedAccounts.length} of ${accountsWithCosts.length} selected` }}
              </span>
              <UButton 
                v-show="selectedAccounts.length > 0" 
                size="xs" 
                color="gray"
                variant="link"
                @click="clearSelection"
              >
                Clear
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col overflow-hidden min-h-0">
      <!-- Header -->
      <CostsHeader
        v-model:mode="dataMode"
        v-model:selected-timeframe="selectedTimeframe"
        v-model:view-by="viewBy"
        :timeframe-options="timeframeOptions"
        :selected-accounts="selectedAccounts"
        :active-tab="activeTab"
        :dataset="dataset"
        :alerts-count="!isHistoricalTimeframe ? alertsCount : 0"
        :alerts-by-severity="!isHistoricalTimeframe ? alertsBySeverity : { critical: 0, escalation: 0, warning: 0, info: 0 }"
        @refresh="refreshData"
        @start-tour="() => handleStartTour(true)"
        @view-alerts="navigateToBudgetAlerts"
        @load-preset="applyPreset"
      />

      <!-- Compare Toggle -->
      <div class="px-4 md:px-5 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <UTooltip text="Compare two time periods side by side">
          <UButton
            size="xs"
            :color="compareMode ? 'blue' : 'gray'"
            :variant="compareMode ? 'soft' : 'ghost'"
            icon="i-heroicons-arrows-right-left"
            @click="compareMode = !compareMode"
          >
            Compare
          </UButton>
        </UTooltip>
      </div>

      <!-- Selected Account Context Banner -->
      <div v-if="selectedAccounts.length > 0" class="px-4 md:px-6 pt-4">
        <div class="bg-blue-900/30 border border-blue-700 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="flex-shrink-0 p-1.5 bg-blue-900/50 rounded-lg">
              <Icon name="i-heroicons-funnel" class="w-4 h-4 text-blue-400" />
            </div>
            <div class="min-w-0 flex-1">
              <template v-if="selectedAccounts.length === 1">
                <div class="text-sm font-semibold text-white truncate">
                  {{ getSelectedAccountName(selectedAccounts[0]) }}
                </div>
                <div class="text-xs text-blue-300">
                  {{ selectedAccounts[0] }}
                </div>
              </template>
              <template v-else-if="selectedAccounts.length <= 5">
                <div class="text-sm font-semibold text-white">
                  {{ selectedAccounts.length }} accounts selected
                </div>
                <div class="text-xs text-blue-300 truncate">
                  {{ selectedAccounts.map(id => getSelectedAccountName(id)).join(', ') }}
                </div>
              </template>
              <template v-else>
                <div class="text-sm font-semibold text-white">
                  {{ selectedAccounts.length }} accounts selected
                </div>
                <div class="text-xs text-blue-300">
                  Filtered view — showing data for selected accounts only
                </div>
              </template>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <UButton size="xs" color="blue" variant="soft" @click="clearSelection">
              <Icon name="i-heroicons-x-mark" class="w-3.5 h-3.5 mr-1" />
              Clear
            </UButton>
          </div>
        </div>
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-auto min-h-0 p-4 md:p-6">
        <!-- Comparison Mode -->
        <div v-if="compareMode">
          <div class="mb-4 flex items-center gap-3">
            <h2 class="text-base font-semibold text-white">Period Comparison</h2>
            <UButton size="xs" color="gray" variant="soft" icon="i-heroicons-x-mark" @click="compareMode = false">
              Exit Compare
            </UButton>
          </div>
          <CostComparisonView />
        </div>

        <!-- Loading State -->
        <div v-else-if="isLoading" class="flex items-center justify-center h-full">
          <div class="text-center">
            <Icon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
            <p class="text-gray-600 dark:text-gray-400">Loading cost data...</p>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="flex items-center justify-center h-full">
          <div class="text-center">
            <Icon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p class="text-red-400">{{ error }}</p>
            <UButton color="blue" variant="soft" class="mt-4" @click="refreshData">
              Try Again
            </UButton>
          </div>
        </div>

        <!-- Main Content -->
        <div v-else class="space-y-6">
          <!-- First Day of Month Notice -->
          <div v-if="isFirstDayOfMonth" class="bg-amber-900/20 border border-amber-700 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <Icon name="i-heroicons-calendar" class="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div class="flex-1">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h4 class="text-sm font-medium text-amber-300">Showing Previous Month's Data</h4>
                    <p class="text-xs text-amber-400 mt-1">
                      It's the first day of {{ new Date().toLocaleDateString('en-US', { month: 'long' }) }}, and AWS Cost Explorer doesn't have data available yet for today.
                      Currently displaying the last day of {{ new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleDateString('en-US', { month: 'long' }) }} instead.
                      Check back tomorrow for {{ new Date().toLocaleDateString('en-US', { month: 'long' }) }} data.
                    </p>
                  </div>
                  <UButton
                    color="amber"
                    variant="soft"
                    size="sm"
                    class="ml-4 flex-shrink-0"
                    @click="switchToLastMonth"
                  >
                    <Icon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
                    View Full Last Month
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <!-- Early Month Notice (days 2-5) -->
          <div v-else-if="isEarlyInMonth" class="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <Icon name="i-heroicons-calendar" class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div class="flex-1">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h4 class="text-sm font-medium text-blue-300">Limited Data Available for Current Month</h4>
                    <p class="text-xs text-blue-400 mt-1">
                      It's early in the month, so cost data for {{ new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }} is still accumulating.
                      Data shown is through yesterday due to AWS Cost Explorer's 24-hour processing lag.
                      For a complete view of recent spending patterns, you may want to review last month's data.
                    </p>
                  </div>
                  <UButton
                    color="blue"
                    variant="soft"
                    size="sm"
                    class="ml-4 flex-shrink-0"
                    @click="switchToLastMonth"
                  >
                    <Icon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
                    View Last Month
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <!-- Historical Data Warning -->
          <div v-if="isHistoricalTimeframe" class="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <Icon name="i-heroicons-information-circle" class="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div class="flex-1">
                <h4 class="text-sm font-medium text-yellow-300">Historical Data Limitations</h4>
                <p class="text-xs text-yellow-400 mt-1">
                  Budget comparisons and forecasts are not available for historical periods as budget data is only maintained for the current period.
                  Additionally, some accounts may have been decommissioned and won't appear in historical views.
                </p>
              </div>
            </div>
          </div>

          <!-- Summary Cards -->
          <div data-tour="costs-summary">
            <CostsSummaryCards
              :total-accounts="selectedAccounts.length || accountsWithCosts.length"
              :total-budget="isHistoricalTimeframe ? 0 : totalBudget"
              :total-spend="totalSpend"
              :utilization="isHistoricalTimeframe ? 0 : utilization"
              :format-currency="formatCurrency"
              :scenario="scenario"
              :is-historical="isHistoricalTimeframe"
            />
          </div>

          <div v-if="isCostPending" class="bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-600 rounded-lg p-4 text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <Icon name="i-heroicons-clock" class="w-5 h-5 animate-pulse" />
            <span>Waiting for account selection to complete...</span>
          </div>
          <div v-else-if="isCostFetching" class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-gray-700 dark:text-gray-300">
            Loading charts...
          </div>
          <div v-else-if="costError" class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-red-600 dark:text-red-400">
            {{ costError }}
          </div>
          <!-- =============================================================
               CHART RENDERING COMPONENT
               This component receives:
               - charts: Array of chart definitions from useChartRegistry
               - dataset: Raw cost data from APIs via useCostData
               - Each chart's extractor function transforms dataset to chart format
               Charts are dynamically selected based on scenario and timeframe
               ============================================================= -->
          <div v-else data-tour="costs-chart">
            <!-- Subtle indicator while forecast/supplementary data loads in background -->
            <div v-if="isDeferredLoading" class="mb-3 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-600 dark:text-blue-400">
              <Icon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              <span>Loading forecast and supplementary data...</span>
            </div>
            <ChartTabs
              :smart-charts="charts"
              :dataset="dataset"
              :show-regression-line="showRegressionLine"
              :selected-accounts="selectedAccounts"
              :smart-charts-loading="isCostFetching"
              :data-mode="dataMode"
              :selected-timeframe="selectedTimeframe"
              :accounts-list="accountsList"
              :active-tab-prop="activeChartTab"
              :show-advanced-charts="showAdvancedCharts"
              :sidebar-tab="activeTab"
              :warnings="fetchWarnings"
              :cost-summary-context="costSummaryContext"
              @toggle-regression-line="showRegressionLine = !showRegressionLine"
              @toggle-advanced-charts="showAdvancedCharts = !showAdvancedCharts; localStorage.setItem('showAdvancedCharts', String(showAdvancedCharts))"
              @tab-changed="activeChartTab = $event"
              @refresh-data="fetchCosts"
            />

          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  keepalive: false
})

// =============================================================================
// COMPOSABLES AND IMPORTS
// =============================================================================
// useAccountCosts: Fetches raw account data from the API
// Component imports for UI elements
import CostsHeader from '~/components/costs/CostsHeader.vue'
import CostsSummaryCards from '~/components/costs/CostsSummaryCards.vue'
import ChartTabs from '~/components/costs/SimpleChartTabs.vue'
import SidebarGroupList from '~/components/costs/SidebarGroupList.vue'

const { handleStartTour, initTourOnMount } = useCostTour()

// Core composables that power the chart system:
// - useCostData: Fetches and manages cost data based on selected accounts/timeframe
// - useCostScenario: Determines which charts to show based on selection context
// - useChartRegistry: Contains all chart definitions and selection logic
// - useCostFilters (cost-filters.ts): Handles filtering accounts by cost thresholds
import { useCostData } from '~/composables/useCostData'
import { useCostScenario } from '~/composables/useCostScenario'
import { useChartRegistry } from '~/composables/useChartRegistry'
import type { DataMode } from '~/types/costs'
import type { BudgetAlert } from '#shared/types/budget-alerts'

const { accounts, isLoading, error, fetchAccounts } = useAccountCosts()
const { favoriteIds } = useFavoriteAccounts()
const { isAdmin } = useUserRoles()

// Types
interface Account {
  accountName?: string
  projectName?: string
  name?: string
  accountId?: string
  awsStandardAccountID?: string
  awsCommercialAccountID?: string
  id?: string
  estimatedMonthlyCharge?: string | number
  budget?: string | number
  estimatedBudget?: string | number
  currentSpend?: number
  totalSpend?: number
  spend?: number
  linesOfBusiness?: string
  lineOfBusiness?: string
  departmentNumber?: string
  department?: string
}

// =============================================================================
// ACCOUNT DATA EXTRACTION
// =============================================================================
// Extract accounts from the API response which may be wrapped in different formats
// The API can return data as:
// - Direct array: [account1, account2, ...]
// - Wrapped response: { data: [account1, account2, ...] }
const accountsList = computed<Account[]>(() => {
  const data = accounts.value
  if (!data) return [] as Account[]
  if (Array.isArray(data)) return data as Account[]
  if ((data as any).data && Array.isArray((data as any).data)) return (data as any).data as Account[]
  return [] as Account[]
})

// =============================================================================
// COST DATA MERGING AND FILTERING
// =============================================================================
// Cost filtering setup - respects user's cost threshold settings
const costSettingsStore = useCostSettingsStore()

// CRITICAL COMPUTED PROPERTY: Merges live cost data with account metadata
// This is where account costs are populated from the dataset returned by API calls
// The dataset is populated by useCostData composable based on selected timeframe
const accountsWithCosts = computed<Account[]>(() => {
  const baseAccounts = accountsList.value
  
  // If no dataset available, return accounts as-is
  if (!dataset.value) {
    return baseAccounts
  }
  
  // Create a map of accountId -> cost data
  const costMap = new Map<string, number>()
  
  // Priority 1: Extract costs from analysis.budgetAnalysis.byAccount (most accurate)
  if (dataset.value.analysis) {
    const analysisData = dataset.value.analysis as any
    
    // The API returns data wrapped in { success: true, data: {...} }
    const actualData = analysisData?.data || analysisData
    
    // Handle proforma mode - data is nested under proforma property
    const analysisSource = dataMode.value === 'proforma' && actualData?.proforma 
      ? actualData.proforma 
      : actualData
    
    if (analysisSource?.budgetAnalysis?.byAccount && Array.isArray(analysisSource.budgetAnalysis.byAccount)) {
      analysisSource.budgetAnalysis.byAccount.forEach((item: any) => {
        if (item.accountId && typeof item.actualCost === 'number') {
          costMap.set(item.accountId, item.actualCost)
        }
      })
    }
  }
  
  // Priority 2: Check summary data for account costs (enhanced summary endpoint)
  if (dataset.value.summary && costMap.size === 0) {
    const summaryData = dataset.value.summary as any
    
    // The API returns data wrapped in { success: true, data: {...} }
    const actualData = summaryData?.data || summaryData
    
    // Handle proforma mode - data structure is different
    let accountsData: any[] = []
    
    if (dataMode.value === 'proforma') {
      // In proforma mode, data is structured as { billable: {...}, proforma: {...} }
      // Use proforma accounts for display
      if (actualData?.proforma?.accounts && Array.isArray(actualData.proforma.accounts)) {
        accountsData = actualData.proforma.accounts
      }
    } else {
      // Standard billable mode - accounts at top level
      if (actualData?.accounts && Array.isArray(actualData.accounts)) {
        accountsData = actualData.accounts
      }
    }
    
    accountsData.forEach((account: any) => {
      const accountId = account.accountId
      const cost = account.totalCost || 0
      if (accountId && cost > 0) {
        costMap.set(accountId, cost)
      }
    })
  }
  
  // Merge costs into accounts
  const enrichedAccounts = baseAccounts.map(account => {
    // Try multiple ID fields to match
    const possibleIds = [
      account.accountId,
      account.awsStandardAccountID,
      account.awsCommercialAccountID,
      account.id
    ].filter(Boolean)
    
    let costFromData = 0
    for (const id of possibleIds) {
      if (id && costMap.has(id)) {
        costFromData = costMap.get(id) || 0
        break
      }
    }
    
    return {
      ...account,
      currentSpend: costFromData,
      totalSpend: costFromData,
      spend: costFromData
    }
  })
  
  // Apply cost filtering based on user settings
  return applyAccountFilters(enrichedAccounts, costSettingsStore.$state)
})

// Compare mode toggle
const compareMode = ref(false)

// State
const searchTerm = ref('')
const searchScope = ref<'tab' | 'global'>('tab') // Default to searching within current tab
const selectedAccounts = ref<string[]>([])
const selectedTimeframe = ref('thisMonth')
const activeTab = ref('all')
const activeChartTab = ref('smart') // Chart tab selection (smart, organizational, trends, budget-health, data, forecast)
const expandedGroups = ref(new Set<string>())
const accountSortBy = ref<'cost' | 'name' | 'budget' | 'utilization'>('cost') // Default sort by cost
const showRegressionLine = ref(false) // Toggle for budget variance regression line

// View By state: controls how cost data is grouped (account, service, or region)
const viewBy = ref('LINKED_ACCOUNT')

// Computed property to detect if we're viewing historical data
const isHistoricalTimeframe = computed(() => {
  return ['last7days', 'last30days', 'last90days', 'lastMonth', 'lastQuarter', 'lastYear', 'last12months'].includes(selectedTimeframe.value)
})

// Budget alerts
const budgetAlerts = ref<BudgetAlert[]>([])
let alertDebounceTimer: ReturnType<typeof setTimeout> | null = null

const alertsCount = computed(() => budgetAlerts.value.length)
const alertsBySeverity = computed(() => {
  const counts = { critical: 0, warning: 0, info: 0, escalation: 0 }
  for (const alert of budgetAlerts.value) {
    const level = alert.alert_level?.toUpperCase()
    if (level === 'CRITICAL') counts.critical++
    else if (level === 'WARNING') counts.warning++
    else if (level === 'INFO') counts.info++
    else if (level === 'ESCALATION') counts.escalation++
  }
  return counts
})


async function fetchAlertsSummary() {
  try {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const res = await $fetch<{ success: boolean; data: BudgetAlert[] }>('/api/alerts/list', {
      query: { month, limit: 100 }
    })
    if (res.success && res.data) {
      let filtered = res.data
      if (selectedAccounts.value.length > 0) {
        const selectedSet = new Set(selectedAccounts.value)
        filtered = filtered.filter(a => selectedSet.has(a.account_id))
      }
      budgetAlerts.value = filtered
    } else {
      budgetAlerts.value = []
    }
  } catch {
    budgetAlerts.value = []
  }
}

// Refetch alerts when account selection changes (debounced)
watch(selectedAccounts, () => {
  if (alertDebounceTimer) clearTimeout(alertDebounceTimer)
  alertDebounceTimer = setTimeout(() => fetchAlertsSummary(), 300)
}, { deep: true })

// Initial fetch
onMounted(() => fetchAlertsSummary())

// Detect if we're in the early days of a new month
const isEarlyInMonth = computed(() => {
  const today = new Date()
  const dayOfMonth = today.getDate()
  // Consider days 1-5 as early in the month
  return dayOfMonth <= 5 && selectedTimeframe.value === 'thisMonth'
})

// Detect if we're on the first day (special case: showing previous month's data)
const isFirstDayOfMonth = computed(() => {
  const today = new Date()
  return today.getDate() === 1 && selectedTimeframe.value === 'thisMonth'
})

// Helper to switch to last month view
const switchToLastMonth = () => {
  selectedTimeframe.value = 'lastMonth'
}

// Options
const timeframeOptions = [
  { label: 'Last 7 Days', value: 'last7days' },
  { label: 'Last 30 Days', value: 'last30days' },
  { label: 'Last 90 Days', value: 'last90days' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'This Quarter', value: 'thisQuarter' },
  { label: 'Last Quarter', value: 'lastQuarter' },
  { label: 'Year-to-Date', value: 'ytd' },
  { label: 'Last 12 Months', value: 'last12months' },
  { label: 'Last Year', value: 'lastYear' }
]

// Sorting options for accounts
const sortOptions = [
  { label: 'Total Cost', value: 'cost', icon: 'i-heroicons-currency-dollar' },
  { label: 'Account Name', value: 'name', icon: 'i-heroicons-identification' },
  { label: 'Budget Amount', value: 'budget', icon: 'i-heroicons-banknotes' },
  { label: 'Budget Utilization', value: 'utilization', icon: 'i-heroicons-chart-bar' }
]

// Tabs configuration
const tabs = [
  { id: 'all', label: 'All', icon: 'i-heroicons-squares-2x2' },
  { id: 'lob', label: 'LOB', icon: 'i-heroicons-briefcase' },
  { id: 'dept', label: 'Dept', icon: 'i-heroicons-building-office' },
  { id: 'smart', label: 'Smart', icon: 'i-heroicons-sparkles' }
]

// Search-related computed properties
const searchPlaceholder = computed(() => {
  const tabLabel = getTabLabel(activeTab.value)
  return searchScope.value === 'global' 
    ? 'Search all accounts and groups...' 
    : `Search ${tabLabel.toLowerCase()}...`
})

const searchScopeTooltip = computed(() => {
  return searchScope.value === 'global' 
    ? 'Searching across all tabs and groups' 
    : `Searching only in ${getTabLabel(activeTab.value)} tab`
})

// Enhanced search results tracking
const searchResults = computed(() => {
  if (!searchTerm.value) return { total: 0, tabSpecific: 0 }
  
  const term = searchTerm.value.toLowerCase()
  
  // Count all matching accounts
  const allMatches = accountsWithCosts.value.filter((acc: Account) => 
    matchesSearchTerm(acc, term)
  )
  
  // Count matches in current tab context
  let tabSpecificMatches = 0
  
  switch (activeTab.value) {
    case 'all':
      tabSpecificMatches = allMatches.length
      break
    case 'lob':
      tabSpecificMatches = lobGroups.value.reduce((count, group) => {
        const groupMatches = group.name.toLowerCase().includes(term)
        const accountMatches = group.accounts.filter(acc => matchesSearchTerm(acc, term)).length
        return count + (groupMatches ? group.accounts.length : accountMatches)
      }, 0)
      break
    case 'dept':
      tabSpecificMatches = departmentGroups.value.reduce((count, group) => {
        const groupMatches = group.name.toLowerCase().includes(term)
        const accountMatches = group.accounts.filter(acc => matchesSearchTerm(acc, term)).length
        return count + (groupMatches ? group.accounts.length : accountMatches)
      }, 0)
      break
    case 'smart':
      tabSpecificMatches = smartGroups.value.reduce((count, group) => {
        const groupMatches = group.name.toLowerCase().includes(term) || group.description.toLowerCase().includes(term)
        const accountMatches = group.accounts.filter(acc => matchesSearchTerm(acc, term)).length
        return count + (groupMatches ? group.accounts.length : accountMatches)
      }, 0)
      break
  }
  
  return { total: allMatches.length, tabSpecific: tabSpecificMatches }
})

// Filter accounts based on search scope
const filteredAccounts = computed<Account[]>(() => {
  if (!searchTerm.value) return accountsWithCosts.value
  
  const term = searchTerm.value.toLowerCase()
  return accountsWithCosts.value.filter((acc: Account) => matchesSearchTerm(acc, term))
})

// Sorted accounts based on selected sort option
const sortedFilteredAccounts = computed<Account[]>(() => {
  const accounts = [...filteredAccounts.value]
  
  switch (accountSortBy.value) {
    case 'cost':
      // Sort by cost, but also use estimatedMonthlyBudget as a fallback for initial load
      return accounts.sort((a, b) => {
        const spendA = getSpend(a)
        const spendB = getSpend(b)
        
        // If both have spend data, sort by spend
        if (spendA > 0 || spendB > 0) {
          return spendB - spendA
        }
        
        // Otherwise, use budget as a proxy for account size
        const budgetA = getBudget(a)
        const budgetB = getBudget(b)
        if (budgetA > 0 || budgetB > 0) {
          return budgetB - budgetA
        }
        
        // Finally, sort by name
        const nameA = (a.accountName || a.projectName || a.name || 'Unnamed Account').toLowerCase()
        const nameB = (b.accountName || b.projectName || b.name || 'Unnamed Account').toLowerCase()
        return nameA.localeCompare(nameB)
      })
    
    case 'name':
      return accounts.sort((a, b) => {
        const nameA = (a.accountName || a.projectName || a.name || 'Unnamed Account').toLowerCase()
        const nameB = (b.accountName || b.projectName || b.name || 'Unnamed Account').toLowerCase()
        return nameA.localeCompare(nameB)
      })
    
    case 'budget':
      return accounts.sort((a, b) => getBudget(b) - getBudget(a)) // Highest budget first
    
    case 'utilization':
      return accounts.sort((a, b) => {
        const utilizationA = getBudget(a) > 0 ? (getSpend(a) / getBudget(a)) * 100 : 0
        const utilizationB = getBudget(b) > 0 ? (getSpend(b) / getBudget(b)) * 100 : 0
        return utilizationB - utilizationA // Highest utilization first
      })
    
    default:
      return accounts
  }
})

const totalBudget = computed<number>(() => {
  const accountsSubset: Account[] = selectedAccounts.value.length > 0 
    ? accountsWithCosts.value.filter((acc: Account) => selectedAccounts.value.includes(getAccountKey(acc)))
    : accountsWithCosts.value
    
  return accountsSubset.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0)
})

const totalSpend = computed<number>(() => {
  const accountsSubset: Account[] = selectedAccounts.value.length > 0 
    ? accountsWithCosts.value.filter((acc: Account) => selectedAccounts.value.includes(getAccountKey(acc)))
    : accountsWithCosts.value
    
  return accountsSubset.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
})

const utilization = computed(() => {
  if (totalBudget.value === 0) return 0
  return Math.round((totalSpend.value / totalBudget.value) * 100)
})

// AI Cost Summary context (combined cost + budget analysis)
const costSummaryContext = computed(() => {
  if (totalSpend.value === 0) return {}
  const accts = selectedAccounts.value.length > 0
    ? accountsWithCosts.value.filter((a: Account) => selectedAccounts.value.includes(getAccountKey(a)))
    : accountsWithCosts.value.slice(0, 10)

  const ctx: Record<string, any> = {
    timeframe: selectedTimeframe.value,
    dataMode: dataMode.value,
    totalCost: totalSpend.value,
    accountCount: selectedAccounts.value.length || accountsWithCosts.value.length,
    accountNames: accts.map((a: Account) => formatAccountDisplayName(a)).slice(0, 5),
    topServices: (dataset.value?.summary as any)?.topServices?.slice(0, 5) || [],
  }

  // Include budget data if available
  if (totalBudget.value > 0) {
    ctx.budgetUtilization = utilization.value
    ctx.totalBudget = totalBudget.value
    const overBudget = accountsWithCosts.value
      .filter((a: Account) => {
        const b = getBudget(a)
        return b > 0 && getSpend(a) > b
      })
      .slice(0, 3)
      .map((a: Account) => ({
        name: formatAccountDisplayName(a),
        actual: getSpend(a),
        budget: getBudget(a),
        variancePercent: getBudget(a) > 0 ? ((getSpend(a) - getBudget(a)) / getBudget(a)) * 100 : 0,
      }))
    if (overBudget.length > 0) {
      ctx.overBudgetAccounts = overBudget
    }
  }

  return ctx
})

// Selected accounts display logic
const selectedAccountObjects = computed(() => {
  if (selectedAccounts.value.length === 0) return []
  return accountsWithCosts.value.filter((acc: Account) =>
    selectedAccounts.value.includes(getAccountKey(acc))
  )
})

const displayedSelectedAccounts = computed(() => {
  return selectedAccountObjects.value.slice(0, 3)
})

const remainingSelectedCount = computed(() => {
  return Math.max(0, selectedAccountObjects.value.length - 3)
})

const formatAccountDisplayName = (account: Account) => {
  const name = account.accountName || account.projectName || account.name || 'Unnamed Account'
  return name.length > 20 ? name.substring(0, 20) + '...' : name
}

const getSelectedAccountName = (accountId: string): string => {
  const account = accountsWithCosts.value.find(
    (acc: Account) => getAccountKey(acc) === accountId
  )
  if (!account) return accountId
  return account.accountName || account.projectName || account.name || accountId
}

// Sidebar groups, helpers, and search matching -- extracted to composable
const { lobGroups, departmentGroups, smartGroups, favoriteAccounts, matchesSearchTerm, getAccountKey, getBudget, getSpend } = useSidebarGroups({
  accountsWithCosts,
  favoriteIds,
  searchTerm,
  searchScope,
  activeTab
})

const getTabLabel = (tabId: string): string => {
  const tab = tabs.find(t => t.id === tabId)
  return tab?.label || 'Tab'
}

// Methods - Use dynamic formatting based on settings
const formatCurrency = (value: number) => {
  return formatCostValue(value, costSettingsStore.currencyFormat)
}

const toggleAccount = (accountId: string) => {
  const index = selectedAccounts.value.indexOf(accountId)
  if (index > -1) {
    selectedAccounts.value.splice(index, 1)
  } else {
    selectedAccounts.value.push(accountId)
  }
}

const selectAll = () => {
  selectedAccounts.value = sortedFilteredAccounts.value.map((acc: Account) => getAccountKey(acc))
}

const clearSelection = () => {
  selectedAccounts.value = []
}

// Search control methods
const toggleSearchScope = () => {
  searchScope.value = searchScope.value === 'global' ? 'tab' : 'global'
}

const clearSearch = () => {
  searchTerm.value = ''
  searchScope.value = 'tab'
}

const refreshData = async () => {
  // Include decommissioned accounts when viewing historical data
  // as they may have had costs in the past
  const includeDecommissioned = isHistoricalTimeframe.value
  await fetchAccounts({ includeDecommissioned, enrichment: 'full' })
}

// Group interaction methods - generic handlers for SidebarGroupList events
const handleToggleGroup = (groupKey: string) => {
  if (expandedGroups.value.has(groupKey)) {
    expandedGroups.value.delete(groupKey)
  } else {
    expandedGroups.value.add(groupKey)
  }
}

const handleSelectGroup = (accountIds: string[]) => {
  selectedAccounts.value = accountIds
}

// Navigate to the Budget Health tab and scroll to the alerts table
const navigateToBudgetAlerts = () => {
  activeChartTab.value = 'budget-health'
  // Wait for tab content to render before scrolling
  nextTick(() => {
    setTimeout(() => {
      const el = document.getElementById('budget-alerts-section')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  })
}

// Apply a filter preset from CostsHeader
const applyPreset = (preset: { selectedAccounts: string[]; timeframe: string; dataMode: string; viewBy: string; activeTab: string }) => {
  selectedAccounts.value = preset.selectedAccounts || []
  if (preset.timeframe) selectedTimeframe.value = preset.timeframe
  if (preset.dataMode === 'billable' || preset.dataMode === 'proforma') {
    dataMode.value = preset.dataMode as DataMode
  }
  if (preset.activeTab) activeTab.value = preset.activeTab
}

// Handle shared state from URL parameters
const applySharedStateFromUrl = () => {
  const route = useRoute()

  // Check for share parameters in URL
  // Support 'account' (single), 'accounts' (comma-separated or JSON array)
  if (route.query.account && typeof route.query.account === 'string') {
    // Single account - clean URL format: ?account=123456789012
    selectedAccounts.value = [route.query.account]
  } else if (route.query.accounts) {
    // Multiple accounts - support comma-separated (from smart links) or JSON array (legacy)
    if (typeof route.query.accounts === 'string') {
      // Try comma-separated first: ?accounts=123,456,789
      if (route.query.accounts.includes(',')) {
        selectedAccounts.value = route.query.accounts.split(',').map(id => id.trim())
      } else {
        // Try JSON array: ?accounts=["123","456"]
        try {
          const accounts = JSON.parse(route.query.accounts)
          if (Array.isArray(accounts)) {
            selectedAccounts.value = accounts
          }
        } catch (err) {
          // If not JSON, treat as single account ID
          selectedAccounts.value = [route.query.accounts]
        }
      }
    }
  }

  if (route.query.timeframe && typeof route.query.timeframe === 'string') {
    selectedTimeframe.value = route.query.timeframe
  }

  if (route.query.tab && typeof route.query.tab === 'string') {
    activeTab.value = route.query.tab
  }

  if (route.query.chartTab && typeof route.query.chartTab === 'string') {
    activeChartTab.value = route.query.chartTab
  }

  if (route.query.mode && typeof route.query.mode === 'string') {
    const mode = route.query.mode as DataMode
    if (mode === 'billable' || mode === 'proforma') {
      dataMode.value = mode
    }
  }
}

// Initialize - only on client side to avoid SSR issues
onMounted(async () => {
  if (import.meta.client) {
    // Apply any shared state from URL first
    applySharedStateFromUrl()
    
    // Then refresh data with the applied state
    await refreshData()

    // Trigger initial cost data fetch (watchers are not immediate)
    await fetchCosts()

    // Enable watchers now that URL state is applied and initial fetch is done
    initialized.value = true

    // Emit cost-specific events for achievement badges (fire-and-forget)
    nextTick(() => {
      for (const acc of accountsWithCosts.value) {
        const spend = getSpend(acc)
        const budget = getBudget(acc)
        if (budget > 0 && spend > budget) {
          useEventBus().emit('cost.over_budget_viewed', { accountId: getAccountKey(acc), spend, budget })
          break
        }
        if (spend === 0) {
          useEventBus().emit('cost.zero_spend_viewed', { accountId: getAccountKey(acc) })
          break
        }
      }
    })

    // Auto-start tour for first-time users or admin resets
    await initTourOnMount()

    // Load advanced charts toggle state from localStorage
    const saved = localStorage.getItem('showAdvancedCharts')
    if (saved !== null) {
      showAdvancedCharts.value = saved === 'true'
    }
  }
})

// =============================================================================
// CHART SYSTEM ORCHESTRATION
// =============================================================================
// This is the core of the chart system - three composables work together:

// 1. useCostData: Fetches cost data from multiple API endpoints based on selection
//    - Watches selectedAccounts and selectedTimeframe
//    - Debounces requests to avoid excessive API calls
//    - Returns dataset containing summary, analysis, historical, services, and forecast data
const { mode: dataMode, isFetching: isCostFetching, isDeferredLoading, isPending: isCostPending, fetchError: costError, fetchWarnings, dataset, fetchCosts, initialized } = useCostData({
  selectedAccounts,
  selectedTimeframe,
  initialMode: 'proforma',
  accountsList, // Pass full accounts data for LOB/Department mapping
  debounceMs: 800 // Wait 800ms after user stops selecting accounts
})

// 2. useCostScenario: Determines the viewing context based on user selections
//    Scenarios: 'all-accounts', 'single-account', 'few-accounts', 'lob-group', 'department-group'
//    This determines which charts are most relevant to show
const { scenario } = useCostScenario({ selectedAccounts, activeTab })

// Advanced charts toggle (persisted in localStorage)
const showAdvancedCharts = ref(false)

// 3. useChartRegistry: Contains all chart definitions and selects appropriate charts
//    - Each chart has an extractor function that transforms dataset into chart data
//    - Charts are selected based on the current scenario
//    - Historical timeframes exclude budget-dependent charts
//    - showAdvanced toggle includes power-user charts when enabled
const { charts } = useChartRegistry({ scenario, timeframe: selectedTimeframe, mode: dataMode, showAdvanced: showAdvancedCharts })

// Activity tracking for cost dashboard interactions
watch(selectedTimeframe, (val) => { if (initialized.value) logUserAction('cost.timeframe_change', `timeframe:${val}`) })
watch(activeTab, (val) => { if (initialized.value) logUserAction('cost.tab_switch', `tab:${val}`) })
watch(activeChartTab, (val) => { if (initialized.value) logUserAction('cost.tab_switch', `chartTab:${val}`) })
watch(dataMode, (val) => { if (initialized.value) { logUserAction('cost.mode_toggle', `mode:${val}`); useEventBus().emit('cost.data_mode_toggled', { mode: val }) } })

// Set page title
useHead({
  title: 'Cost Analytics - Ghost Dashboard'
})
</script>

<style scoped>
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: var(--ghost-scrollbar-track);
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: var(--ghost-scrollbar-thumb);
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: var(--ghost-scrollbar-thumb-hover);
}
</style>