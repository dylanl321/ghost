<template>
  <UCard class="bg-gray-900 border border-gray-700">
    <template #header>
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-semibold">Filters</h3>
          <UBadge v-if="hasActiveFilterBadges" color="primary" variant="solid" size="sm">
            {{ activeFilterBadges.length }} active
          </UBadge>
        </div>
        <div class="flex items-center gap-2">
          <UButton color="gray" variant="ghost" icon="i-heroicons-funnel" :loading="isResetting"
            :disabled="!hasActiveFilterBadges" @click="resetFilters">
            Reset
          </UButton>
          <UButton color="gray" variant="ghost" :icon="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" @click="toggleExpanded">
            {{ isExpanded ? 'Collapse' : 'Expand' }}
          </UButton>
        </div>
      </div>
    </template>

    <div v-if="isExpanded" class="p-4 space-y-4">
      <!-- Active Filters Display -->
      <div v-if="activeFilterBadges.length > 0" class="flex flex-wrap gap-2 mb-4">
        <UBadge 
          v-for="filter in activeFilterBadges" 
          :key="filter.id" 
          :color="filter.color" 
          variant="solid" 
          size="sm"
        >
          {{ filter.label }}
          <UIcon 
            v-if="filter.id !== 'status' && filter.id !== 'type'" 
            name="i-heroicons-x-mark" 
            class="ml-1 w-3 h-3 cursor-pointer" 
            @click="resetFilters"
          />
        </UBadge>
      </div>

      <!-- Quick Filters -->
      <div class="flex flex-wrap items-center gap-3 mb-2">
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-400">Status:</span>
          <div class="flex items-center gap-1">
            <UButton 
              size="xs" 
              :color="accountStatusFilter === 'active' ? 'green' : 'gray'" 
              :variant="accountStatusFilter === 'active' ? 'solid' : 'ghost'"
              @click="setAccountStatusFilter('active')"
            >
              Active
            </UButton>
            <UButton 
              size="xs" 
              :color="accountStatusFilter === 'decommissioned' ? 'red' : 'gray'" 
              :variant="accountStatusFilter === 'decommissioned' ? 'solid' : 'ghost'"
              @click="setAccountStatusFilter('decommissioned')"
            >
              Decommissioned
            </UButton>
            <UButton 
              size="xs" 
              :color="accountStatusFilter === 'all' ? 'blue' : 'gray'" 
              :variant="accountStatusFilter === 'all' ? 'solid' : 'ghost'"
              @click="setAccountStatusFilter('all')"
            >
              All
            </UButton>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-400">Type:</span>
          <div class="flex items-center gap-1">
            <UButton 
              size="xs" 
              :color="accountTypeFilter === 'commercial' ? 'orange' : 'gray'" 
              :variant="accountTypeFilter === 'commercial' ? 'solid' : 'ghost'"
              @click="setAccountTypeFilter('commercial')"
            >
              Commercial
            </UButton>
            <UButton 
              size="xs" 
              :color="accountTypeFilter === 'govcloud' ? 'blue' : 'gray'" 
              :variant="accountTypeFilter === 'govcloud' ? 'solid' : 'ghost'"
              @click="setAccountTypeFilter('govcloud')"
            >
              GovCloud
            </UButton>
            <UButton 
              size="xs" 
              :color="accountTypeFilter === 'all' ? 'blue' : 'gray'" 
              :variant="accountTypeFilter === 'all' ? 'solid' : 'ghost'"
              @click="setAccountTypeFilter('all')"
            >
              All
            </UButton>
          </div>
        </div>
      </div>

      <!-- Search bar and user-specific filters in the first row -->
      <div class="flex flex-wrap gap-4">
        <div class="flex-1 min-w-[300px]">
          <div class="space-y-2">
            <div class="flex gap-2">
              <USelect 
                :model-value="searchType" 
                @update:model-value="$emit('update:searchType', $event)"
                :options="searchTypeOptions" 
                class="w-40" 
              />
              <UInput 
                :model-value="searchQuery" 
                @update:model-value="$emit('update:searchQuery', $event)"
                :placeholder="searchPlaceholder" 
                icon="i-heroicons-magnifying-glass"
                class="w-full" 
                :loading="searchLoading" 
                clearable
              >
                <template #loading>
                  <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
                </template>
              </UInput>
            </div>
          </div>
        </div>

        <div class="flex items-center">
          <UCheckbox 
            :model-value="showMyAccounts" 
            @update:model-value="$emit('update:showMyAccounts', $event)" 
            label="Show only my accounts" 
          />
          <UTooltip text="Shows accounts where you are listed as an admin">
            <UButton color="gray" variant="ghost" icon="i-heroicons-information-circle" size="xs" />
          </UTooltip>
        </div>
      </div>

      <!-- Advanced filters section -->
      <div class="pt-4 border-t border-gray-700">
        <button 
          @click="isAdvancedFiltersOpen = !isAdvancedFiltersOpen"
          class="flex items-center gap-2 py-2 px-0 text-left text-gray-400 hover:text-white focus:outline-none"
        >
          <span class="text-sm font-medium">Advanced Filters</span>
          <UIcon :name="isAdvancedFiltersOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-4 h-4" />
        </button>
        
        <div v-if="isAdvancedFiltersOpen" class="pt-4">
          <!-- Advanced Search -->
          <div class="flex gap-2">
            <USelect 
              :model-value="selectedAttributeLocal" 
              @update:model-value="selectedAttributeLocal = $event"
              :options="attributeOptions" 
              placeholder="Select attribute..."
              class="w-1/3" 
              searchable 
            />

            <UInput 
              :model-value="attributeValueLocal"
              @update:model-value="attributeValueLocal = $event"
              :placeholder="selectedAttributeLocal ? `Search ${formatAccountColumn(selectedAttributeLocal)}...` : 'Select an attribute first'"
              :disabled="!selectedAttributeLocal" 
              class="flex-1" 
              clearable 
              @keyup.enter="addFilterValue"
            >
              <template #append>
                <UButton color="gray" variant="ghost" icon="i-heroicons-plus" :disabled="!canAddFilterValue"
                  @click="addFilterValue" />
              </template>
            </UInput>
          </div>
          
          <!-- Debug Info - Only visible in development mode -->
          <div v-if="isDevelopment" class="mt-2 text-xs text-gray-400">
            {{ attributeOptions.length }} properties available for filtering
          </div>

          <!-- Active Filters -->
          <div v-if="activeFilterValues.length > 0" class="flex flex-wrap gap-2 pt-4">
            <UBadge 
              v-for="filter in activeFilterValues" 
              :key="filter.id" 
              :color="filter.color as any" 
              class="cursor-pointer"
              @click="removeFilterValue(filter.id)"
            >
              {{ filter.label }}
              <UIcon name="i-heroicons-x-mark" class="ml-1 w-3 h-3" />
            </UBadge>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="p-4">
      <!-- Compact filter display when collapsed -->
      <div class="flex flex-wrap items-center gap-3">
        <!-- Status filter buttons -->
        <div class="flex items-center gap-1">
          <UButton 
            size="xs" 
            :color="accountStatusFilter === 'active' ? 'green' : 'gray'" 
            :variant="accountStatusFilter === 'active' ? 'solid' : 'ghost'"
            @click="setAccountStatusFilter('active')"
          >
            Active
          </UButton>
          <UButton 
            size="xs" 
            :color="accountStatusFilter === 'decommissioned' ? 'red' : 'gray'" 
            :variant="accountStatusFilter === 'decommissioned' ? 'solid' : 'ghost'"
            @click="setAccountStatusFilter('decommissioned')"
          >
            Decommissioned
          </UButton>
        </div>

        <!-- Type filter buttons -->
        <div class="flex items-center gap-1">
          <UButton 
            size="xs" 
            :color="accountTypeFilter === 'commercial' ? 'orange' : 'gray'" 
            :variant="accountTypeFilter === 'commercial' ? 'solid' : 'ghost'"
            @click="setAccountTypeFilter('commercial')"
          >
            Commercial
          </UButton>
          <UButton 
            size="xs" 
            :color="accountTypeFilter === 'govcloud' ? 'blue' : 'gray'" 
            :variant="accountTypeFilter === 'govcloud' ? 'solid' : 'ghost'"
            @click="setAccountTypeFilter('govcloud')"
          >
            GovCloud
          </UButton>
        </div>

        <!-- Show my accounts checkbox -->
        <UCheckbox 
          :model-value="showMyAccounts" 
          @update:model-value="$emit('update:showMyAccounts', $event)" 
          label="My accounts" 
        />

        <!-- Search input -->
        <div class="flex-1">
          <UInput 
            :model-value="searchQuery" 
            @update:model-value="$emit('update:searchQuery', $event)"
            :placeholder="searchPlaceholder" 
            icon="i-heroicons-magnifying-glass"
            class="w-full" 
            :loading="searchLoading" 
            clearable 
            size="sm" 
          />
        </div>
        
        <!-- Active filters badges -->
        <div v-if="hasActiveFilterBadges && activeFilterBadges && activeFilterBadges.length > 0" class="flex flex-wrap items-center gap-1">
          <UBadge v-for="filter in activeFilterBadges.slice(0, 2)" :key="filter.id" :color="filter.color as any" size="xs">
            {{ filter.label }}
          </UBadge>
          <UBadge v-if="activeFilterBadges.length > 2" color="gray" size="xs">
            +{{ activeFilterBadges.length - 2 }} more
          </UBadge>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSearch } from '~/composables/useSearch'
import { useFilters } from '~/composables/useFilters'
import { formatAccountColumn } from '~/utils/accountHelpers'

const props = defineProps<{
  searchType: string
  searchQuery: string
  accountStatusFilter: string
  accountTypeFilter: string
  showMyAccounts: boolean
  isDevelopment?: boolean
}>()

const emit = defineEmits<{
  'update:searchType': [value: string]
  'update:searchQuery': [value: string]
  'update:accountStatusFilter': [value: string]
  'update:accountTypeFilter': [value: string]
  'update:showMyAccounts': [value: boolean]
  'filter-changed': []
  'reset-filters': []
}>()

// Local refs for v-model syncing
const isExpanded = ref(false)
const isAdvancedFiltersOpen = ref(false)
const isResetting = ref(false)
const selectedAttributeLocal = ref('')
const attributeValueLocal = ref('')
const activeFilterValues = ref<Array<{id: string, field: string, value: any, label: string, color: string}>>([])

// Import search composable
const {
  searchTypeOptions,
  searchPlaceholder,
  searchLoading,
  formatAttributeName
} = useSearch()

// Import filters composable  
const {
  hasActiveFilters,
  activeFilters: filterState,
  addAttributeFilter,
  removeFilter
} = useFilters()

// Define attribute options for the filter dropdown
const attributeOptions = computed(() => {
  return [
    { label: 'Project Name', value: 'projectName' },
    { label: 'Account Alias', value: 'accountAlias' },
    { label: 'AWS Account ID', value: 'awsStandardAccountID' },
    { label: 'GovCloud Account ID', value: 'awsGovCloudAccountID' },
    { label: 'Line of Business', value: 'lineOfBusiness' },
    { label: 'Department', value: 'department' },
    { label: 'Primary Admin', value: 'primaryAccountAdminName' },
    { label: 'Delegate Admin', value: 'delegateAccountAdminName' },
    { label: 'Cost Manager', value: 'costManagerName' },
    { label: 'Project Number', value: 'projectNumber' },
    { label: 'Department Number', value: 'departmentNumber' },
    { label: 'Environment', value: 'environment' }
  ]
})

// Computed for enable/disable Add button
const canAddFilterValue = computed(() => {
  return !!selectedAttributeLocal.value && !!attributeValueLocal.value.trim()
})

// Active filters computed property
const activeFilterBadges = computed(() => {
  const filters = []
  
  // Add status filter if active
  if (props.accountStatusFilter !== 'all') {
    filters.push({
      id: 'status',
      label: `Status: ${props.accountStatusFilter === 'active' ? 'Active' : 'Decommissioned'}`,
      color: props.accountStatusFilter === 'active' ? 'green' : 'red'
    })
  }
  
  // Add type filter if active
  if (props.accountTypeFilter !== 'all') {
    filters.push({
      id: 'type',
      label: `Type: ${props.accountTypeFilter === 'commercial' ? 'Commercial' : 'GovCloud'}`,
      color: props.accountTypeFilter === 'commercial' ? 'orange' : 'blue'
    })
  }
  
  // Add search filter if active
  if (props.searchQuery) {
    filters.push({
      id: 'search',
      label: `Search: ${props.searchQuery} (${props.searchType})`,
      color: 'primary'
    })
  }
  
  // Add "My Accounts" filter if active
  if (props.showMyAccounts) {
    filters.push({
      id: 'my-accounts',
      label: 'My Accounts Only',
      color: 'purple'
    })
  }
  
  return filters
})

// Computed property for active filters count
const hasActiveFilterBadges = computed(() => activeFilterBadges.value.length > 0)

// Methods
const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
}

const setAccountStatusFilter = (value: string) => {
  emit('update:accountStatusFilter', value)
  emit('filter-changed')
}

const setAccountTypeFilter = (value: string) => {
  emit('update:accountTypeFilter', value)
  emit('filter-changed')
}

const addFilterValue = () => {
  if (!selectedAttributeLocal.value || !attributeValueLocal.value.trim()) return
  
  const id = `${selectedAttributeLocal.value}-${Date.now()}`
  activeFilterValues.value.push({
    id,
    field: selectedAttributeLocal.value,
    value: attributeValueLocal.value,
    label: `${formatAccountColumn(selectedAttributeLocal.value)}: ${attributeValueLocal.value}`,
    color: 'blue'
  })
  
  // Clear the input
  attributeValueLocal.value = ''
  
  emit('filter-changed')
}

const removeFilterValue = (id: string) => {
  const index = activeFilterValues.value.findIndex(f => f.id === id)
  if (index >= 0) {
    activeFilterValues.value.splice(index, 1)
    emit('filter-changed')
  }
}

const resetFilters = async () => {
  isResetting.value = true
  emit('reset-filters')
  await new Promise(resolve => setTimeout(resolve, 300))
  isResetting.value = false
}

// Watch for URL parameter changes
watch(() => props.accountStatusFilter, (newValue) => {
  if (newValue !== 'all') {
    isExpanded.value = true
  }
})

watch(() => props.accountTypeFilter, (newValue) => {
  if (newValue !== 'all') {
    isExpanded.value = true
  }
})

watch(() => props.searchQuery, (newValue) => {
  if (newValue) {
    isExpanded.value = true
  }
})

watch(() => props.showMyAccounts, (newValue) => {
  if (newValue) {
    isExpanded.value = true
  }
})

// Add clickable LOB and DEP filters
const addLobFilter = (lob: string) => {
  if (!lob) return
  const id = `lob-${Date.now()}`
  activeFilterValues.value.push({
    id,
    field: 'lineOfBusiness',
    value: lob,
    label: `LOB: ${lob}`,
    color: 'blue'
  })
  emit('filter-changed')
}

const addDepFilter = (dep: string) => {
  if (!dep) return
  const id = `dep-${Date.now()}`
  activeFilterValues.value.push({
    id,
    field: 'department',
    value: dep,
    label: `DEP: ${dep}`,
    color: 'blue'
  })
  emit('filter-changed')
}

// Expose properties and methods to parent component
defineExpose({
  activeFilterValues,
  resetFilters,
  addLobFilter,
  addDepFilter
})
</script> 