<template>
  <div class="flex h-full min-h-0 bg-gray-950">
    <!-- Sidebar -->
    <div class="w-80 flex-shrink-0 border-r border-gray-700 h-full min-h-0 flex flex-col overflow-hidden" data-tour="account-selector">
      <div class="flex-1 bg-gray-900 flex flex-col min-h-0">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 class="text-lg font-semibold text-white">Account Selector</h2>
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
        <div v-if="selectedAccounts.length > 0" class="px-3 py-2 border-b border-gray-700">
          <UPopover mode="hover" :popper="{ placement: 'bottom-start', offsetDistance: 4 }">
            <button
              class="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-300 bg-blue-900/20 hover:bg-blue-900/30 rounded transition-colors"
            >
              <Icon name="i-heroicons-check-circle" class="w-3.5 h-3.5 text-blue-400" />
              <span class="font-medium">{{ selectedAccounts.length }} account{{ selectedAccounts.length !== 1 ? 's' : '' }} selected</span>
              <Icon name="i-heroicons-chevron-down" class="w-3 h-3 text-gray-400 ml-auto" />
            </button>

            <template #panel>
              <div class="p-2 w-72 max-h-64 overflow-y-auto">
                <div class="text-xs font-medium text-gray-300 mb-2">Selected Accounts</div>
                <div class="space-y-1">
                  <div
                    v-for="account in displayedSelectedAccounts"
                    :key="getAccountKey(account)"
                    class="flex items-center justify-between gap-2 px-2 py-1.5 bg-blue-900/30 rounded text-xs group"
                  >
                    <div class="flex-1 min-w-0">
                      <div class="text-gray-200 truncate font-medium">
                        {{ formatAccountDisplayName(account) }}
                      </div>
                      <div class="text-gray-400 text-[10px] truncate">
                        {{ account.accountId || account.awsStandardAccountID }}
                      </div>
                    </div>
                    <button
                      class="flex-shrink-0 p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                      @click.stop="toggleAccount(getAccountKey(account))"
                    >
                      <Icon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div v-if="remainingSelectedCount > 0" class="px-2 py-1 text-xs text-blue-400">
                    +{{ remainingSelectedCount }} more selected
                  </div>
                </div>

                <div class="mt-2 pt-2 border-t border-gray-700">
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
        <div class="p-3 border-b border-gray-700" data-tour="account-search">
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
          <div v-if="searchTerm && searchResults.total > 0" class="mt-2 text-xs text-gray-400">
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
          <div v-if="searchTerm && searchResults.total === 0" class="mt-2 text-xs text-gray-400">
            No results found. <button class="text-blue-400 hover:text-blue-300 underline" @click="searchScope = 'global'">Search all tabs?</button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="border-b border-gray-700" data-tour="account-tabs">
          <div class="flex">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1"
              :class="{
                'text-blue-400 border-blue-400 bg-blue-900/20': activeTab === tab.id,
                'text-gray-400 border-transparent hover:text-gray-300 hover:border-gray-600': activeTab !== tab.id
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
              <span class="text-sm text-gray-300">All Accounts ({{ sortedFilteredAccounts.length }})</span>
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
                      <div class="text-xs font-medium text-gray-300 mb-2">Sort by</div>
                      <div class="space-y-1">
                        <button
                          v-for="option in sortOptions"
                          :key="option.value"
                          class="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-700 transition-colors"
                          :class="{ 
                            'bg-blue-900/50 text-blue-300': accountSortBy === option.value,
                            'text-gray-300': accountSortBy !== option.value
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
              <div 
                v-for="account in sortedFilteredAccounts" 
                :key="getAccountKey(account)"
                class="flex items-center justify-between p-2 rounded hover:bg-gray-800 cursor-pointer text-sm"
                :class="{ 'bg-blue-900/50': selectedAccounts.includes(getAccountKey(account)) }"
                @click="toggleAccount(getAccountKey(account))"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    :checked="selectedAccounts.includes(getAccountKey(account))"
                    class="w-3 h-3 text-blue-600 bg-gray-700 border-gray-600 rounded"
                    @change="toggleAccount(getAccountKey(account))"
                    @click.stop
                  >
                  <div class="min-w-0 flex-1">
                    <div class="text-gray-200 font-medium truncate">
                      {{ account.accountName || account.projectName || account.name || 'Unnamed Account' }}
                    </div>
                    <div class="text-xs text-gray-400">
                      {{ account.accountId || account.awsStandardAccountID }}
                    </div>
                  </div>
                </div>
                <div class="text-right ml-2 flex flex-col space-y-1 items-end">
                  <UTooltip text="Budget">
                    <div class="text-xs text-gray-300">
                      {{ formatCurrency(getBudget(account)) }}
                    </div>
                  </UTooltip>
                  <UTooltip text="Spend">
                    <div class="text-xs text-green-400">
                      {{ formatCurrency(getSpend(account)) }}
                    </div>
                  </UTooltip>
                  <UTooltip v-if="accountSortBy === 'utilization' && getBudget(account) > 0" text="Utilization">
                    <div class="text-xs" :class="getUtilizationColor(account)">
                      {{ ((getSpend(account) / getBudget(account)) * 100).toFixed(0) }}%
                    </div>
                  </UTooltip>
                </div>
              </div>
            </div>
          </div>

          <!-- Lines of Business Tab -->
          <div v-else-if="activeTab === 'lob'" class="p-3">
            <div class="mb-3">
              <span class="text-sm text-gray-300">Lines of Business ({{ lobGroups.length }})</span>
            </div>
            
            <div class="space-y-2">
              <div
                v-for="lob in lobGroups"
                :key="lob.name"
                class="bg-gray-800/50 rounded-lg"
              >
                <div 
                  class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800 rounded-t-lg min-h-[4rem]"
                  @click="toggleLOB(lob)"
                >
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <Icon name="i-heroicons-briefcase" class="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div class="min-w-0">
                      <div class="font-medium text-gray-200 truncate">{{ lob.name || 'Unknown LOB' }}</div>
                      <div class="text-xs text-gray-400">{{ lob.accounts.length }} accounts</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="text-right flex flex-col space-y-1 items-end">
                      <UTooltip text="Total Budget">
                        <div class="text-xs text-gray-300">
                          {{ formatCurrency(lob.totalBudget) }}
                        </div>
                      </UTooltip>
                      <UTooltip text="Total Spend">
                        <div class="text-xs text-green-400">
                          {{ formatCurrency(lob.totalSpend) }}
                        </div>
                      </UTooltip>
                      <UTooltip v-if="lob.totalBudget > 0" text="Group Utilization">
                        <div class="text-xs" :class="lob.totalSpend > lob.totalBudget ? 'text-red-400' : lob.totalSpend > lob.totalBudget * 0.9 ? 'text-yellow-400' : 'text-green-400'">
                          {{ ((lob.totalSpend / lob.totalBudget) * 100).toFixed(2) }}%
                        </div>
                      </UTooltip>
                    </div>
                    <UTooltip text="Select Group">
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="blue"
                        icon="i-heroicons-check-circle"
                        class="px-2"
                        @click.stop="selectLOBGroup(lob)"
                      />
                    </UTooltip>
                  </div>
                </div>
                
                <div v-if="expandedGroups.has('lob-' + lob.name)" class="px-3 pb-3">
                  <div class="space-y-1 ml-4 border-l border-gray-600 pl-3">
                    <div
                      v-for="account in lob.accounts"
                      :key="getAccountKey(account)"
                      class="flex items-center justify-between p-2 rounded hover:bg-gray-800 cursor-pointer text-sm"
                      :class="{ 'bg-blue-900/50': selectedAccounts.includes(getAccountKey(account)) }"
                      @click="toggleAccount(getAccountKey(account))"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          :checked="selectedAccounts.includes(getAccountKey(account))"
                          class="w-3 h-3 text-blue-600 bg-gray-700 border-gray-600 rounded"
                          @change="toggleAccount(getAccountKey(account))"
                          @click.stop
                        >
                        <div class="min-w-0 flex-1">
                          <div class="text-gray-200 truncate">
                            {{ account.accountName || account.projectName || 'Unnamed Account' }}
                          </div>
                          <div class="text-xs text-gray-400">
                            {{ account.accountId || account.awsStandardAccountID }}
                          </div>
                        </div>
                      </div>
                      <div class="text-right ml-2 flex flex-col space-y-1 items-end">
                        <UTooltip text="Budget">
                          <div class="text-xs text-gray-300">
                            {{ formatCurrency(getBudget(account)) }}
                          </div>
                        </UTooltip>
                        <UTooltip text="Spend">
                          <div class="text-xs text-green-400">
                            {{ formatCurrency(getSpend(account)) }}
                          </div>
                        </UTooltip>
                        <UTooltip v-if="getBudget(account) > 0" text="Utilization">
                          <div class="text-xs" :class="getUtilizationColor(account)">
                            {{ ((getSpend(account) / getBudget(account)) * 100).toFixed(2) }}%
                          </div>
                        </UTooltip>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Departments Tab -->
          <div v-else-if="activeTab === 'dept'" class="p-3">
            <div class="mb-3">
              <span class="text-sm text-gray-300">Departments ({{ departmentGroups.length }})</span>
            </div>
            
            <div class="space-y-2">
              <div
                v-for="dept in departmentGroups"
                :key="dept.name"
                class="bg-gray-800/50 rounded-lg"
              >
                <div 
                  class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800 rounded-t-lg min-h-[4rem]"
                  @click="toggleDepartment(dept)"
                >
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <Icon name="i-heroicons-building-office" class="w-4 h-4 text-green-400 flex-shrink-0" />
                    <div class="min-w-0">
                      <div class="font-medium text-gray-200 truncate">{{ dept.name || 'Unknown Dept' }}</div>
                      <div class="text-xs text-gray-400">{{ dept.accounts.length }} accounts</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="text-right flex flex-col space-y-1 items-end">
                      <UTooltip text="Total Budget">
                        <div class="text-xs text-gray-300">
                          {{ formatCurrency(dept.totalBudget) }}
                        </div>
                      </UTooltip>
                      <UTooltip text="Total Spend">
                        <div class="text-xs text-green-400">
                          {{ formatCurrency(dept.totalSpend) }}
                        </div>
                      </UTooltip>
                      <UTooltip v-if="dept.totalBudget > 0" text="Group Utilization">
                        <div class="text-xs" :class="dept.totalSpend > dept.totalBudget ? 'text-red-400' : dept.totalSpend > dept.totalBudget * 0.9 ? 'text-yellow-400' : 'text-green-400'">
                          {{ ((dept.totalSpend / dept.totalBudget) * 100).toFixed(2) }}%
                        </div>
                      </UTooltip>
                    </div>
                    <UTooltip text="Select Group">
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="blue"
                        icon="i-heroicons-check-circle"
                        class="px-2"
                        @click.stop="selectDepartmentGroup(dept)"
                      />
                    </UTooltip>
                  </div>
                </div>
                
                <div v-if="expandedGroups.has('dept-' + dept.name)" class="px-3 pb-3">
                  <div class="space-y-1 ml-4 border-l border-gray-600 pl-3">
                    <div
                      v-for="account in dept.accounts"
                      :key="getAccountKey(account)"
                      class="flex items-center justify-between p-2 rounded hover:bg-gray-800 cursor-pointer text-sm"
                      :class="{ 'bg-blue-900/50': selectedAccounts.includes(getAccountKey(account)) }"
                      @click="toggleAccount(getAccountKey(account))"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          :checked="selectedAccounts.includes(getAccountKey(account))"
                          class="w-3 h-3 text-blue-600 bg-gray-700 border-gray-600 rounded"
                          @change="toggleAccount(getAccountKey(account))"
                          @click.stop
                        >
                        <div class="min-w-0 flex-1">
                          <div class="text-gray-200 truncate">
                            {{ account.accountName || account.projectName || 'Unnamed Account' }}
                          </div>
                          <div class="text-xs text-gray-400">
                            {{ account.accountId || account.awsStandardAccountID }}
                          </div>
                        </div>
                      </div>
                      <div class="text-right ml-2 flex flex-col space-y-1 items-end">
                        <UTooltip text="Budget">
                          <div class="text-xs text-gray-300">
                            {{ formatCurrency(getBudget(account)) }}
                          </div>
                        </UTooltip>
                        <UTooltip text="Spend">
                          <div class="text-xs text-green-400">
                            {{ formatCurrency(getSpend(account)) }}
                          </div>
                        </UTooltip>
                        <UTooltip v-if="getBudget(account) > 0" text="Utilization">
                          <div class="text-xs" :class="getUtilizationColor(account)">
                            {{ ((getSpend(account) / getBudget(account)) * 100).toFixed(2) }}%
                          </div>
                        </UTooltip>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Smart Groupings Tab -->
          <div v-else-if="activeTab === 'smart'" class="p-3">
            <div class="mb-3">
              <span class="text-sm text-gray-300">Smart Groupings ({{ smartGroups.length }})</span>
            </div>
            
            <div class="space-y-2">
              <div
                v-for="group in smartGroups"
                :key="group.id"
                class="bg-gray-800/50 rounded-lg"
              >
                <div 
                  class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800 rounded-t-lg min-h-[4rem]"
                  @click="toggleSmartGroup(group)"
                >
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <Icon :name="group.icon" class="w-4 h-4 flex-shrink-0" :class="group.iconColor" />
                    <div class="min-w-0">
                      <div class="font-medium text-gray-200 truncate flex items-center gap-1">
                        {{ group.name }}
                        <UTooltip v-if="group.id === 'favorites'" text="Learn about favorites">
                          <NuxtLink to="/support/docs?topic=favorites-guide" class="text-gray-400 hover:text-gray-300" @click.stop>
                            <UIcon name="i-heroicons-question-mark-circle" class="w-3.5 h-3.5" />
                          </NuxtLink>
                        </UTooltip>
                      </div>
                      <div class="text-xs text-gray-400 truncate">{{ group.description }}</div>
                      <div class="text-xs text-gray-400">{{ group.accounts.length }} accounts</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="text-right flex flex-col space-y-1 items-end">
                      <UTooltip text="Total Budget">
                        <div class="text-xs text-gray-300">
                          {{ formatCurrency(group.totalBudget) }}
                        </div>
                      </UTooltip>
                      <UTooltip text="Total Spend">
                        <div class="text-xs text-green-400">
                          {{ formatCurrency(group.totalSpend) }}
                        </div>
                      </UTooltip>
                      <UTooltip v-if="group.totalBudget > 0" text="Group Utilization">
                        <div class="text-xs" :class="group.totalSpend > group.totalBudget ? 'text-red-400' : group.totalSpend > group.totalBudget * 0.9 ? 'text-yellow-400' : 'text-green-400'">
                          {{ ((group.totalSpend / group.totalBudget) * 100).toFixed(2) }}%
                        </div>
                      </UTooltip>
                    </div>
                    <UTooltip text="Select Group">
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="blue"
                        icon="i-heroicons-check-circle"
                        class="px-2"
                        @click.stop="selectSmartGroup(group)"
                      />
                    </UTooltip>
                  </div>
                </div>
                
                <div v-if="expandedGroups.has('smart-' + group.id)" class="px-3 pb-3">
                  <div class="space-y-1 ml-4 border-l border-gray-600 pl-3">
                    <div
                      v-for="account in group.accounts"
                      :key="getAccountKey(account)"
                      class="flex items-center justify-between p-2 rounded hover:bg-gray-800 cursor-pointer text-sm"
                      :class="{ 'bg-blue-900/50': selectedAccounts.includes(getAccountKey(account)) }"
                      @click="toggleAccount(getAccountKey(account))"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          :checked="selectedAccounts.includes(getAccountKey(account))"
                          class="w-3 h-3 text-blue-600 bg-gray-700 border-gray-600 rounded"
                          @change="toggleAccount(getAccountKey(account))"
                          @click.stop
                        >
                        <div class="min-w-0 flex-1">
                          <div class="text-gray-200 truncate">
                            {{ account.accountName || account.projectName || 'Unnamed Account' }}
                          </div>
                          <div class="text-xs text-gray-400">
                            {{ account.accountId || account.awsStandardAccountID }}
                          </div>
                        </div>
                      </div>
                      <div class="text-right ml-2 flex flex-col space-y-1 items-end">
                        <UTooltip text="Budget">
                          <div class="text-xs text-gray-300">
                            {{ formatCurrency(getBudget(account)) }}
                          </div>
                        </UTooltip>
                        <UTooltip text="Spend">
                          <div class="text-xs text-green-400">
                            {{ formatCurrency(getSpend(account)) }}
                          </div>
                        </UTooltip>
                        <UTooltip v-if="getBudget(account) > 0" text="Utilization">
                          <div class="text-xs" :class="getUtilizationColor(account)">
                            {{ ((getSpend(account) / getBudget(account)) * 100).toFixed(2) }}%
                          </div>
                        </UTooltip>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>


        </div>

        <!-- Selection Summary -->
        <div class="p-3 border-t border-gray-700 bg-gray-800/50">
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-300">
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
        :timeframe-options="timeframeOptions"
        :selected-accounts="selectedAccounts"
        :active-tab="activeTab"
        :dataset="dataset"
        @refresh="refreshData"
        @start-tour="handleStartTour"
      />

      <!-- Content Area -->
      <div class="flex-1 overflow-auto min-h-0 p-4 md:p-6">
        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center h-full">
          <div class="text-center">
            <Icon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
            <p class="text-gray-400">Loading cost data...</p>
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
            />
          </div>

          <div v-if="isCostPending" class="bg-gray-900 border border-amber-600 rounded-lg p-4 text-amber-400 flex items-center gap-2">
            <Icon name="i-heroicons-clock" class="w-5 h-5 animate-pulse" />
            <span>Waiting for account selection to complete...</span>
          </div>
          <div v-else-if="isCostFetching" class="bg-gray-900 border border-gray-700 rounded-lg p-6 text-gray-300">
            Loading charts...
          </div>
          <div v-else-if="costError" class="bg-gray-900 border border-gray-700 rounded-lg p-6 text-red-400">
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
              @toggle-regression-line="showRegressionLine = !showRegressionLine"
              @toggle-advanced-charts="showAdvancedCharts = !showAdvancedCharts; localStorage.setItem('showAdvancedCharts', String(showAdvancedCharts))"
              @tab-changed="handleTabChange"
              @refresh-data="fetchCosts"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// =============================================================================
// COMPOSABLES AND IMPORTS
// =============================================================================
// useAccountCosts: Fetches raw account data from the API
// Component imports for UI elements
import CostsHeader from '~/components/costs/CostsHeader.vue'
import CostsSummaryCards from '~/components/costs/CostsSummaryCards.vue'
import ChartTabs from '~/components/costs/SimpleChartTabs.vue'
import ForecastDataTable from '~/components/costs/ForecastDataTable.vue'
import { startCostTour } from '~/components/tutorial/CostTour'

const { getPreference, setPreference, load: loadPreferences } = useUserPreferences()
const tourStartedThisSession = ref(false)
const lastResetTimestamp = ref<string | null>(null)

async function handleStartTour() {
  const pref = getPreference<any>('costTour', {}) || {}
  const resetTimestamp = pref?.resetByAdminAt
  
  // Allow tour to run if it was reset (even if started this session)
  const wasReset = resetTimestamp && resetTimestamp !== lastResetTimestamp.value
  if (tourStartedThisSession.value && !wasReset) return
  
  if (wasReset) {
    lastResetTimestamp.value = resetTimestamp
  }
  tourStartedThisSession.value = true

  const startAt = Number(pref?.lastStep || 0)

  try {
    await startCostTour({
      startAtStep: isNaN(startAt) ? 0 : startAt,
      onComplete: async () => {
        await setPreference('costTour', {
          ...(getPreference<any>('costTour', {}) || {}),
          completed: true,
          completedAt: new Date().toISOString()
        })
      },
      onExit: async (currentStep) => {
        await setPreference('costTour', {
          ...(getPreference<any>('costTour', {}) || {}),
          lastStep: currentStep,
          startedAt: (getPreference<any>('costTour', {}) || {}).startedAt || new Date().toISOString()
        })
      }
    })
  } catch (error: any) {
    console.error('Failed to start tour:', error)
    const toast = useToast()
    toast.add({
      title: 'Tour Error',
      description: error.message || 'Failed to start the guided tour. Please try again.',
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    })
    // Reset session flag so user can try again
    tourStartedThisSession.value = false
  }
}

// Core composables that power the chart system:
// - useCostData: Fetches and manages cost data based on selected accounts/timeframe
// - useCostScenario: Determines which charts to show based on selection context
// - useChartRegistry: Contains all chart definitions and selection logic
// - useCostFilters: Handles filtering accounts by cost thresholds
import { useCostData } from '~/composables/useCostData'
import { useCostScenario } from '~/composables/useCostScenario'
import { useChartRegistry } from '~/composables/useChartRegistry'
import { useCostFilters } from '~/composables/useCostFilters'
import type { DataMode } from '~/types/costs'

const { accounts, isLoading, error, fetchAccounts } = useAccountCosts()
const { favoriteIds } = useFavoriteAccounts()

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
const { applyAccountFilters, formatCurrency: formatCurrencyWithSettings } = useCostFilters()

// CRITICAL COMPUTED PROPERTY: Merges live cost data with account metadata
// This is where account costs are populated from the dataset returned by API calls
// The dataset is populated by useCostData composable based on selected timeframe
const accountsWithCosts = computed<Account[]>(() => {
  const baseAccounts = accountsList.value
  
  // If no dataset available, return accounts as-is
  if (!dataset.value) {
    console.log('No dataset available yet')
    return baseAccounts
  }
  
  console.log('AccountsWithCosts: recalculating for timeframe:', selectedTimeframe.value, 'mode:', dataMode.value)
  
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
      console.log('Found budgetAnalysis data with', analysisSource.budgetAnalysis.byAccount.length, 'accounts')
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
        console.log('Using proforma accounts data with', accountsData.length, 'accounts')
      }
    } else {
      // Standard billable mode - accounts at top level
      if (actualData?.accounts && Array.isArray(actualData.accounts)) {
        accountsData = actualData.accounts
        console.log('Using billable accounts data with', accountsData.length, 'accounts')
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
  
  console.log('Cost map has', costMap.size, 'entries, sample:', Array.from(costMap.entries()).slice(0, 3))
  
  // Merge costs into accounts
  let matchCount = 0
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
        matchCount++
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
  
  console.log(`Matched costs for ${matchCount} out of ${baseAccounts.length} accounts`)
  
  // Apply cost filtering based on user settings
  return applyAccountFilters(enrichedAccounts, costSettingsStore.$state)
})

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

// Computed property to detect if we're viewing historical data
const isHistoricalTimeframe = computed(() => {
  return ['last7days', 'last30days', 'last90days', 'lastMonth', 'lastQuarter', 'lastYear', 'last12months'].includes(selectedTimeframe.value)
})

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

// Grouping computed properties with search filtering
const lobGroups = computed(() => {
  const groups = new Map<string, { name: string; accounts: Account[]; totalBudget: number; totalSpend: number }>()
  
  accountsWithCosts.value.forEach((account: Account) => {
    const lobName = account.linesOfBusiness || account.lineOfBusiness || 'Unknown LOB'
    
    if (!groups.has(lobName)) {
      groups.set(lobName, {
        name: lobName,
        accounts: [],
        totalBudget: 0,
        totalSpend: 0
      })
    }
    
    const group = groups.get(lobName)!
    group.accounts.push(account)
    group.totalBudget += getBudget(account)
    group.totalSpend += getSpend(account)
  })
  
  let allGroups = Array.from(groups.values()).sort((a, b) => b.totalBudget - a.totalBudget)
  
  // Apply search filtering if we're in global search mode or searching within LOB tab
  if (searchTerm.value && (searchScope.value === 'global' || activeTab.value === 'lob')) {
    const term = searchTerm.value.toLowerCase()
    allGroups = allGroups.filter(group => {
      const groupNameMatches = group.name.toLowerCase().includes(term)
      const hasMatchingAccounts = group.accounts.some(acc => matchesSearchTerm(acc, term))
      return groupNameMatches || hasMatchingAccounts
    }).map(group => {
      // If searching, filter accounts within groups too (unless group name matches)
      if (!group.name.toLowerCase().includes(term)) {
        return {
          ...group,
          accounts: group.accounts.filter(acc => matchesSearchTerm(acc, term))
        }
      }
      return group
    })
  }
  
  return allGroups
})

// Favorite accounts computed property
const favoriteAccounts = computed(() => {
  if (favoriteIds.value.length === 0) return []

  // Filter accounts that are in the favorites list
  let favorites = accountsWithCosts.value.filter((account: Account) => {
    const accountKey = getAccountKey(account)
    return favoriteIds.value.includes(accountKey)
  })

  // Apply search filtering if we're in global search mode or searching within favorites tab
  if (searchTerm.value && (searchScope.value === 'global' || activeTab.value === 'favorites')) {
    const term = searchTerm.value.toLowerCase()
    favorites = favorites.filter(acc => matchesSearchTerm(acc, term))
  }

  return favorites
})

const departmentGroups = computed(() => {
  const groups = new Map<string, { name: string; accounts: Account[]; totalBudget: number; totalSpend: number }>()
  
  accountsWithCosts.value.forEach((account: Account) => {
    const deptName = account.departmentNumber || account.department || 'Unknown Department'
    
    if (!groups.has(deptName)) {
      groups.set(deptName, {
        name: deptName,
        accounts: [],
        totalBudget: 0,
        totalSpend: 0
      })
    }
    
    const group = groups.get(deptName)!
    group.accounts.push(account)
    group.totalBudget += getBudget(account)
    group.totalSpend += getSpend(account)
  })
  
  let allGroups = Array.from(groups.values()).sort((a, b) => b.totalBudget - a.totalBudget)
  
  // Apply search filtering for departments
  if (searchTerm.value && (searchScope.value === 'global' || activeTab.value === 'dept')) {
    const term = searchTerm.value.toLowerCase()
    allGroups = allGroups.filter(group => {
      const groupNameMatches = group.name.toLowerCase().includes(term)
      const hasMatchingAccounts = group.accounts.some(acc => matchesSearchTerm(acc, term))
      return groupNameMatches || hasMatchingAccounts
    }).map(group => {
      if (!group.name.toLowerCase().includes(term)) {
        return {
          ...group,
          accounts: group.accounts.filter(acc => matchesSearchTerm(acc, term))
        }
      }
      return group
    })
  }
  
  return allGroups
})

const smartGroups = computed(() => {
  const groups: Array<{ id: string; name: string; description: string; icon: string; iconColor: string; accounts: Account[]; totalBudget: number; totalSpend: number }> = []

  // Favorites (if any)
  if (favoriteAccounts.value.length > 0) {
    groups.push({
      id: 'favorites',
      name: 'My Favorites',
      description: 'Your starred accounts',
      icon: 'i-heroicons-star-solid',
      iconColor: 'text-yellow-500',
      accounts: favoriteAccounts.value,
      totalBudget: favoriteAccounts.value.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
      totalSpend: favoriteAccounts.value.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
    })
  }

  // High Budget (>$10K/month)
  const highBudgetAccounts = accountsWithCosts.value.filter((acc: Account) => getBudget(acc) > 10000)
  if (highBudgetAccounts.length > 0) {
    groups.push({
      id: 'high-budget',
      name: 'High Budget Accounts',
      description: 'Monthly budget > $10K',
      icon: 'i-heroicons-banknotes',
      iconColor: 'text-blue-400',
      accounts: highBudgetAccounts,
      totalBudget: highBudgetAccounts.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
      totalSpend: highBudgetAccounts.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
    })
  }
  
  // Over Budget
  const overBudgetAccounts = accountsWithCosts.value.filter((acc: Account) => {
    const budget = getBudget(acc)
    const spend = getSpend(acc)
    return budget > 0 && spend > budget
  })
  if (overBudgetAccounts.length > 0) {
    groups.push({
      id: 'over-budget',
      name: 'Over Budget',
      description: 'Spending exceeds budget',
      icon: 'i-heroicons-exclamation-triangle',
      iconColor: 'text-red-400',
      accounts: overBudgetAccounts,
      totalBudget: overBudgetAccounts.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
      totalSpend: overBudgetAccounts.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
    })
  }
  
  // Under Budget Severely (< 50% utilization)
  const underBudgetAccounts = accountsWithCosts.value.filter((acc: Account) => {
    const budget = getBudget(acc)
    const spend = getSpend(acc)
    return budget > 0 && spend < (budget * 0.5)
  })
  if (underBudgetAccounts.length > 0) {
    groups.push({
      id: 'under-budget',
      name: 'Severely Under Budget',
      description: 'Less than 50% budget used',
      icon: 'i-heroicons-arrow-trending-down',
      iconColor: 'text-yellow-400',
      accounts: underBudgetAccounts,
      totalBudget: underBudgetAccounts.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
      totalSpend: underBudgetAccounts.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
    })
  }
  
  // Similar Names (group accounts with similar project names)
  const nameGroups = new Map<string, Account[]>()
  const keywordGroups = new Map<string, Account[]>()
  
  accountsWithCosts.value.forEach((account: Account) => {
    const name = account.projectName || account.accountName || ''
    if (name && name.length > 2) {
      
      // Method 1: Extract common keywords/prefixes (like "SDA", "AWS", etc.)
      const keywords = name.match(/^([A-Z]{2,4})|([A-Z]{2,4}[-_\s])|(\b[A-Z]{2,4}\b)/g)
      if (keywords) {
        keywords.forEach((keyword: string) => {
          const cleanKeyword = keyword.replace(/[-_\s]/g, '').toUpperCase()
          if (cleanKeyword.length >= 2) {
            if (!keywordGroups.has(cleanKeyword)) {
              keywordGroups.set(cleanKeyword, [])
            }
            keywordGroups.get(cleanKeyword)!.push(account)
          }
        })
      }
      
      // Method 2: Base name extraction (improved)
      const baseName = name
        .replace(/[-_]\d+$/g, '')                    // Remove trailing numbers
        .replace(/\s*\d+$/g, '')                     // Remove trailing numbers with spaces
        .replace(/(dev|test|prod|staging|demo)$/i, '') // Remove environment suffixes
        .replace(/[-_]+(dev|test|prod|staging|demo)$/i, '') // Remove environment suffixes with separators
        .replace(/\s*[-_]+\s*$/g, '')                // Remove trailing separators
        .trim()
      
      // Group by exact base name match
      if (baseName.length > 2) {
        if (!nameGroups.has(baseName)) {
          nameGroups.set(baseName, [])
        }
        nameGroups.get(baseName)!.push(account)
      }
    }
  })
  
  // Process keyword groups (like "SDA")
  keywordGroups.forEach((accounts: Account[], keyword: string) => {
    if (accounts.length >= 2) {
      groups.push({
        id: `keyword-${keyword.toLowerCase()}`,
        name: `${keyword} Accounts`,
        description: `${accounts.length} accounts containing "${keyword}"`,
        icon: 'i-heroicons-tag',
        iconColor: 'text-purple-400',
        accounts,
        totalBudget: accounts.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
        totalSpend: accounts.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
      })
    }
  })
  
  // Process base name groups
  nameGroups.forEach((accounts: Account[], baseName: string) => {
    // Skip if this group is already covered by keyword grouping
    const hasKeywordGroup = Array.from(keywordGroups.keys()).some((keyword: string) => 
      baseName.toUpperCase().includes(keyword) && (keywordGroups.get(keyword)!.length >= 2)
    )
    
    if (accounts.length >= 2 && !hasKeywordGroup) {
      groups.push({
        id: `similar-${baseName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: `Similar: ${baseName}`,
        description: `${accounts.length} accounts with similar base names`,
        icon: 'i-heroicons-document-duplicate',
        iconColor: 'text-indigo-400',
        accounts,
        totalBudget: accounts.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
        totalSpend: accounts.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
      })
    }
  })
  
  // Apply search filtering for smart groups
  if (searchTerm.value && (searchScope.value === 'global' || activeTab.value === 'smart')) {
    const term = searchTerm.value.toLowerCase()
    return groups.filter(group => {
      const nameMatches = group.name.toLowerCase().includes(term)
      const descMatches = group.description.toLowerCase().includes(term)
      const hasMatchingAccounts = group.accounts.some(acc => matchesSearchTerm(acc, term))
      return nameMatches || descMatches || hasMatchingAccounts
    }).map(group => {
      // If group name/description doesn't match, filter accounts
      if (!group.name.toLowerCase().includes(term) && !group.description.toLowerCase().includes(term)) {
        return {
          ...group,
          accounts: group.accounts.filter(acc => matchesSearchTerm(acc, term))
        }
      }
      return group
    })
  }
  
  return groups
})

// Helper functions to extract budget and spend from account objects
const getBudget = (account: Account) => {
  const budget = account.estimatedMonthlyCharge || account.budget || account.estimatedBudget || '0'
  return parseFloat(budget.toString().replace(/[^0-9.-]/g, '') || '0')
}

const getSpend = (account: Account) => {
  return account.currentSpend || account.totalSpend || account.spend || 0
}

// Search helper functions
const matchesSearchTerm = (account: Account, term: string): boolean => {
  const nameMatch = (account.accountName ?? '').toLowerCase().includes(term)
  const projectMatch = (account.projectName ?? '').toLowerCase().includes(term)
  const idMatch = (account.accountId ?? '').toLowerCase().includes(term)
  const stdIdMatch = (account.awsStandardAccountID ?? '').toLowerCase().includes(term)
  const lobMatch = (account.linesOfBusiness ?? '').toLowerCase().includes(term)
  const deptMatch = (account.departmentNumber ?? '').toLowerCase().includes(term)
  return nameMatch || projectMatch || idMatch || stdIdMatch || lobMatch || deptMatch
}

const getTabLabel = (tabId: string): string => {
  const tab = tabs.find(t => t.id === tabId)
  return tab?.label || 'Tab'
}

// Methods - Use dynamic formatting based on settings
const formatCurrency = (value: number) => {
  return formatCurrencyWithSettings(value, costSettingsStore.currencyFormat)
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

// Helper functions for utilization colors
const getUtilizationColor = (account: any) => {
  const budget = getBudget(account)
  const spend = getSpend(account)
  if (budget === 0) return 'text-gray-400'
  
  const utilization = (spend / budget) * 100
  if (utilization > 100) return 'text-red-400'
  if (utilization > 90) return 'text-yellow-400'
  return 'text-green-400'
}

// Group interaction methods
const toggleLOB = (lob: any) => {
  const groupKey = 'lob-' + lob.name
  if (expandedGroups.value.has(groupKey)) {
    expandedGroups.value.delete(groupKey)
  } else {
    expandedGroups.value.add(groupKey)
  }
}

const toggleDepartment = (dept: any) => {
  const groupKey = 'dept-' + dept.name
  if (expandedGroups.value.has(groupKey)) {
    expandedGroups.value.delete(groupKey)
  } else {
    expandedGroups.value.add(groupKey)
  }
}

const toggleSmartGroup = (group: any) => {
  const groupKey = 'smart-' + group.id
  if (expandedGroups.value.has(groupKey)) {
    expandedGroups.value.delete(groupKey)
  } else {
    expandedGroups.value.add(groupKey)
  }
}

// Group selection methods (clear existing selections and select group)
const selectLOBGroup = (lob: any) => {
  selectedAccounts.value = lob.accounts.map((acc: Account) => getAccountKey(acc))
}

const selectDepartmentGroup = (dept: any) => {
  selectedAccounts.value = dept.accounts.map((acc: Account) => getAccountKey(acc))
}

const selectSmartGroup = (group: any) => {
  selectedAccounts.value = group.accounts.map((acc: Account) => getAccountKey(acc))
}

// Handle shared state from URL parameters
const applySharedStateFromUrl = () => {
  const route = useRoute()

  // Check for share parameters in URL
  if (route.query.accounts) {
    try {
      const accounts = JSON.parse(route.query.accounts as string)
      if (Array.isArray(accounts)) {
        selectedAccounts.value = accounts
      }
    } catch (err) {
      console.warn('Invalid accounts parameter in URL:', err)
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
    // Reload preferences to get fresh data (in case admin reset it)
    await loadPreferences(true)
    
    // Apply any shared state from URL first
    applySharedStateFromUrl()
    
    // Then refresh data with the applied state
    await refreshData()

    // Auto-start tour only for first-time users, forced starts, or admin resets
    const tourPref = getPreference<any>('costTour', {}) || {}
    const forceStart = useRoute().query.tour === '1'
    const wasReset = tourPref?.resetByAdminAt && tourPref?.resetByAdminAt !== lastResetTimestamp.value

    // Only auto-start if:
    // 1. Force start from URL (?tour=1)
    // 2. Admin reset the tour
    // 3. User has NEVER started the tour before (no startedAt and no completed)
    const neverStarted = !tourPref?.startedAt && !tourPref?.completed
    const shouldAutoStart = (forceStart || wasReset || neverStarted) && !tourStartedThisSession.value

    if (shouldAutoStart) {
      // Wait for DOM elements to be ready
      await nextTick()
      // Check if tour elements exist before starting
      const checkElements = () => {
        const header = document.querySelector('[data-tour="costs-header"]')
        return header !== null
      }

      // Try multiple times with increasing delays
      let attempts = 0
      const tryStart = () => {
        if (checkElements()) {
          handleStartTour()
        } else if (attempts < 5) {
          attempts++
          setTimeout(tryStart, 300)
        }
      }
      setTimeout(tryStart, 500)
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
const { mode: dataMode, isFetching: isCostFetching, isPending: isCostPending, fetchError: costError, dataset, fetchCosts } = useCostData({
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

// Load toggle state from localStorage on mount
onMounted(() => {
  if (import.meta.client) {
    const saved = localStorage.getItem('showAdvancedCharts')
    if (saved !== null) {
      showAdvancedCharts.value = saved === 'true'
    }
  }
})

// 3. useChartRegistry: Contains all chart definitions and selects appropriate charts
//    - Each chart has an extractor function that transforms dataset into chart data
//    - Charts are selected based on the current scenario
//    - Historical timeframes exclude budget-dependent charts
//    - showAdvanced toggle includes power-user charts when enabled
const { charts } = useChartRegistry({ scenario, timeframe: selectedTimeframe, mode: dataMode, showAdvanced: showAdvancedCharts })

// Key helper to avoid undefined issues
const getAccountKey = (account: Account): string => {
  return account.accountId || account.awsStandardAccountID || ''
}

// Handle tab changes
const handleTabChange = (tabId: string) => {
  console.log('Tab changed to:', tabId)
  // Can add analytics or additional logic here if needed
}

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
  background: #374151;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #6b7280;
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>