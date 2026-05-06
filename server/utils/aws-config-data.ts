/**
 * AWS Config Data Fetcher
 *
 * Fetches AWS Config resources, compliance data, and configuration history
 * across multiple accounts and regions.
 */

import {
  SelectAggregateResourceConfigCommand,
  DescribeComplianceByResourceCommand,
  DescribeComplianceByConfigRuleCommand,
  ListDiscoveredResourcesCommand,
  GetAggregateComplianceDetailsByConfigRuleCommand,
  type ConfigServiceClient,
} from '@aws-sdk/client-config-service'
import { getConfigServiceClient } from '../lib/aws-client-factory'
import { getAggregatorName } from './config-service'
import { getAllAccountsUnified } from './accounts-consolidated'
import { logger } from './logger'
import type {
  ConfigResourceRecord,
  ConfigDatasetFilters,
} from '../../shared/types/dataset-reports'
import type { AWSConfigResourceType, ComplianceStatus } from '../../shared/types/aws-config'

// Use centralized getAggregatorName from config-service.ts
const getConfigAggregatorName = getAggregatorName

/**
 * Get Config client for a specific account/region
 * Config aggregator typically runs in the organization management account
 */
async function getConfigClient(accountId?: string, region?: string): Promise<ConfigServiceClient> {
  // Default to govcloud environment (can be overridden by env var if needed)
  const environment = (process.env.AWS_CONFIG_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
  // Use appropriate default region based on environment
  const defaultRegion = environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'
  return getConfigServiceClient(environment, region || defaultRegion, accountId)
}

/**
 * Fetch AWS Config resources using advanced query (SQL-like)
 *
 * This uses Config's SelectAggregateResourceConfig API which allows
 * SQL-like queries across all accounts in the organization.
 */
async function fetchResourcesViaQuery(
  accounts: string[],
  filters: ConfigDatasetFilters,
  region: string = 'us-east-1',
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<ConfigResourceRecord[]> {
  const client = await getConfigClient(undefined, region)
  const results: ConfigResourceRecord[] = []
  const aggregatorName = getConfigAggregatorName(environment)

  // Build SQL-like query
  let queryParts: string[] = [
    'SELECT',
    '  accountId,',
    '  awsRegion,',
    '  resourceType,',
    '  resourceId,',
    '  resourceName,',
    '  configuration,',
    '  configurationItemCaptureTime,',
    '  tags',
  ]

  // Start WHERE clause - no status filter needed for aggregated queries
  // The aggregator automatically filters to current resources
  let whereStarted = false

  // Filter by accounts if specified
  if (accounts.length > 0) {
    const accountList = accounts.map(id => `'${id}'`).join(', ')
    queryParts.push(`${whereStarted ? 'AND' : 'WHERE'} accountId IN (${accountList})`)
    whereStarted = true
  }

  // Filter by resource types
  if (filters.resourceTypes && filters.resourceTypes.length > 0) {
    const typeList = filters.resourceTypes.map(t => `'${t}'`).join(', ')
    queryParts.push(`${whereStarted ? 'AND' : 'WHERE'} resourceType IN (${typeList})`)
    whereStarted = true
  }

  // Filter by regions
  if (filters.regions && filters.regions.length > 0) {
    const regionList = filters.regions.map(r => `'${r}'`).join(', ')
    queryParts.push(`${whereStarted ? 'AND' : 'WHERE'} awsRegion IN (${regionList})`)
    whereStarted = true
  }

  const expression = queryParts.join('\n')

  logger.info('[Config] Executing advanced query', { expression })

  try {
    let nextToken: string | undefined
    let pageCount = 0
    const maxPages = 50  // Prevent runaway queries

    do {
      const command = new SelectAggregateResourceConfigCommand({
        Expression: expression,
        ConfigurationAggregatorName: aggregatorName,
        Limit: 100,
        NextToken: nextToken,
      })

      const response = await client.send(command)
      pageCount++

      if (response.Results) {
        for (const resultStr of response.Results) {
          try {
            const resource = JSON.parse(resultStr)

            // Parse tags if present
            let tags: Record<string, string> | undefined
            if (resource.tags) {
              try {
                const tagsData = typeof resource.tags === 'string'
                  ? JSON.parse(resource.tags)
                  : resource.tags
                tags = tagsData
              } catch {
                tags = undefined
              }
            }

            // Parse configuration to extract ARN if available
            let arn: string | undefined
            if (resource.configuration) {
              try {
                const config = typeof resource.configuration === 'string'
                  ? JSON.parse(resource.configuration)
                  : resource.configuration
                arn = config.arn || config.ARN
              } catch {
                // Ignore parsing errors
              }
            }

            results.push({
              accountId: resource.accountId,
              accountName: '', // Will be filled later
              region: resource.awsRegion,
              resourceType: resource.resourceType,
              resourceId: resource.resourceId,
              resourceName: resource.resourceName || undefined,
              configurationItemCaptureTime: resource.configurationItemCaptureTime,
              tags,
              arn,
            })
          } catch (error) {
            logger.warn('[Config] Failed to parse resource result', { error, resultStr })
          }
        }
      }

      nextToken = response.NextToken
      logger.debug('[Config] Query page completed', {
        page: pageCount,
        resultsInPage: response.Results?.length || 0,
        totalResults: results.length,
        hasMore: !!nextToken
      })

    } while (nextToken && pageCount < maxPages)

    if (nextToken) {
      logger.warn('[Config] Query exceeded max pages, results may be incomplete', {
        maxPages,
        totalResults: results.length
      })
    }

  } catch (error) {
    logger.error('[Config] Advanced query failed', { error, expression })
    throw new Error(`Failed to query Config resources: ${error.message}`)
  }

  return results
}

/**
 * Fetch compliance details for resources
 *
 * This enriches resource records with compliance status from Config rules.
 */
async function fetchComplianceDetails(
  accounts: string[],
  filters: ConfigDatasetFilters,
  region: string = 'us-east-1',
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<Map<string, { status: ComplianceStatus; rules: string[] }>> {
  const client = await getConfigClient(undefined, region)
  const complianceMap = new Map<string, { status: ComplianceStatus; rules: string[] }>()
  const aggregatorName = getConfigAggregatorName(environment)

  // If complianceOnly filter is set, we need compliance data
  // Otherwise, compliance is optional enrichment
  if (!filters.complianceOnly && !filters.complianceStatus) {
    return complianceMap  // Skip if not needed
  }

  try {
    // Use aggregator to get compliance across all accounts
    const command = new GetAggregateComplianceDetailsByConfigRuleCommand({
      ConfigurationAggregatorName: aggregatorName,
      ConfigRuleName: undefined,  // Get all rules
      AccountId: accounts.length > 0 ? accounts[0] : undefined,
      AwsRegion: region,
      ComplianceType: filters.complianceStatus?.[0],  // Filter by compliance status if specified
      Limit: 100,
    })

    // Note: This is a simplified version. In production, you'd need to:
    // 1. Iterate through all config rules
    // 2. Fetch compliance for each rule
    // 3. Build a comprehensive map
    // For now, we'll log a warning and continue
    logger.warn('[Config] Compliance enrichment not fully implemented - returning basic data')

  } catch (error) {
    logger.error('[Config] Failed to fetch compliance details', { error })
    // Non-fatal - continue without compliance data
  }

  return complianceMap
}

/**
 * Main function: Get Config resources for dataset reports
 *
 * @param accountIds - List of account IDs to query (empty = all accounts)
 * @param filters - Filter options for resources
 * @returns Normalized Config resource records
 */
export async function getConfigResources(
  accountIds: string[],
  filters: ConfigDatasetFilters = {}
): Promise<ConfigResourceRecord[]> {
  const startTime = Date.now()

  logger.info('[Config] Fetching resources', {
    accountCount: accountIds.length || 'all',
    filters,
  })

  try {
    // Get all accounts for name mapping
    const allAccounts = await getAllAccountsUnified()

    // Determine the appropriate environment based on configuration
    const environment = (process.env.AWS_CONFIG_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
    const region = environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'

    // Build account maps for both Commercial and GovCloud IDs
    const commercialAccountMap = new Map(
      allAccounts.map(acc => [acc.accountId, acc.accountName || acc.projectName || acc.accountId])
    )
    const govCloudAccountMap = new Map(
      allAccounts
        .filter(acc => acc.awsGovCloudAccountID)
        .map(acc => [acc.awsGovCloudAccountID!, acc.accountName || acc.projectName || acc.accountId])
    )

    // Determine which accounts to query - need to use correct IDs for the environment
    let targetAccounts: string[] = []
    if (accountIds.length === 0) {
      // Empty array = all accounts
      if (environment === 'govcloud') {
        targetAccounts = allAccounts
          .filter(acc => acc.awsGovCloudAccountID)
          .map(acc => acc.awsGovCloudAccountID!)
      } else {
        targetAccounts = allAccounts.map(acc => acc.accountId)
      }
    } else {
      // User selected specific accounts (by commercial ID)
      // Need to map to the correct environment's account IDs
      if (environment === 'govcloud') {
        targetAccounts = accountIds
          .map(commercialId => {
            const account = allAccounts.find(acc => acc.accountId === commercialId)
            return account?.awsGovCloudAccountID
          })
          .filter((id): id is string => !!id) // Remove undefined values
      } else {
        targetAccounts = accountIds
      }
    }

    // Validate accounts exist
    const accountMap = environment === 'govcloud' ? govCloudAccountMap : commercialAccountMap
    const validAccounts = targetAccounts.filter(id => accountMap.has(id))
    if (validAccounts.length < targetAccounts.length) {
      const missing = targetAccounts.filter(id => !accountMap.has(id))
      logger.warn('[Config] Some accounts not found in environment', {
        missing,
        environment,
        requestedCount: targetAccounts.length,
        validCount: validAccounts.length
      })
    }

    // Fetch resources via advanced query
    // Config aggregator works across all regions, so we only need one call
    const resources = await fetchResourcesViaQuery(validAccounts, filters, region, environment)

    // Fetch compliance details if needed
    const complianceMap = await fetchComplianceDetails(validAccounts, filters, region, environment)

    // Enrich resources with account names and compliance
    const enrichedResources = resources.map(resource => {
      const accountName = accountMap.get(resource.accountId) || resource.accountId
      const compliance = complianceMap.get(`${resource.accountId}:${resource.resourceId}`)

      return {
        ...resource,
        accountName,
        complianceStatus: compliance?.status,
        complianceType: compliance?.rules.join(', '),
      }
    })

    // Apply compliance filters if specified
    let filteredResources = enrichedResources
    if (filters.complianceStatus && filters.complianceStatus.length > 0) {
      filteredResources = enrichedResources.filter(r =>
        r.complianceStatus && filters.complianceStatus!.includes(r.complianceStatus)
      )
    }

    // If complianceOnly is true, exclude resources without compliance data
    if (filters.complianceOnly) {
      filteredResources = filteredResources.filter(r => r.complianceStatus !== undefined)
    }

    const duration = Date.now() - startTime
    logger.info('[Config] Resources fetched successfully', {
      totalResources: filteredResources.length,
      durationMs: duration,
      accountsQueried: validAccounts.length,
    })

    return filteredResources

  } catch (error) {
    logger.error('[Config] Failed to fetch resources', { error })
    throw new Error(`Failed to fetch Config resources: ${error.message}`)
  }
}

/**
 * Get Config resource types summary
 *
 * Returns a count of resources by type across specified accounts.
 */
export async function getConfigResourceTypeSummary(
  accountIds: string[],
  filters: ConfigDatasetFilters = {}
): Promise<Record<string, number>> {
  const resources = await getConfigResources(accountIds, filters)

  const summary: Record<string, number> = {}
  for (const resource of resources) {
    summary[resource.resourceType] = (summary[resource.resourceType] || 0) + 1
  }

  return summary
}

/**
 * Get Config compliance summary
 *
 * Returns a summary of compliance status across resources.
 */
export async function getConfigComplianceSummary(
  accountIds: string[],
  filters: ConfigDatasetFilters = {}
): Promise<{
  compliant: number
  nonCompliant: number
  notApplicable: number
  insufficientData: number
  total: number
}> {
  const resources = await getConfigResources(accountIds, filters)

  const summary = {
    compliant: 0,
    nonCompliant: 0,
    notApplicable: 0,
    insufficientData: 0,
    total: resources.length,
  }

  for (const resource of resources) {
    if (!resource.complianceStatus) continue

    switch (resource.complianceStatus) {
      case 'COMPLIANT':
        summary.compliant++
        break
      case 'NON_COMPLIANT':
        summary.nonCompliant++
        break
      case 'NOT_APPLICABLE':
        summary.notApplicable++
        break
      case 'INSUFFICIENT_DATA':
        summary.insufficientData++
        break
    }
  }

  return summary
}
