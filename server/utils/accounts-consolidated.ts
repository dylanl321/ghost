/**
 * Consolidated Account Management Utilities
 * 
 * Architecture:
 * - Primary source: Organizations API (for account hierarchy)
 * - Metadata source: DynamoDB (for additional project metadata)
 * - GovCloud DynamoDB table structure:
 *   - Primary key: requestID
 *   - Fields: awsStandardAccountID, awsGovCloudAccountID, awsAccountEmail, projectName, etc.
 * 
 * This consolidates functionality from:
 * - accounts.ts (original)
 * - accounts-v2.ts (refactored)
 * - Keeping only actively used functions
 */

import { scanItems, updateItem } from './dynamodb'
import { getOrganizationsClient, hasCredentials } from '../lib/aws-client-factory'
import type { AccountInfo, AWSEnvironmentType, AccountLookupCriteria } from '../types'
import { getTableName, getTableEnvironment } from '../lib/dynamodb-config'
import { logger } from './logger'

/**
 * Get the DynamoDB table name for accounts (with config loader)
 */
export async function getAccountsTableName(): Promise<string> {
  return await getTableName('externalAccounts')
}

/**
 * Get the Organizations account ID for the environment
 */
function getOrganizationsAccountId(environment: AWSEnvironmentType = 'commercial'): string | undefined {
  return environment === 'commercial' 
    ? process.env.AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID
    : process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID
}

/**
 * Get account information from Organizations API
 * Used by: account-lookup-optimized.ts
 */
export async function getAccountFromOrganizations(
  accountId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<AccountInfo | null> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const client = await getOrganizationsClient(environment, undefined, orgAccountId)
    
    const { DescribeAccountCommand } = await import('@aws-sdk/client-organizations')
    const response = await client.send(new DescribeAccountCommand({ AccountId: accountId }))
    
    if (!response.Account) return null
    
    return {
      accountId: response.Account.Id!,
      accountName: response.Account.Name,
      accountEmail: response.Account.Email,
      accountStatus: response.Account.Status,
      organizationArn: response.Account.Arn,
      joinedMethod: response.Account.JoinedMethod,
      joinedTimestamp: response.Account.JoinedTimestamp?.toISOString(),
      environment: environment
    }
  } catch (error) {
    logger.error(`Failed to get account ${accountId} from Organizations:`, error)
    return null
  }
}

/**
 * Get all accounts from Organizations API
 * Used by: bulk operations in accounts-v2.ts
 */
export async function getAllAccountsFromOrganizations(
  environment: AWSEnvironmentType = 'commercial'
): Promise<AccountInfo[]> {
  if (!hasCredentials(environment)) {
    logger.warn(`No credentials available for ${environment} environment`)
    return []
  }

  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const client = await getOrganizationsClient(environment, undefined, orgAccountId)
    
    const { ListAccountsCommand } = await import('@aws-sdk/client-organizations')
    const accounts: AccountInfo[] = []
    let nextToken: string | undefined
    
    do {
      const response = await client.send(new ListAccountsCommand({ NextToken: nextToken }))
      
      if (response.Accounts) {
        for (const account of response.Accounts) {
          if (account.Id && account.Name) {
            accounts.push({
              accountId: account.Id,
              accountName: account.Name,
              accountEmail: account.Email,
              accountStatus: account.Status,
              organizationArn: account.Arn,
              joinedMethod: account.JoinedMethod,
              joinedTimestamp: account.JoinedTimestamp?.toISOString(),
              environment: environment
            })
          }
        }
      }
      
      nextToken = response.NextToken
    } while (nextToken)
    
    return accounts
  } catch (error) {
    logger.error(`Failed to list accounts from Organizations (${environment}):`, error)
    return []
  }
}

/**
 * Get all account metadata from DynamoDB
 * Note: DynamoDB table is in GovCloud with structure:
 * - Primary key: requestID
 * - Contains both commercial and govcloud account IDs
 */

// NOTE: Consider switching externalAccounts DynamoDB table to on-demand billing to
// eliminate ProvisionedThroughputExceededException / ThrottlingException at scale.

/**
 * Module-level stale cache for DynamoDB accounts.
 * Populated on each successful read; returned when all retries are exhausted.
 */
let _staleAccountsCache: any[] | null = null

/**
 * Sleep helper for exponential-backoff retries.
 */
function _sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function getAllAccountMetadataFromDynamoDB(): Promise<any[]> {
  if (!hasCredentials('govcloud')) {
    logger.warn('No credentials available for govcloud environment, skipping DynamoDB query')
    return []
  }

  const MAX_ATTEMPTS = 5
  let lastThrottleError: Error | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const tableName = await getAccountsTableName()
      const environment = await getTableEnvironment('externalAccounts')
      const result = await scanItems(tableName, undefined, undefined, undefined, environment)
      // Successful read — refresh stale cache and return
      _staleAccountsCache = result.items
      return result.items
    } catch (error: any) {
      const isThrottled =
        error?.name === 'ProvisionedThroughputExceededException' ||
        error?.name === 'ThrottlingException'

      if (isThrottled) {
        lastThrottleError = error
        const backoffMs = Math.pow(2, attempt) * 200
        logger.warn(
          `DynamoDB accounts scan throttled (${error.name}), attempt ${attempt + 1}/${MAX_ATTEMPTS}. ` +
          `Retrying in ${backoffMs}ms...`
        )
        await _sleep(backoffMs)
        continue
      }

      // Non-throttle error — fall through to original behaviour
      logger.error('Failed to get accounts from DynamoDB:', error)
      return []
    }
  }

  // All retry attempts exhausted due to throttling
  if (_staleAccountsCache !== null) {
    logger.error(
      `DynamoDB accounts scan failed after ${MAX_ATTEMPTS} attempts (${lastThrottleError?.name}). ` +
      `Serving stale cached accounts (${_staleAccountsCache.length} entries).`
    )
    return _staleAccountsCache
  }

  // No stale cache available — hard fail so callers know data is unavailable
  logger.error(
    `DynamoDB accounts scan failed after ${MAX_ATTEMPTS} attempts (${lastThrottleError?.name}) ` +
    `and no stale cache is available.`
  )
  throw lastThrottleError!
}

/**
 * Type for unified account (combining Organizations + DynamoDB data)
 */
export interface UnifiedAccount {
  // Normalized fields (consistent naming)
  accountId?: string           // Commercial account ID
  govCloudAccountId?: string   // GovCloud account ID
  requestId?: number           // Request ID from DynamoDB
  name?: string               // Account/Project name
  email?: string              // Root account email
  status?: string             // Account status
  
  // Original DynamoDB fields (for backward compatibility)
  requestID?: number
  awsStandardAccountID?: string
  awsGovCloudAccountID?: string
  awsAccountEmail?: string
  projectName?: string
  enclaveStatus?: string
  
  // Metadata
  environment?: string
  source?: 'organizations' | 'dynamodb' | 'both'
  
  // Additional fields from either source
  [key: string]: any
}

/**
 * Get all accounts with unified data from Organizations + DynamoDB
 * This is the main function used by most APIs for listing accounts
 */
export async function getAllAccountsUnified(
  includeDecommissioned: boolean = false
): Promise<UnifiedAccount[]> {
  // Get data from both sources in parallel
  const [orgAccounts, dynamoMetadata] = await Promise.all([
    getAllAccountsFromOrganizations('commercial'),
    getAllAccountMetadataFromDynamoDB()
  ])
  
  // Create maps for efficient lookups
  const orgAccountsMap = new Map<string, any>()
  orgAccounts.forEach(acc => {
    if (acc.accountId) {
      orgAccountsMap.set(acc.accountId, acc)
    }
  })
  
  // Combine data with DynamoDB as primary (it has more metadata)
  const unifiedAccounts: UnifiedAccount[] = []
  
  // Process DynamoDB accounts (these have the most metadata)
  for (const dynamoAccount of dynamoMetadata) {
    // Skip decommissioned if not requested
    if (!includeDecommissioned && dynamoAccount.enclaveStatus === 'Decommissioned') {
      continue
    }

    const commercialId = dynamoAccount.awsStandardAccountID
    const govCloudId = dynamoAccount.awsGovCloudAccountID

    // Skip accounts without a commercial account ID - no account ID means no costs possible
    if (!commercialId) {
      continue
    }

    // Get Organizations data if available
    const orgData = orgAccountsMap.get(commercialId)
    
    // Create unified account with normalized fields
    const unified: UnifiedAccount = {
      ...dynamoAccount,
      ...orgData,
      // Normalized fields (override any conflicts)
      accountId: commercialId,
      govCloudAccountId: govCloudId,
      requestId: dynamoAccount.requestID,
      email: dynamoAccount.awsAccountEmail,
      name: dynamoAccount.projectName || orgData?.accountName,
      status: orgData?.accountStatus || 'UNKNOWN',
      source: orgData ? 'both' : 'dynamodb'
    }
    
    unifiedAccounts.push(unified)

    // Mark as processed (commercialId is guaranteed to exist at this point)
    orgAccountsMap.delete(commercialId)
  }

  // Add any Organizations-only accounts (not in DynamoDB)
  for (const [accountId, orgAccount] of orgAccountsMap) {
    if (!includeDecommissioned && orgAccount.accountStatus !== 'ACTIVE') {
      continue
    }
    
    const unified: UnifiedAccount = {
      ...orgAccount,
      accountId: accountId,
      name: orgAccount.accountName,
      email: orgAccount.accountEmail,
      status: orgAccount.accountStatus,
      source: 'organizations'
    }
    
    unifiedAccounts.push(unified)
  }
  
  return unifiedAccounts
}

/**
 * Lookup account by various criteria (replaces lookupAccountUnified)
 */
export async function lookupAccountUnified(criteria: AccountLookupCriteria): Promise<UnifiedAccount | null> {
  // Get all unified accounts and search
  const accounts = await getAllAccountsUnified(true) // Include decommissioned for lookup
  
  // Find account matching criteria
  const account = accounts.find(acc => {
    if (criteria.accountId && (acc.accountId === criteria.accountId || acc.awsStandardAccountID === criteria.accountId)) {
      return true
    }
    if (criteria.govCloudAccountId && (acc.govCloudAccountId === criteria.govCloudAccountId || acc.awsGovCloudAccountID === criteria.govCloudAccountId)) {
      return true
    }
    if (criteria.requestId && (acc.requestId === criteria.requestId || acc.requestID === criteria.requestId)) {
      return true
    }
    if (criteria.accountEmail && acc.email?.toLowerCase().includes(criteria.accountEmail.toLowerCase())) {
      return true
    }
    if (criteria.accountName && acc.name?.toLowerCase().includes(criteria.accountName.toLowerCase())) {
      return true
    }
    return false
  })
  
  return account || null
}

/**
 * Update account metadata in DynamoDB
 */
export async function updateAccountMetadata(
  accountId: string,
  metadata: Partial<AccountInfo>
): Promise<AccountInfo | null> {
  if (!hasCredentials('govcloud')) {
    throw new Error('GovCloud credentials required to update account metadata')
  }
  
  try {
    const tableName = await getAccountsTableName()
    const environment = await getTableEnvironment('externalAccounts')

    // Ensure we don't overwrite the primary account ID
    const { accountId: _, ...safeMetadata } = metadata
    const updateData = {
      ...safeMetadata,
      modifiedDate: new Date().toISOString()
    }

    await updateItem(tableName, { accountId }, updateData, environment)
    
    // Return the updated account with full data
    return lookupAccountUnified({ accountId })
  } catch (error) {
    logger.error(`Failed to update metadata for account ${accountId}:`, error)
    throw error
  }
}

/**
 * Sync account from Organizations (placeholder for sync functionality)
 */
export async function syncAccountFromOrganizations(
  accountId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<AccountInfo | null> {
  try {
    // Get fresh data from Organizations
    const orgData = await getAccountFromOrganizations(accountId, environment)
    if (!orgData) {
      throw new Error(`Account ${accountId} not found in Organizations`)
    }
    
    logger.info(`Synced account ${accountId} from Organizations (${environment})`)
    return orgData
  } catch (error) {
    logger.error(`Failed to sync account ${accountId} from Organizations:`, error)
    throw error
  }
}

/**
 * Search accounts by name or email
 */
export async function searchAccountsUnified(searchTerm: string): Promise<UnifiedAccount[]> {
  const accounts = await getAllAccountsUnified(false) // Exclude decommissioned by default
  const term = searchTerm.toLowerCase()
  
  return accounts.filter(acc => 
    acc.name?.toLowerCase().includes(term) ||
    acc.email?.toLowerCase().includes(term) ||
    acc.accountId?.includes(term) ||
    acc.govCloudAccountId?.includes(term) ||
    acc.requestId?.toString().includes(term)
  )
}

/**
 * Get account statistics
 */
export async function getAccountStatistics() {
  const accounts = await getAllAccountsUnified(true) // Include decommissioned for stats
  
  const stats = {
    total: accounts.length,
    active: accounts.filter(acc => acc.status === 'ACTIVE').length,
    decommissioned: accounts.filter(acc => acc.enclaveStatus === 'Decommissioned').length,
    commercialOnly: accounts.filter(acc => acc.accountId && !acc.govCloudAccountId).length,
    govCloudPaired: accounts.filter(acc => acc.accountId && acc.govCloudAccountId).length,
    govCloudOnly: accounts.filter(acc => !acc.accountId && acc.govCloudAccountId).length,
    withMetadata: accounts.filter(acc => acc.source === 'both' || acc.source === 'dynamodb').length,
    environments: {} as Record<string, number>
  }
  
  // Count by source
  accounts.forEach(acc => {
    const source = acc.source || 'unknown'
    stats.environments[source] = (stats.environments[source] || 0) + 1
  })
  
  return stats
}