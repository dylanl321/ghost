/**
 * GET /api/config/summary
 * 
 * Get organization-wide or account-specific resource summaries
 * 
 * FEATURES:
 * - Organization-wide resource summaries across all accounts
 * - Account-specific summaries when account identifier provided
 * - Resource counts by type, region, and account
 * - Tag coverage analysis
 * - Age distribution of resources
 * - Multi-environment support (Commercial and GovCloud)
 * - Efficient aggregation using AWS Config
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, sendApiError, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { parseAndValidateAccountFilters, filterAccounts } from '../../utils/account-filters'
import { lookupAccountOptimized } from '../../utils/account-lookup-optimized'
import {
  listAggregateResources,
  calculateResourceStats,
  type ResourceDetail,
  type ResourceFilter
} from '../../utils/config-service'
import { getCacheManager } from '../../utils/cache-manager'
import type { AWSEnvironmentType } from '../../types'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/config/summary', 'GET', {
  summary: 'Get resource summary',
  description: 'Get organization-wide or account-specific resource summaries with counts and statistics',
  tags: ['Resources'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of account identifiers (12-digit ID, email, or request ID) for specific account summaries'
    },
    {
      name: 'linesOfBusiness',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of lines of business'
    },
    {
      name: 'departments',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of department numbers'
    },
    {
      name: 'includeDecommissioned',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include decommissioned accounts'
    },
    {
      name: 'region',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'AWS region to filter resources'
    },
    {
      name: 'includeDetails',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include detailed breakdowns by resource type'
    },
    {
      name: 'scanMode',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['quick', 'standard', 'full'],
        default: 'standard'
      },
      description: 'Scan mode: quick (priority types only), standard (no pagination), full (all resources with pagination)'
    },
    {
      name: 'maxResourcesPerType',
      in: 'query',
      required: false,
      schema: { 
        type: 'integer',
        default: 1000,
        minimum: 100,
        maximum: 10000
      },
      description: 'Maximum resources to fetch per type (full mode only)'
    }
  ],
  responses: {
    200: {
      description: 'Successfully retrieved resource summary',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  summary: {
                    type: 'object',
                    properties: {
                      totalResources: { 
                        type: 'integer',
                        description: 'Total number of resources'
                      },
                      totalAccounts: { 
                        type: 'integer',
                        description: 'Number of accounts with resources'
                      },
                      totalRegions: { 
                        type: 'integer',
                        description: 'Number of regions with resources'
                      },
                      resourceTypes: { 
                        type: 'integer',
                        description: 'Number of distinct resource types'
                      },
                      tagCoverage: { 
                        type: 'integer',
                        description: 'Percentage of resources with tags (0-100)'
                      },
                      oldestResource: { 
                        type: 'string',
                        format: 'date-time',
                        description: 'Creation time of oldest resource'
                      },
                      newestResource: { 
                        type: 'string',
                        format: 'date-time',
                        description: 'Creation time of newest resource'
                      }
                    }
                  },
                  byAccount: { 
                    type: 'object',
                    additionalProperties: { 
                      type: 'object',
                      properties: {
                        count: { type: 'integer' },
                        resourceTypes: { 
                          type: 'array',
                          items: { type: 'string' }
                        },
                        regions: { 
                          type: 'array',
                          items: { type: 'string' }
                        }
                      }
                    },
                    description: 'Resource counts and details by account'
                  },
                  byRegion: { 
                    type: 'object',
                    additionalProperties: { type: 'integer' },
                    description: 'Resource count by AWS region'
                  },
                  byType: { 
                    type: 'object',
                    additionalProperties: { 
                      type: 'object',
                      properties: {
                        count: { type: 'integer' },
                        accounts: { 
                          type: 'array',
                          items: { type: 'string' }
                        },
                        regions: { 
                          type: 'array',
                          items: { type: 'string' }
                        }
                      }
                    },
                    description: 'Resource count and distribution by type'
                  },
                  topResourceTypes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string' },
                        count: { type: 'integer' },
                        percentage: { type: 'number' }
                      }
                    },
                    description: 'Top 10 most common resource types'
                  },
                  ageDistribution: {
                    type: 'object',
                    properties: {
                      lessThan30Days: { type: 'integer' },
                      between30And90Days: { type: 'integer' },
                      between90And365Days: { type: 'integer' },
                      moreThan365Days: { type: 'integer' }
                    },
                    description: 'Resource age distribution'
                  }
                }
              }
            }
          }
        }
      }
    },
    400: {
      description: 'Bad request - invalid parameters',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    401: {
      description: 'Unauthorized - missing or invalid API key',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    }
  }
})

/**
 * Common AWS resource types to query
 */
const RESOURCE_TYPES = [
  'AWS::EC2::Instance',
  'AWS::EC2::Volume',
  'AWS::EC2::SecurityGroup',
  'AWS::EC2::VPC',
  'AWS::EC2::Subnet',
  'AWS::S3::Bucket',
  'AWS::Lambda::Function',
  'AWS::RDS::DBInstance',
  'AWS::RDS::DBCluster',
  'AWS::IAM::Role',
  'AWS::IAM::User',
  'AWS::IAM::Policy',
  'AWS::DynamoDB::Table',
  'AWS::CloudFormation::Stack',
  'AWS::AutoScaling::AutoScalingGroup',
  'AWS::ECS::Service',
  'AWS::ECS::Cluster',
  'AWS::ELB::LoadBalancer',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::ElasticLoadBalancingV2::TargetGroup'
]

/**
 * Priority resource types for quick summary
 */
const PRIORITY_RESOURCE_TYPES = [
  'AWS::EC2::Instance',
  'AWS::S3::Bucket',
  'AWS::RDS::DBInstance',
  'AWS::Lambda::Function',
  'AWS::DynamoDB::Table'
]

/**
 * Sleep for specified milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Query resources for a single type with pagination and retry logic
 */
async function queryResourceType(
  aggregatorName: string,
  resourceType: string,
  filter: ResourceFilter,
  environment: AWSEnvironmentType,
  region: string,
  maxResources: number = 1000
): Promise<ResourceDetail[]> {
  const allResources: ResourceDetail[] = []
  
  // If we have multiple account IDs, we need to query each separately
  // AWS Config API only accepts one account ID at a time in filters
  const accountIds = filter.accountIds || []
  const accountsToQuery = accountIds.length > 0 ? accountIds : [undefined]
  
  for (const accountId of accountsToQuery) {
    let nextToken: string | undefined
    let accountResources = 0
    
    do {
      let retryCount = 0
      const maxRetries = 3
      let lastError: any
      
      while (retryCount < maxRetries) {
        try {
          const queryFilter: ResourceFilter = {
            ...filter,
            resourceType,
            limit: Math.min(1000, maxResources - allResources.length),
            nextToken
          }
          
          // Override with single account ID if iterating
          if (accountId) {
            queryFilter.accountIds = [accountId]
          } else {
            // Remove accountIds for organization-wide query
            delete queryFilter.accountIds
          }
          
          const { resources, nextToken: newToken } = await listAggregateResources(
            aggregatorName,
            queryFilter,
            environment,
            region
          )
          
          const resourceDetails: ResourceDetail[] = resources.map(r => ({
            resourceId: r.ResourceId!,
            resourceType: r.ResourceType!.split('::').pop()!, // Simplify type name (AWS::EC2::Instance -> Instance)
            accountId: r.SourceAccountId!,
            region: r.SourceRegion!,
            resourceName: r.ResourceName,
            creationTime: r.ResourceCreationTime ? new Date(r.ResourceCreationTime) : undefined
          }))
          
          allResources.push(...resourceDetails)
          accountResources += resourceDetails.length
          nextToken = newToken
          
          if (resources.length > 0) {
            logger.debug(`[Config Summary API] Found ${resources.length} ${resourceType} resources${accountId ? ` for account ${accountId}` : ''} (total: ${allResources.length})`)
          } else if (!nextToken) {
            logger.debug(`[Config Summary API] No ${resourceType} resources found${accountId ? ` for account ${accountId}` : ''}`)
          }
          
          // Success - break out of retry loop
          break
        } catch (error) {
          lastError = error
          const errorMessage = error?.message || String(error)
          
          // Check if it's a rate limit error
          if (errorMessage.includes('Rate exceeded') || errorMessage.includes('rate limit')) {
            retryCount++
            if (retryCount < maxRetries) {
              const backoffTime = Math.pow(2, retryCount) * 1000 // Exponential backoff: 2s, 4s, 8s
              logger.info(`[Config Summary API] Rate limited for ${resourceType}, retrying in ${backoffTime}ms (attempt ${retryCount}/${maxRetries})`)
              await sleep(backoffTime)
              continue
            }
          }
          
          // Non-rate limit error or max retries reached
          logger.error(`[Config Summary API] Failed to query ${resourceType}${accountId ? ` for account ${accountId}` : ''}:`, errorMessage)
          break
        }
      }
      
      // If we exhausted retries, break out of pagination loop
      if (retryCount >= maxRetries && lastError) {
        break
      }
    } while (nextToken && allResources.length < maxResources)
    
    // If we've hit the max, stop querying other accounts
    if (allResources.length >= maxResources) break
  }
  
  return allResources
}

/**
 * Query multiple resource types in parallel
 */
async function queryResourcesParallel(
  aggregatorName: string,
  resourceTypes: string[],
  filter: ResourceFilter,
  environment: AWSEnvironmentType,
  region: string,
  maxResourcesPerType: number = 1000
): Promise<ResourceDetail[]> {
  const batchSize = 3 // Reduced from 5 to avoid rate limits
  const allResources: ResourceDetail[] = []
  const typesSummary: Record<string, number> = {}
  
  // Add delay between batches to avoid rate limits
  const delayBetweenBatches = 1000 // 1 second delay
  
  for (let i = 0; i < resourceTypes.length; i += batchSize) {
    const batch = resourceTypes.slice(i, i + batchSize)
    const promises = batch.map(resourceType => 
      queryResourceType(aggregatorName, resourceType, filter, environment, region, maxResourcesPerType)
    )
    
    const batchResults = await Promise.all(promises)
    batch.forEach((type, index) => {
      const resources = batchResults[index]
      if (resources.length > 0) {
        typesSummary[type] = resources.length
        allResources.push(...resources)
      }
    })
    
    logger.info(`[Config Summary API] Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(resourceTypes.length / batchSize)}`)
    
    // Add delay between batches to avoid rate limiting (except for last batch)
    if (i + batchSize < resourceTypes.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches))
    }
  }
  
  logger.debug(`[Config Summary API] Query complete. Found resources: ${JSON.stringify(typesSummary)}`)
  
  return allResources
}

/**
 * Calculate age distribution of resources
 */
function calculateAgeDistribution(resources: ResourceDetail[]): Record<string, number> {
  const now = new Date()
  const distribution = {
    lessThan30Days: 0,
    between30And90Days: 0,
    between90And365Days: 0,
    moreThan365Days: 0
  }

  resources.forEach(r => {
    if (!r.creationTime) return
    
    const ageInDays = Math.floor((now.getTime() - new Date(r.creationTime).getTime()) / (1000 * 60 * 60 * 24))
    
    if (ageInDays < 30) {
      distribution.lessThan30Days++
    } else if (ageInDays < 90) {
      distribution.between30And90Days++
    } else if (ageInDays < 365) {
      distribution.between90And365Days++
    } else {
      distribution.moreThan365Days++
    }
  })

  return distribution
}

/**
 * Get detailed resource type information
 */
function getDetailedTypeInfo(resources: ResourceDetail[]): Record<string, any> {
  const typeInfo: Record<string, any> = {}
  
  resources.forEach(r => {
    if (!typeInfo[r.resourceType]) {
      typeInfo[r.resourceType] = {
        count: 0,
        accounts: new Set<string>(),
        regions: new Set<string>()
      }
    }
    
    typeInfo[r.resourceType].count++
    typeInfo[r.resourceType].accounts.add(r.accountId)
    typeInfo[r.resourceType].regions.add(r.region)
  })
  
  // Convert Sets to arrays for JSON serialization
  Object.keys(typeInfo).forEach(type => {
    typeInfo[type].accounts = Array.from(typeInfo[type].accounts)
    typeInfo[type].regions = Array.from(typeInfo[type].regions)
  })
  
  return typeInfo
}

/**
 * Get detailed account information
 */
function getDetailedAccountInfo(resources: ResourceDetail[]): Record<string, any> {
  const accountInfo: Record<string, any> = {}
  
  resources.forEach(r => {
    const accountKey = r.accountName || r.accountId
    if (!accountInfo[accountKey]) {
      accountInfo[accountKey] = {
        count: 0,
        resourceTypes: new Set<string>(),
        regions: new Set<string>()
      }
    }
    
    accountInfo[accountKey].count++
    accountInfo[accountKey].resourceTypes.add(r.resourceType)
    accountInfo[accountKey].regions.add(r.region)
  })
  
  // Convert Sets to arrays for JSON serialization
  Object.keys(accountInfo).forEach(account => {
    accountInfo[account].resourceTypes = Array.from(accountInfo[account].resourceTypes)
    accountInfo[account].regions = Array.from(accountInfo[account].regions)
  })
  
  return accountInfo
}

export default defineEventHandler(handleAsync(async (event) => {
  try {
    const query = getQuery(event)
    
    // Parse environment first
    const environment = (query.environment as AWSEnvironmentType) || 'commercial'
    const includeDetails = query.includeDetails === 'true'
    const scanMode = (query.scanMode as 'quick' | 'standard' | 'full') || 'standard'
    const maxResourcesPerType = parseInt(query.maxResourcesPerType as string) || 1000
    const region = query.region as string | undefined
    
    // Create cache key for this specific query
    const cache = getCacheManager()
    const cacheKey = `config:summary:${environment}:${scanMode}:${includeDetails}:${region || 'all'}:${JSON.stringify(query)}`
    const cacheTTL = scanMode === 'quick' ? 60 : 300 // Quick mode: 1 min, others: 5 min
    
    // Check cache
    const cached = await cache.get(cacheKey)
    if (cached) {
      logger.info(`[Config Summary API] Cache hit for summary: ${cacheKey}`)
      return sendSuccess(event, cached, { message: 'Resource summary (cached)', fromCache: true })
    }
    
    // Parse account filters
    const { parseAccountFilters } = await import('../../utils/account-filters')
    const accountFilters = parseAccountFilters(query)
    
    // Store resolved account objects for name mapping
    const resolvedAccountObjects: any[] = []
    
    // Resolve account identifiers if provided
    if (accountFilters.accountIds && accountFilters.accountIds.length > 0) {
      const resolvedAccountIds: string[] = []
      const resolveErrors: string[] = []
      
      for (const identifier of accountFilters.accountIds) {
        try {
          const lookupResult = await lookupAccountOptimized(event, identifier, {
            includeDecommissioned: accountFilters.includeDecommissioned || false
          })
          
          resolvedAccountObjects.push(lookupResult.account)
          
          // Choose the appropriate account ID based on the environment
          let fullAccountId: string | undefined
          if (environment === 'govcloud') {
            fullAccountId = lookupResult.account.govCloudAccountId || lookupResult.account.awsGovCloudAccountID || lookupResult.account.primaryAccountID
          } else {
            fullAccountId = lookupResult.account.accountId || lookupResult.account.awsStandardAccountID || lookupResult.account.id
          }
          
          if (fullAccountId) {
            resolvedAccountIds.push(fullAccountId)
          } else {
            resolveErrors.push(`Account found for identifier ${identifier} but missing ${environment} account ID`)
          }
        } catch (error) {
          resolveErrors.push(`No account found for identifier: ${identifier}`)
        }
      }
      
      if (resolveErrors.length > 0) {
        return errors.validationError(event, resolveErrors)
      }
      
      accountFilters.accountIds = resolvedAccountIds
    }
    
    // Validate filters
    const { validateAccountFilters } = await import('../../utils/account-filters')
    const filterErrors = validateAccountFilters(accountFilters)
    
    if (filterErrors.length > 0) {
      return errors.validationError(event, filterErrors)
    }
    
    // Get aggregator name
    const aggregatorName = environment === 'commercial' 
      ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'CommercialAggregator')
      : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')
    
    logger.info(`[Config Summary API] Generating summary for env=${environment}, filters=${JSON.stringify(accountFilters)}`)
    
    // Filter accounts if needed
    const filteredAccounts = await filterAccounts(accountFilters)
    
    // Extract the appropriate account IDs based on the environment
    const targetAccountIds = filteredAccounts.map(acc => {
      if (environment === 'govcloud') {
        return acc.govCloudAccountId || acc.awsGovCloudAccountID || acc.govId
      } else {
        return acc.accountId || acc.awsStandardAccountID || acc.id
      }
    }).filter(Boolean)
    
    logger.debug(`[Config Summary API] Found ${targetAccountIds.length} accounts after filtering`)
    
    // Get default region for environment
    const targetRegion = region || 
      (environment === 'commercial' 
        ? process.env.AWS_COMMERCIAL_REGION || 'us-east-1'
        : process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')
    
    // Determine which resource types to query based on scan mode
    let resourcesToQuery: string[] = []
    let maxResources = 1000
    
    switch (scanMode) {
      case 'quick':
        resourcesToQuery = PRIORITY_RESOURCE_TYPES
        maxResources = 1000
        logger.info(`[Config Summary API] Quick mode: Querying ${resourcesToQuery.length} priority resource types`)
        break
      case 'full':
        resourcesToQuery = RESOURCE_TYPES
        maxResources = maxResourcesPerType
        logger.info(`[Config Summary API] Full mode: Querying ${resourcesToQuery.length} resource types with pagination (max ${maxResources} per type)`)
        break
      default: // 'standard'
        resourcesToQuery = RESOURCE_TYPES
        maxResources = 1000
        logger.info(`[Config Summary API] Standard mode: Querying ${resourcesToQuery.length} resource types`)
        break
    }
    
    // Build base filter
    const baseFilter: ResourceFilter = {}
    
    // Only filter by accounts if explicitly requested, not for org-wide summaries
    // If specific account IDs were provided in the query, use them
    if (accountFilters.accountIds && accountFilters.accountIds.length > 0) {
      baseFilter.accountIds = targetAccountIds
      logger.info(`[Config Summary API] Filtering by ${targetAccountIds.length} specific accounts`)
    } else if (accountFilters.linesOfBusiness || accountFilters.departments) {
      // For LOB/department filters, we might want to post-filter instead
      // since querying 100+ accounts individually is slow
      logger.info(`[Config Summary API] Post-filtering for LOB/departments from all resources`)
    }
    
    if (region) {
      baseFilter.regions = [region]
    }
    
    // Query resources in parallel
    const startTime = Date.now()
    const allResources = await queryResourcesParallel(
      aggregatorName,
      resourcesToQuery,
      baseFilter,
      environment,
      targetRegion,
      maxResources
    )
    const queryTime = Date.now() - startTime
    
    logger.debug(`[Config Summary API] Total resources found: ${allResources.length} in ${queryTime}ms`)
    
    // Post-filter resources if we queried org-wide but need specific LOB/department filtering
    let filteredResources = allResources
    if (!baseFilter.accountIds && targetAccountIds.length > 0) {
      const targetAccountIdSet = new Set(targetAccountIds)
      filteredResources = allResources.filter(r => targetAccountIdSet.has(r.accountId))
      logger.info(`[Config Summary API] Post-filtered to ${filteredResources.length} resources for target accounts`)
    }
    
    // Create account name mapping
    const accountNamesMap = new Map<string, string>()
    
    // Add resolved account objects
    resolvedAccountObjects.forEach(acc => {
      const commAccountId = acc.accountId || acc.awsStandardAccountID
      const govAccountId = acc.govCloudAccountId || acc.awsGovCloudAccountID || acc.primaryAccountID
      const accountName = acc.name || acc.projectName || acc.accountName
      
      if (commAccountId && accountName) {
        accountNamesMap.set(commAccountId, accountName)
      }
      if (govAccountId && accountName) {
        accountNamesMap.set(govAccountId, accountName)
      }
    })
    
    // Add filtered accounts
    filteredAccounts.forEach(acc => {
      const commAccountId = acc.accountId || acc.awsStandardAccountID
      const govAccountId = acc.govCloudAccountId || acc.awsGovCloudAccountID
      const accountName = acc.name || acc.projectName || acc.accountName
      
      if (commAccountId && accountName) {
        accountNamesMap.set(commAccountId, accountName)
      }
      if (govAccountId && accountName) {
        accountNamesMap.set(govAccountId, accountName)
      }
    })
    
    // Add account names to resources
    filteredResources.forEach(resource => {
      if (resource.accountId) {
        resource.accountName = accountNamesMap.get(resource.accountId) || resource.accountId
      }
    })
    
    // Calculate statistics
    const stats = calculateResourceStats(filteredResources)
    
    // Calculate top resource types and identify those hitting limits
    const resourcesAtLimit: string[] = []
    const sortedTypes = Object.entries(stats.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => {
        // Check if this type hit the limit
        const hitLimit = count === maxResources && scanMode !== 'full'
        if (hitLimit) {
          resourcesAtLimit.push(type)
        }
        return {
          type,
          count,
          percentage: Math.round((count / stats.total) * 100 * 100) / 100,
          ...(hitLimit && { limitReached: true })
        }
      })
    
    // Build response
    const response: any = {
      summary: {
        totalResources: stats.total,
        totalAccounts: Object.keys(stats.byAccount).length,
        totalRegions: Object.keys(stats.byRegion).length,
        resourceTypes: Object.keys(stats.byType).length,
        tagCoverage: stats.tagCoverage,
        oldestResource: stats.oldestResource?.toISOString(),
        newestResource: stats.newestResource?.toISOString()
      },
      topResourceTypes: sortedTypes,
      ageDistribution: calculateAgeDistribution(filteredResources),
      performance: {
        queryTime: `${queryTime}ms`,
        scanMode,
        resourceTypesQueried: resourcesToQuery.length,
        maxResourcesPerType: maxResources,
        actualResourcesFound: filteredResources.length,
        ...(resourcesAtLimit.length > 0 && {
          note: `Resource types at limit (${maxResources}): ${resourcesAtLimit.join(', ')}. Use scanMode=full for complete data.`
        })
      }
    }
    
    // Add detailed breakdowns if requested
    if (includeDetails) {
      response.byAccount = getDetailedAccountInfo(allResources)
      response.byRegion = stats.byRegion
      response.byType = getDetailedTypeInfo(allResources)
    } else {
      // Simple counts only
      response.byAccount = stats.byAccount
      response.byRegion = stats.byRegion
      response.byType = Object.fromEntries(
        Object.entries(stats.byType).map(([type, count]) => [type, { count }])
      )
    }
    
    // Cache the response
    await cache.set(cacheKey, response, cacheTTL)
    logger.info(`[Config Summary API] Cached summary for ${cacheTTL}s: ${cacheKey}`)
    
    logger.info(`[Config Summary API] Returning summary with ${stats.total} total resources across ${Object.keys(stats.byAccount).length} accounts`)
    
    return sendSuccess(event, response, { 
      message: targetAccountIds.length > 0 
        ? `Resource summary for ${targetAccountIds.length} account(s)` 
        : 'Organization-wide resource summary'
    })
  } catch (error) {
    logger.error('[Config Summary API] Unexpected error:', error)
    return errors.serverError(event, `Configuration service error: ${error.message}`)
  }
}))