<template>
  <div class="space-y-6 p-6 max-w-[1600px] mx-auto">
    <!-- Header with Controls -->
    <UCard>
      <div class="space-y-4 p-2">
        <!-- Title and Main Controls -->
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <div>
              <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-1">Account Organization Chart</h1>
              <p class="text-gray-600 dark:text-gray-300 text-sm">{{ masterAccountName }}</p>
            </div>
            <UTooltip text="Learn how to use the Organization Chart">
              <NuxtLink to="/support/docs?topic=org-chart-guide" class="text-gray-400 hover:text-gray-300">
                <UIcon name="i-heroicons-question-mark-circle" class="w-5 h-5" />
              </NuxtLink>
            </UTooltip>
          </div>
          <div class="flex gap-2">
            <UButton color="white" variant="ghost" icon="i-heroicons-arrow-path" @click="refreshData">
              Refresh
            </UButton>
            <UDropdown :items="viewModeItems">
              <UButton color="white" variant="ghost" icon="i-heroicons-eye">
                {{ viewMode === 'overview' ? 'Overview' : viewMode === 'detail' ? 'Detail' : 'Minimap' }}
              </UButton>
            </UDropdown>
            <UButton color="white" variant="ghost" icon="i-heroicons-viewfinder-circle" title="Fit to Screen" @click="fitChartToContainer" />
            <UButton color="white" variant="ghost" icon="i-heroicons-arrows-pointing-in" @click="resetZoom" />
            <UButton color="white" variant="ghost" icon="i-heroicons-plus" @click="zoomIn" />
            <UButton color="white" variant="ghost" icon="i-heroicons-minus" @click="zoomOut" />
          </div>
        </div>

        <!-- Search and Filters -->
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <!-- Search -->
          <div class="lg:col-span-2">
            <UInput
              v-model="filters.searchTerm"
              placeholder="Search accounts, IDs, or names..."
              icon="i-heroicons-magnifying-glass"
              size="sm"
              :disabled="isLoading"
            />
          </div>
          
          <!-- Quick Filters -->
          <div class="flex gap-2">
            <UButton
              :color="showOverBudget ? 'red' : 'gray'"
              variant="soft"
              size="sm"
              @click="toggleBudgetFilter('over')"
            >
              Over Budget ({{ overBudgetCount }})
            </UButton>
            <UButton
              :color="showNoSpend ? 'amber' : 'gray'"
              variant="soft"
              size="sm"
              @click="toggleBudgetFilter('none')"
            >
              No Spend ({{ noSpendCount }})
            </UButton>
          </div>
          
          <!-- View Controls -->
          <div class="flex gap-2">
            <UToggle v-model="useProforma" :disabled="isLoading">
              <template #default="{ checked }">
                <span class="text-sm" :class="checked ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'">
                  {{ checked ? 'Proforma' : 'Billable' }}
                </span>
              </template>
            </UToggle>
            <UTooltip text="Learn about Billable vs Pro-forma data">
              <NuxtLink to="/support/docs?topic=proforma-vs-billable" class="text-gray-400 hover:text-gray-300">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4" />
              </NuxtLink>
            </UTooltip>
            <UButton
              color="emerald"
              variant="soft"
              size="sm"
              :disabled="isLoading"
              @click="expandAll"
            >
              Expand All
            </UButton>
            <UButton
              color="gray"
              variant="soft"
              size="sm"
              :disabled="isLoading"
              @click="collapseAll"
            >
              Collapse
            </UButton>
          </div>
        </div>

        <!-- Advanced Filters (Collapsible) -->
        <div>
          <UButton variant="ghost" color="gray" size="sm" @click="showAdvancedFilters = !showAdvancedFilters">
            <Icon :name="showAdvancedFilters ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-4 h-4 mr-2" />
            Advanced Filters
          </UButton>
          
          <div v-if="showAdvancedFilters" class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-gray-800 rounded-lg">
            <!-- LOB Filter -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Lines of Business</label>
              <USelectMenu
                v-model="filters.lobFilter"
                :options="availableLobs"
                multiple
                placeholder="Select LOBs..."
                size="sm"
              />
            </div>
            
            <!-- Department Filter -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Departments</label>
              <USelectMenu
                v-model="filters.departmentFilter"
                :options="availableDepartments"
                multiple
                placeholder="Select Departments..."
                size="sm"
              />
            </div>
            
            <!-- Budget Range -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Budget Range</label>
              <div class="flex gap-2">
                <UInput
                  v-model.number="filters.minBudget"
                  placeholder="Min"
                  type="number"
                  size="sm"
                />
                <UInput
                  v-model.number="filters.maxBudget"
                  placeholder="Max"
                  type="number"
                  size="sm"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Stats -->
        <div class="flex justify-between text-xs text-gray-400">
          <span>
            Showing {{ visibleNodeCount }} of {{ totalNodeCount }} nodes
            {{ filters.searchTerm ? `(filtered from ${filteredNodeCount})` : '' }}
          </span>
          <span>
            Scale: {{ (viewport.scale * 100).toFixed(0) }}% | 
            Performance: {{ renderingPerformance }}
          </span>
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <UCard v-if="isLoading" class="bg-gray-900 border border-gray-700">
      <div class="space-y-4 p-12">
        <div class="flex items-center justify-between">
          <span class="text-gray-300">{{ loadingMessage }}</span>
          <span class="text-gray-400">{{ Math.round(loadingProgress) }}%</span>
        </div>
        <UProgress :value="loadingProgress" color="yellow" />
      </div>
    </UCard>

    <!-- Error State -->
    <UCard v-else-if="error" class="bg-gray-900 border border-gray-700">
      <div class="p-4">
        <div class="flex items-center gap-2 text-red-500 mb-2">
          <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
          <span class="font-semibold">Error Loading Data</span>
        </div>
        <p class="text-gray-400">{{ error }}</p>
        <UButton color="white" variant="soft" size="sm" class="mt-4" @click="refreshData">
          Try Again
        </UButton>
      </div>
    </UCard>

    <!-- Main Content Grid -->
    <div v-else-if="treeData" class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- Chart Container -->
      <div class="xl:col-span-2">
        <UCard class="bg-gray-900 border border-gray-700 relative">
          <div 
            ref="chartContainerRef"
            class="visualization-container"
            :class="{ 'fullscreen': isChartFullscreen }"
          >
            
            <!-- Chart Overlay Controls -->
            <div class="absolute top-4 right-4 flex flex-col gap-2 z-20">
              <UButton
                color="white"
                variant="soft"
                size="xs"
                :icon="isChartFullscreen ? 'i-heroicons-arrows-pointing-in' : 'i-heroicons-arrows-pointing-out'"
                @click="toggleChartFullscreen"
              >
                {{ isChartFullscreen ? 'Exit' : 'Fullscreen' }}
              </UButton>
              <UButton
                v-if="selectedNode"
                color="blue"
                variant="soft"
                size="xs"
                icon="i-heroicons-map-pin"
                @click="focusOnNode(selectedNode.id)"
              >
                Focus
              </UButton>
            </div>
            
            <!-- Escape hint for fullscreen -->
            <div v-if="isChartFullscreen" class="absolute top-8 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white px-6 py-3 rounded-lg text-sm border border-gray-600 z-50">
              <div class="flex items-center gap-2">
                <Icon name="i-heroicons-information-circle" class="w-4 h-4" />
                Press <kbd class="px-2 py-1 bg-gray-700 rounded text-xs font-mono">ESC</kbd> to exit fullscreen
              </div>
            </div>
            
            <!-- Performance Warning -->
            <div v-if="totalNodeCount > 300" class="absolute bottom-4 left-4">
              <UAlert
                color="yellow"
                variant="soft"
                title="Large Dataset"
                :description="`${totalNodeCount} nodes detected. Some features limited for performance.`"
              />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Detail Panel -->
      <div class="xl:col-span-1">
        <!-- Selected Node Details -->
        <UCard v-if="selectedNode" class="bg-gray-900 border border-gray-700 mb-6">
          <template #header>
            <div class="flex justify-between items-center">
              <span class="font-semibold text-white">{{ selectedNode.name }}</span>
              <UButton
                color="gray"
                variant="ghost"
                size="xs"
                icon="i-heroicons-x-mark"
                @click="selectedNode = null"
              />
            </div>
          </template>
          
          <div class="space-y-4">
            <div>
              <p class="text-xs text-gray-400 mb-1">Account ID</p>
              <p class="text-sm text-white font-mono">{{ selectedNode.id }}</p>
            </div>
            
            <div>
              <p class="text-xs text-gray-400 mb-1">Type</p>
              <UBadge :color="getNodeTypeColor(selectedNode.type)" variant="soft">
                {{ selectedNode.type }}
              </UBadge>
            </div>

            <!-- Show detailed account info if available -->
            <div v-if="selectedAccountDetails" class="space-y-3 pt-2 border-t border-gray-700">
              <!-- Account Status -->
              <div v-if="selectedAccountDetails.organizationStatus">
                <p class="text-xs text-gray-400 mb-1">Status</p>
                <UBadge 
                  :color="selectedAccountDetails.organizationStatus === 'ACTIVE' ? 'green' : 'red'" 
                  variant="soft" 
                  size="xs"
                >
                  {{ selectedAccountDetails.organizationStatus }}
                </UBadge>
              </div>

              <!-- Project Info -->
              <div v-if="selectedAccountDetails.projectName" class="grid grid-cols-2 gap-2">
                <div>
                  <p class="text-xs text-gray-400 mb-1">Project</p>
                  <p class="text-xs text-white">{{ selectedAccountDetails.projectName }}</p>
                </div>
                <div v-if="selectedAccountDetails.projectNumber">
                  <p class="text-xs text-gray-400 mb-1">Project #</p>
                  <p class="text-xs text-white">{{ selectedAccountDetails.projectNumber }}</p>
                </div>
              </div>

              <!-- Admin Contacts -->
              <div v-if="selectedAccountDetails.primaryAccountAdminUsername || selectedAccountDetails.delegateAccountAdminUsername">
                <p class="text-xs text-gray-400 mb-1">Admins</p>
                <div class="space-y-1">
                  <div v-if="selectedAccountDetails.primaryAccountAdminUsername" class="flex items-center gap-2">
                    <Icon name="i-heroicons-user" class="w-3 h-3 text-gray-500" />
                    <span class="text-xs text-white">{{ selectedAccountDetails.primaryAccountAdminUsername }}</span>
                  </div>
                  <div v-if="selectedAccountDetails.delegateAccountAdminUsername" class="flex items-center gap-2">
                    <Icon name="i-heroicons-users" class="w-3 h-3 text-gray-500" />
                    <span class="text-xs text-white">{{ selectedAccountDetails.delegateAccountAdminUsername }}</span>
                  </div>
                </div>
              </div>

              <!-- Environment Info -->
              <div v-if="selectedAccountDetails.govCloudAccountId || selectedAccountDetails.govId" class="grid grid-cols-2 gap-2">
                <div>
                  <p class="text-xs text-gray-400 mb-1">Commercial</p>
                  <p class="text-xs text-white font-mono">{{ selectedNode.id }}</p>
                </div>
                <div v-if="selectedAccountDetails.govCloudAccountId || selectedAccountDetails.govId">
                  <p class="text-xs text-gray-400 mb-1">GovCloud</p>
                  <p class="text-xs text-white font-mono">{{ selectedAccountDetails.govCloudAccountId || selectedAccountDetails.govId }}</p>
                </div>
              </div>

              <!-- Creation Date -->
              <div v-if="selectedAccountDetails.createdAt || selectedAccountDetails.joinedTimestamp">
                <p class="text-xs text-gray-400 mb-1">Created</p>
                <p class="text-xs text-white">
                  {{ new Date(selectedAccountDetails.createdAt || selectedAccountDetails.joinedTimestamp).toLocaleDateString() }}
                </p>
              </div>

              <!-- Monthly Charge -->
              <div v-if="selectedAccountDetails.estimatedMonthlyCharge">
                <p class="text-xs text-gray-400 mb-1">Est. Monthly Charge</p>
                <p class="text-xs text-white font-semibold">${{ formatCurrency(selectedAccountDetails.estimatedMonthlyCharge) }}</p>
              </div>
            </div>

            <!-- Loading state for details -->
            <div v-if="isLoadingDetails && selectedNode.type === 'account'" class="text-center py-2">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mx-auto"/>
              <p class="text-xs text-gray-400 mt-1">Loading details...</p>
            </div>
            
            <!-- Financial Overview -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-gray-400 mb-1">Budget</p>
                <p class="text-lg font-semibold text-white">${{ formatCurrency(selectedNode.budget || 0) }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-400 mb-1">Spend</p>
                <p class="text-lg font-semibold" :class="getSpendColorClass(selectedNode)">
                  ${{ formatCurrency(selectedNode.spend || 0) }}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-400 mb-1">Remaining</p>
                <p class="text-sm font-semibold" :class="getRemainingColorClass(selectedNode)">
                  ${{ formatCurrency((selectedNode.budget || 0) - (selectedNode.spend || 0)) }}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-400 mb-1">Variance</p>
                <p class="text-sm font-semibold" :class="getVarianceColorClass(selectedNode)">
                  {{ getVariancePercent(selectedNode) }}%
                </p>
              </div>
            </div>
            
            <!-- Utilization Progress -->
            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Utilization</span>
                <span>{{ getUtilizationPercent(selectedNode) }}%</span>
              </div>
              <UProgress
                :value="getUtilizationPercent(selectedNode)"
                :color="getUtilizationColor(selectedNode)"
                size="sm"
              />
            </div>

            <!-- Hierarchy Info -->
            <div v-if="selectedNode.type !== 'master'">
              <p class="text-xs text-gray-400 mb-2">Hierarchy</p>
              <div class="space-y-1">
                <div v-for="(pathItem, index) in getNodePath(selectedNode.id)" :key="pathItem.id" 
                     class="flex items-center text-xs">
                  <span v-if="index > 0" class="text-gray-600 mr-1">→</span>
                  <UBadge :color="getNodeTypeColor(pathItem.type)" variant="soft" size="xs">
                    {{ pathItem.name }}
                  </UBadge>
                </div>
              </div>
            </div>

            <!-- Children Summary -->
            <div v-if="selectedNode.children && selectedNode.children.length > 0">
              <p class="text-xs text-gray-400 mb-2">Children ({{ selectedNode.children.length }})</p>
              <div class="space-y-1 max-h-32 overflow-y-auto">
                <div v-for="child in selectedNode.children" :key="child.id" 
                     class="flex justify-between items-center py-1 px-2 bg-gray-800 rounded text-xs">
                  <span class="text-gray-300 truncate">{{ child.name }}</span>
                  <span class="text-white font-mono">${{ formatCurrency(child.spend || 0) }}</span>
                </div>
              </div>
            </div>

            <!-- Usage Metrics (if available) -->
            <div v-if="selectedNode.usage !== undefined">
              <p class="text-xs text-gray-400 mb-1">Usage</p>
              <p class="text-sm text-white">{{ formatUsage(selectedNode.usage) }}</p>
            </div>

            <!-- Cost Analysis (if available) -->
            <div v-if="selectedAccountCostAnalysis && selectedNode.type === 'account'" class="pt-2 border-t border-gray-700">
              <p class="text-xs text-gray-400 mb-2">Cost Analysis</p>
              
              <!-- Anomalies -->
              <div v-if="selectedAccountCostAnalysis.anomalies && selectedAccountCostAnalysis.anomalies.length > 0">
                <UAlert
                  color="yellow"
                  variant="soft"
                  size="xs"
                  title="Cost Anomaly Detected"
                  :description="`${selectedAccountCostAnalysis.anomalies.length} unusual cost pattern(s) found`"
                />
              </div>

              <!-- Budget vs Actual -->
              <div v-if="selectedAccountCostAnalysis.budgetComparison" class="mt-2">
                <div class="flex justify-between text-xs">
                  <span class="text-gray-400">Budget Status</span>
                  <UBadge 
                    :color="selectedAccountCostAnalysis.budgetComparison.status === 'OVER' ? 'red' : 'green'" 
                    variant="soft" 
                    size="xs"
                  >
                    {{ selectedAccountCostAnalysis.budgetComparison.status }}
                  </UBadge>
                </div>
              </div>

              <!-- Trend -->
              <div v-if="selectedAccountCostAnalysis.trend" class="mt-2 flex items-center gap-2 text-xs">
                <span class="text-gray-400">Trend:</span>
                <span :class="selectedAccountCostAnalysis.trend.direction === 'up' ? 'text-red-400' : 'text-green-400'">
                  {{ selectedAccountCostAnalysis.trend.percentChange }}% 
                  <Icon :name="selectedAccountCostAnalysis.trend.direction === 'up' ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'" class="w-3 h-3 inline" />
                </span>
              </div>
            </div>

            <!-- Data Source -->
            <div class="pt-2 border-t border-gray-700">
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-400">Data Source</span>
                <UBadge :color="useProforma ? 'blue' : 'green'" variant="soft" size="xs">
                  {{ useProforma ? 'Proforma' : 'Billable' }}
                </UBadge>
              </div>
            </div>
            
            <!-- Actions -->
            <div class="flex gap-2 pt-2">
              <UButton
                color="blue"
                variant="soft"
                size="xs"
                icon="i-heroicons-map-pin"
                @click="focusOnNode(selectedNode.id)"
              >
                Focus
              </UButton>
              <UButton
                v-if="getNodePath(selectedNode.id).length > 1"
                color="gray"
                variant="soft"
                size="xs"
                icon="i-heroicons-arrow-up"
                @click="focusOnParent"
              >
                Parent
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Quick Stats -->
        <UCard class="bg-gray-900 border border-gray-700 mb-6">
          <template #header>
            <span class="font-semibold text-white">Overview</span>
          </template>
          
          <div class="space-y-4">
            <div class="grid grid-cols-1 gap-3">
              <div class="flex justify-between">
                <span class="text-gray-400 text-sm">Total Accounts</span>
                <span class="text-white font-semibold">{{ totalAccounts }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400 text-sm">Visible Nodes</span>
                <span class="text-white font-semibold">{{ visibleNodeCount }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400 text-sm">Total Budget</span>
                <span class="text-white font-semibold">${{ formatCurrency(totalBudget) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400 text-sm">Total Spend</span>
                <span class="font-semibold" :class="totalSpendColorClass">
                  ${{ formatCurrency(totalSpend) }}
                </span>
              </div>
            </div>
            
            <!-- Overall Utilization -->
            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Overall Utilization</span>
                <span>{{ overallUtilization }}%</span>
              </div>
              <UProgress
                :value="overallUtilization"
                :color="overallUtilization > 100 ? 'red' : overallUtilization > 90 ? 'yellow' : 'green'"
                size="sm"
              />
            </div>
          </div>
        </UCard>

        <!-- Filter Results -->
        <UCard v-if="filteredNodeCount !== totalNodeCount" class="bg-gray-900 border border-gray-700">
          <template #header>
            <div class="flex justify-between items-center">
              <span class="font-semibold text-white">Filters Active</span>
              <UButton
                color="gray"
                variant="ghost"
                size="xs"
                @click="clearAllFilters"
              >
                Clear All
              </UButton>
            </div>
          </template>
          
          <div class="space-y-2 text-sm">
            <div v-if="filters.searchTerm" class="flex justify-between">
              <span class="text-gray-400">Search:</span>
              <UBadge color="blue" variant="soft">{{ filters.searchTerm }}</UBadge>
            </div>
            <div v-if="filters.lobFilter.length > 0" class="flex justify-between">
              <span class="text-gray-400">LOBs:</span>
              <span class="text-white">{{ filters.lobFilter.length }} selected</span>
            </div>
            <div v-if="filters.departmentFilter.length > 0" class="flex justify-between">
              <span class="text-gray-400">Departments:</span>
              <span class="text-white">{{ filters.departmentFilter.length }} selected</span>
            </div>
            <div class="flex justify-between pt-2 border-t border-gray-700">
              <span class="text-gray-400">Showing:</span>
              <span class="text-white font-semibold">{{ filteredNodeCount }} / {{ totalNodeCount }}</span>
            </div>
          </div>
        </UCard>
      </div>


    <!-- No Data State -->
    <UCard v-if="!isLoading && !error && !treeData" class="bg-gray-900 border border-gray-700">
      <div class="p-12 text-center">
        <Icon name="i-heroicons-chart-bar" class="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p class="text-gray-400">No data available. Click refresh to load.</p>
        <UButton color="white" variant="soft" size="sm" class="mt-4" @click="refreshData">
          Load Data
        </UButton>
      </div>
    </UCard>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useAccountCosts } from '~/composables/useAccountCosts'
import { useD3TreeChart } from '~/composables/useD3TreeChart'
import type { TreeNode } from '~/composables/useD3TreeChart'
import * as d3 from 'd3'

// Composables
const {
  accounts,
  costs,
  accountDetails,
  linesOfBusiness,
  isLoading,
  isLoadingDetails,
  error,
  fetchAccounts,
  fetchCostSummary,
  fetchAccountDetails,
  fetchAccountCostAnalysis,
  fetchLinesOfBusiness,
  transformToD3Tree
} = useAccountCosts()

const { drawChart, zoomIn, zoomOut, resetZoom, fitChartToContainer, centerOnNode, selectedNodeId: d3SelectedNodeId, cleanup, setOnNodeToggleCallback } = useD3TreeChart()

// Enhanced chart state
const selectedNode = ref<TreeNode | null>(null)
const selectedAccountDetails = ref<any>(null)
const selectedAccountCostAnalysis = ref<any>(null)
const filters = ref({
  searchTerm: '',
  showOverBudget: true,
  showUnderBudget: true,
  showNoSpend: true,
  minBudget: 0,
  maxBudget: 1000000,
  lobFilter: [] as string[],
  departmentFilter: [] as string[]
})
const viewport = ref({ scale: 1 })
const layoutMode = ref('tree')
const viewMode = ref('overview')
const allNodes = ref<TreeNode[]>([])
const filteredNodes = ref<TreeNode[]>([])
const visibleNodes = ref<TreeNode[]>([])

// Mock data for filters (will be populated from real data)
const availableLobs = ref<string[]>([])
const availableDepartments = ref<string[]>([])

// Local state
const loadingProgress = ref(0)
const loadingMessage = ref('Initializing...')
const treeData = ref<TreeNode | null>(null)
const showAdvancedFilters = ref(false)
const renderingPerformance = ref('Good')
const isChartFullscreen = ref(false)
const chartContainerRef = ref<HTMLElement>()

// View mode dropdown items
const viewModeItems = [
  [
    { label: 'Overview', click: () => viewMode.value = 'overview' },
    { label: 'Detail View', click: () => viewMode.value = 'detail' },
    { label: 'Minimap', click: () => viewMode.value = 'minimap' }
  ]
]

// Computed properties
const masterAccountName = computed(() => {
  if (!treeData.value) return 'Loading...'
  return `Master Account: ${treeData.value.name} (${treeData.value.id})`
})

const totalNodeCount = computed(() => allNodes.value.length)
const filteredNodeCount = computed(() => filteredNodes.value.length)
const visibleNodeCount = computed(() => visibleNodes.value.length)

const totalAccounts = computed(() => {
  return allNodes.value.filter(n => n.type === 'account').length
})

const totalBudget = computed(() => {
  return allNodes.value
    .filter(n => n.type === 'account')
    .reduce((sum, n) => sum + (n.budget || 0), 0)
})

const totalSpend = computed(() => {
  return allNodes.value
    .filter(n => n.type === 'account')
    .reduce((sum, n) => sum + (n.spend || 0), 0)
})

const overallUtilization = computed(() => {
  if (!totalBudget.value) return 0
  return Math.round((totalSpend.value / totalBudget.value) * 100)
})

const totalSpendColorClass = computed(() => {
  const util = overallUtilization.value
  if (util > 100) return 'text-red-500'
  if (util > 90) return 'text-yellow-500'
  return 'text-green-500'
})

// Filter counts
const overBudgetCount = computed(() => {
  return allNodes.value.filter(n => 
    n.type === 'account' && (n.budget || 0) > 0 && (n.spend || 0) > (n.budget || 0)
  ).length
})

const noSpendCount = computed(() => {
  return allNodes.value.filter(n => 
    n.type === 'account' && n.spend === 0
  ).length
})

const showOverBudget = computed({
  get: () => filters.value.showOverBudget,
  set: (value) => filters.value.showOverBudget = value
})

const showNoSpend = computed({
  get: () => filters.value.showNoSpend,
  set: (value) => filters.value.showNoSpend = value
})

const useProforma = ref(false)

// Methods
const loadData = async () => {
  try {
    loadingProgress.value = 0
    loadingMessage.value = 'Fetching account data...'
    
    const startTime = performance.now()
    
    // Fetch accounts
    loadingProgress.value = 10
    await fetchAccounts({
      includeDecommissioned: false,
      enrichment: 'full'
    })
    
    // Fetch lines of business for full names
    loadingProgress.value = 25
    loadingMessage.value = 'Fetching lines of business...'
    await fetchLinesOfBusiness(false)
    
    loadingProgress.value = 40
    loadingMessage.value = 'Fetching cost data...'
    
    // Fetch costs for current month
    await fetchCostSummary({
      period: 'thisMonth',
      granularity: 'MONTHLY',
      groupBy: 'LINKED_ACCOUNT',
      enhanced: true,
      proforma: useProforma.value
    })
    
    loadingProgress.value = 70
    loadingMessage.value = 'Processing data...'
    
    // Transform data
    const transformedData = transformToD3Tree(accounts.value?.data || accounts.value, costs.value?.data || costs.value, useProforma.value)
    
    console.log('Transformed data:', transformedData)
    console.log('Accounts data:', accounts.value)
    console.log('Costs data:', costs.value)
    
    if (transformedData) {
      treeData.value = transformedData
      
      // Populate filter data
      populateFilterData(transformedData)
      
      loadingProgress.value = 90
      loadingMessage.value = 'Rendering chart...'
      
      // Calculate performance metrics
      const loadTime = performance.now() - startTime
      renderingPerformance.value = loadTime < 1000 ? 'Excellent' : 
                                   loadTime < 3000 ? 'Good' : 
                                   loadTime < 5000 ? 'Fair' : 'Slow'
      
      // Render chart using original D3 composable
      await nextTick()
      console.log('About to draw chart with data:', transformedData)
      drawChart(transformedData)
    } else {
      console.error('No transformed data available')
    }
    
    loadingProgress.value = 100
    loadingMessage.value = 'Complete!'
    
  } catch (err) {
    console.error('Failed to load data:', err)
  }
}

const populateFilterData = (tree: TreeNode) => {
  const flatNodes: TreeNode[] = []
  
  const flattenTree = (node: TreeNode) => {
    flatNodes.push(node)
    // Include both expanded (children) and collapsed (_children) nodes
    if (node.children) {
      node.children.forEach(flattenTree)
    }
    if (node._children) {
      node._children.forEach(flattenTree)
    }
  }
  
  flattenTree(tree)
  allNodes.value = flatNodes
  filteredNodes.value = flatNodes
  visibleNodes.value = flatNodes.slice(0, 50) // Limit for performance
  
  // Extract unique LOBs (use shortName if available for filtering consistency)
  availableLobs.value = [...new Set(
    flatNodes
      .filter(n => n.type === 'lob')
      .map(n => (n as any).shortName || n.name)
  )].sort()
  
  availableDepartments.value = [...new Set(
    flatNodes
      .filter(n => n.type === 'department')
      .map(n => n.name.replace('Department: ', ''))
  )].sort()
}

const formatCurrency = (amount: number | string | undefined | null): string => {
  // Handle various input types and ensure we have a valid number
  let numAmount = 0
  
  if (amount === null || amount === undefined) {
    numAmount = 0
  } else if (typeof amount === 'string') {
    numAmount = parseFloat(amount)
  } else if (typeof amount === 'number') {
    numAmount = amount
  }
  
  // Handle NaN case
  if (isNaN(numAmount)) {
    return '0'
  }
  
  // Format the number
  if (numAmount >= 1000000) {
    return (numAmount / 1000000).toFixed(1) + 'M'
  } else if (numAmount >= 1000) {
    return (numAmount / 1000).toFixed(1) + 'K'
  }
  return numAmount.toFixed(0)
}

const getSpendColor = (node: TreeNode): string => {
  if (!node.budget || node.budget === 0) return '#a0aec0'
  const utilization = (node.spend || 0) / node.budget
  if (utilization > 1) return '#f56565'
  if (utilization > 0.9) return '#ed8936'
  if (utilization > 0.7) return '#ecc94b'
  return '#48bb78'
}

const focusOnNode = (nodeId: string) => {
  const node = allNodes.value.find(n => n.id === nodeId)
  if (node) {
    selectedNode.value = node
  }
}

const getNodePath = (nodeId: string): TreeNode[] => {
  const path: TreeNode[] = []
  
  // Build hierarchical path from root to target node
  const findPath = (node: TreeNode, targetId: string, currentPath: TreeNode[]): boolean => {
    currentPath.push(node)
    
    if (node.id === targetId) {
      path.splice(0, path.length, ...currentPath)
      return true
    }
    
    if (node.children) {
      for (const child of node.children) {
        if (findPath(child, targetId, currentPath)) {
          return true
        }
      }
    }
    
    currentPath.pop()
    return false
  }
  
  if (treeData.value) {
    findPath(treeData.value, nodeId, [])
  }
  
  return path
}

const getRemainingColorClass = (node: TreeNode): string => {
  const remaining = (node.budget || 0) - (node.spend || 0)
  if (remaining < 0) return 'text-red-400'
  if (remaining < (node.budget || 0) * 0.1) return 'text-yellow-400'
  return 'text-green-400'
}

const getVariancePercent = (node: TreeNode): number => {
  if (!node.budget) return 0
  const variance = ((node.spend || 0) - node.budget) / node.budget * 100
  return Math.round(variance)
}

const getVarianceColorClass = (node: TreeNode): string => {
  const variance = getVariancePercent(node)
  if (variance > 10) return 'text-red-400'
  if (variance > 0) return 'text-yellow-400'
  if (variance > -10) return 'text-green-400'
  return 'text-blue-400'
}

const formatUsage = (usage: number): string => {
  if (usage >= 1000000) return `${(usage / 1000000).toFixed(1)}M units`
  if (usage >= 1000) return `${(usage / 1000).toFixed(1)}K units`
  return `${usage.toFixed(0)} units`
}

const expandAll = () => {
  if (!treeData.value) return
  
  const expandNode = (node: TreeNode) => {
    if (node._children) {
      node.children = node._children
      node._children = undefined
    }
    if (node.children) {
      node.children.forEach(expandNode)
    }
  }
  
  expandNode(treeData.value)
  drawChart(treeData.value)
  
  // Reapply filters after expansion to ensure proper styling
  nextTick(() => {
    applyFiltersAndRedraw()
  })
}

const collapseAll = () => {
  if (!treeData.value) return
  
  const collapseNode = (node: TreeNode, depth = 0) => {
    if (node.children && depth > 0) {
      node._children = node.children
      node.children = undefined
    }
    const children = node.children || node._children
    if (children) {
      children.forEach((child: TreeNode) => collapseNode(child, depth + 1))
    }
  }
  
  collapseNode(treeData.value)
  drawChart(treeData.value)
  
  // Reapply filters after collapse to ensure proper styling
  nextTick(() => {
    applyFiltersAndRedraw()
  })
}

const refreshData = async () => {
  selectedNode.value = null
  await loadData()
}

const toggleChartFullscreen = () => {
  isChartFullscreen.value = !isChartFullscreen.value
  
  if (isChartFullscreen.value) {
    // Add escape key listener
    document.addEventListener('keydown', handleEscapeKey)
  } else {
    document.removeEventListener('keydown', handleEscapeKey)
  }
  
  // Re-render chart with new dimensions
  setTimeout(() => {
    if (treeData.value) {
      drawChart(treeData.value)
    }
  }, 100)
}

const handleEscapeKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isChartFullscreen.value) {
    event.preventDefault()
    isChartFullscreen.value = false
    document.removeEventListener('keydown', handleEscapeKey)
    
    // Remove fullscreen class and reset styles
    const container = chartContainerRef.value
    if (container) {
      container.classList.remove('fullscreen')
    }
    
    // Re-render chart with proper delay
    setTimeout(() => {
      if (treeData.value) {
        drawChart(treeData.value)
      }
    }, 150)
  }
}

const toggleBudgetFilter = (type: 'over' | 'under' | 'none') => {
  switch (type) {
    case 'over':
      filters.value.showOverBudget = !filters.value.showOverBudget
      break
    case 'under':
      filters.value.showUnderBudget = !filters.value.showUnderBudget
      break
    case 'none':
      filters.value.showNoSpend = !filters.value.showNoSpend
      break
  }
}

const toggleLayoutMode = () => {
  const modes = ['tree', 'cluster', 'pack', 'force']
  const currentIndex = modes.indexOf(layoutMode.value)
  layoutMode.value = modes[(currentIndex + 1) % modes.length] || 'tree'
  
  if (treeData.value) {
    drawChart(treeData.value)
  }
}

const clearAllFilters = () => {
  filters.value = {
    searchTerm: '',
    showOverBudget: true,
    showUnderBudget: true,
    showNoSpend: true,
    minBudget: 0,
    maxBudget: 1000000,
    lobFilter: [],
    departmentFilter: []
  }
}

const focusOnParent = () => {
  if (!selectedNode.value) {
    console.log('No node selected')
    return
  }
  
  // Find the current selected node in the D3 tree structure via allNodes
  const currentNode = allNodes.value.find(n => n.id === selectedNode.value.id)
  if (!currentNode) {
    console.log('Selected node not found in tree structure')
    return
  }
  
  // Check if current node has a parent
  if (!currentNode.parent) {
    console.log('No parent node found - already at root')
    return
  }
  
  // Get parent node data and focus on it
  const parentData = currentNode.parent.data
  selectedNode.value = parentData
  selectedNodeId.value = parentData.id
  d3SelectedNodeId.value = parentData.id
  
  // Use the centerOnNode function from the D3 chart
  centerOnNode(currentNode.parent)
}

// Utility functions
const getNodeTypeColor = (type: string) => {
  switch (type) {
    case 'master': return 'blue'
    case 'lob': return 'orange'
    case 'department': return 'green'
    case 'account': return 'gray'
    default: return 'gray'
  }
}

const getSpendColorClass = (node: TreeNode) => {
  const color = getSpendColor(node)
  if (color === '#f56565') return 'text-red-500'
  if (color === '#ed8936') return 'text-yellow-500'
  if (color === '#ecc94b') return 'text-yellow-400'
  if (color === '#48bb78') return 'text-green-500'
  return 'text-gray-400'
}

const getUtilizationPercent = (node: TreeNode) => {
  if (!node.budget) return 0
  return Math.round(((node.spend || 0) / node.budget) * 100)
}

const getUtilizationColor = (node: TreeNode) => {
  const percent = getUtilizationPercent(node)
  if (percent > 100) return 'red'
  if (percent > 90) return 'yellow'
  return 'green'
}

// Make search reactive
const searchDebounce = ref<any>(null)

watch(() => filters.value.searchTerm, () => {
  clearTimeout(searchDebounce.value)
  searchDebounce.value = setTimeout(() => {
    applyFiltersAndRedraw()
  }, 300)
})

// Watch other filters
watch(() => [filters.value.showOverBudget, filters.value.showNoSpend, filters.value.lobFilter, filters.value.departmentFilter], () => {
  applyFiltersAndRedraw()
}, { deep: true })

const applyFiltersAndRedraw = () => {
  if (!treeData.value) return
  
  // Re-populate allNodes to include any newly expanded/collapsed nodes
  populateFilterData(treeData.value)
  
  // Create filtered node set for performance
  const matchingNodeIds = new Set<string>()
  const ancestorNodeIds = new Set<string>()
  
  // First pass: find all directly matching nodes
  allNodes.value.forEach(node => {
    let matches = false
    
    // Search filter - simplified logic without redundancy
    if (filters.value.searchTerm) {
      const term = filters.value.searchTerm.toLowerCase()
      const searchMatches = node.name?.toLowerCase().includes(term) || 
                           node.id?.toLowerCase().includes(term)
      if (searchMatches) matches = true
    }
    
    // For accounts, also check budget filters
    if (node.type === 'account') {
      const utilization = node.budget ? (node.spend || 0) / node.budget : 0
      const hasSpend = (node.spend || 0) > 0
      
      // Apply budget filters only if no search term or if search matches
      if (!filters.value.searchTerm || matches) {
        if (!filters.value.showOverBudget && utilization > 1) matches = false
        else if (!filters.value.showNoSpend && !hasSpend) matches = false
      }
    }
    
    // Check if account belongs to filtered LOB/Department
    if (node.type === 'account' && (filters.value.lobFilter.length > 0 || filters.value.departmentFilter.length > 0)) {
      const nodePath = getNodePath(node.id)
      let belongsToFilteredLOB = filters.value.lobFilter.length === 0
      let belongsToFilteredDept = filters.value.departmentFilter.length === 0
      
      nodePath.forEach(pathNode => {
        if (pathNode.type === 'lob' && filters.value.lobFilter.length > 0) {
          const lobName = (pathNode as any).shortName || pathNode.name.replace('Line of Business: ', '')
          if (filters.value.lobFilter.includes(lobName)) belongsToFilteredLOB = true
        }
        if (pathNode.type === 'department' && filters.value.departmentFilter.length > 0) {
          const deptName = pathNode.name.replace('Department: ', '')
          if (filters.value.departmentFilter.includes(deptName)) belongsToFilteredDept = true
        }
      })
      
      if (!belongsToFilteredLOB || !belongsToFilteredDept) matches = false
    }
    
    if (matches) {
      matchingNodeIds.add(node.id)
      // Only include ancestors for hierarchical context, not all siblings
      getNodePath(node.id).forEach(pathNode => ancestorNodeIds.add(pathNode.id))
    }
  })
  
  // Second pass: include ancestor nodes for context but mark them differently
  const combinedNodeIds = new Set([...matchingNodeIds, ...ancestorNodeIds])
  
  // Update filtered nodes - only include directly matching nodes
  filteredNodes.value = allNodes.value.filter(node => matchingNodeIds.has(node.id))
  
  // Apply visual filtering to SVG
  const svg = d3.select('svg')
  if (svg.empty()) return
  
  const nodes = svg.selectAll('.node')
  const links = svg.selectAll('.link')
  
  // Update node visibility - different opacity for matched vs ancestors
  nodes.style('opacity', (d: any) => {
    // Check if this node has matching descendants that are currently collapsed
    const hasMatchingCollapsedChildren = (node: any): boolean => {
      if (!node._children) return false
      return node._children.some((child: any) => 
        matchingNodeIds.has(child.id) || hasMatchingCollapsedChildren(child)
      )
    }
    
    if (matchingNodeIds.has(d.data.id)) return 1 // Full opacity for matched nodes
    if (ancestorNodeIds.has(d.data.id)) {
      // If ancestor has collapsed matching children, show higher opacity
      if (hasMatchingCollapsedChildren(d)) return 0.8
      return 0.8 // Half opacity for ancestors (context)
    }
    return 0.15 // Low opacity for non-matching nodes
  })
  .style('pointer-events', (d: any) => {
    // Allow interaction with matched nodes and their ancestors
    return (matchingNodeIds.has(d.data.id) || ancestorNodeIds.has(d.data.id)) ? 'all' : 'none'
  })
  .style('stroke-width', (d: any) => {
    // Add visual indicator for collapsed nodes with matches inside
    const hasMatchingCollapsedChildren = (node: any): boolean => {
      if (!node._children) return false
      return node._children.some((child: any) => 
        matchingNodeIds.has(child.id) || hasMatchingCollapsedChildren(child)
      )
    }
    
    if (hasMatchingCollapsedChildren(d)) {
      return 3 // Thicker border for collapsed nodes with matches
    }
    return null // Default stroke width
  })
  
  // Update collapse button to show if there are matches inside
  svg.selectAll('.collapse-button')
    .style('fill', (d: any) => {
      const hasMatchingCollapsedChildren = (node: any): boolean => {
        if (!node._children) return false
        return node._children.some((child: any) => 
          matchingNodeIds.has(child.id) || hasMatchingCollapsedChildren(child)
        )
      }
      
      if (hasMatchingCollapsedChildren(d)) {
        return '#3b82f6' // Blue color for collapse button with matches inside
      }
      return null // Default color
    })
  
  // Update link visibility - only show links in the path
  links.style('opacity', (d: any) => {
    const sourceInPath = matchingNodeIds.has(d.source.data.id) || ancestorNodeIds.has(d.source.data.id)
    const targetInPath = matchingNodeIds.has(d.target.data.id) || ancestorNodeIds.has(d.target.data.id)
    
    // Only show link if both ends are in the matched or ancestor path
    if (sourceInPath && targetInPath) {
      // Stronger opacity if connecting to a matched node
      return matchingNodeIds.has(d.target.data.id) ? 0.8 : 0.4
    }
    return 0.1
  })
  
  // Reset if no filters active
  const hasActiveFilters = filters.value.searchTerm || 
                          filters.value.lobFilter.length > 0 || 
                          filters.value.departmentFilter.length > 0 ||
                          !filters.value.showOverBudget || 
                          !filters.value.showNoSpend
  
  if (!hasActiveFilters) {
    nodes.style('opacity', 1).style('pointer-events', 'all')
    links.style('opacity', 0.6)
  }
  
  // Additional visibility control for budget-filtered accounts
  if (hasActiveFilters && (!filters.value.showOverBudget || !filters.value.showNoSpend)) {
    nodes.each(function(d: any) {
      const node = d3.select(this)
      if (d.data.type === 'account' && !matchingNodeIds.has(d.data.id)) {
        // Hide accounts that don't match the budget filters
        node.style('opacity', 0.15)
          .style('pointer-events', 'none')
      }
    })
  }
  
  updateFilteredCounts()
}

const updateFilteredCounts = () => {
  if (!allNodes.value.length) return
  
  let filtered = allNodes.value
  
  // Apply search filter
  if (filters.value.searchTerm) {
    const term = filters.value.searchTerm.toLowerCase()
    filtered = filtered.filter(node => 
      node.name?.toLowerCase().includes(term) || 
      node.id?.toLowerCase().includes(term)
    )
  }
  
  // Apply budget filters for accounts
  filtered = filtered.filter(node => {
    if (node.type !== 'account') return true
    
    const spend = node.spend || 0
    const budget = node.budget || 0
    const utilization = budget > 0 ? spend / budget : 0
    
    if (!filters.value.showOverBudget && utilization > 1) return false
    if (!filters.value.showNoSpend && spend === 0) return false
    
    return true
  })
  
  filteredNodes.value = filtered
  visibleNodes.value = filtered.slice(0, 100) // Performance limit
}

// Watch for tree data changes to redraw chart
watch(treeData, async (newData) => {
  if (newData) {
    console.log('Tree data updated, drawing chart:', newData)
    await nextTick()
    // Don't auto-redraw here - let the initial load handle it
  }
})

// Watch for node selection from D3 chart
watch(d3SelectedNodeId, async (nodeId) => {
  if (nodeId && allNodes.value.length) {
    const node = allNodes.value.find(n => n.id === nodeId)
    if (node) {
      selectedNode.value = node
      
      // Fetch detailed account info for account nodes
      if (node.type === 'account' && nodeId.match(/^\d{12}$/)) {
        selectedAccountDetails.value = await fetchAccountDetails(nodeId)
        selectedAccountCostAnalysis.value = await fetchAccountCostAnalysis(nodeId, {
          period: 'thisMonth',
          proforma: useProforma.value
        })
      } else {
        selectedAccountDetails.value = null
        selectedAccountCostAnalysis.value = null
      }
    }
  } else {
    selectedNode.value = null
    selectedAccountDetails.value = null
    selectedAccountCostAnalysis.value = null
  }
})

// Handle view mode changes
// Watch for proforma toggle changes
watch(useProforma, async () => {
  if (treeData.value) {
    await refreshData()
  }
})

watch(viewMode, (mode) => {
  if (!treeData.value) return
  
  const svg = d3.select('svg')
  const g = svg.select('g')
  
  switch(mode) {
    case 'overview':
      // Show all nodes, standard view
      g.selectAll('.node').style('display', 'block')
      g.selectAll('.link').style('display', 'block')
      resetZoom()
      break
    case 'detail':
      // Zoom in on selected node or first node
      if (selectedNode.value) {
        const node = g.selectAll('.node')
          .filter((d: any) => d.data.id === selectedNode.value?.id)
        if (!node.empty()) {
          const d = node.datum() as any
          const transform = d3.zoomIdentity
            .translate(400 - d.x, 300 - d.y)
            .scale(1.5)
          svg.transition()
            .duration(750)
            .call((svg.node() as any).__zoom.transform, transform)
        }
      }
      break
    case 'minimap':
      // Zoom out to see everything
      const transform = d3.zoomIdentity
        .translate(400, 400)
        .scale(0.3)
      svg.transition()
        .duration(750)
        .call((svg.node() as any).__zoom?.transform || (() => {}), transform)
      break
  }
})

// Initialize
onMounted(() => {
  // Set up callback to reapply filters after node toggle
  setOnNodeToggleCallback(() => {
    applyFiltersAndRedraw()
  })
  
  loadData()
})

// Cleanup
onUnmounted(() => {
  // Remove escape key listener if still attached
  document.removeEventListener('keydown', handleEscapeKey)
  
  // Cleanup D3 chart resources
  cleanup()
  
  // Reset fullscreen if still active
  if (isChartFullscreen.value) {
    isChartFullscreen.value = false
  }
})
</script>

<style scoped>
:root {
  --primary-color: #232f3e;
  --secondary-color: #ff9900;
  --danger-color: #dc2626;
  --success-color: #16a34a;
}

.visualization-container {
  position: relative;
  width: 100%;
  height: calc(100vh - 240px); /* Account for header and controls */
  min-height: 600px;
  max-height: 90vh;
  border-radius: 8px;
  overflow: hidden;
  background: #111827;
  cursor: grab;
  resize: vertical; /* Allow manual resize */
}

.visualization-container:active {
  cursor: grabbing;
}

.visualization-container.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  border-radius: 0;
}

/* D3 Chart Essential Styles */
:deep(.link) {
  stroke: #687c99;
  stroke-width: 1px;
  stroke-opacity: 0.4;
  fill: none;
  pointer-events: none;
}

:deep(.node-box) {
  fill: #1f2937;
  stroke: #374151;
  rx: 6;
  ry: 6;
  cursor: pointer;
}

/* Hover effects handled by JavaScript for smoother transitions */

/* Node type-specific styles */
:deep(.master .node-box) {
  fill: url(#headerGradient);
  stroke: #4b5563;
}

:deep(.lob .node-box) {
  stroke: #ff9900;
  stroke-width: 2px;
  stroke-opacity: 0.7;
}

:deep(.department .node-box) {
  stroke: #16a34a;
  stroke-width: 2px;
  stroke-opacity: 0.5;
}

:deep(.account .node-box) {
  stroke: #4b5563;
  stroke-width: 1px;
}

/* Text styles - Make text visible */
:deep(.node-header) {
  font-weight: 600;
  font-size: 11px;
  fill: #f3f4f6 !important;
}

:deep(.node-subheader) {
  font-size: 9px;
  fill: #9ca3af !important;
  opacity: 0.8;
}

:deep(.node-metric) {
  font-size: 9px;
  fill: #9ca3af !important;
}

:deep(.node-metric-value) {
  font-size: 11px;
  font-weight: 500;
  fill: #f3f4f6 !important;
}

:deep(.node-utilization) {
  font-size: 14px;
  fill: #f3f4f6 !important;
}

:deep(.collapse-button) {
  font-size: 12px;
  fill: #9ca3af;
  cursor: pointer;
}

/* Optimized node styles for performance */
.node {
  will-change: transform;
  backface-visibility: hidden;
  transform-style: preserve-3d;
}

.node-box {
  shape-rendering: optimizeSpeed;
  transition: all 0.2s ease;
}

.node-box:hover {
  stroke-width: 3;
  filter: brightness(1.1);
}

/* Link styles with performance optimization */
.link {
  stroke: #4a5568;
  stroke-width: 1;
  fill: none;
  shape-rendering: optimizeSpeed;
  pointer-events: none;
}

.node-title {
  dominant-baseline: middle;
  user-select: none;
}

.node-subtitle {
  dominant-baseline: middle;
  user-select: none;
}

.node-budget,
.node-spend {
  dominant-baseline: middle;
  user-select: none;
}

.utilization-bar rect {
  shape-rendering: optimizeSpeed;
}

.child-indicator {
  cursor: pointer;
  transition: all 0.2s ease;
}

.child-indicator:hover {
  r: 10;
  fill: #5a67d8;
}

.child-count {
  pointer-events: none;
  user-select: none;
}

/* Responsive adjustments */
@media (max-width: 1280px) {
  .visualization-container {
    height: 600px;
  }
}

@media (max-width: 768px) {
  .visualization-container {
    height: 500px;
  }
}

/* Chart tooltip styles */
.chart-tooltip {
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  max-width: 300px;
}
</style>