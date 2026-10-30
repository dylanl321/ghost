/**
 * AWS Config Data Fetcher
 *
 * Fetches AWS Config resources, compliance data, and configuration history
 * across multiple accounts and regions.
 */

import {
  SelectAggregateResourceConfigCommand,
  DescribeAggregateComplianceByConfigRulesCommand,
  GetAggregateComplianceDetailsByConfigRuleCommand,
  type ConfigServiceClient,
} from '@aws-sdk/client-config-service'
import { getConfigServiceClient } from '../lib/aws-client-factory'
import { configTagsToRecord, getAggregatorName } from './config-service'
import { getAllAccountsUnified, type UnifiedAccount } from './accounts-consolidated'
import { logger } from './logger'
import type {
  ConfigResourceRecord,
  ConfigDatasetFilters,
  DatasetQueryOptions,
  DatasetQueryResult,
} from '../../shared/types/dataset-reports'

type ConfigComplianceStatus = 'COMPLIANT' | 'NON_COMPLIANT' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA'

// Use centralized getAggregatorName from config-service.ts
const getConfigAggregatorName = getAggregatorName

export function resolveConfigAccountScope(
  allAccounts: UnifiedAccount[],
  requestedIds: string[],
  environment: 'commercial' | 'govcloud'
): { validAccounts: string[]; accountMap: Map<string, string> } {
  const accountIdFor = (account: UnifiedAccount) => environment === 'govcloud'
    ? account.govCloudAccountId || account.awsGovCloudAccountID
    : account.accountId || account.awsStandardAccountID
  const accountMap = new Map(allAccounts.flatMap(account => {
    const id = accountIdFor(account)
    return id ? [[id, account.accountName || account.projectName || account.name || id] as const] : []
  }))
  const requestedTargets = requestedIds.map(requestedId => {
    const account = allAccounts.find(item => [
      item.accountId, item.awsStandardAccountID, item.govCloudAccountId, item.awsGovCloudAccountID
    ].includes(requestedId))
    return { requestedId, targetId: account ? accountIdFor(account) : undefined }
  })
  const unresolved = requestedTargets.filter(item => !item.targetId || !accountMap.has(item.targetId)).map(item => item.requestedId)
  if (unresolved.length) {
    const error = new Error(`Requested accounts are unavailable in ${environment}: ${unresolved.join(', ')}`)
    error.name = 'ACCOUNT_NOT_FOUND'
    throw error
  }
  const targetAccounts = requestedIds.length
    ? requestedTargets.map(item => item.targetId!).filter(Boolean)
    : [...accountMap.keys()]
  const validAccounts = [...new Set(targetAccounts.filter(id => accountMap.has(id)))]
  return { validAccounts, accountMap }
}

/**
 * Get Config client for a specific account/region
 * Config aggregator typically runs in the organization management account
 */
async function getConfigClient(environment: 'commercial' | 'govcloud', region?: string, accountId?: string): Promise<ConfigServiceClient> {
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
  environment: 'commercial' | 'govcloud' = 'govcloud',
  options: DatasetQueryOptions = {}
): Promise<{ records: ConfigResourceRecord[]; hasMore: boolean; scannedCount: number }> {
  const client = await getConfigClient(environment, region)
  const results: ConfigResourceRecord[] = []
  let queryHasMore = false
  const aggregatorName = getConfigAggregatorName(environment)

  // Build SQL-like query
  const queryParts: string[] = [
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
    const accountList = accounts.map(id => `'${id.replace(/'/g, "''")}'`).join(', ')
    queryParts.push(`${whereStarted ? 'AND' : 'WHERE'} accountId IN (${accountList})`)
    whereStarted = true
  }

  // Filter by resource types
  if (filters.resourceTypes && filters.resourceTypes.length > 0) {
    const typeList = filters.resourceTypes.map(t => `'${t.replace(/'/g, "''")}'`).join(', ')
    queryParts.push(`${whereStarted ? 'AND' : 'WHERE'} resourceType IN (${typeList})`)
    whereStarted = true
  }

  // Filter by regions
  if (filters.regions && filters.regions.length > 0) {
    const regionList = filters.regions.map(r => `'${r.replace(/'/g, "''")}'`).join(', ')
    queryParts.push(`${whereStarted ? 'AND' : 'WHERE'} awsRegion IN (${regionList})`)
    whereStarted = true
  }

  if (filters.resourceId) {
    // resourceId is an immutable identifier (for example, an EC2 instance ID),
    // so exact matching avoids AWS Config's short wildcard restrictions.
    queryParts.push(`${whereStarted ? 'AND' : 'WHERE'} resourceId = '${filters.resourceId.replace(/'/g, "''")}'`)
    whereStarted = true
  }
  if (filters.resourceName) {
    queryParts.push(`${whereStarted ? 'AND' : 'WHERE'} ${buildConfigResourceNamePredicate(filters.resourceName)}`)
    whereStarted = true
  }
  if (filters.instanceStates?.length) {
    const states = filters.instanceStates.map(state => `'${state.replace(/'/g, "''")}'`).join(', ')
    queryParts.push(`${whereStarted ? 'AND' : 'WHERE'} configuration.state.name IN (${states})`)
  }

  const expression = queryParts.join('\n')

  logger.info('[Config] Executing advanced query', { expression })

  try {
    let nextToken: string | undefined
    let pageCount = 0
    const preview = options.mode === 'preview'
    const needsClientFiltering = filters.quickFilters || filters.tags || filters.complianceOnly || filters.complianceStatus?.length
    const maxScanned = preview ? (options.maxScanned || (needsClientFiltering ? 250 : (options.limit || 25))) : Number.POSITIVE_INFINITY

    do {
      const command = new SelectAggregateResourceConfigCommand({
        Expression: expression,
        ConfigurationAggregatorName: aggregatorName,
        Limit: preview ? Math.min(100, Math.max(1, maxScanned - results.length)) : 100,
        NextToken: nextToken,
      })

      const response = await client.send(command, { abortSignal: options.signal })
      pageCount++

      if (response.Results) {
        for (const resultStr of response.Results) {
          try {
            const resource = JSON.parse(resultStr)

            // Parse tags if present
            // Config returns tags as [{ key, value }]; filters and reports expect a map
            const tags = resource.tags ? configTagsToRecord(resource.tags) : undefined

            // Parse configuration to extract ARN if available
            let arn: string | undefined
            let configuration: Record<string, any> | undefined
            if (resource.configuration) {
              try {
                const config = typeof resource.configuration === 'string'
                  ? JSON.parse(resource.configuration)
                  : resource.configuration
                configuration = config
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
              configuration,
            })
          } catch (error) {
            logger.warn('[Config] Failed to parse resource result', { error, resultStr })
          }
        }
      }

      nextToken = response.NextToken
      await options.onProgress?.({ phase: 'config', processed: results.length })
      logger.debug('[Config] Query page completed', {
        page: pageCount,
        resultsInPage: response.Results?.length || 0,
        totalResults: results.length,
        hasMore: !!nextToken
      })

      if (preview && results.length >= maxScanned) {
        queryHasMore = Boolean(nextToken)
        break
      }
    } while (nextToken && pageCount < 50)

    if (nextToken) {
      queryHasMore = true
      logger.warn('[Config] Query exceeded max pages, results may be incomplete', {
        maxPages: 50,
        totalResults: results.length
      })
    }

  } catch (error) {
    logger.error('[Config] Advanced query failed', { error, expression })
    throw new Error(`Failed to query Config resources: ${(error instanceof Error ? error.message : String(error))}`, { cause: error })
  }

  return { records: results, hasMore: queryHasMore, scannedCount: results.length }
}

export function buildConfigResourceNamePredicate(resourceName: string): string {
  // AWS Config supports prefix matching but rejects the leading wildcard used by contains searches.
  const prefix = resourceName.trim().replace(/%/g, '')
  if (!prefix) throw new Error('Resource name must include non-wildcard characters')
  const escaped = prefix.replace(/'/g, "''")
  return prefix.length < 3 ? `resourceName = '${escaped}'` : `resourceName LIKE '${escaped}%'`
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
  environment: 'commercial' | 'govcloud' = 'govcloud',
  options: DatasetQueryOptions = {}
): Promise<Map<string, { status: ConfigComplianceStatus; rules: string[] }>> {
  const client = await getConfigClient(environment, region)
  const complianceMap = new Map<string, { status: ConfigComplianceStatus; rules: string[] }>()
  const aggregatorName = getConfigAggregatorName(environment)

  // If complianceOnly filter is set, we need compliance data
  // Otherwise, compliance is optional enrichment
  if (!filters.complianceOnly && !filters.complianceStatus) {
    return complianceMap  // Skip if not needed
  }

  try {
    const ruleScopes: Array<{ ruleName: string; accountId: string; awsRegion: string }> = []
    let nextToken: string | undefined

    do {
      if (options.signal?.aborted) throw options.signal.reason || new Error('Query canceled')
      const response = await client.send(new DescribeAggregateComplianceByConfigRulesCommand({
        ConfigurationAggregatorName: aggregatorName,
        Filters: filters.complianceStatus?.length === 1
          ? { ComplianceType: filters.complianceStatus[0] }
          : undefined,
        Limit: 100,
        NextToken: nextToken
      }), { abortSignal: options.signal })

      for (const rule of response.AggregateComplianceByConfigRules || []) {
        if (!rule.ConfigRuleName || !rule.AccountId || !rule.AwsRegion) continue
        if (accounts.length > 0 && !accounts.includes(rule.AccountId)) continue
        if (filters.regions?.length && !filters.regions.includes(rule.AwsRegion)) continue
        ruleScopes.push({ ruleName: rule.ConfigRuleName, accountId: rule.AccountId, awsRegion: rule.AwsRegion })
      }
      nextToken = response.NextToken
    } while (nextToken)

    for (let offset = 0; offset < ruleScopes.length; offset += 10) {
      await Promise.all(ruleScopes.slice(offset, offset + 10).map(async scope => {
        let detailToken: string | undefined
        do {
          if (options.signal?.aborted) throw options.signal.reason || new Error('Query canceled')
          const response = await client.send(new GetAggregateComplianceDetailsByConfigRuleCommand({
            ConfigurationAggregatorName: aggregatorName,
            ConfigRuleName: scope.ruleName,
            AccountId: scope.accountId,
            AwsRegion: scope.awsRegion,
            ComplianceType: filters.complianceStatus?.length === 1 ? filters.complianceStatus[0] : undefined,
            Limit: 100,
            NextToken: detailToken
          }), { abortSignal: options.signal })

          for (const result of response.AggregateEvaluationResults || []) {
            const qualifier = result.EvaluationResultIdentifier?.EvaluationResultQualifier
            const status = result.ComplianceType as ConfigComplianceStatus | undefined
            if (!qualifier?.ResourceId || !qualifier.ResourceType || !status) continue

            const key = `${scope.accountId}:${qualifier.ResourceType}:${qualifier.ResourceId}`
            const existing = complianceMap.get(key)
            if (!existing) {
              complianceMap.set(key, { status, rules: [scope.ruleName] })
            } else {
              existing.rules.push(scope.ruleName)
              if (status === 'NON_COMPLIANT') existing.status = status
            }
          }
          detailToken = response.NextToken
        } while (detailToken)
      }))
    }

  } catch (error) {
    if (options.signal?.aborted) throw error
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
  filters: ConfigDatasetFilters = {},
  options: DatasetQueryOptions = {}
): Promise<ConfigResourceRecord[]> {
  return (await queryConfigResources(accountIds, filters, options)).records
}

export async function queryConfigResources(
  accountIds: string[],
  filters: ConfigDatasetFilters = {},
  options: DatasetQueryOptions = {}
): Promise<DatasetQueryResult<ConfigResourceRecord>> {
  const startTime = Date.now()

  logger.info('[Config] Fetching resources', {
    accountCount: accountIds.length || 'all',
    filters,
  })

  try {
    // Get all accounts for name mapping
    const allAccounts = await getAllAccountsUnified()
    // Determine the appropriate environment based on configuration
    const environment = options.environment || (process.env.AWS_CONFIG_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
    const region = environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'

    const { validAccounts, accountMap } = resolveConfigAccountScope(allAccounts, accountIds, environment)

    // Fetch resources via advanced query
    // Config aggregator works across all regions, so we only need one call
    const queryResult = await fetchResourcesViaQuery(validAccounts, filters, region, environment, options)
    const resources = queryResult.records

    // Fetch compliance details if needed
    const complianceMap = await fetchComplianceDetails(validAccounts, filters, region, environment, options)

    // Enrich resources with account names and compliance
    const enrichedResources = resources.map(resource => {
      const accountName = accountMap.get(resource.accountId) || resource.accountId
      const compliance = complianceMap.get(`${resource.accountId}:${resource.resourceType}:${resource.resourceId}`)

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

    if (filters.quickFilters) {
      filteredResources = filteredResources.filter(resource => matchesQuickFilters(resource, filters.quickFilters!))
    }
    if (filters.tags && Object.keys(filters.tags).length > 0) {
      filteredResources = filteredResources.filter(resource => Object.entries(filters.tags!).every(([key, value]) => resource.tags?.[key] === value))
    }

    const limit = options.limit
    const truncated = Boolean(limit && (filteredResources.length > limit || queryResult.hasMore))
    const records = limit ? filteredResources.slice(0, limit) : filteredResources

    const duration = Date.now() - startTime
    logger.info('[Config] Resources fetched successfully', {
      totalResources: records.length,
      durationMs: duration,
      accountsQueried: validAccounts.length,
    })

    return {
      records,
      sampleCount: records.length,
      hasMore: truncated,
      truncated,
      scannedCount: queryResult.scannedCount
    }

  } catch (error) {
    logger.error('[Config] Failed to fetch resources', { error })
    throw new Error(`Failed to fetch Config resources: ${(error instanceof Error ? error.message : String(error))}`, { cause: error })
  }
}

function matchesQuickFilters(
  resource: ConfigResourceRecord,
  filters: NonNullable<ConfigDatasetFilters['quickFilters']>
): boolean {
  const config = resource.configuration || {}
  const serialized = JSON.stringify(config).toLowerCase()

  if (filters.publicIpOnly) {
    const hasPublicIp = Boolean(config.publicIpAddress || config.publicIp) ||
      /"public(?:ip|ipaddress)"\s*:\s*"\d{1,3}(?:\.\d{1,3}){3}"/.test(serialized)
    if (!hasPublicIp) return false
  }

  if (filters.publicAccessEnabled) {
    const block = config.publicAccessBlockConfiguration || config.PublicAccessBlockConfiguration
    const fullyBlocked = block && ['blockPublicAcls', 'ignorePublicAcls', 'blockPublicPolicy', 'restrictPublicBuckets']
      .every(key => block[key] === true)
    if (fullyBlocked || (!block && !serialized.includes('public'))) return false
  }

  if (filters.openToInternet && !serialized.includes('0.0.0.0/0') && !serialized.includes('::/0')) {
    return false
  }

  if (filters.unencryptedOnly && config.encrypted !== false && config.storageEncrypted !== false) {
    return false
  }

  if (filters.noMfaOnly && config.mfaActive !== false && config.mfaEnabled !== false) {
    return false
  }

  return true
}
