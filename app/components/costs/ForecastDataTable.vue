<template>
  <div class="space-y-4">
    <!-- Quick Search Bar -->
    <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-3">
        <div class="flex-1">
          <UInput
            v-model="quickSearch"
            placeholder="Quick search by account name, ID, LOB, or project type..."
            size="sm"
            icon="i-heroicons-magnifying-glass"
            :ui="{ icon: { trailing: { pointer: '' } } }"
          />
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span>{{ filteredData.length }} results</span>
          <span v-if="quickSearch" class="text-blue-400">
            (filtered)
          </span>
        </div>
      </div>
    </div>
    
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Forecast Data</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ forecastData.length }} accounts • Total: {{ formatCurrencyIntl(grandTotal) }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <!-- View Mode Toggle -->
        <UButtonGroup size="xs">
          <UButton
            variant="ghost"
            :color="viewMode === 'detailed' ? 'primary' : 'gray'"
            @click="viewMode = 'detailed'"
          >
            Detailed
          </UButton>
          <UButton
            variant="ghost"
            :color="viewMode === 'grouped' ? 'primary' : 'gray'"
            @click="viewMode = 'grouped'"
          >
            Grouped
          </UButton>
        </UButtonGroup>
        
        <!-- Group By Selector -->
        <USelectMenu
          v-model="selectedGroupBy"
          :options="groupByOptions"
          size="xs"
          class="w-40"
        />
        
        <!-- Expand/Collapse All for Grouped View -->
        <div v-if="viewMode === 'grouped' && groupBy" class="flex gap-1">
          <UButton
            size="xs"
            variant="ghost"
            color="gray"
            icon="i-heroicons-chevron-down"
            @click="expandAllGroups"
            title="Expand all groups"
          />
          <UButton
            size="xs"
            variant="ghost"
            color="gray"
            icon="i-heroicons-chevron-right"
            @click="collapseAllGroups"
            title="Collapse all groups"
          />
        </div>
        
        <UButton
          size="xs"
          variant="ghost"
          color="gray"
          icon="i-heroicons-funnel"
          @click="showFilterPanel = !showFilterPanel"
        >
          Filters
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          color="blue"
          icon="i-heroicons-arrow-path"
          @click="refreshData"
          :loading="isLoading"
        >
          Refresh
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          color="orange"
          icon="i-heroicons-arrow-path"
          @click="showClearDialog = true"
          :disabled="forecastData.length === 0"
        >
          Clear All
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          color="green"
          icon="i-heroicons-arrow-down-tray"
          @click="exportData"
          :disabled="filteredData.length === 0"
        >
          Export
        </UButton>
      </div>
    </div>

    <!-- Filter Panel -->
    <div v-if="showFilterPanel" class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Account</label>
          <UInput 
            v-model="filters.accountName" 
            size="sm" 
            placeholder="Name or ID"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Enclave</label>
          <UInput 
            v-model="filters.enclaveId" 
            size="sm" 
            placeholder="Enclave ID"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Project Type</label>
          <UInput 
            v-model="filters.projectType" 
            size="sm" 
            placeholder="Project type"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">LOB</label>
          <UInput 
            v-model="filters.lob" 
            size="sm" 
            placeholder="Line of business"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Min Amount</label>
          <UInput 
            v-model.number="filters.minAmount" 
            type="number"
            size="sm" 
            placeholder="0"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Max Amount</label>
          <UInput 
            v-model.number="filters.maxAmount" 
            type="number"
            size="sm" 
            placeholder="999999"
          />
        </div>
      </div>
      <div class="flex justify-between items-center mt-4">
        <p class="text-xs text-gray-600 dark:text-gray-400">
          Showing {{ filteredData.length }} of {{ forecastData.length }} accounts
        </p>
        <UButton 
          size="xs" 
          variant="ghost" 
          @click="clearFilters"
        >
          Clear Filters
        </UButton>
      </div>
    </div>

    <!-- Spreadsheet-style Table -->
    <div ref="tableContainer" class="bg-white dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <!-- Drag Instruction -->
      <div v-if="filteredData.length > 0" class="bg-gray-50 dark:bg-gray-800/50 px-3 py-1 text-xs text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
        <UIcon name="i-heroicons-cursor-arrow-rays" class="w-3 h-3 inline mr-1" />
        Hold <kbd class="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Shift</kbd> or <kbd class="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Alt</kbd> and drag to scroll • Middle-click and drag also works
      </div>
      <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-300px)]">
        <table class="w-full text-sm">
          <thead class="bg-white dark:bg-gray-800 sticky top-0 z-20">
            <!-- Column Headers -->
            <tr class="border-b border-gray-200 dark:border-gray-700">
              <!-- Fixed columns -->
              <th 
                class="sticky left-0 top-0 bg-white dark:bg-gray-800 px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 z-30"
                @click="handleSort('enclaveId')"
              >
                <div class="flex items-center gap-1">
                  Enclave
                  <UIcon v-if="sortColumn === 'enclaveId'" :name="sortDirection === 'asc' ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3 h-3" />
                </div>
              </th>
              <th 
                class="sticky left-16 top-0 bg-white dark:bg-gray-800 px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider min-w-[200px] border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 z-30"
                @click="handleSort('accountName')"
              >
                <div class="flex items-center gap-1">
                  Account Name
                  <UIcon v-if="sortColumn === 'accountName'" :name="sortDirection === 'asc' ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3 h-3" />
                </div>
              </th>
              <th 
                class="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider min-w-[150px] cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                @click="handleSort('projectType')"
              >
                <div class="flex items-center gap-1">
                  Project Type
                  <UIcon v-if="sortColumn === 'projectType'" :name="sortDirection === 'asc' ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3 h-3" />
                </div>
              </th>
              <th 
                class="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                @click="handleSort('lob')"
              >
                <div class="flex items-center gap-1">
                  LOB
                  <UIcon v-if="sortColumn === 'lob'" :name="sortDirection === 'asc' ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3 h-3" />
                </div>
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Dept #
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Proj #
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                Task #
              </th>
              
              <!-- Dynamic month columns -->
              <th 
                v-for="month in monthColumns" 
                :key="month"
                class="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider min-w-[100px] border-r border-gray-200 dark:border-gray-600"
              >
                {{ formatMonth(month) }}
              </th>
              
              <!-- Row Total -->
              <th 
                class="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider min-w-[120px] bg-gray-50 dark:bg-gray-750 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                @click="handleSort('totalAmount')"
              >
                <div class="flex items-center justify-end gap-1">
                  Total
                  <UIcon v-if="sortColumn === 'totalAmount'" :name="sortDirection === 'asc' ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3 h-3" />
                </div>
              </th>
            </tr>

            <!-- Monthly Totals Row -->
            <tr class="bg-gray-50 dark:bg-gray-850 border-b border-gray-200 dark:border-gray-700 sticky top-[40px] z-10">
              <td colspan="7" class="sticky left-0 bg-gray-50 dark:bg-gray-850 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 z-30">
                Monthly Totals
              </td>
              <td 
                v-for="month in monthColumns" 
                :key="`total-${month}`"
                class="px-3 py-2 text-right text-xs font-semibold text-blue-600 dark:text-blue-400 border-r border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-850"
              >
                {{ formatCurrency(monthlyTotals[month] || 0, { compact: true, uppercase: true }) }}
              </td>
              <td class="px-3 py-2 text-right text-xs font-semibold text-green-600 dark:text-green-400 bg-gray-50 dark:bg-gray-850">
                {{ formatCurrency(grandTotal, { compact: true, uppercase: true }) }}
              </td>
            </tr>
          </thead>
          
          <tbody v-if="viewMode === 'detailed'" class="divide-y divide-gray-200 dark:divide-gray-700">
            <template v-for="item in paginatedData" :key="item.id">
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <!-- Fixed columns -->
              <td class="sticky left-0 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700">
                {{ item.enclaveId || '-' }}
              </td>
              <td class="sticky left-16 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-gray-200 min-w-[200px] border-r border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <NuxtLink 
                      :to="`/account/${item.comAccountId || item.accountId}`"
                      class="font-medium text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      {{ item.accountName || 'Unknown' }}
                    </NuxtLink>
                    <div class="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <UTooltip :text="getAccountStatusTooltip(item.enclaveStatus)">
                        <UIcon
                          :name="getAccountStatusIcon(item.enclaveStatus)" 
                          :class="getAccountStatusClass(item.enclaveStatus)"
                          class="w-3 h-3"
                        />
                      </UTooltip>
                      <span>{{ item.accountId }}</span>
                    </div>
                  </div>
                  <UButton
                    size="xs"
                    variant="ghost"
                    :icon="expandedRows.has(item.id) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                    @click="toggleRowExpansion(item.id)"
                    class="ml-2"
                  />
                </div>
              </td>
              <td class="px-3 py-2 text-xs text-gray-900 dark:text-gray-200">
                {{ item.projectType || '-' }}
              </td>
              <td class="px-3 py-2 text-xs text-gray-900 dark:text-gray-200">
                {{ item.lob || '-' }}
              </td>
              <td class="px-3 py-2 text-xs text-gray-900 dark:text-gray-200">
                {{ item.deptNumber || '-' }}
              </td>
              <td class="px-3 py-2 text-xs text-gray-900 dark:text-gray-200">
                {{ item.projNumber || '-' }}
              </td>
              <td class="px-3 py-2 text-xs text-gray-900 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700">
                {{ item.taskNumber || '-' }}
              </td>
              
              <!-- Dynamic month values -->
              <td 
                v-for="month in monthColumns" 
                :key="`${item.id}-${month}`"
                class="px-3 py-2 text-right text-xs border-r border-gray-200 dark:border-gray-600"
                :class="getAmountClass(item.forecasts?.[month])"
              >
                {{ formatAmount(item.forecasts?.[month]) }}
              </td>
              
              <!-- Row Total -->
              <td class="px-3 py-2 text-right text-xs font-medium text-green-600 dark:text-green-400 bg-gray-50 dark:bg-gray-800/30">
                {{ formatCurrency(item.totalAmount || 0, { compact: true, uppercase: true }) }}
              </td>
              </tr>
              
              <!-- Expanded Row Details -->
              <tr v-if="expandedRows.has(item.id)" class="border-0">
                <td :colspan="7 + monthColumns.length + 1" class="bg-gray-50 dark:bg-gray-800/50 p-4">
                <div class="space-y-4">
                  <!-- Mini Chart -->
                  <div class="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Monthly Forecast Trend</h4>
                    <client-only>
                      <VChart 
                        :option="getChartOption(item)" 
                        :style="{ height: '200px' }"
                        autoresize
                      />
                    </client-only>
                  </div>
                  
                  <!-- Account Details Grid -->
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span class="text-xs text-gray-600 dark:text-gray-400">Total Forecast</span>
                      <div class="text-lg font-semibold text-green-600 dark:text-green-400">
                        {{ formatCurrencyIntl(item.totalAmount || 0) }}
                      </div>
                    </div>
                    <div>
                      <span class="text-xs text-gray-600 dark:text-gray-400">Average Monthly</span>
                      <div class="text-lg font-semibold text-blue-400">
                        {{ formatCurrencyIntl((item.totalAmount || 0) / monthColumns.length) }}
                      </div>
                    </div>
                    <div>
                      <span class="text-xs text-gray-600 dark:text-gray-400">Peak Month</span>
                      <div class="text-lg font-semibold text-orange-400">
                        {{ getPeakMonth(item) }}
                      </div>
                    </div>
                    <div>
                      <span class="text-xs text-gray-600 dark:text-gray-400">Non-Zero Months</span>
                      <div class="text-lg font-semibold text-purple-400">
                        {{ getNonZeroMonths(item) }} / {{ monthColumns.length }}
                      </div>
                    </div>
                  </div>
                  
                  <!-- Quick Actions -->
                  <div class="flex gap-2">
                    <NuxtLink 
                      :to="`/account/${item.comAccountId || item.accountId}`"
                      class="inline-flex"
                    >
                      <UButton size="xs" color="blue" variant="soft">
                        View Account Details
                      </UButton>
                    </NuxtLink>
                    <UButton size="xs" variant="soft" @click="exportSingleAccount(item)">
                      Export This Account
                    </UButton>
                    <UButton size="xs" variant="soft" color="gray" @click="toggleRowExpansion(item.id)">
                      Close Details
                    </UButton>
                  </div>
                </div>
                </td>
              </tr>
            </template>
          </tbody>
          
          <!-- Grouped View -->
          <tbody v-if="viewMode === 'grouped' && groupedData" class="divide-y divide-gray-200 dark:divide-gray-700">
            <template v-for="group in groupedData" :key="group.groupName">
              <!-- Group Header Row -->
              <tr class="bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors">
                <td colspan="7" class="px-3 py-2">
                  <button
                    @click="toggleGroup(group.groupName)"
                    class="flex items-center gap-2 w-full text-left"
                  >
                    <UIcon
                      :name="group.expanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'" 
                      class="w-4 h-4"
                    />
                    <span class="font-medium text-sm text-gray-900 dark:text-white">{{ group.groupName }}</span>
                    <span class="text-xs text-gray-600 dark:text-gray-400 ml-2">({{ group.itemCount }} accounts)</span>
                  </button>
                </td>
                
                <!-- Group Monthly Totals -->
                <td 
                  v-for="month in monthColumns" 
                  :key="`group-${group.groupName}-${month}`"
                  class="px-3 py-2 text-right text-xs font-medium border-r border-gray-200 dark:border-gray-600"
                  :class="getAmountClass(group.monthlyTotals[month])"
                >
                  {{ formatAmount(group.monthlyTotals[month]) }}
                </td>
                
                <!-- Group Total -->
                <td class="px-3 py-2 text-right text-xs font-bold text-green-600 dark:text-green-400 bg-gray-50 dark:bg-gray-800/50">
                  {{ formatCurrency(group.totalAmount, { compact: true, uppercase: true }) }}
                </td>
              </tr>
              
              <!-- Expanded Group Items -->
              <template v-if="group.expanded">
                <tr
                  v-for="item in group.items"
                  :key="`${group.groupName}-${item.id}`"
                  class="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <!-- Fixed columns -->
                  <td class="sticky left-0 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 pl-8 border-r border-gray-200 dark:border-gray-700">
                    {{ item.enclaveId || '-' }}
                  </td>
                  <td class="sticky left-16 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 min-w-[200px] border-r border-gray-200 dark:border-gray-700">
                    <div>{{ item.accountName || 'Unknown' }}</div>
                    <div class="flex items-center gap-1.5 text-gray-500">
                      <UTooltip :text="getAccountStatusTooltip(item.enclaveStatus)">
                        <UIcon
                          :name="getAccountStatusIcon(item.enclaveStatus)" 
                          :class="getAccountStatusClass(item.enclaveStatus)"
                          class="w-3 h-3"
                        />
                      </UTooltip>
                      <span>{{ item.accountId }}</span>
                    </div>
                  </td>
                  <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {{ item.projectType || '-' }}
                  </td>
                  <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {{ item.lob || '-' }}
                  </td>
                  <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {{ item.deptNumber || '-' }}
                  </td>
                  <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {{ item.projNumber || '-' }}
                  </td>
                  <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                    {{ item.taskNumber || '-' }}
                  </td>
                  
                  <!-- Dynamic month values -->
                  <td 
                    v-for="month in monthColumns" 
                    :key="`${group.groupName}-${item.id}-${month}`"
                    class="px-3 py-2 text-right text-xs border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-400"
                  >
                    {{ formatAmount(item.forecasts?.[month]) }}
                  </td>
                  
                  <!-- Row Total -->
                  <td class="px-3 py-2 text-right text-xs text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/20">
                    {{ formatCurrency(item.totalAmount || 0, { compact: true, uppercase: true }) }}
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div v-if="filteredData.length === 0" class="p-8 text-center">
        <UIcon name="i-heroicons-document-text" class="w-12 h-12 text-gray-500 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-300 mb-2">No forecast data found</h3>
        <p class="text-gray-600 dark:text-gray-400">Upload an Excel file to get started</p>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="filteredData.length > 0" class="flex items-center justify-between">
      <div class="text-sm text-gray-600 dark:text-gray-400">
        Showing {{ paginatedData.length }} of {{ filteredData.length }} accounts
      </div>
      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          variant="ghost"
          :disabled="currentPage === 1"
          @click="currentPage = 1"
        >
          First
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          Previous
        </UButton>
        <span class="text-sm text-gray-600 dark:text-gray-400">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
        <UButton
          size="xs"
          variant="ghost"
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        >
          Next
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          :disabled="currentPage === totalPages"
          @click="currentPage = totalPages"
        >
          Last
        </UButton>
      </div>
    </div>

    <!-- Clear Confirmation Dialog -->
    <UModal v-model="showClearDialog">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Clear All Forecast Data</h3>
        </template>
        <p class="text-gray-700 dark:text-gray-300">
          Are you sure you want to clear all forecast data? This action cannot be undone.
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showClearDialog = false">
              Cancel
            </UButton>
            <UButton color="red" @click="clearAllData">
              Clear All
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useForecastData } from '~/composables/useForecastData'

const logger = createLogger('ForecastDataTable')

// Get forecast data composable
const { 
  forecastData, 
  isLoading, 
  error, 
  fetchForecastData
} = useForecastData()

// State
const currentPage = ref(1)
const itemsPerPage = 100 // Increased from 50
const showClearDialog = ref(false)
const sortColumn = ref<string>('accountName')
const sortDirection = ref<'asc' | 'desc'>('asc')
const filters = ref({
  accountName: '',
  enclaveId: '',
  projectType: '',
  lob: '',
  minAmount: undefined as number | undefined,
  maxAmount: undefined as number | undefined
})
const showFilterPanel = ref(false)
const quickSearch = ref('')
const groupBy = ref<string>('') // Group by field
const expandedGroups = ref<Set<string>>(new Set()) // Track expanded groups
const expandedRows = ref<Set<string>>(new Set()) // Track expanded detail rows
const viewMode = ref<'detailed' | 'grouped'>('detailed') // View mode

// Group by options
const groupByOptions = [
  { label: 'No Grouping', value: '' },
  { label: 'LOB', value: 'lob' },
  { label: 'Project Type', value: 'projectType' },
  { label: 'Enclave', value: 'enclaveId' },
  { label: 'Department', value: 'deptNumber' }
]

// Selected group by option (for USelectMenu)
const selectedGroupBy = computed({
  get: () => groupByOptions.find(opt => opt.value === groupBy.value) || groupByOptions[0],
  set: (option) => {
    groupBy.value = typeof option === 'object' ? String((option as any).value ?? '') : String(option ?? '')
  }
})

// Drag scrolling state
const tableContainer = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const startX = ref(0)
const startY = ref(0)
const scrollLeft = ref(0)
const scrollTop = ref(0)
const dragThreshold = 5 // pixels of movement before drag starts
const hasDraggedBeyondThreshold = ref(false)

// Get all unique months from the data
const monthColumns = computed(() => {
  const months = new Set<string>()
  forecastData.value.forEach(item => {
    if (item.forecasts) {
      Object.keys(item.forecasts).forEach(month => {
        // Skip total columns and empty values
        if (!month.toLowerCase().includes('total') && month.trim() !== '') {
          months.add(month)
        }
      })
    }
  })
  
  return Array.from(months).sort()
})

// Calculate monthly totals
const monthlyTotals = computed(() => {
  const totals: Record<string, number> = {}
  monthColumns.value.forEach(month => {
    totals[month] = forecastData.value.reduce((sum, item) => {
      return sum + (item.forecasts?.[month] || 0)
    }, 0)
  })
  return totals
})

// Calculate grand total
const grandTotal = computed(() => {
  return Object.values(monthlyTotals.value).reduce((sum, val) => sum + val, 0)
})

// Group data by selected field
const groupedData = computed(() => {
  if (!groupBy.value || viewMode.value === 'detailed') {
    return null
  }
  
  const groups = new Map<string, any[]>()
  
  filteredData.value.forEach(item => {
    const key = String(item[groupBy.value as keyof typeof item] || 'Unknown')
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(item)
  })
  
  // Calculate aggregations for each group
  const result = Array.from(groups.entries()).map(([groupName, items]) => {
    const monthlyTotals: Record<string, number> = {}
    
    // Sum up all monthly forecasts for this group
    monthColumns.value.forEach(month => {
      monthlyTotals[month] = items.reduce((sum, item) => {
        return sum + (item.forecasts?.[month] || 0)
      }, 0)
    })
    
    // Calculate total for the group
    const totalAmount = items.reduce((sum, item) => sum + (item.totalAmount || 0), 0)
    
    return {
      groupName,
      items,
      itemCount: items.length,
      monthlyTotals,
      totalAmount,
      expanded: expandedGroups.value.has(groupName)
    }
  })
  
  // Sort groups by total amount descending
  result.sort((a, b) => b.totalAmount - a.totalAmount)
  
  return result
})

// Filtered and sorted data
const filteredData = computed(() => {
  let data = [...forecastData.value]
  
  // Apply quick search first
  if (quickSearch.value) {
    const searchTerm = quickSearch.value.toLowerCase()
    data = data.filter(item => 
      item.accountName?.toLowerCase().includes(searchTerm) ||
      item.accountId?.toLowerCase().includes(searchTerm) ||
      item.lob?.toLowerCase().includes(searchTerm) ||
      item.projectType?.toLowerCase().includes(searchTerm) ||
      item.enclaveId?.toLowerCase().includes(searchTerm) ||
      item.deptNumber?.toLowerCase().includes(searchTerm)
    )
  }
  
  // Apply filters
  if (filters.value.accountName) {
    const searchTerm = filters.value.accountName.toLowerCase()
    data = data.filter(item => 
      item.accountName?.toLowerCase().includes(searchTerm) ||
      item.accountId?.toLowerCase().includes(searchTerm)
    )
  }
  
  if (filters.value.enclaveId) {
    const searchTerm = filters.value.enclaveId.toLowerCase()
    data = data.filter(item => 
      String(item.enclaveId || '').toLowerCase().includes(searchTerm)
    )
  }
  
  if (filters.value.projectType) {
    const searchTerm = filters.value.projectType.toLowerCase()
    data = data.filter(item => 
      item.projectType?.toLowerCase().includes(searchTerm)
    )
  }
  
  if (filters.value.lob) {
    const searchTerm = filters.value.lob.toLowerCase()
    data = data.filter(item => 
      item.lob?.toLowerCase().includes(searchTerm)
    )
  }
  
  if (filters.value.minAmount !== null) {
    data = data.filter(item => 
      (item.totalAmount || 0) >= filters.value.minAmount!
    )
  }
  
  if (filters.value.maxAmount !== null) {
    data = data.filter(item => 
      (item.totalAmount || 0) <= filters.value.maxAmount!
    )
  }
  
  // Apply sorting
  data.sort((a, b) => {
    let aVal: any = a[sortColumn.value as keyof typeof a]
    let bVal: any = b[sortColumn.value as keyof typeof b]
    
    // Handle null/undefined values
    if (aVal === null || aVal === undefined) aVal = ''
    if (bVal === null || bVal === undefined) bVal = ''
    
    // Numeric comparison for numbers
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection.value === 'asc' ? aVal - bVal : bVal - aVal
    }
    
    // String comparison
    aVal = String(aVal).toLowerCase()
    bVal = String(bVal).toLowerCase()
    
    if (sortDirection.value === 'asc') {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
    }
  })
  
  return data
})

// Paginated data
const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return filteredData.value.slice(start, end)
})

const totalPages = computed(() => Math.ceil(filteredData.value.length / itemsPerPage))

// Format month for display
const formatMonth = (month: string) => {
  if (!month) return '-'
  const [year, monthNum] = month.split('-')
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthIndex = parseInt(monthNum || '', 10) - 1
  const monthLabel = monthNames[monthIndex] || month
  return `${monthLabel} ${year || ''}`.trim()
}

// Format currency for non-compact display (e.g. $1,234)
const formatCurrencyIntl = (value: number) => {
  if (!value) return '$0'
  return formatCurrency(value, 0)
}

// Format amount for cells (compact: $1.23K)
const formatAmount = (value: number | undefined) => {
  if (!value || value === 0) return '-'
  return formatCurrency(value, { compact: true, uppercase: true })
}

// Get class for amount cells
const getAmountClass = (value: number | undefined) => {
  if (!value || value === 0) return 'text-gray-500'
  if (value > 10000) return 'text-green-400'
  if (value > 5000) return 'text-blue-400'
  return 'text-gray-200'
}

// Sorting handler
const handleSort = (column: string) => {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

// Clear filters
const clearFilters = () => {
  filters.value = {
    accountName: '',
    enclaveId: '',
    projectType: '',
    lob: '',
    minAmount: undefined,
    maxAmount: undefined
  }
  updateURL()
}

// Toggle group expansion
const toggleGroup = (groupName: string) => {
  if (expandedGroups.value.has(groupName)) {
    expandedGroups.value.delete(groupName)
  } else {
    expandedGroups.value.add(groupName)
  }
}

// Toggle row expansion for details
const toggleRowExpansion = async (rowId: string) => {
  if (expandedRows.value.has(rowId)) {
    expandedRows.value.delete(rowId)
  } else {
    expandedRows.value.add(rowId)
  }
}

// Get ECharts option for an item
const getChartOption = (item: any) => {
  if (!item || !item.forecasts) return {}
  
  const xAxisData = monthColumns.value.map(m => formatMonth(m))
  const seriesData = monthColumns.value.map(m => item.forecasts[m] || 0)
  
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const data = params[0]
        return `${data.name}<br/>Forecast: ${formatCurrencyIntl(data.value)}`
      },
      backgroundColor: 'rgba(17, 24, 39, 0.9)',
      borderColor: 'rgba(156, 163, 175, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#F3F4F6'
      }
    },
    grid: {
      left: '10',
      right: '10',
      bottom: '10',
      top: '10',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLine: {
        lineStyle: {
          color: 'rgba(156, 163, 175, 0.2)'
        }
      },
      axisLabel: {
        color: '#9CA3AF',
        fontSize: 10,
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(156, 163, 175, 0.1)'
        }
      },
      axisLabel: {
        color: '#9CA3AF',
        fontSize: 10,
        formatter: (value: number) => formatCurrency(value, { compact: true, uppercase: true })
      }
    },
    series: [{
      type: 'line',
      data: seriesData,
      smooth: true,
      symbolSize: 6,
      lineStyle: {
        width: 2,
        color: '#3B82F6'
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
          ]
        }
      },
      itemStyle: {
        color: '#3B82F6'
      }
    }]
  }
}

// Get peak month for an account
const getPeakMonth = (item: any) => {
  if (!item.forecasts) return 'N/A'
  
  let maxAmount = 0
  let maxMonth = ''
  
  Object.entries(item.forecasts).forEach(([month, amount]) => {
    if ((amount as number) > maxAmount) {
      maxAmount = amount as number
      maxMonth = month
    }
  })
  
  return maxMonth ? `${formatMonth(maxMonth)} (${formatCurrency(maxAmount, { compact: true, uppercase: true })})` : 'N/A'
}

// Get number of non-zero months
const getNonZeroMonths = (item: any) => {
  if (!item.forecasts) return 0
  return Object.values(item.forecasts).filter(v => (v as number) > 0).length
}

// Export single account data
const exportSingleAccount = (item: any) => {
  const headers = ['Month', 'Forecast Amount']
  const rows = monthColumns.value.map(month => [
    formatMonth(month),
    item.forecasts?.[month] || 0
  ])
  
  const csv = [
    `Account: ${item.accountName} (${item.accountId})`,
    '',
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', `forecast-${item.accountId}-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Expand all groups
const expandAllGroups = () => {
  if (groupedData.value) {
    groupedData.value.forEach(group => {
      expandedGroups.value.add(group.groupName)
    })
  }
}

// Collapse all groups
const collapseAllGroups = () => {
  expandedGroups.value.clear()
}

// URL State Management
const route = useRoute()
const router = useRouter()

// Load state from URL on mount
const loadFromURL = () => {
  const query = route.query
  
  if (query.groupBy) groupBy.value = query.groupBy as string
  if (query.viewMode) viewMode.value = query.viewMode as 'detailed' | 'grouped'
  if (query.sortColumn) sortColumn.value = query.sortColumn as string
  if (query.sortDirection) sortDirection.value = query.sortDirection as 'asc' | 'desc'
  
  // Load filters
  if (query.accountName) filters.value.accountName = query.accountName as string
  if (query.enclaveId) filters.value.enclaveId = query.enclaveId as string
  if (query.projectType) filters.value.projectType = query.projectType as string
  if (query.lob) filters.value.lob = query.lob as string
  if (query.minAmount) filters.value.minAmount = Number(query.minAmount)
  if (query.maxAmount) filters.value.maxAmount = Number(query.maxAmount)
  
  // Load expanded groups
  if (query.expanded) {
    const expanded = Array.isArray(query.expanded) ? query.expanded : [query.expanded]
    expanded.forEach(g => expandedGroups.value.add(g as string))
  }
}

// Update URL with current state
const updateURL = () => {
  const query: any = {}
  
  // Only add primitive values, not objects
  if (groupBy.value && typeof groupBy.value === 'string') query.groupBy = groupBy.value
  if (viewMode.value !== 'detailed') query.viewMode = viewMode.value
  if (sortColumn.value !== 'accountName') query.sortColumn = sortColumn.value
  if (sortDirection.value !== 'asc') query.sortDirection = sortDirection.value
  
  // Add filters to URL
  if (filters.value.accountName) query.accountName = filters.value.accountName
  if (filters.value.enclaveId) query.enclaveId = filters.value.enclaveId
  if (filters.value.projectType) query.projectType = filters.value.projectType
  if (filters.value.lob) query.lob = filters.value.lob
  if (filters.value.minAmount) query.minAmount = filters.value.minAmount
  if (filters.value.maxAmount) query.maxAmount = filters.value.maxAmount
  
  // Add expanded groups
  if (expandedGroups.value.size > 0) {
    query.expanded = Array.from(expandedGroups.value)
  }
  
  router.replace({ query })
}

// Watch for changes and update URL
watch([groupBy, viewMode, sortColumn, sortDirection, filters], () => {
  updateURL()
}, { deep: true })

// Refresh data
const refreshData = async () => {
  await fetchForecastData()
}

// Clear all data
const clearAllData = async () => {
  try {
    await $fetch('/api/forecast/clear', {
      method: 'POST',
      body: { confirm: true }
    })
    await fetchForecastData() // Refresh the data
    showClearDialog.value = false
  } catch (err) {
    logger.error('Failed to clear all data:', err)
  }
}

// Export data to CSV
const exportData = () => {
  const data = viewMode.value === 'grouped' && groupedData.value ? exportGroupedData() : exportDetailedData()
  
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', `forecast-data-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Export detailed data
const exportDetailedData = () => {
  const headers = [
    'Enclave ID',
    'Account Name',
    'Account ID',
    'Project Type',
    'LOB',
    'Department',
    'Project',
    'Task',
    ...monthColumns.value.map(m => formatMonth(m)),
    'Total'
  ]
  
  const rows = filteredData.value.map(item => [
    item.enclaveId || '',
    item.accountName || '',
    item.accountId || '',
    item.projectType || '',
    item.lob || '',
    item.deptNumber || '',
    item.projNumber || '',
    item.taskNumber || '',
    ...monthColumns.value.map(m => item.forecasts?.[m] || 0),
    item.totalAmount || 0
  ])
  
  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => 
      typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
    ).join(','))
  ].join('\n')
}

// Export grouped data
const exportGroupedData = () => {
  if (!groupedData.value) return exportDetailedData()
  
  const headers = [
    groupBy.value?.toUpperCase() || 'Group',
    'Account Count',
    ...monthColumns.value.map(m => formatMonth(m)),
    'Total'
  ]
  
  const rows = groupedData.value.map(group => [
    group.groupName,
    group.itemCount,
    ...monthColumns.value.map(m => group.monthlyTotals[m] || 0),
    group.totalAmount
  ])
  
  // Add grand total row
  rows.push([
    'GRAND TOTAL',
    forecastData.value.length,
    ...monthColumns.value.map(m => monthlyTotals.value[m] || 0),
    grandTotal.value
  ])
  
  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => 
      typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
    ).join(','))
  ].join('\n')
}

// Drag scrolling functions
const handleMouseDown = (e: MouseEvent) => {
  // Check if we're within the table container
  const target = e.target as HTMLElement
  if (!tableContainer.value?.contains(target)) return
  
  // Only start drag if middle mouse button or holding shift/alt
  const isMiddleClick = e.button === 1
  const isModifierHeld = e.shiftKey || e.altKey
  
  // Check if clicking on interactive elements
  const isInteractive = target.closest('a, button, input, textarea, select, [role="button"]')
  
  if (!isInteractive && (isMiddleClick || isModifierHeld)) {
    const container = tableContainer.value?.querySelector('.overflow-x-auto') as HTMLElement
    if (!container) return
    
    isDragging.value = true
    hasDraggedBeyondThreshold.value = false
    startX.value = e.pageX
    startY.value = e.pageY
    scrollLeft.value = container.scrollLeft
    scrollTop.value = container.scrollTop
    
    // Change cursor to indicate dragging
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    
    e.preventDefault()
    
  }
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  
  e.preventDefault()
  
  const container = tableContainer.value?.querySelector('.overflow-x-auto') as HTMLElement
  if (!container) return
  
  const x = e.pageX
  const y = e.pageY
  const walkX = (startX.value - x) * 1.5 // Reversed for natural drag direction
  const walkY = (startY.value - y) * 1.5
  
  // Check if we've moved beyond threshold
  if (!hasDraggedBeyondThreshold.value) {
    if (Math.abs(walkX) > dragThreshold || Math.abs(walkY) > dragThreshold) {
      hasDraggedBeyondThreshold.value = true
    } else {
      return // Don't scroll until threshold is met
    }
  }
  
  container.scrollLeft = scrollLeft.value + walkX
  container.scrollTop = scrollTop.value + walkY
}

const handleMouseUp = (e: MouseEvent) => {
  if (isDragging.value) {
    isDragging.value = false
    hasDraggedBeyondThreshold.value = false
    
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    
    e.preventDefault()
    e.stopPropagation()
  }
}

const handleMouseLeave = (e: MouseEvent) => {
  if (isDragging.value) {
    handleMouseUp(e)
  }
}

// Load forecast data on mount
onMounted(async () => {
  loadFromURL()
  await fetchForecastData()
  
  // Set up drag scrolling listeners
  // Use document-level events for better tracking
  document.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
})

// Cleanup event listeners
onUnmounted(() => {
  document.removeEventListener('mousedown', handleMouseDown)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})

// Account status helper functions
const getAccountStatusIcon = (status: string | undefined) => {
  // If status is 'Decommissioned', it's inactive, otherwise it's active
  if (!status || status.toLowerCase() !== 'decommissioned') {
    return 'i-heroicons-check-circle-solid'
  }
  return 'i-heroicons-x-circle-solid'
}

const getAccountStatusClass = (status: string | undefined) => {
  // If status is 'Decommissioned', it's inactive (red), otherwise it's active (green)
  if (!status || status.toLowerCase() !== 'decommissioned') {
    return 'text-green-500'
  }
  return 'text-red-500'
}

const getAccountStatusTooltip = (status: string | undefined) => {
  // If status is 'Decommissioned', it's inactive, otherwise it's active
  if (!status || status.toLowerCase() !== 'decommissioned') {
    return 'Account is active'
  }
  return 'Account is decommissioned'
}
</script>

<style scoped>
/* Custom scrollbar for the table */
.overflow-x-auto::-webkit-scrollbar {
  height: 8px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  background: var(--ghost-scrollbar-track);
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  background: var(--ghost-scrollbar-thumb);
  border-radius: 4px;
}

.overflow-x-auto::-webkit-scrollbar-thumb:hover {
  background: var(--ghost-scrollbar-thumb-hover);
}

/* Sticky positioning for headers and columns */
thead {
  position: sticky;
  top: 0;
  z-index: 20;
}

/* Sticky column shadows */
.sticky {
  position: sticky;
  z-index: 5;
}

/* Higher z-index for corner cells (both row and column sticky) */
th.sticky.left-0,
th.sticky.left-16 {
  z-index: 30;
}

td.sticky:after,
th.sticky:after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 1px;
  background: var(--ghost-border);
}

/* Ensure proper background for sticky headers */
thead th {
  background-color: var(--ghost-surface);
}

/* Monthly totals row styling */
thead tr:nth-child(2) td {
  background-color: var(--ghost-surface-2);
}

/* Drag scrolling styles */
.cursor-grab {
  cursor: grab;
}

.cursor-grab:active {
  cursor: grabbing;
}

.cursor-grabbing {
  cursor: grabbing !important;
}

/* Prevent text selection during drag */
.no-select {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

/* Visual feedback for drag mode */
kbd {
  font-family: inherit;
  font-size: 0.75rem;
}
</style>