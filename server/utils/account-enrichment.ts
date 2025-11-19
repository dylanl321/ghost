/**
 * Account Enrichment Level Filtering
 * 
 * Controls how much data is returned based on the requested enrichment level
 */

import type { UnifiedAccount, EnrichmentLevel } from '../schemas/account-schema'

/**
 * Filter account data based on enrichment level
 */
export function applyEnrichmentLevel(
  account: UnifiedAccount, 
  level: EnrichmentLevel
): Partial<UnifiedAccount> {
  
  switch (level) {
    case 'minimal':
      return {
        id: account.id,
        govId: account.govId,
        env: account.env,
        name: account.name,
        email: account.email,
        organizationStatus: account.organizationStatus,
        requestID: account.requestID,
        _metadata: {
          ...account._metadata,
          enrichment_level: 'minimal'
        }
      }
      
    case 'basic':
      return {
        // Simple fields
        id: account.id,
        govId: account.govId,
        env: account.env,
        name: account.name,
        email: account.email,
        createdAt: account.createdAt,
        organizationStatus: account.organizationStatus,
        organizationEnvironment: account.organizationEnvironment,
        
        // Key project info
        requestID: account.requestID,
        projectName: account.projectName,
        projectType: account.projectType,
        projectNumber: account.projectNumber,
        
        // Key admin contacts
        primaryAccountAdminUsername: account.primaryAccountAdminUsername,
        primaryAccountAdminName: account.primaryAccountAdminName,
        costManagerUsername: account.costManagerUsername,
        costManagerName: account.costManagerName,
        
        // Basic infrastructure
        isAWSStdEnv: account.isAWSStdEnv,
        region: account.region,
        accountAlias: account.accountAlias,
        enclaveType: account.enclaveType,
        enclaveStatus: account.enclaveStatus,
        
        _metadata: {
          ...account._metadata,
          enrichment_level: 'basic'
        }
      }
      
    case 'full':
    default:
      return {
        ...account,
        _metadata: {
          ...account._metadata,
          enrichment_level: 'full'
        }
      }
  }
}

/**
 * Apply enrichment level to an array of accounts
 */
export function applyEnrichmentToList(
  accounts: UnifiedAccount[], 
  level: EnrichmentLevel
): Partial<UnifiedAccount>[] {
  return accounts.map(account => applyEnrichmentLevel(account, level))
}

/**
 * Validate enrichment level parameter
 */
export function validateEnrichmentLevel(level: string | undefined): EnrichmentLevel {
  if (!level) return 'full'
  
  const validLevels: EnrichmentLevel[] = ['simple', 'basic', 'full']
  if (validLevels.includes(level as EnrichmentLevel)) {
    return level as EnrichmentLevel
  }
  
  return 'full' // Default fallback
}

/**
 * Get enrichment level description
 */
export function getEnrichmentDescription(level: EnrichmentLevel): string {
  switch (level) {
    case 'simple':
      return 'Basic identifiers, names, status, and request ID only'
    case 'basic':
      return 'Simple data plus key project info, admin contacts, and basic infrastructure'
    case 'full':
      return 'Complete account information with all available fields'
    default:
      return 'Unknown enrichment level'
  }
}