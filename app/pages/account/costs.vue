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
                        {{ account.accountId || account.awsStandardAccountID || account.awsCommercialAccountID }}
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
                'text-blue-600 dark:text-blue-400 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20': activeTab === tab.id,
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
                            'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300': accountSortBy === option.value,
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
                :selected="selectedAccountSet.has(getAccountKey(account))"
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
        v-model:compare="compareMode"
        :timeframe-options="timeframeOptions"
        :selected-accounts="selectedAccounts"
        :active-tab="activeTab"
        :active-chart-tab="activeChartTab"
        :selected-tag="selectedTag"
        :tag-view="tagView"
        :dataset="dataset"
        :alerts-count="!isHistoricalTimeframe ? alertsCount : 0"
        :alerts-by-severity="!isHistoricalTimeframe ? alertsBySeverity : { critical: 0, escalation: 0, warning: 0, info: 0 }"
        @refresh="refreshData"
        @start-tour="() => handleStartTour(true)"
        @view-alerts="navigateToBudgetAlerts"
        @load-preset="applyPreset"
      />

      <!-- Selected Account Context Banner -->
      <div v-if="selectedAccounts.length > 0 && !isTagAnalysis" class="px-4 md:px-6 pt-4">
        <div class="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="flex-shrink-0 p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Icon name="i-heroicons-funnel" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div class="min-w-0 flex-1">
              <template v-if="selectedAccounts.length === 1">
                <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {{ getSelectedAccountName(selectedAccounts[0]) }}
                </div>
                <div class="text-xs text-blue-700 dark:text-blue-300">
                  {{ selectedAccounts[0] }}
                </div>
              </template>
              <template v-else-if="selectedAccounts.length <= 5">
                <div class="text-sm font-semibold text-gray-900 dark:text-white">
                  {{ selectedAccounts.length }} accounts selected
                </div>
                <div class="text-xs text-blue-700 dark:text-blue-300 truncate">
                  {{ selectedAccounts.map(id => getSelectedAccountName(id)).join(', ') }}
                </div>
              </template>
              <template v-else>
                <div class="text-sm font-semibold text-gray-900 dark:text-white">
                  {{ selectedAccounts.length }} accounts selected
                </div>
                <div class="text-xs text-blue-700 dark:text-blue-300">
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
        <div v-if="compareMode && !isTagAnalysis">
          <div class="mb-4 flex items-center gap-3">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">Period Comparison</h2>
            <UButton size="xs" color="gray" variant="soft" icon="i-heroicons-x-mark" @click="compareMode = false">
              Exit Compare
            </UButton>
          </div>
          <CostComparisonView :selected-accounts="selectedAccounts" :mode="dataMode" />
        </div>

        <!-- Loading State (first load only; a refresh keeps the current view on screen) -->
        <div v-else-if="isLoading && !hasAccounts" class="flex items-center justify-center h-full">
          <div class="text-center">
            <Icon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
            <p class="text-gray-600 dark:text-gray-400">Loading cost data...</p>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error && !hasAccounts" class="flex items-center justify-center h-full">
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
          <!-- A failed refresh keeps the last good data and says so -->
          <div v-if="error" class="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5 flex-shrink-0" />
            <span class="flex-1">Couldn't refresh the account list: {{ error }}. Showing the last loaded data.</span>
            <UButton size="xs" color="red" variant="soft" @click="refreshData">Retry</UButton>
          </div>

          <!-- First Day of Month Notice -->
          <div v-if="isFirstDayOfMonth && !isTagAnalysis" class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <Icon name="i-heroicons-calendar" class="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div class="flex-1">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h4 class="text-sm font-medium text-amber-800 dark:text-amber-300">Current Month Has No Observed Days Yet</h4>
                    <p class="text-xs text-amber-700 dark:text-amber-400 mt-1">
                      This Month is empty because AWS Cost Explorer reports through yesterday and uses an exclusive end date. No prior-month charges are substituted.
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
          <div v-else-if="isEarlyInMonth && !isTagAnalysis" class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <Icon name="i-heroicons-calendar" class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div class="flex-1">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h4 class="text-sm font-medium text-blue-800 dark:text-blue-300">Limited Data Available for Current Month</h4>
                    <p class="text-xs text-blue-700 dark:text-blue-400 mt-1">
                      It's early in the month, so cost data for {{ new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }} is still accumulating.
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
          <div v-if="isHistoricalTimeframe && !isTagAnalysis" class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <Icon name="i-heroicons-information-circle" class="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div class="flex-1">
                <h4 class="text-sm font-medium text-yellow-800 dark:text-yellow-300">Historical Data Limitations</h4>
                <p class="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  Budget comparisons and forecasts are not available for historical periods as budget data is only maintained for the current period.
                  Additionally, some accounts may have been decommissioned and won't appear in historical views.
                </p>
              </div>
            </div>
          </div>

          <!-- Budgets carried forward because this year's PEP budget isn't loaded yet -->
          <div v-if="carriedForwardBudgets.count > 0 && !isHistoricalTimeframe && !isTagAnalysis"
            class="flex items-start gap-3 rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 px-4 py-3 text-xs text-purple-800 dark:text-purple-300">
            <Icon name="i-heroicons-information-circle" class="w-5 h-5 flex-shrink-0 text-purple-500" />
            <span>
              <span class="font-medium">{{ carriedForwardBudgets.year }} PEP budgets aren't loaded for {{ carriedForwardBudgets.count }} of {{ displayedAccounts.length }} accounts.</span>
              Their budgets use the December {{ carriedForwardBudgets.from }} monthly amount until {{ carriedForwardBudgets.year }} values are supplied.
            </span>
          </div>

          <!-- Summary Cards -->
          <div v-if="!isTagAnalysis" data-tour="costs-summary">
            <CostsSummaryCards
              :total-accounts="selectedAccounts.length || accountsWithCosts.length"
              :total-budget="isHistoricalTimeframe ? 0 : totalBudget"
              :total-spend="totalSpend"
              :utilization="isHistoricalTimeframe ? 0 : utilization"
              :format-currency="formatCurrency"
              :scenario="scenario"
              :is-historical="isHistoricalTimeframe"
              :timeframe="selectedTimeframe"
            />
          </div>

          <!-- First load: nothing to show yet -->
          <div v-if="!dataset && (isCostPending || isCostFetching) && !isTagAnalysis" class="space-y-4" aria-busy="true">
            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Icon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
              Loading charts...
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div v-for="n in 4" :key="n" class="h-64 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 animate-pulse" />
            </div>
          </div>
          <div v-else-if="costError && !isTagAnalysis" class="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-lg p-6 flex items-center justify-between gap-4">
            <span class="text-red-600 dark:text-red-400">{{ costError }}</span>
            <UButton color="red" variant="soft" size="sm" @click="fetchCosts({ force: true })">Try Again</UButton>
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
            <!-- Filter changed: keep the current charts on screen while the new data loads -->
            <div v-if="(isCostPending || isCostFetching) && !isTagAnalysis" class="mb-3 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-600 dark:text-blue-400" role="status">
              <Icon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              <span>Updating charts...</span>
            </div>
            <!-- Subtle indicator while forecast/supplementary data loads in background -->
            <div v-else-if="isDeferredLoading && !isTagAnalysis" class="mb-3 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-600 dark:text-blue-400" role="status">
              <Icon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              <span>Loading forecast and supplementary data...</span>
            </div>
            <div :class="{ 'opacity-60 transition-opacity': (isCostPending || isCostFetching) && !isTagAnalysis }">
            <ChartTabs
              v-model:tag="selectedTag"
              v-model:tag-view="tagView"
              :smart-charts="charts"
              :dataset="chartDataset"
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
              @toggle-advanced-charts="toggleAdvancedCharts"
              @tab-changed="activeChartTab = $event"
              @refresh-data="fetchCosts({ force: true })"
            />
            </div>

          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CostsHeader from '~/components/costs/CostsHeader.vue'
import CostsSummaryCards from '~/components/costs/CostsSummaryCards.vue'
import ChartTabs from '~/components/costs/SimpleChartTabs.vue'
import SidebarGroupList from '~/components/costs/SidebarGroupList.vue'
import { useCostData } from '~/composables/useCostData'
import { useCostScenario } from '~/composables/useCostScenario'
import { useChartRegistry } from '~/composables/useChartRegistry'
import type { DataMode } from '~/types/costs'
import type { BudgetAlert } from '#shared/types/budget-alerts'
import { getCostTagWorkspaceQuery, normalizeCostTagCreatorView } from '~/utils/cost-tag-workspace'
import type { CostTagCreatorView } from '~/utils/cost-tag-workspace'
import { getTimeframeBudget } from '~/utils/cost-period'
import { getAnnualBudgetArray } from '#shared/utils/budget-utils'

definePageMeta({
  keepalive: false
})

// =============================================================================
// COMPOSABLES AND IMPORTS
// =============================================================================
// useAccountCosts: Fetches raw account data from the API
const { handleStartTour, initTourOnMount } = useCostTour()

// Core composables that power the chart system:
// - useCostData: Fetches and manages cost data based on selected accounts/timeframe
// - useCostScenario: Determines which charts to show based on selection context
// - useChartRegistry: Contains all chart definitions and selection logic
// - useCostFilters (cost-filters.ts): Handles filtering accounts by cost thresholds

const { accounts, isLoading, error, fetchAccounts } = useAccountCosts()
const { favoriteIds } = useFavoriteAccounts()
const selectedAccounts = ref<string[]>([])

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
  requestID?: string | number
  requestId?: string | number
  status?: string
  enclaveStatus?: string
  accountAlias?: string
  pepCloudRecordName?: string
  pepEnvironmentName?: string
  periodBudget?: number
}

const supplementalAccounts = ref<Account[]>([])

const getPossibleAccountIds = (account: Account): string[] => {
  return [
    account.accountId,
    account.awsStandardAccountID,
    account.awsCommercialAccountID,
    account.id
  ].filter((id): id is string => Boolean(id))
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
  const baseAccounts = !data
    ? []
    : Array.isArray(data)
      ? data as Account[]
      : (data as any).data && Array.isArray((data as any).data)
        ? (data as any).data as Account[]
        : []

  const knownIds = new Set(baseAccounts.flatMap(getPossibleAccountIds))
  const missingSupplements = supplementalAccounts.value.filter(account =>
    !getPossibleAccountIds(account).some(id => knownIds.has(id))
  )
  return [...baseAccounts, ...missingSupplements]
})
const hasAccounts = computed(() => accountsList.value.length > 0)

// =============================================================================
// COST DATA MERGING AND FILTERING
// =============================================================================
// Cost filtering setup - respects user's cost threshold settings
const costSettingsStore = useCostSettingsStore()

// Forecast APIs need an explicit scope so the default "All accounts" view
// excludes the same hidden development/decommissioned accounts as the UI.
const defaultCostScopeAccountIds = computed<string[]>(() => {
  const metadataSettings = {
    ...costSettingsStore.$state,
    // Spend thresholds are applied after costs load; they are not a stable forecast scope.
    minCostThreshold: 0
  }

  return applyAccountFilters(accountsList.value, metadataSettings)
    .map(account => getPossibleAccountIds(account)[0])
    .filter((id): id is string => Boolean(id))
})

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
  
  // The requested-mode summary is the authoritative source for displayed spend.
  if (dataset.value.summary) {
    const summaryData = dataset.value.summary as any
    
    // The API returns data wrapped in { success: true, data: {...} }
    const actualData = summaryData?.data || summaryData
    
    // Handle proforma mode - data structure is different
    let accountsData: any[] = []
    
    const summarySource = actualData?.[dataMode.value] || actualData
    if (Array.isArray(summarySource?.accounts)) accountsData = summarySource.accounts
    
    accountsData.forEach((account: any) => {
      const accountId = account.accountId
      const cost = Number(account.totalCost || 0)
      if (accountId && Number.isFinite(cost)) {
        costMap.set(accountId, cost)
      }
    })
  }

  // Analysis enriches budgets only; this fallback supports older cached responses.
  if (dataset.value.analysis && costMap.size === 0) {
    const analysisData = dataset.value.analysis as any
    const actualData = analysisData?.data || analysisData
    for (const item of actualData?.budgetAnalysis?.byAccount || []) {
      if (item.accountId && typeof item.actualCost === 'number') costMap.set(item.accountId, item.actualCost)
    }
  }
  
  // Merge costs into accounts
  const enrichedAccounts = baseAccounts.map(account => {
    // Try multiple ID fields to match
    const possibleIds = getPossibleAccountIds(account)
    
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
      spend: costFromData,
      // Quarter and year-to-date spend is compared with the budget for the same months
      ...(isMultiMonthCurrentTimeframe.value
        ? { periodBudget: getTimeframeBudget(account, selectedTimeframe.value) }
        : {})
    }
  })
  
  // Explicit URL selections must remain visible even when general sidebar
  // filters (for example, "hide dev accounts") would normally remove them.
  const filteredAccounts = applyAccountFilters(enrichedAccounts, costSettingsStore.$state)
  if (selectedAccounts.value.length === 0) return filteredAccounts

  const filteredSet = new Set(filteredAccounts)
  const selectedSet = new Set(selectedAccounts.value)
  return enrichedAccounts.filter(account =>
    filteredSet.has(account) || getPossibleAccountIds(account).some(id => selectedSet.has(id))
  )
})

// Compare mode toggle
const compareMode = ref(false)

// State
const searchTerm = ref('')
const searchScope = ref<'tab' | 'global'>('tab') // Default to searching within current tab
const selectedTimeframe = ref('thisMonth')
const activeTab = ref('all')
const activeChartTab = ref('smart') // Chart tab selection (smart, organizational, trends, budget-health, data, forecast)
const selectedTag = ref<string | null>(null)
const tagView = ref<CostTagCreatorView>('people')
const expandedGroups = ref(new Set<string>())
const accountSortBy = ref<'cost' | 'name' | 'budget' | 'utilization'>('cost') // Default sort by cost
const showRegressionLine = ref(false) // Toggle for budget variance regression line

// View By state: controls how cost data is grouped (account, service, or region)
const viewBy = ref('LINKED_ACCOUNT')
const isTagAnalysis = computed(() => activeChartTab.value === 'tags')

const isMultiMonthCurrentTimeframe = computed(() => ['thisQuarter', 'ytd', 'thisYear'].includes(selectedTimeframe.value))

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
    // UTC, matching Cost Explorer and the month notices on this page
    const month = new Date().toISOString().slice(0, 7)
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
  const dayOfMonth = today.getUTCDate()
  // Consider days 1-5 as early in the month
  return dayOfMonth <= 5 && selectedTimeframe.value === 'thisMonth'
})

// Detect if we're on the first day (special case: showing previous month's data)
const isFirstDayOfMonth = computed(() => {
  const today = new Date()
  return today.getUTCDate() === 1 && selectedTimeframe.value === 'thisMonth'
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

// Selection may use any of an account's ids (URL links can carry the commercial id),
// so every total, the charts and the sidebar match on all of them.
const selectedAccountSet = computed(() => new Set(selectedAccounts.value))

// Accounts the summary cards and charts describe: the selection, or everything shown
const displayedAccounts = computed<Account[]>(() => {
  if (selectedAccounts.value.length === 0) return accountsWithCosts.value
  const selected = selectedAccountSet.value
  return accountsWithCosts.value.filter((account: Account) =>
    getPossibleAccountIds(account).some(id => selected.has(id)))
})

// Accounts whose current-year budget is December of an earlier year carried forward
const carriedForwardBudgets = computed(() => {
  const year = new Date().getUTCFullYear()
  let count = 0
  let from: number | undefined
  for (const account of displayedAccounts.value) {
    const { carriedForwardFrom } = getAnnualBudgetArray(account, year)
    if (carriedForwardFrom !== undefined) {
      count += 1
      from = carriedForwardFrom
    }
  }
  return { count, year, from }
})

const totalBudget = computed<number>(() =>
  displayedAccounts.value.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0))

const totalSpend = computed<number>(() =>
  displayedAccounts.value.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0))

const chartDataset = computed<NormalizedDataset | null>(() => {
  if (!dataset.value) return null

  const displayed = displayedAccounts.value

  return {
    ...dataset.value,
    displayedAccountIds: displayed.flatMap(getPossibleAccountIds),
    displayedCurrentSpend: totalSpend.value
  }
})

const utilization = computed(() => {
  if (totalBudget.value === 0) return 0
  return Math.round((totalSpend.value / totalBudget.value) * 100)
})

// AI Cost Summary context (combined cost + budget analysis)
const costSummaryContext = computed(() => {
  if (totalSpend.value === 0) return {}
  const accts = selectedAccounts.value.length > 0
    ? displayedAccounts.value
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
const selectedAccountObjects = computed(() =>
  selectedAccounts.value.length === 0 ? [] : displayedAccounts.value)

const displayedSelectedAccounts = computed(() => {
  return selectedAccountObjects.value.slice(0, 3)
})

const remainingSelectedCount = computed(() => {
  return Math.max(0, selectedAccountObjects.value.length - 3)
})

const formatAccountDisplayName = (account: Account) => {
  const name = account.accountName || account.projectName || account.name || account.pepCloudRecordName || account.pepEnvironmentName || account.accountAlias || 'Unnamed Account'
  return name.length > 20 ? name.substring(0, 20) + '...' : name
}

const getSelectedAccountName = (accountId?: string): string => {
  if (!accountId) return ''
  const account = accountsWithCosts.value.find(
    (acc: Account) => getAccountKey(acc) === accountId
  )
  if (!account) return accountId
  return account.accountName || account.projectName || account.name || account.pepCloudRecordName || account.pepEnvironmentName || account.accountAlias || accountId
}

// Sidebar groups, helpers, and search matching -- extracted to composable
const { lobGroups, departmentGroups, smartGroups, matchesSearchTerm, getAccountKey, getBudget, getSpend } = useSidebarGroups({
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

const loadAccounts = async (): Promise<boolean> => {
  // Include decommissioned accounts when viewing historical data
  // as they may have had costs in the past
  const includeDecommissioned = isHistoricalTimeframe.value
  try {
    await fetchAccounts({ includeDecommissioned, enrichment: 'full' })
    return true
  } catch {
    // useAccountCosts records the error for the page to show
    return false
  }
}

// Refresh button and error retries: reload accounts and bypass the client cost cache.
// Also completes the first-load sequence if the initial accounts request failed.
const refreshData = async () => {
  const [accountsOk] = await Promise.all([
    loadAccounts(),
    initialized.value ? fetchCosts({ force: true }) : Promise.resolve()
  ])
  if (!initialized.value && accountsOk) await finishInitialLoad()
}

const finishInitialLoad = async () => {
  await ensureSelectedAccountMetadata()
  // Initial cost data fetch (watchers are not immediate)
  await fetchCosts()
  // Enable watchers now that URL state is applied and initial fetch is done
  initialized.value = true
}

const ensureSelectedAccountMetadata = async () => {
  const knownIds = new Set(accountsList.value.flatMap(getPossibleAccountIds))
  const missingIds = selectedAccounts.value.filter(id => !knownIds.has(id))
  if (missingIds.length === 0) return

  const resolved = await Promise.all(missingIds.map(async (id) => {
    try {
      const response = await $fetch<any>(`/api/accounts/${encodeURIComponent(id)}`, {
        query: { includeDecommissioned: true }
      })
      const account = response?.data?.account || response?.account
      if (!account) return null
      return {
        ...account,
        accountId: account.accountId || account.awsStandardAccountID || id
      } as Account
    } catch (err) {
      logger.warn(`Unable to load metadata for selected account ${id}`, err)
      return null
    }
  }))

  supplementalAccounts.value = resolved.filter((account): account is Account => account !== null)
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
const applyPreset = (preset: {
  selectedAccounts: string[]
  timeframe: string
  dataMode: string
  viewBy: string
  activeTab: string
  chartTab?: string
  tag?: string | null
  tagView?: CostTagCreatorView
}) => {
  selectedAccounts.value = preset.selectedAccounts || []
  if (preset.timeframe) selectedTimeframe.value = preset.timeframe
  if (preset.dataMode === 'billable' || preset.dataMode === 'proforma') {
    dataMode.value = preset.dataMode as DataMode
  }
  if (preset.viewBy) viewBy.value = preset.viewBy
  if (preset.activeTab) activeTab.value = preset.activeTab
  if (preset.chartTab) activeChartTab.value = preset.chartTab
  if (preset.tag !== undefined) selectedTag.value = preset.tag
  if (preset.tagView) tagView.value = normalizeCostTagCreatorView(preset.tagView)
}

// Handle shared state from URL parameters
const applySharedStateFromUrl = () => {
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
        } catch {
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

  if (route.query.tag && typeof route.query.tag === 'string') {
    selectedTag.value = route.query.tag
  }

  tagView.value = normalizeCostTagCreatorView(route.query.tagView)

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
    
    // Then load data with the applied state
    if (await loadAccounts()) await finishInitialLoad()

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
    try {
      const saved = localStorage.getItem('showAdvancedCharts')
      if (saved !== null) {
        showAdvancedCharts.value = saved === 'true'
      }
    } catch {
      // Storage unavailable (private mode); keep the default
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
  defaultAccountScope: defaultCostScopeAccountIds,
  debounceMs: 800 // Wait 800ms after user stops selecting accounts
})

// 2. useCostScenario: Determines the viewing context based on user selections
//    Scenarios: 'all-accounts', 'single-account', 'few-accounts', 'lob-group', 'department-group'
//    This determines which charts are most relevant to show
const { scenario } = useCostScenario({ selectedAccounts, activeTab })

// Advanced charts toggle (persisted in localStorage)
const showAdvancedCharts = ref(false)
const toggleAdvancedCharts = () => {
  showAdvancedCharts.value = !showAdvancedCharts.value
  try {
    localStorage.setItem('showAdvancedCharts', String(showAdvancedCharts.value))
  } catch {
    // Storage unavailable (private mode); the toggle still works for this visit
  }
}

// 3. useChartRegistry: Contains all chart definitions and selects appropriate charts
//    - Each chart has an extractor function that transforms dataset into chart data
//    - Charts are selected based on the current scenario
//    - Historical timeframes exclude budget-dependent charts
//    - showAdvanced toggle includes power-user charts when enabled
const { charts } = useChartRegistry({ scenario, timeframe: selectedTimeframe, mode: dataMode, showAdvanced: showAdvancedCharts })

const route = useRoute()
const router = useRouter()

// Keep the focused workspace bookmarkable without coupling tag controls to the
// broader cost-data request pipeline.
watch([activeChartTab, selectedTag, tagView], () => {
  if (!import.meta.client) return

  const workspaceQuery = getCostTagWorkspaceQuery({
    chartTab: activeChartTab.value,
    selectedTag: selectedTag.value,
    tagView: tagView.value
  })
  const nextQuery: Record<string, any> = Object.fromEntries(
    Object.entries(route.query).filter(([key]) =>
      !(key in workspaceQuery) || workspaceQuery[key as keyof typeof workspaceQuery] !== undefined
    )
  )
  const changed = Object.entries(workspaceQuery).some(([key, value]) => route.query[key] !== value)

  for (const [key, value] of Object.entries(workspaceQuery)) {
    if (value !== undefined) nextQuery[key] = value
  }

  if (changed) void router.replace({ query: nextQuery })
})

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
