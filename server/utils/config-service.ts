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

// Cache configuration
const CACHE_TTL = {
  RESOURCE_LIST: 300, // 5 minutes for resource lists
  RESOURCE_DETAIL: 600, // 10 minutes for resource details
  RESOURCE_CONFIG: 900, // 15 minutes for full configurations
}

const CACHE_KEYS = {
  RESOURCE_LIST: (aggregator: string, type?: string, accountId?: string) => 
    `config:resources:${aggregator}:${type || 'all'}:${accountId || 'all'}`,
  RESOURCE_DETAIL: (aggregator: string, resourceId: string) => 
    `config:resource:${aggregator}:${resourceId}`,
  RESOURCE_CONFIG: (aggregator: string, resourceId: string) => 
    `config:config:${aggregator}:${resourceId}`,
  AGGREGATOR_INFO: (aggregator: string) => 
    `config:aggregator:${aggregator}`
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
 */
export async function listAggregateResources(
  aggregatorName: string,
  filter?: ResourceFilter,
  environment: AWSEnvironmentType = 'commercial',
  region?: string
): Promise<{ resources: ResourceIdentifier[]; nextToken?: string }> {
  const cache = getCacheManager()
  const cacheKey = CACHE_KEYS.RESOURCE_LIST(
    aggregatorName, 
    filter?.resourceType,
    filter?.accountIds?.[0]
  )
  
  // Check cache for non-paginated requests
  if (!filter?.nextToken) {
    const cached = await cache.get<{ resources: ResourceIdentifier[]; nextToken?: string }>(cacheKey)
    if (cached) {
      console.log(`[Config] Cache hit for resource list: ${cacheKey}`)
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
    
    console.log(`[Config] Verified aggregator '${aggregatorName}' exists in ${environment}`)
  } catch (error) {
    if (error.name === 'NoSuchConfigurationAggregatorException' || error.message?.includes('does not exist')) {
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
    
    console.log(`[Config] No resource type specified, querying ${commonResourceTypes.length} common types`)
    
    for (const resourceType of commonResourceTypes) {
      if (resources.length >= maxItems) break
      
      try {
        const params: ListAggregateDiscoveredResourcesCommandInput = {
          ConfigurationAggregatorName: aggregatorName,
          ResourceType: resourceType,
          Limit: Math.min(maxItems - resources.length, 100)
        }
        
        if (filter?.accountIds?.length === 1) {
          params.Filters = { AccountId: filter.accountIds[0] }
        }
        
        if (filter?.regions && filter.regions.length > 0) {
          params.Filters = { ...params.Filters, Region: filter.regions[0] }
        }
        
        const command = new ListAggregateDiscoveredResourcesCommand(params)
        const response = await client.send(command)
        
        if (response.ResourceIdentifiers) {
          resources.push(...response.ResourceIdentifiers)
        }
      } catch (error) {
        console.warn(`[Config] Failed to list ${resourceType}:`, error)
      }
    }
    
    const result = { resources: resources.slice(0, maxItems), nextToken: undefined }
    
    // Cache the result
    if (resources.length > 0) {
      await cache.set(cacheKey, result, CACHE_TTL.RESOURCE_LIST)
      console.log(`[Config] Cached resource list: ${cacheKey}`)
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
    
    if (filter?.accountIds?.length === 1) {
      params.Filters = { AccountId: filter.accountIds[0] }
    }
    
    if (filter?.regions && filter.regions.length > 0) {
      params.Filters = { ...params.Filters, Region: filter.regions[0] }
    }
    
    const command = new ListAggregateDiscoveredResourcesCommand(params)
    const response = await client.send(command)
    
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
    await cache.set(cacheKey, result, CACHE_TTL.RESOURCE_LIST)
    console.log(`[Config] Cached resource list: ${cacheKey}`)
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
    console.log(`[Config] Cache hit for resource detail: ${cacheKey}`)
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
    await cache.set(cacheKey, detail, CACHE_TTL.RESOURCE_DETAIL)
    console.log(`[Config] Cached resource detail: ${cacheKey}`)
    
    return detail
  } catch (error) {
    console.error(`Error fetching resource config:`, error)
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
  
  console.log(`[Config] Batch get: ${successful.length} cached, ${uncachedIdentifiers.length} to fetch`)
  
  // Batch fetch uncached resources (max 100 per request)
  const chunks = chunkArray(uncachedIdentifiers, 100)
  
  for (const chunk of chunks) {
    try {
      const command = new BatchGetAggregateResourceConfigCommand({
        ConfigurationAggregatorName: aggregatorName,
        ResourceIdentifiers: chunk
      })
      
      const response = await client.send(command)
      
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
            await cache.set(cacheKey, detail, CACHE_TTL.RESOURCE_DETAIL)
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
      console.log(`[Config] Cache hit for query: ${query.substring(0, 50)}...`)
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
    await cache.set(cacheKey, result, CACHE_TTL.RESOURCE_LIST)
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
  console.log(`[Config] Cleared cache with pattern: ${prefix}`)
}