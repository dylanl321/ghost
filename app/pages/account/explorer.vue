<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Compact Header -->
    <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
      <div class="flex items-center justify-between">
        <!-- Left: Title + Quick Filters -->
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">Enclave Explorer</h1>

          <!-- LOB -->
          <USelect v-model="lobFilter" :options="lobOptions" size="xs" class="w-28" />

          <!-- Status buttons -->
          <div class="flex gap-1">
            <UButton
              v-for="item in statusOptions"
              :key="item"
              size="xs"
              :variant="statusFilter === item ? 'solid' : 'ghost'"
              :color="statusFilter === item ? 'primary' : 'gray'"
              @click="statusFilter = item"
            >
              {{ item }}
            </UButton>
          </div>

          <!-- Environment buttons -->
          <div class="flex gap-1">
            <UButton
              v-for="item in envOptions"
              :key="item"
              size="xs"
              :variant="envFilter === item ? 'solid' : 'ghost'"
              :color="envFilter === item ? 'primary' : 'gray'"
              @click="envFilter = item"
            >
              {{ item === 'All' ? 'All Env' : item === 'Commercial Only' ? 'Comm' : 'GovCloud' }}
            </UButton>
          </div>
        </div>

        <!-- Right: Settings & Filter Button -->
        <div class="flex items-center gap-2">
          <UButton
            icon="i-heroicons-arrow-path"
            variant="ghost"
            size="sm"
            @click="resetFilters"
            title="Reset all filters"
          />
          <UButton
            icon="i-heroicons-funnel"
            variant="outline"
            size="sm"
            :badge="totalActiveFilters"
            @click="showFilterPanel = true"
          >
            Filters
          </UButton>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex-shrink-0">
      <div class="flex items-center justify-between">
        <!-- Left: Results + Quick Actions -->
        <ClientOnly>
          <div class="flex items-center gap-3">
            <UBadge color="emerald" variant="subtle" size="md">
              {{ filteredRows.length }} enclaves
            </UBadge>
            <USelectMenu
              v-model="selectedColumns"
              :options="availableColumns"
              multiple
              value-attribute="key"
              option-attribute="label"
              class="w-40"
            >
              <template #label>
                <UIcon name="i-heroicons-eye" class="w-4 h-4 mr-1" />
                <span class="text-xs">{{ selectedColumns.length }} of {{ availableColumns.length }}</span>
              </template>
            </USelectMenu>
            <USelect
              v-model="itemsPerPage"
              :options="itemsPerPageOptions"
              size="xs"
              class="w-24"
            />
          </div>
          <template #fallback>
            <UBadge color="gray" variant="subtle">Loading...</UBadge>
          </template>
        </ClientOnly>

        <!-- Right: Export -->
        <ClientOnly>
          <UButton
            icon="i-heroicons-arrow-down-tray"
            size="xs"
            variant="outline"
            @click="() => exportToCSV(filteredRows)"
          >
            Export
          </UButton>
        </ClientOnly>
      </div>
    </div>

    <!-- Table Section - Full Screen -->
    <div class="flex-1 overflow-hidden flex flex-col bg-white dark:bg-gray-900">
      <ClientOnly>
        <div class="flex-1 overflow-auto px-4">
          <UTable :rows="paginatedRows" :columns="columns" :loading="loading">

          <!-- Project Name column -->
          <template #projectName-data="{ row }">
            <div class="flex items-center gap-2 mb-2">
              <span class="w-3 h-3 rounded-full"
                :class="row.enclaveStatus !== 'Decommissioned' ? 'bg-green-500' : 'bg-red-500'" />
              <span>{{ row.projectName || row.accountId }}</span>
            </div>
            <p class="text-xs">{{ row.awsAccountEmail }}</p>
          </template>

          <!-- Account IDs column -->
          <template #accountIds-data="{ row }">
            <div class="flex flex-col gap-1">
              <span>
                <UBadge color="orange" variant="subtle">Comm</UBadge>
                {{ row.awsStandardAccountID || '—' }}
              </span>
              <span>
                <UBadge color="blue" variant="subtle">Gov</UBadge>
                {{ row.awsGovCloudAccountID || '—' }}
              </span>
            </div>
          </template>

          <!-- Platform info column -->
          <template #platformInfo-data="{ row }">
            <div class="flex flex-col gap-1">
              <UTooltip :text="row.awsGovCloudAccountID ? 'GovCloud Paired' : 'Commercial Only'">
                <p>{{ row.awsGovCloudAccountID ? "GovCloud" : "Commercial" }}</p>
              </UTooltip>

              <UTooltip v-if="row.isAWSStdEnv" text="Standard AWS Environment">
                <UBadge color="orange" size="xs">SAWSE</UBadge>
              </UTooltip>

              <UBadge v-if="row.dataType" :color="getDataTypeColor(row.dataType)" size="xs" class="w-fit">
                <UIcon name="i-heroicons-shield-check" class="w-3 h-3" />
                {{ row.dataType }}
              </UBadge>

            </div>
          </template>

          <!-- Admins column -->
          <template #admins-data="{ row }">
            <div v-if="row.primaryAccountAdminName || row.primaryAccountAdminUsername.replace('.', ' ')"
              class="flex items-center">
              <UIcon name="i-heroicons-user" class="mr-1" />
              <span>{{ row.primaryAccountAdminName || row.primaryAccountAdminUsername.replace('.', ' ') }}</span>
            </div>
            <div v-if="row.delegateAccountAdminName || row.delegateAccountAdminUsername.replace('.', ' ')"
              class="flex items-center">
              <UIcon name="i-heroicons-user-plus" class="mr-1" />
              <span>{{ row.delegateAccountAdminName || row.delegateAccountAdminUsername.replace('.', ' ') }}</span>
            </div>
            <div v-if="row.costManagerName || row.costManagerUsername.replace('.', ' ')" class="flex items-center">
              <UIcon name="i-heroicons-currency-dollar" class="mr-1" />
              <span>{{ row.costManagerName || row.costManagerUsername.replace('.', ' ') }}</span>
            </div>
          </template>

          <!-- LOB column -->
          <template #lineOfBusiness-data="{ row }">
            <p>{{ row.linesOfBusiness || "IT" }}</p>
          </template>

          <!-- Cost Center column -->
          <template #costCenter-data="{ row }">
            <p>{{ row.costCenter || '—' }}</p>
          </template>

          <!-- Department column -->
          <template #departmentNumber-data="{ row }">
            <p>{{ row.departmentNumber || '—' }}</p>
          </template>

          <!-- Region column -->
          <template #region-data="{ row }">
            <p>{{ row.region || '—' }}</p>
          </template>

          <!-- Platform Type column -->
          <template #platformType-data="{ row }">
            <UBadge v-if="row.platformType" color="blue" variant="subtle" size="xs">
              {{ row.platformType }}
            </UBadge>
            <span v-else>—</span>
          </template>

          <!-- Project Type column -->
          <template #projectType-data="{ row }">
            <UBadge v-if="row.projectType" color="purple" variant="subtle" size="xs">
              {{ row.projectType }}
            </UBadge>
            <span v-else>—</span>
          </template>

          <!-- Technical Contact column -->
          <template #technicalContact-data="{ row }">
            <p class="text-sm">{{ row.technicalContact || '—' }}</p>
          </template>

          <!-- Business Contact column -->
          <template #businessContact-data="{ row }">
            <p class="text-sm">{{ row.businessContact || '—' }}</p>
          </template>

          <!-- Intended Use column -->
          <template #intendedUse-data="{ row }">
            <p class="text-sm truncate max-w-xs" :title="row.intendedUse">
              {{ row.intendedUse || '—' }}
            </p>
          </template>

          <!-- Modified Date column -->
          <template #modifiedDate-data="{ row }">
            <p class="text-sm">{{ row.modifiedDate ? new Date(row.modifiedDate).toLocaleDateString() : '—' }}</p>
          </template>

          <!-- Actions column -->
          <template #actions-data="{ row }">
            <div class="flex items-center gap-1">
              <!-- Favorite button -->
              <UButton
                :icon="isFavorite(row.awsStandardAccountID) ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
                :color="isFavorite(row.awsStandardAccountID) ? 'yellow' : 'gray'"
                variant="ghost"
                size="xs"
                @click="toggleFavorite(row.awsStandardAccountID)"
                :title="isFavorite(row.awsStandardAccountID) ? 'Remove from favorites' : 'Add to favorites'"
              />

              <!-- More actions -->
              <UDropdown :items="getActionItems(row)">
                <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-vertical" size="xs" />
              </UDropdown>
            </div>
          </template>

          </UTable>
        </div>

        <!-- Pagination - Sticky at bottom -->
        <div v-if="itemsPerPage < 999999" class="flex-shrink-0 flex justify-end p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <UPagination v-model="page" :page-count="itemsPerPage" :total="filteredRows.length" />
        </div>
        <template #fallback>
          <div class="flex justify-center items-center h-full">
            <div class="text-center">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
              <p class="text-gray-500 dark:text-gray-400">Loading enclaves...</p>
            </div>
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- Filter Slide-Over Panel -->
    <USlideover v-model="showFilterPanel" side="right">
      <div class="p-4 h-full flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Filters</h2>
          <div class="flex items-center gap-2">
            <UButton @click="resetFilters" variant="ghost" size="sm" icon="i-heroicons-arrow-path">
              Reset
            </UButton>
            <UButton @click="showFilterPanel = false" variant="ghost" size="sm" icon="i-heroicons-x-mark" />
          </div>
        </div>

        <!-- Filter Content -->
        <div class="flex-1 overflow-y-auto space-y-6">
          <!-- Search Section -->
          <div>
            <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Search</h3>
            <div class="space-y-2">
              <USelect v-model="searchScope" :options="searchScopeOptions" size="sm" />
              <UInput
                v-model="search"
                :placeholder="`Search ${searchScope}...`"
                icon="i-heroicons-magnifying-glass"
                size="sm"
              />
            </div>
          </div>

          <!-- Checkboxes Section -->
          <div>
            <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Quick Filters</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <label class="text-sm text-gray-600 dark:text-gray-400">SAWSE</label>
                <UCheckbox v-model="sawseCheckbox" />
              </div>
              <div class="flex items-center justify-between">
                <label class="text-sm text-gray-600 dark:text-gray-400">My Enclaves</label>
                <UCheckbox v-model="myEnclavesCheckbox" />
              </div>
              <div class="flex items-center justify-between">
                <label class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <UIcon name="i-heroicons-star-solid" class="w-3 h-3 text-yellow-500" />
                  Favorites Only
                </label>
                <div class="flex items-center gap-2">
                  <UCheckbox v-model="favoritesCheckbox" />
                  <NuxtLink to="/support/docs?topic=favorites-guide" target="_blank">
                    <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 hover:text-gray-300" />
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>

          <!-- Advanced Filters Section -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Advanced Filters</h3>
              <UButton
                size="xs"
                variant="ghost"
                icon="i-heroicons-plus"
                @click="showFilterModal = true"
              >
                Add
              </UButton>
            </div>

            <!-- Active Filter Chips -->
            <div v-if="activeFilterCount > 0" class="space-y-2 mb-4">
              <UBadge
                v-for="chip in activeFilters"
                :key="chip.field"
                color="primary"
                variant="subtle"
                class="mr-2 mb-2"
              >
                <div class="flex items-center gap-1">
                  <span class="text-xs">{{ getFilterChipText(chip.field, getFilterConfig(chip.field)) }}</span>
                  <UButton
                    icon="i-heroicons-x-mark"
                    color="primary"
                    variant="ghost"
                    size="2xs"
                    @click="clearFilter(chip.field)"
                  />
                </div>
              </UBadge>
            </div>

            <p v-else class="text-sm text-gray-500 dark:text-gray-400 italic">
              No advanced filters applied
            </p>
          </div>
        </div>

        <!-- Footer: Active Count -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-600 dark:text-gray-400">
              {{ totalActiveFilters }} filters active
            </span>
            <UButton size="sm" @click="showFilterPanel = false" color="primary">
              Apply
            </UButton>
          </div>
        </div>
      </div>
    </USlideover>

    <!-- Add Filter Modal (reuse existing) -->
    <ClientOnly>
      <AddFilterModal
        v-model="showFilterModal"
        :enclaves="enclaveStore.enclaves"
        @filter-selected="handleFilterSelected"
      />

      <!-- Filter Edit Dialog (reuse existing) -->
      <UModal v-model="showFilterEditDialog" v-if="editingFilter">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">{{ editingFilter.label }}</h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" size="sm" @click="showFilterEditDialog = false" />
          </div>
        </template>

        <div class="space-y-4">
          <!-- Multi-select -->
          <div v-if="editingFilter.type === 'select-multi'">
            <label class="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
              Select one or more {{ editingFilter.label.toLowerCase() }} values
            </label>
            <USelectMenu
              :model-value="(filterState[editingFilter.field] as string[]) || []"
              @update:model-value="setFilter(editingFilter.field, $event)"
              :options="getFilterOptions(editingFilter.field)"
              multiple
              :placeholder="`Select ${editingFilter.label}`"
            />
          </div>

          <!-- Single select -->
          <div v-else-if="editingFilter.type === 'select'">
            <label class="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
              Select a {{ editingFilter.label.toLowerCase() }} value
            </label>
            <USelectMenu
              :model-value="(filterState[editingFilter.field] as string[])?.[0] || null"
              @update:model-value="setFilter(editingFilter.field, $event ? [$event] : [])"
              :options="['', ...getFilterOptions(editingFilter.field)]"
              :placeholder="`Select ${editingFilter.label}`"
            />
          </div>

          <!-- Boolean -->
          <div v-else-if="editingFilter.type === 'boolean'">
            <label class="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
              Filter by {{ editingFilter.label.toLowerCase() }}
            </label>
            <div class="flex gap-2">
              <UButton
                variant="solid"
                :color="filterState[editingFilter.field] === null || filterState[editingFilter.field] === undefined ? 'emerald' : 'gray'"
                @click="setFilter(editingFilter.field, null)"
              >
                Any
              </UButton>
              <UButton
                variant="solid"
                :color="filterState[editingFilter.field] === true ? 'emerald' : 'gray'"
                @click="setFilter(editingFilter.field, true)"
              >
                Yes
              </UButton>
              <UButton
                variant="solid"
                :color="filterState[editingFilter.field] === false ? 'emerald' : 'gray'"
                @click="setFilter(editingFilter.field, false)"
              >
                No
              </UButton>
            </div>
          </div>

          <!-- Text -->
          <div v-else-if="editingFilter.type === 'text'">
            <label class="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
              Filter by {{ editingFilter.label.toLowerCase() }}
            </label>
            <UInput
              :model-value="(filterState[editingFilter.field] as string) || ''"
              @update:model-value="setFilter(editingFilter.field, $event || '')"
              :placeholder="`Enter ${editingFilter.label.toLowerCase()}...`"
            />
          </div>

          <div class="text-xs text-gray-500 dark:text-gray-400">
            {{ editingFilter.description }}
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showFilterEditDialog = false">
              Done
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { advancedFilterConfigs, getFiltersByCategory, getUniqueFieldValues } from '~/utils/advancedFilterConfig'
import AddFilterModal from '~/components/accounts/AddFilterModal.vue'

const enclaveStore = useEnclaveStore()
const userGroupStore = useUserGroupStore()
const { favoriteIds, toggleFavorite, isFavorite } = useFavoriteAccounts()
const { filterState, setFilter, clearFilter, clearAllFilters, activeFilterCount, activeFilters, getFilterChipText, matchesAdvancedFilters } = useAdvancedFilters()
const loading = ref(false)

// Modal state
const showFilterModal = ref(false)
const showFilterPanel = ref(false)

// search + filters - MUST be defined before totalActiveFilters uses them
const search = ref('')
const searchScope = ref<'All Fields' | 'Project Name' | 'Personnel' | 'Account IDs'>('All Fields')
const searchScopeOptions = ['All Fields', 'Project Name', 'Personnel', 'Account IDs']
const statusFilter = ref<'All' | 'Active' | 'Decommissioned'>('Active')
const statusOptions: ('All' | 'Active' | 'Decommissioned')[] = ['All', 'Active', 'Decommissioned']
const envFilter = ref<'All' | 'Commercial Only' | 'GovCloud Paired'>('All')
const envOptions: ('All' | 'Commercial Only' | 'GovCloud Paired')[] = ['All', 'Commercial Only', 'GovCloud Paired']
const lobFilter = ref<'All' | 'MSS' | 'SIS' | 'Cyber' | 'SC&I' | 'LAS' | 'IT'>('All')
const lobOptions = ['All', 'MSS', 'SIS', 'Cyber', 'SC&I', 'LAS', 'IT']
const sawseCheckbox = ref<boolean>(false)
const myEnclavesCheckbox = ref<boolean>(false)
const favoritesCheckbox = ref<boolean>(false)

// Total active filters (for badge) - NOW defined after all refs it depends on
const totalActiveFilters = computed(() => {
  let count = 0

  // Count basic filters
  if (lobFilter.value !== 'All') count++
  if (statusFilter.value !== 'Active') count++ // Default is Active
  if (envFilter.value !== 'All') count++
  if (sawseCheckbox.value) count++
  if (myEnclavesCheckbox.value) count++
  if (favoritesCheckbox.value) count++
  if (search.value) count++

  // Add advanced filters
  count += activeFilterCount.value

  return count
})

// Advanced filters
const filtersByCategory = getFiltersByCategory()

// Helper to get unique values for select filters
const getFilterOptions = (field: keyof AWSEnclaveData) => {
  return getUniqueFieldValues(enclaveStore.enclaves, field)
}

// Helper to get filter config by field
const getFilterConfig = (field: string) => {
  return advancedFilterConfigs.find(c => c.field === field)
}

// Handle filter selection from modal
const handleFilterSelected = (config: any) => {
  // Set initial value based on filter type
  if (config.type === 'boolean') {
    setFilter(config.field, null) // Start with "Any"
  } else if (config.type === 'select-multi' || config.type === 'select') {
    setFilter(config.field, [])
  } else if (config.type === 'text') {
    setFilter(config.field, '')
  }
  showFilterModal.value = false

  // Open an edit dialog for the filter
  setTimeout(() => {
    openFilterEditDialog(config)
  }, 100)
}

// Track which filter is being edited
const editingFilter = ref<any>(null)
const showFilterEditDialog = ref(false)

// Open filter edit dialog
const openFilterEditDialog = (config: any) => {
  editingFilter.value = config
  showFilterEditDialog.value = true
}

// Column selection and pagination
// All columns including actions (which is always visible)
const allTableColumns = [
  { key: 'projectName', label: 'Project Name' },
  { key: 'accountIds', label: 'Account IDs' },
  { key: 'platformInfo', label: 'Platform Info' },
  { key: 'admins', label: 'Admins' },
  { key: 'lineOfBusiness', label: 'LOB' },
  { key: 'costCenter', label: 'Cost Center' },
  { key: 'departmentNumber', label: 'Department' },
  { key: 'region', label: 'Region' },
  { key: 'platformType', label: 'Platform Type' },
  { key: 'projectType', label: 'Project Type' },
  { key: 'technicalContact', label: 'Technical Contact' },
  { key: 'businessContact', label: 'Business Contact' },
  { key: 'intendedUse', label: 'Intended Use' },
  { key: 'modifiedDate', label: 'Modified Date' },
  { key: 'actions', label: '' }
]

// Columns available in selector (excludes actions)
const availableColumns = allTableColumns.filter(col => col.key !== 'actions')

// Default selected columns (actions not included as it's always shown)
const selectedColumns = ref(['projectName', 'accountIds', 'platformInfo', 'admins', 'lineOfBusiness'])

// Compute visible columns based on selection + always include actions at the end
const columns = computed(() => {
  const selected = allTableColumns.filter(col => 
    selectedColumns.value.includes(col.key) || col.key === 'actions'
  )
  return selected
})

// Items per page
const itemsPerPageOptions = [
  { value: 10, label: '10 / page' },
  { value: 25, label: '25 / page' },
  { value: 50, label: '50 / page' },
  { value: 100, label: '100 / page' },
  { value: 999999, label: 'All' }
]
const itemsPerPage = ref(25)

// Pagination
const page = ref(1)

const getActionItems = (account: AWSEnclaveData) => {
  // Always use commercial account ID for navigation (primary identifier)
  const accountId = account.awsStandardAccountID

  const actionItems: any = [
    [
      {
        label: 'Account Details',
        icon: 'i-heroicons-document-text',
        to: `/account/${accountId}`,
        description: 'View full account details and overview'
      },
    ],
  ]

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

  if (utilityActions.length > 0) {
    actionItems.push(utilityActions)
  }

  return actionItems
}

const getDataTypeColor = (dataType?: string) => {
  if (!dataType) return 'gray';

  const typeLower = dataType.toLowerCase();
  if (typeLower.includes('pii') || typeLower.includes('personal')) return 'amber';
  if (typeLower.includes('public')) return 'green';
  if (typeLower.includes('sensitive') || typeLower.includes('confidential')) return 'red';
  if (typeLower.includes('internal')) return 'blue';

  return 'indigo';
}

const allRows = computed(() => Object.values(enclaveStore.enclaves || {}))

const filteredRows = computed(() => {
  const query = search.value.toLowerCase()

  return allRows.value.filter(e => {
    let valuesToSearch: (string | undefined)[] = []

    if (searchScope.value === 'All Fields') {
      valuesToSearch = [
        e.projectName,
        e.awsStandardAccountID,
        e.awsGovCloudAccountID,
        e.linesOfBusiness,
        e.accountStatus,
        e.primaryAccountAdminName,
        e.primaryAccountAdminUsername,
        e.primaryAccountAdminUsername?.replace('.', ' '),
        e.delegateAccountAdminName,
        e.delegateAccountAdminUsername,
        e.delegateAccountAdminUsername?.replace('.', ' '),
        e.costManagerName,
        e.costManagerUsername,
        e.costManagerUsername?.replace('.', ' '),
      ]
    }

    if (searchScope.value === 'Project Name') {
      valuesToSearch = [
        e.projectName
      ]
    }

    if (searchScope.value === 'Personnel') {
      valuesToSearch = [
        e.primaryAccountAdminName,
        e.primaryAccountAdminUsername,
        e.primaryAccountAdminUsername?.replace('.', ' '),
        e.delegateAccountAdminName,
        e.delegateAccountAdminUsername,
        e.delegateAccountAdminUsername?.replace('.', ' '),
        e.costManagerName,
        e.costManagerUsername,
        e.costManagerUsername?.replace('.', ' '),
      ]
    }

    if (searchScope.value === 'Account IDs') {
      valuesToSearch = [
        e.awsStandardAccountID,
        e.awsGovCloudAccountID
      ]
    }

    const matchesSearch = !query || valuesToSearch.some(val => String(val || '').toLowerCase().includes(query))

    const matchesStatus =
      statusFilter.value === 'All' ||
      (statusFilter.value === 'Active' && e.enclaveStatus !== 'Decommissioned') ||
      (statusFilter.value === 'Decommissioned' && e.enclaveStatus === 'Decommissioned')

    const matchesEnvironment =
      envFilter.value === 'All' ||
      (envFilter.value === 'GovCloud Paired' && e.awsGovCloudAccountID !== '') ||
      (envFilter.value === 'Commercial Only' && e.awsGovCloudAccountID === '')

    const matchesLOB =
      lobFilter.value === 'All' ||
      (lobFilter.value === (e.linesOfBusiness ?? 'IT'))

    const matchesSAWSE =
      sawseCheckbox.value === false ||
      e.isAWSStdEnv

    const matchesMyEnclaves =
      myEnclavesCheckbox.value === false ||
      Object.keys(userGroupStore.myEnclaves).some(accountId => accountId === e.awsStandardAccountID)

    const matchesFavorites =
      favoritesCheckbox.value === false ||
      isFavorite(e.awsStandardAccountID)

    // Apply advanced filters
    const matchesAdvancedFiltersCheck = matchesAdvancedFilters(e)

    return matchesSearch && matchesStatus && matchesEnvironment && matchesLOB && matchesSAWSE && matchesMyEnclaves && matchesFavorites && matchesAdvancedFiltersCheck
  })
})

const paginatedRows = computed(() => {
  const perPage = itemsPerPage.value
  if (perPage >= 999999) return filteredRows.value // Show all
  const start = (page.value - 1) * perPage
  return filteredRows.value.slice(start, start + perPage)
})

// Reset to page 1 when filters change the result set
watch(filteredRows, () => {
  page.value = 1
})

function resetFilters() {
  search.value = ''
  searchScope.value = 'All Fields'
  statusFilter.value = 'Active'
  envFilter.value = 'All'
  lobFilter.value = 'All'
  sawseCheckbox.value = false
  myEnclavesCheckbox.value = false
  favoritesCheckbox.value = false
  clearAllFilters() // Clear advanced filters too
}

</script>
