/**
 * AWS Config Service Utilities
 * 
 * Reusable functions for interacting with AWS Config Service
 * Includes caching, batch operations, and resource aggregation
 */

import {
  ListAggregateDiscoveredResourcesCommand,
  GetAggregateResourceConfigCommand,
  SelectAggregateResourceConfigCommand,
  BatchGetAggregateResourceConfigCommand,
  type ConfigServiceClient,
  type ResourceIdentifier,
  type ConfigurationItem,
  type AggregateResourceIdentifier,
  type ListAggregateDiscoveredResourcesCommandInput
} from '@aws-sdk/client-config-service'
import { getConfigServiceClient } from '../lib/aws-client-factory'
import { getCacheManager } from './cache-manager'
import type { AWSEnvironmentType } from '../types'
import { logger } from './logger'

// Cache configuration
const CACHE_TTL = {
  RESOURCE_LIST: 300, // 5 minutes for resource lists
  RESOURCE_DETAIL: 600, // 10 minutes for resource details
  RESOURCE_CONFIG: 900, // 15 minutes for full configurations
}

const CACHE_KEYS = {
  // The region filter changes the result, so it is part of the key.
  RESOURCE_LIST: (aggregator: string, type?: string, accountId?: string, limit?: number, region?: string) =>
    `config:resources:${aggregator}:${type || 'all'}:${accountId || 'all'}:${region || 'all'}:${limit || 100}`,
  RESOURCE_DETAIL: (aggregator: string, resourceId: string) => 
    `config:resource:${aggregator}:${resourceId}`,
  RESOURCE_CONFIG: (aggregator: string, resourceId: string) => 
    `config:config:${aggregator}:${resourceId}`,
  AGGREGATOR_INFO: (aggregator: string) => 
    `config:aggregator:${aggregator}`
}

/**
 * Get the correct Config aggregator name for a given environment
 */
export function getAggregatorName(environment: 'commercial' | 'govcloud'): string {
  return environment === 'commercial'
    ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'GDMS_Aggregator')
    : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')
}

const AGGREGATOR_EXISTS_CACHE = new Map<string, { exists: boolean; checkedAt: number }>()
const AGGREGATOR_CHECK_TTL = 300_000 // 5 minutes

// ---------------------------------------------------------------------------
// Throttle-retry helper
// ---------------------------------------------------------------------------

const THROTTLE_ERROR_NAMES = new Set([
  'ThrottlingException',
  'RequestThrottledException',
  'Throttling',
])

function isThrottleError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.name === 'string' && THROTTLE_ERROR_NAMES.has(e.name)) return true
    if (typeof e.message === 'string' && e.message.includes('Rate exceeded')) return true
    if (typeof e.$metadata === 'object' && e.$metadata !== null) {
      const meta = e.$metadata as Record<string, unknown>
      if (meta.httpStatusCode === 429) return true
    }
  }
  return false
}

/**
 * Wrap an AWS SDK call with jittered-exponential-backoff retry for throttling.
 * Non-throttle errors propagate immediately.
 * After all attempts are exhausted, rethrows the throttle error with
 * name === 'ThrottlingException' and isThrottled = true set so route handlers
 * can map it to a 429/503 response.
 */
async function withThrottleRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 4,
  baseDelayMs = 200
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isThrottleError(err)) {
        throw err
      }

      lastErr = err

      if (attempt >= maxAttempts) {
        break
      }

      // Full-jitter exponential: delay in [0, base * 2^attempt]
      const cap = baseDelayMs * Math.pow(2, attempt)
      const delay = Math.floor(Math.random() * cap)
      logger.warn(
        `[Config] Throttled on ${label} (attempt ${attempt}/${maxAttempts}), ` +
        `retrying in ${delay}ms`
      )
      await new Promise<void>(resolve => setTimeout(resolve, delay))
    }
  }
  // All retries exhausted — surface a distinguishable throttle error
  const throttleErr = (lastErr instanceof Error
    ? lastErr
    : new Error(`Config request throttled on ${label}`)) as Error & { isThrottled?: boolean }
  throttleErr.name = 'ThrottlingException'
  throttleErr.isThrottled = true
  throw throttleErr
}

/**
 * Check if a Config aggregator exists and is accessible (cached for 5 min)
 */
export async function isAggregatorAvailable(
  environment: 'commercial' | 'govcloud',
  region?: string
): Promise<boolean> {
  const aggregatorName = getAggregatorName(environment)
  const cacheKey = `${environment}:${aggregatorName}`
  const cached = AGGREGATOR_EXISTS_CACHE.get(cacheKey)

  if (cached && (Date.now() - cached.checkedAt) < AGGREGATOR_CHECK_TTL) {
    return cached.exists
  }

  try {
    const client = await getConfigClient(environment, region)
    const { DescribeConfigurationAggregatorsCommand } = await import('@aws-sdk/client-config-service')
    const response = await client.send(new DescribeConfigurationAggregatorsCommand({
      ConfigurationAggregatorNames: [aggregatorName]
    }))
    const exists = (response.ConfigurationAggregators?.length ?? 0) > 0
    AGGREGATOR_EXISTS_CACHE.set(cacheKey, { exists, checkedAt: Date.now() })
    return exists
  } catch {
    AGGREGATOR_EXISTS_CACHE.set(cacheKey, { exists: false, checkedAt: Date.now() })
    return false
  }
}

export interface ResourceFilter {
  resourceType?: string
  accountIds?: string[]
  regions?: string[]
  resourceNames?: string[]
  tags?: Record<string, string>
  limit?: number
  nextToken?: string
}

export interface ResourceDetail {
  resourceId: string
  resourceType: string
  resourceName?: string
  accountId: string
  region: string
  arn?: string
  creationTime?: Date
  tags?: Record<string, string>
  configuration?: any
  configurationStateId?: string
  resourceCreationTime?: Date
  availabilityZone?: string
  relationships?: any[]
  supplementaryConfiguration?: any
}

export interface BatchResourceResult {
  successful: ResourceDetail[]
  failed: Array<{ identifier: ResourceIdentifier; error: Error }>
}

/**
 * Get or create Config Service client with caching
 */
export async function getConfigClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string
): Promise<ConfigServiceClient> {
  return getConfigServiceClient(environment, region)
}

/**
 * List aggregate discovered resources with caching
 *
 * NOTE: AWS Config API limitation - the Filters.AccountId parameter only accepts
 * a single account ID, not an array. When multiple account IDs are provided,
 * this function queries them in parallel and combines results.
 */
export async function listAggregateResources(
  aggregatorName: string,
  filter?: ResourceFilter,
  environment: AWSEnvironmentType = 'commercial',
  region?: string
): Promise<{ resources: ResourceIdentifier[]; nextToken?: string }> {
  const cache = getCacheManager()

  // If multiple accounts provided, query them in parallel
  if (filter?.accountIds && filter.accountIds.length > 1) {
    logger.info(`[Config] Multiple accounts (${filter.accountIds.length}) provided, querying in parallel`)

    const accountPromises = filter.accountIds.map(accountId =>
      listAggregateResources(
        aggregatorName,
        { ...filter, accountIds: [accountId] },
        environment,
        region
      )
    )

    const results = await Promise.all(accountPromises)
    const allResources = results.flatMap(r => r.resources)
    const maxItems = filter.limit || 100

    return {
      resources: allResources.slice(0, maxItems),
      nextToken: undefined // Can't paginate across multiple accounts
    }
  }

  const cacheKey = CACHE_KEYS.RESOURCE_LIST(
    aggregatorName,
    filter?.resourceType,
    filter?.accountIds?.[0],
    filter?.limit,
    filter?.regions?.[0]
  )

  // Check cache for non-paginated requests
  if (!filter?.nextToken) {
    const cached = await cache.get<{ resources: ResourceIdentifier[]; nextToken?: string }>(cacheKey)
    if (cached) {
      logger.info(`[Config] Cache hit for resource list: ${cacheKey}`)
      return cached
    }
  }

  const client = await getConfigClient(environment, region)

  // First, verify the aggregator exists
  try {
    const { DescribeConfigurationAggregatorsCommand } = await import('@aws-sdk/client-config-service')
    const checkAggregatorCommand = new DescribeConfigurationAggregatorsCommand({
      ConfigurationAggregatorNames: [aggregatorName]
    })
    const aggregatorResponse = await client.send(checkAggregatorCommand)

    if (!aggregatorResponse.ConfigurationAggregators?.length) {
      throw new Error(`Config aggregator '${aggregatorName}' not found. Please verify the aggregator name in your ${environment} environment or contact your AWS administrator.`)
    }

    logger.info(`[Config] Verified aggregator '${aggregatorName}' exists in ${environment}`)
  } catch (error) {
    if ((error instanceof Error ? error.name : "Error") === 'NoSuchConfigurationAggregatorException' || (error instanceof Error ? error.message : String(error))?.includes('does not exist')) {
      throw new Error(`Config aggregator '${aggregatorName}' not found in ${environment} environment. Please check your AWS Config setup or contact your AWS administrator.`)
    }
    throw error
  }

  const resources: ResourceIdentifier[] = []
  let currentToken = filter?.nextToken
  const maxItems = filter?.limit || 100

  // If no resource type specified, we need to query common resource types
  // AWS Config requires ResourceType parameter
  if (!filter?.resourceType) {
    const commonResourceTypes = [
      'AWS::EC2::Instance',
      'AWS::EC2::Volume',
      'AWS::S3::Bucket',
      'AWS::RDS::DBInstance',
      'AWS::Lambda::Function'
    ]

    logger.info(`[Config] No resource type specified, querying ${commonResourceTypes.length} common types`)

    for (const resourceType of commonResourceTypes) {
      if (resources.length >= maxItems) break

      try {
        const params: ListAggregateDiscoveredResourcesCommandInput = {
          ConfigurationAggregatorName: aggregatorName,
          ResourceType: resourceType,
          Limit: Math.min(maxItems - resources.length, 100)
        }

        // Build Filters object - AWS Config API only accepts single values
        const filters: any = {}
        if (filter?.accountIds?.length === 1) {
          filters.AccountId = filter.accountIds[0]
        }
        if (filter?.regions && filter.regions.length > 0) {
          filters.Region = filter.regions[0]
        }

        // Only add Filters if we have at least one filter
        if (Object.keys(filters).length > 0) {
          params.Filters = filters
        }

        const command = new ListAggregateDiscoveredResourcesCommand(params)
        const response = await withThrottleRetry(
          () => client.send(command),
          `ListAggregateDiscoveredResources(${resourceType})`
        )

        if (response.ResourceIdentifiers) {
          resources.push(...response.ResourceIdentifiers)
        }
      } catch (error) {
        logger.warn(`[Config] Failed to list ${resourceType}:`, error)
      }
    }

    const result = { resources: resources.slice(0, maxItems), nextToken: undefined }

    // Cache the result
    if (resources.length > 0) {
      await cache.set(cacheKey, result, { ttl: CACHE_TTL.RESOURCE_LIST })
      logger.info(`[Config] Cached resource list: ${cacheKey}`)
    }

    return result
  }

  // Original logic for when resource type is specified
  do {
    const params: ListAggregateDiscoveredResourcesCommandInput = {
      ConfigurationAggregatorName: aggregatorName,
      ResourceType: filter.resourceType,
      Limit: Math.min(maxItems - resources.length, 100)
    }

    // Only add optional fields if they have values
    if (currentToken) {
      params.NextToken = currentToken
    }

    // Build Filters object - AWS Config API only accepts single values
    const filters: any = {}
    if (filter?.accountIds?.length === 1) {
      filters.AccountId = filter.accountIds[0]
    }
    if (filter?.regions && filter.regions.length > 0) {
      filters.Region = filter.regions[0]
    }

    // Only add Filters if we have at least one filter
    if (Object.keys(filters).length > 0) {
      params.Filters = filters
    }

    logger.debug('[Config] Query params', params)

    const command = new ListAggregateDiscoveredResourcesCommand(params)
    const response = await withThrottleRetry(
      () => client.send(command),
      `ListAggregateDiscoveredResources(${filter.resourceType})`
    )

    if (response.ResourceIdentifiers) {
      resources.push(...response.ResourceIdentifiers)
    }

    currentToken = response.NextToken

    // Stop if we've reached the limit
    if (resources.length >= maxItems) {
      break
    }
  } while (currentToken && !filter?.nextToken) // Only auto-paginate if not manually paginating

  const result = { resources, nextToken: currentToken }

  // Cache the result if it's not a paginated request
  if (!filter?.nextToken && resources.length > 0) {
    await cache.set(cacheKey, result, { ttl: CACHE_TTL.RESOURCE_LIST })
    logger.info(`[Config] Cached resource list: ${cacheKey}`)
  }

  return result
}

/**
 * Get detailed configuration for a single resource with caching
 */
export async function getResourceConfig(
  aggregatorName: string,
  resourceIdentifier: AggregateResourceIdentifier,
  environment: AWSEnvironmentType = 'commercial',
  region?: string
): Promise<ResourceDetail | null> {
  const cache = getCacheManager()
  const cacheKey = CACHE_KEYS.RESOURCE_DETAIL(
    aggregatorName,
    `${resourceIdentifier.SourceAccountId}:${resourceIdentifier.ResourceId}`
  )
  
  // Check cache
  const cached = await cache.get<ResourceDetail>(cacheKey)
  if (cached) {
    logger.info(`[Config] Cache hit for resource detail: ${cacheKey}`)
    return cached
  }
  
  try {
    const client = await getConfigClient(environment, region)
    const command = new GetAggregateResourceConfigCommand({
      ConfigurationAggregatorName: aggregatorName,
      ResourceIdentifier: resourceIdentifier
    })
    
    const response = await client.send(command)
    const item = response.ConfigurationItem
    
    if (!item) return null
    
    const detail = parseConfigurationItem(item, resourceIdentifier)
    
    // Cache the result
    await cache.set(cacheKey, detail, { ttl: CACHE_TTL.RESOURCE_DETAIL })
    logger.info(`[Config] Cached resource detail: ${cacheKey}`)
    
    return detail
  } catch (error) {
    logger.error(`Error fetching resource config:`, error)
    return null
  }
}

/**
 * Batch get resource configurations with caching
 */
export async function batchGetResourceConfigs(
  aggregatorName: string,
  resourceIdentifiers: AggregateResourceIdentifier[],
  environment: AWSEnvironmentType = 'commercial',
  region?: string
): Promise<BatchResourceResult> {
  const cache = getCacheManager()
  const client = await getConfigClient(environment, region)
  
  const successful: ResourceDetail[] = []
  const failed: Array<{ identifier: ResourceIdentifier; error: Error }> = []
  const uncachedIdentifiers: AggregateResourceIdentifier[] = []
  
  // Check cache for each resource
  for (const identifier of resourceIdentifiers) {
    const cacheKey = CACHE_KEYS.RESOURCE_DETAIL(
      aggregatorName,
      `${identifier.SourceAccountId}:${identifier.ResourceId}`
    )
    
    const cached = await cache.get<ResourceDetail>(cacheKey)
    if (cached) {
      successful.push(cached)
    } else {
      uncachedIdentifiers.push(identifier)
    }
  }
  
  logger.info(`[Config] Batch get: ${successful.length} cached, ${uncachedIdentifiers.length} to fetch`)

  // Batch fetch uncached resources (max 100 per request)
  const chunks = chunkArray(uncachedIdentifiers, 100)

  // Process chunks in parallel with concurrency limit of 5 to avoid rate limits
  const concurrencyLimit = 5
  const chunkPromises: Promise<void>[] = []

  for (let i = 0; i < chunks.length; i += concurrencyLimit) {
    const chunkBatch = chunks.slice(i, i + concurrencyLimit)

    const batchPromises = chunkBatch.map(async (chunk) => {
      try {
        const command = new BatchGetAggregateResourceConfigCommand({
          ConfigurationAggregatorName: aggregatorName,
          ResourceIdentifiers: chunk
        })

        const response = await withThrottleRetry(
          () => client.send(command),
          `BatchGetAggregateResourceConfig(chunk[${chunk.length}])`
        )

        // Process successful results
        if (response.BaseConfigurationItems) {
          for (const item of response.BaseConfigurationItems) {
            const identifier = chunk.find(id =>
              id.ResourceId === item.resourceId &&
              id.SourceAccountId === item.accountId
            )

            if (identifier) {
              const detail = parseConfigurationItem(item as ConfigurationItem, identifier)
              successful.push(detail)

              // Cache the result
              const cacheKey = CACHE_KEYS.RESOURCE_DETAIL(
                aggregatorName,
                `${identifier.SourceAccountId}:${identifier.ResourceId}`
              )
              await cache.set(cacheKey, detail, { ttl: CACHE_TTL.RESOURCE_DETAIL })
            }
          }
        }

        // Process failed results
        if (response.UnprocessedResourceIdentifiers) {
          for (const unprocessed of response.UnprocessedResourceIdentifiers) {
            failed.push({
              identifier: unprocessed as ResourceIdentifier,
              error: new Error('Resource could not be processed')
            })
          }
        }
      } catch (error) {
        // Add all chunk items to failed if batch request fails
        for (const identifier of chunk) {
          failed.push({
            identifier: identifier as ResourceIdentifier,
            error: error as Error
          })
        }
      }
    })

    // Wait for this batch of chunks to complete before starting next batch
    await Promise.all(batchPromises)
  }
  
  return { successful, failed }
}

/**
 * Query resources using SQL-like syntax with caching
 */
export async function queryResources(
  aggregatorName: string,
  query: string,
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  limit?: number,
  nextToken?: string
): Promise<{ results: any[]; nextToken?: string }> {
  const cache = getCacheManager()
  const cacheKey = `config:query:${aggregatorName}:${Buffer.from(query).toString('base64')}`
  
  // Check cache for non-paginated requests
  if (!nextToken) {
    const cached = await cache.get<{ results: any[]; nextToken?: string }>(cacheKey)
    if (cached) {
      logger.info(`[Config] Cache hit for query: ${query.substring(0, 50)}...`)
      return cached
    }
  }
  
  const client = await getConfigClient(environment, region)
  const results: any[] = []
  let currentToken = nextToken
  const maxItems = limit || 100
  
  do {
    const command = new SelectAggregateResourceConfigCommand({
      ConfigurationAggregatorName: aggregatorName,
      Expression: query,
      Limit: Math.min(maxItems - results.length, 100),
      NextToken: currentToken
    })
    
    const response = await client.send(command)
    
    if (response.Results) {
      results.push(...response.Results)
    }
    
    currentToken = response.NextToken
    
    if (results.length >= maxItems) {
      break
    }
  } while (currentToken && !nextToken)
  
  const result = { results, nextToken: currentToken }
  
  // Cache if not paginated
  if (!nextToken && results.length > 0) {
    await cache.set(cacheKey, result, { ttl: CACHE_TTL.RESOURCE_LIST })
  }
  
  return result
}

/**
 * Filter resources by tags
 */
export function filterResourcesByTags(
  resources: ResourceDetail[],
  tagFilters: Record<string, string>
): ResourceDetail[] {
  return resources.filter(resource => {
    if (!resource.tags) return false
    
    return Object.entries(tagFilters).every(([key, value]) => {
      // Support wildcard matching
      if (value === '*') {
        return key in resource.tags!
      }
      return resource.tags![key] === value
    })
  })
}

/**
 * Group resources by various dimensions
 */
export function groupResources(
  resources: ResourceDetail[],
  groupBy: 'account' | 'region' | 'type' | 'tag'
): Map<string, ResourceDetail[]> {
  const groups = new Map<string, ResourceDetail[]>()
  
  for (const resource of resources) {
    let key: string
    
    switch (groupBy) {
      case 'account':
        key = resource.accountId
        break
      case 'region':
        key = resource.region
        break
      case 'type':
        key = resource.resourceType
        break
      case 'tag':
        // Group by first tag key-value pair
        key = resource.tags ? Object.entries(resource.tags)[0]?.join(':') || 'untagged' : 'untagged'
        break
    }
    
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(resource)
  }
  
  return groups
}

/**
 * Calculate resource statistics
 */
export function calculateResourceStats(resources: ResourceDetail[]) {
  const stats = {
    total: resources.length,
    byAccount: {} as Record<string, number>,
    byRegion: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    byAvailabilityZone: {} as Record<string, number>,
    oldestResource: null as Date | null,
    newestResource: null as Date | null,
    tagCoverage: 0
  }
  
  let taggedCount = 0
  
  for (const resource of resources) {
    // By account
    stats.byAccount[resource.accountId] = (stats.byAccount[resource.accountId] || 0) + 1
    
    // By region
    stats.byRegion[resource.region] = (stats.byRegion[resource.region] || 0) + 1
    
    // By type
    const typeKey = resource.resourceType.split('::').pop() || resource.resourceType
    stats.byType[typeKey] = (stats.byType[typeKey] || 0) + 1
    
    // By AZ if available
    if (resource.availabilityZone) {
      stats.byAvailabilityZone[resource.availabilityZone] = 
        (stats.byAvailabilityZone[resource.availabilityZone] || 0) + 1
    }
    
    // Track resource age
    if (resource.resourceCreationTime) {
      const creationTime = new Date(resource.resourceCreationTime)
      if (!stats.oldestResource || creationTime < stats.oldestResource) {
        stats.oldestResource = creationTime
      }
      if (!stats.newestResource || creationTime > stats.newestResource) {
        stats.newestResource = creationTime
      }
    }
    
    // Track tag coverage - handle both formats
    let hasValidTags = false
    if (resource.tags) {
      if (Array.isArray(resource.tags)) {
        // Array format from Config
        hasValidTags = resource.tags.length > 0
      } else {
        // Object format after conversion
        hasValidTags = Object.keys(resource.tags).length > 0
      }
    }
    
    if (hasValidTags) {
      taggedCount++
    }
  }
  
  stats.tagCoverage = resources.length > 0 
    ? Math.round((taggedCount / resources.length) * 100)
    : 0
  
  return stats
}

/**
 * Build Config SQL query from filters
 */
export function buildConfigQuery(filters: {
  resourceType?: string
  accountIds?: string[]
  regions?: string[]
  tags?: Record<string, string>
  resourceNames?: string[]
}): string {
  const conditions: string[] = []
  
  if (filters.resourceType) {
    conditions.push(`resourceType = '${filters.resourceType}'`)
  }
  
  if (filters.accountIds && filters.accountIds.length > 0) {
    const accountList = filters.accountIds.map(id => `'${id}'`).join(', ')
    conditions.push(`accountId IN (${accountList})`)
  }
  
  if (filters.regions && filters.regions.length > 0) {
    const regionList = filters.regions.map(r => `'${r}'`).join(', ')
    conditions.push(`awsRegion IN (${regionList})`)
  }
  
  if (filters.resourceNames && filters.resourceNames.length > 0) {
    const nameConditions = filters.resourceNames.map(name => 
      `resourceName LIKE '%${name}%'`
    ).join(' OR ')
    conditions.push(`(${nameConditions})`)
  }
  
  if (filters.tags) {
    const tagConditions = Object.entries(filters.tags).map(([key, value]) => 
      `tags.tag = '${key}=${value}'`
    )
    conditions.push(...tagConditions)
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  
  return `SELECT 
    resourceId,
    resourceType,
    resourceName,
    accountId,
    awsRegion,
    arn,
    resourceCreationTime,
    tags,
    configuration
  FROM resources
  ${whereClause}
  ORDER BY resourceCreationTime DESC`
}

/**
 * Parse configuration item to resource detail
 */
function parseConfigurationItem(
  item: ConfigurationItem,
  identifier: AggregateResourceIdentifier
): ResourceDetail {
  let configuration = {}
  
  if (item.configuration) {
    try {
      configuration = typeof item.configuration === 'string'
        ? JSON.parse(item.configuration)
        : item.configuration
    } catch {
      configuration = item.configuration
    }
  }
  
  // Convert Config tag format (array of {key, value}) to simple object
  let tags: Record<string, string> = {}
  if (item.tags) {
    if (Array.isArray(item.tags)) {
      // Convert from Config format: [{key: "Name", value: "instance"}]
      for (const tag of item.tags) {
        if (tag.key && tag.value !== undefined) {
          tags[tag.key] = tag.value
        }
      }
    } else {
      // Already in simple object format
      tags = item.tags as Record<string, string>
    }
  }
  
  return {
    resourceId: identifier.ResourceId!,
    resourceType: identifier.ResourceType!,
    resourceName: identifier.ResourceName || item.resourceName,
    accountId: identifier.SourceAccountId!,
    region: identifier.SourceRegion!,
    arn: item.arn,
    creationTime: item.configurationItemCaptureTime,
    resourceCreationTime: item.resourceCreationTime,
    tags,
    configuration,
    configurationStateId: item.configurationStateId,
    availabilityZone: item.availabilityZone,
    relationships: item.relationships,
    supplementaryConfiguration: item.supplementaryConfiguration
  }
}

/**
 * Chunk array into smaller arrays
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Clear Config cache
 */
export async function clearConfigCache(pattern?: string): Promise<void> {
  const cache = getCacheManager()
  const prefix = pattern || 'config:'
  await cache.clearPattern(prefix)
  logger.info(`[Config] Cleared cache with pattern: ${prefix}`)
}