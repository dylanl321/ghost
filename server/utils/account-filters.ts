/**
 * Account Filtering Utilities
 * Provides flexible filtering by account IDs, lines of business, and departments
 */

import { getAllAccountsUnified } from './accounts-consolidated'
import type { UnifiedAccount } from '../schemas/account-schema'
import type { LOBSummary, DepartmentSummary } from '#shared/types/accounts'
import { getLOBFullName } from './lob-mapping'
import { findAccountByIdentifierOptimized } from './account-lookup-optimized'
import { logger } from './logger'

/**
 * Get nested value from object using dot notation
 * @param obj - The object to access
 * @param path - The path to the property (e.g., 'user.name', 'metadata.tags')
 * @returns The value at the path, or undefined if not found
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined
  }, obj)
}

export interface AdvancedFilter {
  key: string
  value: string
  operator: 'eq' | 'ne' | 'contains' | 'not_contains' | 'begins_with' | 'not_begins_with' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in'
}

export interface AccountFilterCriteria {
  accountIds?: string[]  // Can be request IDs, 12-digit account IDs, or email addresses
  linesOfBusiness?: string[]
  departments?: string[]
  excludeDecommissioned?: boolean
  includeDecommissioned?: boolean
  // Advanced filtering system
  advancedFilters?: AdvancedFilter[]
}

/**
 * Filter accounts based on flexible criteria
 * @param criteria - The filter criteria to apply
 * @param accounts - Optional pre-fetched accounts array. If not provided, will fetch from database
 */
export async function filterAccounts(
  criteria: AccountFilterCriteria, 
  accounts?: UnifiedAccount[]
): Promise<UnifiedAccount[]> {
  // Use provided accounts or fetch if not provided (for backwards compatibility)
  const allAccounts = accounts || await getAllAccountsUnified(criteria.includeDecommissioned || false)
  
  let filteredAccounts = allAccounts
  
  // Note: Decommissioned filtering is now handled in getAllAccountsUnified()
  
  // If specific account IDs are provided, filter to those
  if (criteria.accountIds && criteria.accountIds.length > 0) {
    filteredAccounts = filteredAccounts.filter(account => {
      // Check all possible account ID fields for a match, including requestId
      const accountIdFields = [
        account.accountId,
        account.govCloudAccountId,
        account.awsStandardAccountID,
        account.awsGovCloudAccountID,
        account.requestId ? String(account.requestId) : null,
        account.requestID ? String(account.requestID) : null
      ].filter(Boolean) // Remove undefined/null values
      
      // Check if any of the account's IDs match any of the requested IDs
      return criteria.accountIds!.some(requestedId => {
        // Convert both to strings for comparison
        const requestedIdStr = String(requestedId)
        return accountIdFields.includes(requestedIdStr)
      })
    })
  }
  
  // Filter by lines of business
  if (criteria.linesOfBusiness && criteria.linesOfBusiness.length > 0) {
    filteredAccounts = filteredAccounts.filter(account => {
      if (!account.linesOfBusiness) return false
      
      // Handle both single LOB and comma-separated LOBs
      const accountLOBs = account.linesOfBusiness
        .split(',')
        .map(lob => lob.trim().toLowerCase())
      
      return criteria.linesOfBusiness!.some(filterLOB =>
        accountLOBs.some(accountLOB => 
          accountLOB.includes(filterLOB.toLowerCase()) ||
          filterLOB.toLowerCase().includes(accountLOB)
        )
      )
    })
  }
  
  // Filter by departments
  if (criteria.departments && criteria.departments.length > 0) {
    filteredAccounts = filteredAccounts.filter(account => {
      if (!account.departmentNumber) return false

      return criteria.departments!.some(dept =>
        account.departmentNumber?.toLowerCase().includes(dept.toLowerCase()) ||
        dept.toLowerCase().includes(account.departmentNumber!.toLowerCase())
      )
    })
  }

  // Apply advanced filters (key, value, operator)
  if (criteria.advancedFilters && criteria.advancedFilters.length > 0) {
    filteredAccounts = filteredAccounts.filter(account => {
      return criteria.advancedFilters!.every(filter => {
        const accountValue = getNestedValue(account, filter.key)
        const stringValue = accountValue !== null && accountValue !== undefined ? String(accountValue) : ''

        switch (filter.operator) {
          case 'eq':
            return stringValue === filter.value
          case 'ne':
            return stringValue !== filter.value
          case 'contains':
            return stringValue.toLowerCase().includes(filter.value.toLowerCase())
          case 'not_contains':
            return !stringValue.toLowerCase().includes(filter.value.toLowerCase())
          case 'begins_with':
            return stringValue.toLowerCase().startsWith(filter.value.toLowerCase())
          case 'not_begins_with':
            return !stringValue.toLowerCase().startsWith(filter.value.toLowerCase())
          case 'gt':
            return stringValue > filter.value
          case 'gte':
            return stringValue >= filter.value
          case 'lt':
            return stringValue < filter.value
          case 'lte':
            return stringValue <= filter.value
          case 'in':
            // Check if account value is in the comma-separated filter value
            const values = filter.value.split(',').map(v => v.trim().toLowerCase())
            return values.includes(stringValue.toLowerCase())
          case 'not_in':
            // Check if account value is NOT in the comma-separated filter value
            const notValues = filter.value.split(',').map(v => v.trim().toLowerCase())
            return !notValues.includes(stringValue.toLowerCase())
          default:
            return true // Unknown operator, pass through
        }
      })
    })
  }

  return filteredAccounts
}

/**
 * Get unique lines of business from all accounts
 */
export async function getUniqueBusinessLines(includeDecommissioned: boolean = false): Promise<LOBSummary[]> {
  const accounts = await getAllAccountsUnified(includeDecommissioned)
  const lobMap = new Map<string, { count: number, budget: number }>()
  
  accounts.forEach(account => {
    if (account.linesOfBusiness) {
      // Handle comma-separated LOBs
      const lobs = account.linesOfBusiness
        .split(',')
        .map(lob => lob.trim())
        .filter(lob => lob.length > 0)
      
      lobs.forEach(lob => {
        const existing = lobMap.get(lob) || { count: 0, budget: 0 }
        const budget = parseFloat(account.estimatedMonthlyCharge?.replace(/[^0-9.-]/g, '') || '0')
        
        lobMap.set(lob, {
          count: existing.count + 1,
          budget: existing.budget + budget
        })
      })
    }
  })
  
  return Array.from(lobMap.entries())
    .map(([linesOfBusiness, data]) => ({
      linesOfBusiness,
      linesOfBusinessFullName: getLOBFullName(linesOfBusiness),
      accountCount: data.count,
      totalBudget: data.budget > 0 ? data.budget : undefined
    }))
    .sort((a, b) => b.accountCount - a.accountCount) // Sort by account count descending
}

/**
 * Get unique departments from all accounts
 */
export async function getUniqueDepartments(includeDecommissioned: boolean = false): Promise<DepartmentSummary[]> {
  const accounts = await getAllAccountsUnified(includeDecommissioned)
  const deptMap = new Map<string, { count: number, budget: number }>()
  
  accounts.forEach(account => {
    if (account.departmentNumber) {
      const dept = account.departmentNumber.trim()
      const existing = deptMap.get(dept) || { count: 0, budget: 0 }
      const budget = parseFloat(account.estimatedMonthlyCharge?.replace(/[^0-9.-]/g, '') || '0')
      
      deptMap.set(dept, {
        count: existing.count + 1,
        budget: existing.budget + budget
      })
    }
  })
  
  return Array.from(deptMap.entries())
    .map(([departmentNumber, data]) => ({
      departmentNumber,
      accountCount: data.count,
      totalBudget: data.budget > 0 ? data.budget : undefined
    }))
    .sort((a, b) => b.accountCount - a.accountCount) // Sort by account count descending
}

/**
 * Get account IDs from filter criteria (for Cost Explorer filtering)
 * IMPORTANT: Cost Explorer ALWAYS requires commercial account IDs, even for GovCloud accounts
 * This is because Cost Explorer only exists in commercial and uses consolidated billing
 */
export async function getAccountIdsFromCriteria(criteria: AccountFilterCriteria): Promise<string[]> {
  const filteredAccounts = await filterAccounts(criteria)
  
  // For Cost Explorer, we MUST use commercial account IDs
  // Priority: awsStandardAccountID > accountId (both are commercial)
  const commercialIds = filteredAccounts
    .map(account => {
      // Try multiple fields for commercial account ID
      const commercialId = account.awsStandardAccountID || 
                          account.accountId ||
                          account.id // Some accounts might have 'id' field
      return commercialId
    })
    .filter(id => id !== null && id !== undefined && id !== '')
  
  // Remove duplicates and return
  return [...new Set(commercialIds)]
}

/**
 * Resolve mixed account identifiers (requestId, accountId, govCloudAccountId) to commercial account IDs
 * This is crucial for Cost Explorer which only works with commercial account IDs
 * @param identifiers - Array of mixed identifiers (can be requestIds, commercial IDs, or govcloud IDs)
 * @returns Array of resolved commercial account IDs
 */
export async function resolveToCommercialAccountIds(identifiers: string[]): Promise<string[]> {
  if (!identifiers || identifiers.length === 0) {
    return []
  }
  
  const commercialIds: string[] = []
  
  for (const identifier of identifiers) {
    // Try to find the account using optimized lookup
    const result = await findAccountByIdentifierOptimized(identifier, { includeDecommissioned: true })
    
    if (result && result.account) {
      // Get the commercial account ID from the result
      const commercialId = result.account.accountId || 
                          result.account.awsStandardAccountID ||
                          result.account.id
      
      if (commercialId) {
        commercialIds.push(commercialId)
      }
    } else {
      // If it looks like a 12-digit account ID, keep it as-is (might be a valid commercial ID)
      if (/^\d{12}$/.test(identifier)) {
        commercialIds.push(identifier)
      }
      // Skip non-resolvable identifiers (like requestIds that don't exist)
    }
  }
  
  // Remove duplicates
  return [...new Set(commercialIds)]
}

/**
 * Parse account filter parameters from query string
 */
export function parseAccountFilters(query: Record<string, any>): AccountFilterCriteria {
  const criteria: AccountFilterCriteria = {
    includeDecommissioned: query.includeDecommissioned === 'true' || query.includeDecommissioned === true,
    // Keep excludeDecommissioned for backwards compatibility (but includeDecommissioned takes precedence)
    excludeDecommissioned: query.excludeDecommissioned === 'true' || query.excludeDecommissioned === true
  }
  
  // Parse account IDs (comma-separated)
  if (query.accountIds) {
    criteria.accountIds = typeof query.accountIds === 'string' 
      ? query.accountIds.split(',').map(id => id.trim()).filter(id => id.length > 0)
      : Array.isArray(query.accountIds) ? query.accountIds : [query.accountIds]
  }
  
  // Parse lines of business (comma-separated)
  if (query.linesOfBusiness) {
    criteria.linesOfBusiness = typeof query.linesOfBusiness === 'string'
      ? query.linesOfBusiness.split(',').map(lob => lob.trim()).filter(lob => lob.length > 0)
      : Array.isArray(query.linesOfBusiness) ? query.linesOfBusiness : [query.linesOfBusiness]
  }
  
  // Parse departments (comma-separated)
  if (query.departments) {
    criteria.departments = typeof query.departments === 'string'
      ? query.departments.split(',').map(dept => dept.trim()).filter(dept => dept.length > 0)
      : Array.isArray(query.departments) ? query.departments : [query.departments]
  }

  // Parse advanced filters - support both individual parameters and JSON format
  if (query.filters) {
    // Handle JSON string format (Swagger UI friendly)
    try {
      const filtersData = typeof query.filters === 'string'
        ? JSON.parse(query.filters)
        : query.filters

      if (Array.isArray(filtersData)) {
        criteria.advancedFilters = filtersData.map(filter => ({
          key: filter.key?.trim() || '',
          value: filter.value?.trim() || '',
          operator: (filter.operator || 'eq') as AdvancedFilter['operator']
        })).filter(filter => filter.key)
      }
    } catch (error) {
      // If JSON parsing fails, ignore and fall back to individual parameters
      logger.warn('Failed to parse filters JSON:', error)
    }
  } else if (query.key) {
    // Handle individual key/value/operator parameters
    const keys = Array.isArray(query.key) ? query.key : [query.key]
    const values = Array.isArray(query.value) ? query.value : [query.value]
    const operators = Array.isArray(query.operator) ? query.operator : [query.operator || 'eq']

    criteria.advancedFilters = []

    // Use the length of keys as the primary iterator, but handle mismatched lengths
    const maxLength = Math.max(keys.length, values.length, operators.length)

    for (let i = 0; i < maxLength; i++) {
      const key = keys[i] || keys[0] || ''
      const value = values[i] || values[0] || ''
      const operator = operators[i] || operators[0] || 'eq'

      if (key.trim()) {
        criteria.advancedFilters.push({
          key: key.trim(),
          value: value.trim(),
          operator: operator as AdvancedFilter['operator']
        })
      }
    }
  }

  return criteria
}

/**
 * Validate account filter criteria for mutual exclusion and other rules
 */
export function validateAccountFilters(criteria: AccountFilterCriteria): string[] {
  const errors: string[] = []
  
  // Count how many filter types are specified
  const filterTypes = []
  if (criteria.accountIds && criteria.accountIds.length > 0) filterTypes.push('accountIds')
  if (criteria.linesOfBusiness && criteria.linesOfBusiness.length > 0) filterTypes.push('linesOfBusiness')
  if (criteria.departments && criteria.departments.length > 0) filterTypes.push('departments')
  if (criteria.advancedFilters && criteria.advancedFilters.length > 0) filterTypes.push('advancedFilters')

  // Check for conflicts: advancedFilters cannot be combined with other filter types
  if (criteria.advancedFilters && criteria.advancedFilters.length > 0 && filterTypes.length > 1) {
    errors.push(`Advanced filters cannot be combined with other filter types. Found: ${filterTypes.join(', ')}. Use either advanced filters OR accountIds/linesOfBusiness/departments.`)
  }

  // For backwards compatibility, still allow only one of the simple filter types
  const simpleFilterTypes = filterTypes.filter(type => type !== 'advancedFilters')
  if (simpleFilterTypes.length > 1) {
    errors.push(`Only one simple filter type allowed at a time. Found: ${simpleFilterTypes.join(', ')}. Use either accountIds, linesOfBusiness, or departments, but not multiple.`)
  }
  
  // Validate account identifiers format (can be request IDs, account IDs, or email addresses)
  if (criteria.accountIds) {
    criteria.accountIds.forEach(id => {
      const idStr = String(id).trim()
      // Valid formats:
      // - 12-digit account ID (commercial or GovCloud)
      // - Numeric request ID (any length, typically 1-6 digits)
      // - Email address (contains @ and .)
      const isValidAccountId = /^\d{12}$/.test(idStr)
      const isValidRequestId = /^\d+$/.test(idStr) && idStr.length < 10
      const isValidEmail = idStr.includes('@') && idStr.includes('.')
      
      if (!isValidAccountId && !isValidRequestId && !isValidEmail) {
        errors.push(`Invalid identifier format: ${id}. Must be a 12-digit account ID, numeric request ID, or email address.`)
      }
    })
  }
  
  // Validate lines of business format
  if (criteria.linesOfBusiness) {
    criteria.linesOfBusiness.forEach(lob => {
      if (lob.length < 2) {
        errors.push(`Line of business too short: ${lob}. Must be at least 2 characters.`)
      }
    })
  }
  
  // Validate departments format
  if (criteria.departments) {
    criteria.departments.forEach(dept => {
      if (dept.length < 1) {
        errors.push(`Department number too short: ${dept}. Must be at least 1 character.`)
      }
    })
  }
  
  return errors
}

/**
 * Parse and validate account filters from query parameters
 */
export function parseAndValidateAccountFilters(query: Record<string, any>): { criteria: AccountFilterCriteria, errors: string[] } {
  const criteria = parseAccountFilters(query)
  const errors = validateAccountFilters(criteria)
  
  return { criteria, errors }
}

