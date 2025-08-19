/**
 * Account Filtering Utilities
 * Provides flexible filtering by account IDs, lines of business, and departments
 */

import { getAllAccountsUnified } from './accounts-consolidated'
import type { UnifiedAccount } from '../schemas/account-schema'

export interface AccountFilterCriteria {
  accountIds?: string[]
  linesOfBusiness?: string[]
  departments?: string[]
  excludeDecommissioned?: boolean
  includeDecommissioned?: boolean
}

/**
 * Filter accounts based on flexible criteria
 */
export async function filterAccounts(criteria: AccountFilterCriteria): Promise<UnifiedAccount[]> {
  // Get all accounts if we need to filter by LOB or department
  const allAccounts = await getAllAccountsUnified(criteria.includeDecommissioned || false)
  
  let filteredAccounts = allAccounts
  
  // Note: Decommissioned filtering is now handled in getAllAccountsUnified()
  
  // If specific account IDs are provided, filter to those
  if (criteria.accountIds && criteria.accountIds.length > 0) {
    filteredAccounts = filteredAccounts.filter(account =>
      criteria.accountIds!.includes(account.id) || 
      (account.govId && criteria.accountIds!.includes(account.govId))
    )
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
  
  return filteredAccounts
}

/**
 * Get unique lines of business from all accounts
 */
export async function getUniqueBusinessLines(includeDecommissioned: boolean = false): Promise<Array<{
  linesOfBusiness: string
  accountCount: number
  totalBudget?: number
}>> {
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
      accountCount: data.count,
      totalBudget: data.budget > 0 ? data.budget : undefined
    }))
    .sort((a, b) => b.accountCount - a.accountCount) // Sort by account count descending
}

/**
 * Get unique departments from all accounts
 */
export async function getUniqueDepartments(includeDecommissioned: boolean = false): Promise<Array<{
  departmentNumber: string
  accountCount: number
  totalBudget?: number
}>> {
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
 */
export async function getAccountIdsFromCriteria(criteria: AccountFilterCriteria): Promise<string[]> {
  const filteredAccounts = await filterAccounts(criteria)
  return filteredAccounts.map(account => account.id)
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
  
  // Only allow one type of filter at a time
  if (filterTypes.length > 1) {
    errors.push(`Only one filter type allowed at a time. Found: ${filterTypes.join(', ')}. Use either accountIds, linesOfBusiness, or departments, but not multiple.`)
  }
  
  // Validate account IDs format
  if (criteria.accountIds) {
    criteria.accountIds.forEach(id => {
      if (!/^\d{12}$/.test(id)) {
        errors.push(`Invalid account ID format: ${id}. Account IDs must be 12 digits.`)
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