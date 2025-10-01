<template>
  <div class="w-full overflow-hidden">
    <UCard class="bg-gray-900 border border-gray-700">
      <template #header>
        <div class="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-semibold">Results</h3>
            <UBadge v-if="totalCount" color="primary" variant="subtle" size="sm">
              {{ totalCount }} accounts found
            </UBadge>
            
            <!-- Active filter indicators -->
            <UBadge 
              v-if="accountStatusFilter !== 'all'" 
              :color="accountStatusFilter === 'active' ? 'green' : 'red'" 
              variant="solid" 
              size="xs"
            >
              {{ accountStatusFilter === 'active' ? 'Active Accounts' : 'Decommissioned Only' }}
            </UBadge>
            <UBadge 
              v-if="accountTypeFilter !== 'all'" 
              :color="accountTypeFilter === 'commercial' ? 'orange' : 'blue'" 
              variant="solid" 
              size="xs"
            >
              {{ accountTypeFilter === 'commercial' ? 'Commercial Only' : 'GovCloud Only' }}
            </UBadge>
          </div>
          <div class="flex items-center gap-2">
            <UTooltip text="Export these results to CSV">
              <UButton color="primary" variant="solid" icon="i-heroicons-arrow-down-tray" @click="exportResults">
                Export
              </UButton>
            </UTooltip>
            <UTooltip text="Configure displayed columns">
              <UPopover :popper="{ placement: 'bottom-end' }">
                <UButton color="gray" variant="ghost" icon="i-heroicons-table-cells">
                  Columns
                </UButton>

                <template #panel>
                  <div class="p-4 w-80">
                    <h4 class="font-medium mb-2">Table Columns</h4>

                    <!-- Fixed Columns -->
                    <div class="mb-4">
                      <p class="text-sm text-gray-400 mb-2">Default Columns</p>
                      <div class="space-y-2">
                        <div v-for="column in defaultColumns.filter(c => c !== 'actions')" :key="column" class="flex items-center">
                          <UCheckbox :model-value="true" disabled />
                          <span class="ml-2">{{ formatAccountColumn(column) }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Optional Columns by Category -->
                    <div>
                      <p class="text-sm text-gray-400 mb-2">Additional Columns</p>
                      <div v-for="(columns, category) in columnsByCategory" :key="category" class="mb-3">
                        <p class="text-xs font-medium text-gray-300 mb-1">{{ category }}</p>
                        <div class="space-y-1 max-h-60 overflow-y-auto pl-2">
                          <div v-for="column in columns" :key="column.key" class="flex items-center">
                            <UCheckbox 
                              :model-value="columnVisibility[column.key] ?? false"
                              @update:model-value="(value) => toggleColumnVisibility(column.key, value)" 
                            />
                            <span class="ml-2 text-sm">{{ column.label }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </UPopover>
            </UTooltip>
          </div>
        </div>
      </template>

      <!-- Responsive table wrapper -->
      <div class="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <UTable 
          v-if="!error && accounts.length > 0" 
          :rows="paginatedAccounts" 
          :columns="visibleColumns"
          :loading="isLoading"
          :ui="{
            wrapper: 'relative min-w-full',
            base: 'min-w-full table-auto',
            td: {
              base: 'text-sm h-auto min-h-12 px-2 border-b border-gray-700 whitespace-nowrap'
            },
            th: {
              base: 'text-left text-xs uppercase tracking-wider text-gray-400 h-12 px-2 border-b border-gray-700',
              padding: 'px-2 py-3',
              font: 'font-medium',
              color: 'text-gray-400'
            }
          }"
        >
          <!-- Add loading overlay -->
          <template #loading>
            <div class="absolute inset-0 bg-gray-900/50 flex items-center justify-center">
              <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
            </div>
          </template>

          <!-- Empty state -->
          <template #empty>
            <div class="text-center p-4">
              <UIcon name="i-heroicons-inbox" class="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 class="text-lg font-medium text-gray-300 mb-2">No accounts found</h3>
              <p class="text-gray-400">Try adjusting your filters or search criteria.</p>
            </div>
          </template>

          <!-- Project Name Column with Status Indicator -->
          <template #projectName-data="{ row }">
            <div class="flex items-start gap-2 py-2 project-name-cell" style="max-width: 200px; white-space: normal;">
              <UTooltip :text="row.enclaveStatus || 'Unknown Status'">
                <div 
                  class="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                  :class="getStatusIndicatorClass(row)"
                ></div>
              </UTooltip>
              <div class="flex flex-col min-w-0 flex-1">
                <span class="font-medium text-sm leading-tight break-words hyphens-auto" style="word-break: break-word;">{{ row.projectName || row.accountAlias }}</span>
                <span class="text-xs text-gray-400 mt-1">{{ row.accountType }}</span>
              </div>
            </div>
          </template>

          <!-- Account IDs -->
          <template #awsStandardAccountID-data="{ row }">
            <div class="text-sm space-y-1">
              <div class="flex items-center gap-1">
                <UBadge color="orange" variant="subtle" size="xs">Com</UBadge>
                <span v-html="highlightSearchMatch(row.awsStandardAccountID || 'N/A', row, 'awsStandardAccountID')" />
              </div>
              <div v-if="row.awsGovCloudAccountID" class="flex items-center gap-1">
                <UBadge color="blue" variant="subtle" size="xs">Gov</UBadge>
                <span class="text-xs">{{ row.awsGovCloudAccountID }}</span>
              </div>
              <div v-if="row.accountAlias" class="text-xs text-gray-400 flex items-center gap-1">
                <UIcon name="i-heroicons-identification" class="w-3 h-3" />
                <span v-html="highlightSearchMatch(row.accountAlias || '', row, 'accountAlias')" />
              </div>
              <div v-if="row.awsAccountEmail" class="text-xs text-gray-400 flex items-center gap-1">
                <UIcon name="i-heroicons-envelope" class="w-3 h-3" />
                <span v-html="highlightSearchMatch(row.awsAccountEmail || '', row, 'awsAccountEmail')" />
              </div>
            </div>
          </template>

          <!-- Admin Info -->
          <template #primaryAccountAdminName-data="{ row }">
            <div class="text-sm space-y-1">
              <div class="flex items-center gap-1">
                <UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-primary-400" />
                <span 
                  class="cursor-pointer hover:text-primary-400"
                  @click="$emit('filter-by-username', row.primaryAccountAdminName)"
                  v-html="highlightSearchMatch(row.primaryAccountAdminName || 'N/A', row, 'primaryAccountAdminName')" 
                />
              </div>
              <div v-if="row.primaryAccountAdminEmail" class="text-xs text-gray-400 flex items-center gap-1">
                <UIcon name="i-heroicons-envelope" class="w-3 h-3" />
                <span>{{ row.primaryAccountAdminEmail }}</span>
              </div>
              <div v-if="row.delegateAccountAdminName" class="flex items-center gap-1 mt-1 border-t border-gray-800 pt-1">
                <UIcon name="i-heroicons-users" class="w-3 h-3 text-blue-400" />
                <span 
                  class="cursor-pointer hover:text-primary-400"
                  @click="$emit('filter-by-username', row.delegateAccountAdminName)"
                  v-html="highlightSearchMatch(row.delegateAccountAdminName || '', row, 'delegateAccountAdminName')" 
                />
              </div>
              <div v-if="row.costManagerName" class="flex items-center gap-1">
                <UIcon name="i-heroicons-currency-dollar" class="w-3 h-3 text-green-400" />
                <span 
                  class="cursor-pointer hover:text-primary-400"
                  @click="$emit('filter-by-username', row.costManagerName)"
                  v-html="highlightSearchMatch(row.costManagerName || '', row, 'costManagerName')" 
                />
              </div>
            </div>
          </template>

          <!-- Platform Info Column -->
          <template #platformType-data="{ row }">
            <div class="text-sm space-y-1">
              <div class="flex items-center gap-2">
                <!-- <UIcon name="i-simple-icons-amazonaws" class="w-4 h-4 text-yellow-600" /> -->
                <span class="font-medium">{{ transformPlatformType(row.platformType) }}</span>
              </div>
              <div v-if="row.dataType" class="text-xs text-gray-400 flex items-center gap-1">
                <UIcon name="i-heroicons-shield-check" class="w-3 h-3" />
                <UBadge :color="getDataTypeColor(row.dataType)" variant="subtle" size="xs">
                  {{ row.dataType }}
                </UBadge>
              </div>
              <div v-if="row.isAWSStdEnv" class="flex">
                <UTooltip text="Standard AWS Environment">
                  <UBadge color="orange" variant="solid" size="xs">SAWSE</UBadge>
                </UTooltip>
              </div>
            </div>
          </template>

          <!-- Status with enhanced visual indicators -->
          <template #enclaveStatus-data="{ row }">
            <div class="flex items-center gap-2">
              <div 
                class="w-3 h-3 rounded-full"
                :class="getStatusIndicatorClass(row)"
              ></div>
              <UBadge :color="getStatusColor(row.enclaveStatus) as any" variant="subtle">
                {{ row.enclaveStatus || 'Unknown' }}
              </UBadge>
              <UTooltip v-if="row.isAWSStdEnv" text="Standard Environment">
                <UBadge color="orange" variant="solid" size="xs">SAWSE</UBadge>
              </UTooltip>
            </div>
          </template>

          <!-- Actions Column -->
          <template #actions-data="{ row }">
            <UDropdown 
              :items="getActionItems(row)"
              :ui="{
                item: {
                  base: 'group flex items-center gap-2 w-full',
                  padding: 'px-3 py-2',
                  size: 'text-sm',
                  active: 'bg-gray-700 text-white',
                  inactive: 'text-gray-200'
                },
                divide: 'divide-y divide-gray-700'
              }"
            >
              <UButton 
                color="gray" 
                variant="ghost" 
                icon="i-heroicons-ellipsis-horizontal"
                size="sm"
                :ui="{
                  rounded: 'rounded-md'
                }"
              />
            </UDropdown>
          </template>
        </UTable>

        <!-- Show loading state when accounts are being fetched -->
        <div v-else-if="isLoading" class="flex justify-center items-center p-12">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8 text-gray-400" />
          <span class="ml-3 text-gray-600">Loading accounts...</span>
        </div>

        <!-- Show error state if there's an error -->
        <div v-else-if="error" class="text-center p-8">
          <UIcon name="i-heroicons-exclamation-triangle" class="h-12 w-12 mx-auto text-amber-500 mb-4" />
          <h3 class="text-lg font-medium text-gray-300 mb-2">Error loading accounts</h3>
          <p class="text-gray-400">{{ error }}</p>
          <UButton class="mt-4" @click="$emit('reload')">Retry</UButton>
        </div>

        <!-- Show empty state if there are no accounts -->
        <div v-else class="text-center p-8">
          <UIcon name="i-heroicons-server" class="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 class="text-lg font-medium text-gray-300 mb-2">No accounts found</h3>
          <p class="text-gray-400">Try adjusting your filters or search criteria.</p>
        </div>

        <!-- Pagination -->
        <div class="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 p-4 border-t border-gray-700">
          <div class="flex flex-col sm:flex-row sm:items-center gap-4">
            <span class="text-sm text-gray-400">
              Showing {{ paginationStart }} to {{ paginationEnd }} of {{ totalCount }}
            </span>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-400">Show</span>
              <USelect
                v-model="pageSize"
                size="sm"
                :options="pageSizeOptions"
                class="w-20"
              />
              <span class="text-sm text-gray-400">per page</span>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-4">
            <span class="text-sm text-gray-400">
              Page {{ page }} of {{ totalPages }}
            </span>
            <div class="flex gap-2">
              <UButton :disabled="!canPreviousPage" @click="previousPage" color="gray" variant="ghost"
                icon="i-heroicons-arrow-left">
                <span class="hidden sm:inline">Previous</span>
              </UButton>
              <UButton :disabled="!canNextPage" @click="nextPage" color="gray" variant="ghost"
                icon="i-heroicons-arrow-right" icon-right>
                <span class="hidden sm:inline">Next</span>
              </UButton>
            </div>
          </div>
        </div>

        <!-- Add a debug button after the table -->
        <div class="mt-4 flex justify-end">
          <UButton color="gray" variant="ghost" @click="$emit('debug')">Debug Data</UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePagination } from '~/composables/usePagination'
import { useSearch } from '~/composables/useSearch'
import { useAccountColumns } from '~/composables/useAccountColumns'
import { useToast } from '#imports'
import UserAvatar from '~/components/ui/UserAvatar.vue'
import type { AccountData } from '~/composables/types/reportTypes'
import { 
  formatAccountColumn, 
  getStatusIndicatorClass, 
  getStatusColor, 
  getDataTypeColor,
  generateAccountsCSV
} from '~/utils/accountHelpers'

// Extended Account interface
interface Account extends AccountData {
  [key: string]: any;
  searchMatches?: Array<{
    field: string;
    value: string;
    matchedText: string;
    displayValue?: string;
  }>;
}

// Define props
const props = defineProps({
  accounts: {
    type: Array as () => Account[],
    required: true
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: null
  },
  accountStatusFilter: {
    type: String,
    default: 'all'
  },
  accountTypeFilter: {
    type: String,
    default: 'all'
  },
  searchQuery: {
    type: String,
    default: ''
  }
})

// Define emits
const emit = defineEmits([
  'filter-by-username',
  'reload',
  'debug',
  'update:pageSize'
])

// Use the account columns composable
const {
  defaultColumns,
  availableColumns,
  columnVisibility,
  columnsByCategory,
  visibleColumns,
  toggleColumnVisibility
} = useAccountColumns()

// Setup pagination
const pageSizeOptions = [
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 }
]

const pageSize = ref(25)
const {
  page,
  paginationStart,
  paginationEnd,
  previousPage,
  nextPage,
  goToPage
} = usePagination(pageSize.value)

// Computed properties
const totalCount = computed(() => props.accounts.length)

const totalPages = computed(() => {
  return Math.ceil(totalCount.value / pageSize.value) || 1
})

const canPreviousPage = computed(() => page.value > 1)

const canNextPage = computed(() => page.value < totalPages.value)

const paginatedAccounts = computed(() => {
  const startIndex = (page.value - 1) * pageSize.value
  const endIndex = startIndex + pageSize.value
  return props.accounts.slice(startIndex, endIndex)
})

// Helper methods
const transformPlatformType = (platformType: string) => {
  if (!platformType) return 'AWS'
  
  if (platformType.toLowerCase().includes('government sensitive')) {
    return 'GovCloud'
  }
  
  if (platformType.toLowerCase().includes('commercial')) {
    return 'Commercial'
  }
  
  return platformType
}

const getActionItems = (account: Account) => {
  // Always use commercial account ID for navigation (primary identifier)
  const commercialId = account.awsStandardAccountID
  const govCloudId = account.awsGovCloudAccountID
  
  // Fallback to GovCloud ID only if no commercial ID exists
  const primaryAccountId = commercialId || govCloudId
  
  if (!primaryAccountId) {
    return []
  }
  
  const actionItems = [
    [
      {
        label: 'Account Details',
        icon: 'i-heroicons-document-text',
        to: `/account/${primaryAccountId}`,
        description: 'View full account details and overview'
      },
      {
        label: 'Users',
        icon: 'i-heroicons-users',
        to: `/account/${primaryAccountId}/users`,
        description: 'View all users in this account'
      },
      {
        label: 'Groups',
        icon: 'i-heroicons-user-group',
        to: `/account/${primaryAccountId}/groups`,
        description: 'View all AWS groups for this account'
      }
    ],
    [
      {
        label: 'Cost Dashboard',
        icon: 'i-heroicons-chart-bar',
        to: `/cost`,
        description: 'View cost analysis and billing information'
      },
      {
        label: 'Resources',
        icon: 'i-heroicons-cube',
        to: `/account/${primaryAccountId}?tab=resources`,
        description: 'View AWS resources and services'
      }
    ]
  ]

  // Add user actions section first
  const userActions = []
  
  if (account.govCloudId) {
    userActions.push({
      label: 'Search Users',
      icon: 'i-heroicons-magnifying-glass',
      to: `/account/user?account=${account.govCloudId}`,
      description: `Search users with access to ${account.govCloudId}`
    })
  }
  
  if (userActions.length > 0) {
    actionItems.push(userActions)
  }

  // Add utility actions
  const utilityActions = []
  
  if (account.recordLink) {
    utilityActions.push({
      label: 'View Record',
      icon: 'i-heroicons-arrow-top-right-on-square',
      click: () => window.open(account.recordLink, '_blank'),
      description: 'Open source record in new tab'
    })
  }
  
  utilityActions.push({
    label: 'Copy Account ID',
    icon: 'i-heroicons-clipboard',
    click: () => {
      navigator.clipboard.writeText(primaryAccountId)
      showCopiedToast()
    },
    description: `Copy ${primaryAccountId} to clipboard`
  })

  if (utilityActions.length > 0) {
    actionItems.push(utilityActions)
  }

  return actionItems
}

const highlightSearchMatch = (text: string, account: Account, field: string) => {
  if (!props.searchQuery || !text) return text
  
  if (account.searchMatches && account.searchMatches.length > 0) {
    const match = account.searchMatches.find(m => m.field === field)
    if (match) {
      return text.replace(new RegExp(`(${match.matchedText})`, 'gi'), '<span class="bg-yellow-500/10 text-yellow-400">$1</span>')
    }
  }
  
  return text
}

const showCopiedToast = () => {
  try {
    const toast = useToast()
    toast.add({
      title: 'Account ID copied to clipboard',
      color: 'green',
      timeout: 2000
    })
  } catch (e) {
    console.error('Toast not available', e)
  }
}

const exportResults = () => {
  if (props.accounts.length === 0) {
    console.error('No data to export')
    return
  }
  
  try {
    const { csv, filename } = generateAccountsCSV(props.accounts)
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.setAttribute('href', url)
    a.setAttribute('download', filename)
    a.click()
  } catch (err) {
    console.error('Error exporting data:', err)
  }
}

// Watch pageSize changes
watch(pageSize, (newSize) => {
  emit('update:pageSize', newSize)
})

// Reset to page 1 when accounts change
watch(() => props.accounts, () => {
  page.value = 1
})

// Expose methods
defineExpose({
  exportResults,
  totalCount,
  page,
  goToPage
})
</script>

<style scoped>
/* Project Name column should wrap and have a constrained width */
:deep(table td:first-child) {
  white-space: normal !important;
  max-width: 200px;
  width: 200px;
  vertical-align: top;
}

/* Ensure project name container uses full width */
.project-name-cell {
  white-space: normal !important;
  word-wrap: break-word;
  word-break: break-word;
}
</style>