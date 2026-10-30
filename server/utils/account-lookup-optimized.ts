/**
 * Single-account lookup by account ID, request ID, email or PEP ID.
 *
 * The account registry (externalAccounts, keyed by requestID) has no index on
 * the other identifiers, so every lookup reads the registry through
 * getAllAccountMetadataFromDynamoDB: one paginated scan shared by all callers
 * for a few minutes, instead of one unpaginated scan per request. Matches are
 * enriched with AWS Organizations data when it is available.
 */

import { getAccountFromOrganizations, getAllAccountMetadataFromDynamoDB } from './accounts-consolidated'
import { errors } from './api-response'
import type { H3Event } from 'h3'
import { logger } from './logger'

// Type definitions
export interface AccountLookupOptions {
  includeDecommissioned?: boolean
  requireActive?: boolean
  requireSpecificEnvironment?: 'commercial' | 'govcloud'
  explicitType?: string  // 'pep' to force PEP External Enclave ID lookup
}

export interface OptimizedLookupResult {
  account: any // Use the existing account type structure
  identifierType: 'accountId' | 'govId' | 'requestId' | 'email' | 'pepId'
  matchedValue: string
  source: 'dynamodb' | 'organizations' | 'both'
}

/**
 * Map registry field names to the normalized names, then merge in
 * Organizations data. Organizations reports the GovCloud ID as accountId for
 * a GovCloud account, so the normalized IDs are applied last: accountId is
 * always the commercial account and govCloudAccountId the GovCloud one.
 */
async function normalizeAndEnrich(record: any, preferred: 'commercial' | 'govcloud' = 'commercial'): Promise<any> {
  const normalized = {
    requestId: record.requestID,
    accountId: record.awsStandardAccountID,
    govCloudAccountId: record.awsGovCloudAccountID,
    email: record.awsAccountEmail,
    name: record.projectName
  }

  // Organizations data comes from the partition of the ID that was looked
  // up, or commercial (the primary ID) when the lookup was by another field.
  const commercial: [string | undefined, 'commercial'] = [record.awsStandardAccountID, 'commercial']
  const govcloud: [string | undefined, 'govcloud'] = [record.awsGovCloudAccountID, 'govcloud']
  const lookups = preferred === 'govcloud' ? [govcloud, commercial] : [commercial, govcloud]
  for (const [id, environment] of lookups) {
    if (!id) continue
    const orgAccount = await getAccountFromOrganizations(id, environment)
    if (orgAccount) {
      return {
        ...record,
        ...orgAccount,
        ...normalized,
        status: orgAccount.accountStatus,
        source: 'both'
      }
    }
  }

  return { ...record, ...normalized, source: 'dynamodb' }
}

async function findRegistryRecord(predicate: (item: any) => boolean): Promise<any | null> {
  const records = await getAllAccountMetadataFromDynamoDB()
  return records.find(predicate) ?? null
}

/**
 * Get account by commercial or GovCloud account ID
 */
async function getAccountByAccountId(accountId: string): Promise<any | null> {
  const record = await findRegistryRecord(item =>
    item.awsStandardAccountID === accountId || item.awsGovCloudAccountID === accountId
  )
  if (record) {
    return normalizeAndEnrich(record, record.awsGovCloudAccountID === accountId ? 'govcloud' : 'commercial')
  }

  // Not in the registry: the account may still exist in either organization.
  for (const environment of ['commercial', 'govcloud'] as const) {
    const orgAccount = await getAccountFromOrganizations(accountId, environment)
    if (orgAccount) {
      return {
        ...orgAccount,
        ...(environment === 'govcloud' ? { accountId: undefined, govCloudAccountId: accountId } : {}),
        name: orgAccount.accountName,
        email: orgAccount.accountEmail,
        status: orgAccount.accountStatus,
        source: 'organizations'
      }
    }
  }
  return null
}

/**
 * Get account by root email (registry field names vary by deployment)
 */
async function getAccountByEmail(email: string): Promise<any | null> {
  const target = email.toLowerCase()
  const record = await findRegistryRecord(item =>
    [item.awsAccountEmail, item.accountEmail, item.email]
      .some(value => typeof value === 'string' && value.toLowerCase() === target)
  )
  return record ? normalizeAndEnrich(record) : null
}

/**
 * Get account by request ID (stored as a number, accepted as a string)
 */
async function getAccountByRequestId(requestId: string): Promise<any | null> {
  const record = await findRegistryRecord(item => String(item.requestID) === requestId)
  return record ? normalizeAndEnrich(record) : null
}

/**
 * Get account by PEP External Enclave ID
 */
async function getAccountByPepId(pepId: string): Promise<any | null> {
  const record = await findRegistryRecord(item =>
    item.pepExternalEnclaveID != null && String(item.pepExternalEnclaveID) === pepId
  )
  return record ? normalizeAndEnrich(record) : null
}

/**
 * Determine identifier type and format
 */
function determineIdentifierType(identifier: string): 'accountId' | 'requestId' | 'email' | 'unknown' {
  if (identifier.includes('@') && identifier.includes('.')) {
    return 'email'
  }
  
  if (/^\d{12}$/.test(identifier)) {
    return 'accountId'
  }
  
  if (/^\d+$/.test(identifier)) {
    return 'requestId'
  }
  
  return 'unknown'
}

/**
 * Optimized single account lookup
 */
export async function findAccountByIdentifierOptimized(
  identifier: string,
  options: AccountLookupOptions = {}
): Promise<OptimizedLookupResult | null> {
  if (!identifier || identifier.trim() === '') {
    return null
  }

  const cleanIdentifier = identifier.trim()

  const {
    includeDecommissioned = false,
    requireActive = false,
    explicitType
  } = options

  // If explicitType is set, use that directly instead of auto-detecting
  if (explicitType === 'pep') {
    try {
      const account = await getAccountByPepId(cleanIdentifier)
      if (account) {
        if (requireActive && account.status !== 'ACTIVE') return null
        if (!includeDecommissioned && account.enclaveStatus === 'Decommissioned') return null
        return {
          account,
          identifierType: 'pepId' as const,
          matchedValue: cleanIdentifier,
          source: account.source || 'dynamodb'
        }
      }
    } catch (error) {
      logger.warn(`Error searching for PEP ID ${cleanIdentifier}:`, error)
    }
    return null
  }

  const identifierType = determineIdentifierType(cleanIdentifier)

  if (identifierType === 'unknown') {
    return null
  }

  // Try to find account using the most efficient method
  let account: any = null

  try {
    switch (identifierType) {
      case 'accountId':
        account = await getAccountByAccountId(cleanIdentifier)
        break
      case 'email':
        account = await getAccountByEmail(cleanIdentifier)
        break
      case 'requestId':
        account = await getAccountByRequestId(cleanIdentifier)
        break
    }

    if (account) {
      // Apply filters
      if (requireActive && account.status !== 'ACTIVE') {
        return null
      }

      if (!includeDecommissioned && account.enclaveStatus === 'Decommissioned') {
        return null
      }

      // Found valid account
      return {
        account,
        identifierType,
        matchedValue: cleanIdentifier,
        source: account.source || 'dynamodb'
      }
    }
  } catch (error) {
    logger.warn(`Error looking up account by ${identifierType} ${cleanIdentifier}:`, error)
  }

  return null
}

/**
 * Main optimized lookup function with HTTP error handling
 */
export async function lookupAccountOptimized(
  event: H3Event,
  identifier: string,
  options: AccountLookupOptions = {}
): Promise<OptimizedLookupResult | null> {
  // Validate identifier format
  if (!identifier || identifier.trim() === '') {
    throw errors.badRequest(event, 'Account identifier is required')
  }
  
  const cleanIdentifier = identifier.trim()

  // When explicitType is set (e.g. 'pep'), skip auto-detection validation
  if (!options.explicitType) {
    const identifierType = determineIdentifierType(cleanIdentifier)

    if (identifierType === 'unknown') {
      throw errors.badRequest(event,
        'Invalid identifier format. Must be: 12-digit account ID, numeric request ID, PEP External Enclave ID (with type=pep), or email address'
      )
    }

    if (identifierType === 'accountId' && !/^\d{12}$/.test(cleanIdentifier)) {
      throw errors.badRequest(event, 'Account ID must be exactly 12 digits')
    }
  }

  // Find the account using optimized lookup
  const result = await findAccountByIdentifierOptimized(cleanIdentifier, options)
  
  if (!result) {
    const { includeDecommissioned = false } = options
    
    if (!includeDecommissioned) {
      throw errors.notFound(event, 
        `Account not found with identifier: ${cleanIdentifier}. ` +
        'Use includeDecommissioned=true if the account might be decommissioned.'
      )
    } else {
      throw errors.notFound(event, `Account not found with identifier: ${cleanIdentifier}`)
    }
  }
  
  // Additional status checks
  if (options.requireActive && result.account.status !== 'ACTIVE') {
    throw errors.badRequest(event, 
      `Account ${cleanIdentifier} is not active (status: ${result.account.status})`
    )
  }
  
  if (!options.includeDecommissioned && result.account.enclaveStatus === 'Decommissioned') {
    throw errors.notFound(event, 
      `Account ${cleanIdentifier} is decommissioned. Use includeDecommissioned=true to include it.`
    )
  }
  
  return result
}

/**
 * The account's ID in one partition, or undefined when it has none there.
 * Never falls back to the other partition's ID.
 */
export function getEnvironmentAccountId(
  account: any,
  environment: 'commercial' | 'govcloud'
): string | undefined {
  if (!account) return undefined
  return environment === 'govcloud'
    ? (account.govCloudAccountId || account.awsGovCloudAccountID || account.govId || undefined)
    : (account.accountId || account.awsStandardAccountID || account.id || undefined)
}

/**
 * Validate account exists in specific environment
 */
export function validateAccountEnvironment(
  account: any, 
  requiredEnvironment: 'commercial' | 'govcloud'
): string {
  if (requiredEnvironment === 'commercial') {
    if (!account.accountId && !account.id) {
      throw new Error(`Account ${account.name} does not exist in commercial environment`)
    }
    return account.accountId || account.id
  } else {
    if (!account.govCloudAccountId && !account.govId) {
      throw new Error(`Account ${account.name} does not exist in govcloud environment`)
    }
    return account.govCloudAccountId || account.govId
  }
}
