/**
 * Composable for managing advanced filters in the Enclave Explorer
 *
 * Provides reactive filter state and filtering logic that can be applied
 * to enclave data based on the filter configuration.
 */

import { ref, computed } from 'vue'
import type { FilterConfig } from '~/utils/advancedFilterConfig'

// Filter state types
export interface FilterState {
  // Select filters store array of selected values
  [key: string]: string[] | boolean | null | undefined
}

export function useAdvancedFilters() {
  // Filter state - stores the current filter values
  const filterState = ref<FilterState>({})

  // Track if advanced filters section is expanded
  const isExpanded = ref(false)

  /**
   * Set a filter value
   */
  function setFilter(field: string, value: string[] | boolean | null) {
    filterState.value[field] = value
  }

  /**
   * Clear a specific filter
   */
  function clearFilter(field: string) {
    delete filterState.value[field]
  }

  /**
   * Clear all advanced filters
   */
  function clearAllFilters() {
    filterState.value = {}
  }

  /**
   * Get display text for a filter chip
   */
  function getFilterChipText(field: string, config: any): string {
    const value = filterState.value[field]
    if (value === null || value === undefined) return ''

    const label = config?.label || field

    // Handle arrays (multi-select)
    if (Array.isArray(value)) {
      if (value.length === 0) return ''
      if (value.length === 1) return `${label}: ${value[0]}`
      return `${label}: ${value.length} selected`
    }

    // Handle boolean
    if (typeof value === 'boolean') {
      return `${label}: ${value ? 'Yes' : 'No'}`
    }

    // Handle text
    if (typeof value === 'string' && value.length > 0) {
      return `${label}: ${value.length > 20 ? value.substring(0, 20) + '...' : value}`
    }

    return ''
  }

  /**
   * Get all active filters as chips with metadata
   */
  const activeFilters = computed(() => {
    const chips: Array<{ field: string; text: string; value: any }> = []

    Object.entries(filterState.value).forEach(([field, value]) => {
      // Skip empty values
      if (value === null || value === undefined) return
      if (Array.isArray(value) && value.length === 0) return
      if (typeof value === 'string' && value === '') return

      chips.push({
        field,
        text: '', // Will be filled by component with config
        value
      })
    })

    return chips
  })

  /**
   * Count of active filters (filters that have values set)
   */
  const activeFilterCount = computed(() => {
    let count = 0
    Object.entries(filterState.value).forEach(([_, value]) => {
      // Count filter as active if it has a value
      if (value !== null && value !== undefined) {
        // For arrays, only count if not empty
        if (Array.isArray(value)) {
          if (value.length > 0) count++
        }
        // For booleans, only count if not null (null means "Any")
        else if (typeof value === 'boolean') {
          count++
        }
        // For strings/other
        else if (value !== '') {
          count++
        }
      }
    })
    return count
  })

  /**
   * Check if an enclave matches the current advanced filters
   */
  function matchesAdvancedFilters(enclave: AWSEnclaveData): boolean {
    // If no filters are active, match all
    if (activeFilterCount.value === 0) {
      return true
    }

    // Check each active filter
    for (const [field, filterValue] of Object.entries(filterState.value)) {
      // Skip if filter has no value
      if (filterValue === null || filterValue === undefined) continue

      const enclaveValue = enclave[field as keyof AWSEnclaveData]

      // Handle array filters (multi-select)
      if (Array.isArray(filterValue)) {
        if (filterValue.length === 0) continue // Empty array means no filter

        // Check if enclave value matches any of the selected values
        if (!filterValue.some(fv => String(enclaveValue) === fv)) {
          return false
        }
      }
      // Handle boolean filters
      else if (typeof filterValue === 'boolean') {
        if (enclaveValue !== filterValue) {
          return false
        }
      }
      // Handle text filters (contains match, case-insensitive)
      else if (typeof filterValue === 'string') {
        if (!String(enclaveValue || '').toLowerCase().includes(filterValue.toLowerCase())) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Apply advanced filters to a list of enclaves
   */
  function applyFilters(enclaves: AWSEnclaveData[]): AWSEnclaveData[] {
    if (activeFilterCount.value === 0) {
      return enclaves
    }

    return enclaves.filter(matchesAdvancedFilters)
  }

  return {
    filterState,
    isExpanded,
    setFilter,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    activeFilters,
    getFilterChipText,
    matchesAdvancedFilters,
    applyFilters
  }
}
