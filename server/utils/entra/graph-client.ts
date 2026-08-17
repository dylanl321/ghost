/**
 * Microsoft Graph API Client with Caching
 * Handles Graph API interactions with token management and caching
 */

import type { H3Event } from 'h3'
import { createError } from 'h3'
import type {
  EntraGroup,
  EntraUser,
  GroupMembersResponse,
} from '../../types/entra'

interface GroupSearchFilters {
  accountId?: string
  environment?: 'commercial' | 'govcloud'
  role?: string
  includeDistribution?: boolean
}
import { EntraCacheTags } from '../../types/entra'
import {
  getCacheKey,
  buildGroupFilter,
  buildDistributionGroupFilter,
  GRAPH_SELECT_FIELDS,
  getGraphBaseUrl,
  isAwsAuthorizationGroupName,
  entraConfig
} from './config'
import { groupByAccount } from './group-parser'
import { accountCache, CacheTags } from '../cache-manager'
import { getUserSession } from './session'
import { logger } from '../logger'

/**
 * Check if the current session is in dev mode (using mock authentication)
 * Dev mode sessions have an invalid token that won't work with real Graph API
 */
async function isDevModeSession(event: H3Event): Promise<boolean> {
  if (event.context.datasetExportService) return false
  try {
    const { getUserSession: getOIDCUserSession } = await import('nuxt-oidc-auth/runtime/server/utils/session.js')
    const oidcSession = await getOIDCUserSession(event)
    return oidcSession?.provider === 'dev'
  } catch {
    return false
  }
}

/**
 * Create a dev mode error that gracefully informs the client
 */
function createDevModeError(operation: string) {
  return createError({
    statusCode: 503,
    statusMessage: `Graph API unavailable in dev mode`,
    data: {
      devMode: true,
      operation,
      message: 'Microsoft Graph API calls are not available in development authentication mode. Use real Entra ID authentication to access user/group data.'
    }
  })
}

// Export for use in API handlers
export { isDevModeSession }

/**
 * Create headers for Graph API requests
 */
async function getGraphHeaders(event: H3Event, requiresConsistencyLevel: boolean = false): Promise<Record<string, string>> {
  // Get user session from OIDC - this will be implemented with nuxt-oidc
  const session = await getUserSession(event)
  
  logger.debug('Session check:', {
    hasSession: !!session,
    hasAccessToken: !!session?.accessToken,
    tokenLength: session?.accessToken?.length,
    user: session?.user ? {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email
    } : null
  })
  
  if (!session?.accessToken) {
    logger.error('No access token available in session')
    throw new Error('No access token available in session')
  }
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json'
  }
  
  // Add ConsistencyLevel header for advanced queries (endsWith, count, etc.)
  if (requiresConsistencyLevel) {
    headers['ConsistencyLevel'] = 'eventual'
    logger.info('Added ConsistencyLevel header for advanced query')
  }
  
  logger.info('Graph API headers prepared:', Object.keys(headers))
  return headers
}

/**
 * Make a Graph API request with retry logic
 */
export async function graphRequest<T>(
  event: H3Event,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Check if we're in dev mode - Graph API won't work with mock tokens
  if (await isDevModeSession(event)) {
    logger.info('Dev mode detected - skipping Graph API request')
    throw createDevModeError(`graphRequest: ${endpoint}`)
  }

  const baseUrl = getGraphBaseUrl()
  const url = `${baseUrl}${endpoint}`

  // Check if the query uses advanced operators that require ConsistencyLevel header
  const requiresConsistencyLevel = endpoint.includes('endsWith') ||
                                   endpoint.includes('$count') ||
                                   endpoint.includes('$orderby') ||
                                   endpoint.includes('$search')

  let retries = 0
  const maxRetries = entraConfig.search.maxRetries

  logger.info(`Making Graph API request to: ${url}`)
  logger.info('Request options:', { method: options.method || 'GET', requiresConsistencyLevel })

  while (retries <= maxRetries) {
    try {
      const headers = await getGraphHeaders(event, requiresConsistencyLevel)
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers
        }
      })
      
      logger.info(`Graph API response: ${response.status} ${response.statusText}`)
      
      if (!response.ok) {
        let error: any = {}
        try {
          error = await response.json()
          logger.error('Graph API error response:', error)
        } catch (parseError) {
          logger.error('Could not parse error response:', parseError)
          error = { message: `HTTP ${response.status}: ${response.statusText}` }
        }
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retries) * 1000
          
          if (retries < maxRetries) {
            logger.info(`Rate limited, retrying after ${delay}ms...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            retries++
            continue
          }
        }
        
        // Handle authentication errors
        if (response.status === 401) {
          logger.error('Authentication failed: Token expired or invalid')
          throw createError({
            statusCode: 401,
            statusMessage: 'Authentication token expired. Please sign in again.',
            data: { 
              requiresReauth: true,
              originalError: error.error?.message || (error instanceof Error ? error.message : String(error)) 
            }
          })
        }
        
        // Check for specific token expiration messages
        const errorMessage = error.error?.message || (error instanceof Error ? error.message : String(error)) || `Graph API error: ${response.status}`
        if (errorMessage.includes('Lifetime validation failed') || 
            errorMessage.includes('token is expired') ||
            errorMessage.includes('token has expired') ||
            errorMessage.includes('AADSTS700082')) {
          logger.error('Token expiration detected in Graph API response')
          throw createError({
            statusCode: 401,
            statusMessage: 'Authentication token expired. Please sign in again.',
            data: { 
              requiresReauth: true,
              originalError: errorMessage 
            }
          })
        }
        
        throw new Error(errorMessage)
      }
      
      const data = await response.json()
      logger.info(`Graph API success: Retrieved ${data.value?.length || 'unknown'} items`)
      return data
    } catch (error) {
      if (retries >= maxRetries) {
        throw error
      }
      
      // Exponential backoff for other errors
      const delay = Math.pow(2, retries) * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
      retries++
    }
  }
  
  throw new Error('Max retries exceeded')
}

/**
 * Get all pages of results from Graph API
 */
export async function getAllPages<T>(
  event: H3Event,
  initialEndpoint: string,
  options: { limit?: number; maxPages?: number; signal?: AbortSignal } = {}
): Promise<T[]> {
  const results: T[] = []
  let nextLink: string | null = initialEndpoint
  let pageCount = 0
  
  logger.info(`Starting pagination for endpoint: ${initialEndpoint}`)
  
  while (nextLink && pageCount < (options.maxPages || Number.POSITIVE_INFINITY) && (!options.limit || results.length < options.limit)) {
    pageCount++
    logger.info(`Fetching page ${pageCount}: ${nextLink}`)
    
    const response: { value?: T[]; '@odata.nextLink'?: string; '@odata.count'?: number } = await graphRequest(event, nextLink, { signal: options.signal })
    
    logger.info(`Page ${pageCount} response:`, {
      hasValue: !!response.value,
      itemCount: response.value?.length || 0,
      hasNextLink: !!response['@odata.nextLink'],
      totalCount: response['@odata.count']
    })
    
    if (response.value) {
      const pageValues = options.limit
        ? response.value.slice(0, Math.max(0, options.limit - results.length))
        : response.value
      results.push(...pageValues)
      logger.info(`Added ${response.value.length} items, total so far: ${results.length}`)
    } else {
      logger.info('No "value" property in response:', Object.keys(response))
    }
    
    // Handle pagination
    nextLink = response['@odata.nextLink'] 
      ? response['@odata.nextLink'].replace(getGraphBaseUrl(), '')
      : null
      
    if (nextLink) {
      logger.info(`Next page URL: ${nextLink}`)
    } else {
      logger.info('No more pages')
    }
  }
  
  logger.info(`Pagination complete: ${results.length} total items across ${pageCount} pages`)
  return results
}

/**
 * Get AWS groups with caching
 */
export async function getAWSGroups(
  event: H3Event,
  filters?: GroupSearchFilters,
  options: { maxPages?: number; signal?: AbortSignal } = {}
): Promise<{ data: Record<string, any>, fromCache: boolean }> {
  const cacheKey = getCacheKey('groups', filters?.accountId || 'all')
  
  // Check cache first
  const cached = await accountCache.get(cacheKey)
  if (cached) {
    logger.info(`Cache hit for ${cacheKey}`)
    return { data: cached, fromCache: true }
  }
  
  logger.info(`Cache miss for ${cacheKey}, fetching from Graph API...`)
  
  try {
    // Build filter query
    let filter = buildGroupFilter(filters?.accountId, filters?.environment)
    
    // Add role filter if specified
    if (filters?.role) {
      filter += ` and contains(displayName, '-${filters.role}')`
    }
    
    // Build query parameters
    const queryParams = new URLSearchParams({
      '$filter': filter,
      '$select': GRAPH_SELECT_FIELDS.group.join(','),
      '$top': entraConfig.search.batchSize.toString()
    })
    
    // Add $count=true for advanced queries that use endsWith
    if (filter.includes('endsWith')) {
      queryParams.append('$count', 'true')
    }
    
    const endpoint = `/groups?${queryParams}`
    const groups = await getAllPages<EntraGroup>(event, endpoint, options)
    
    // Also get distribution groups if requested
    let allGroups = groups
    if (filters?.includeDistribution !== false) {
      const distFilter = buildDistributionGroupFilter(
        filters?.accountId ? undefined : undefined // Will need account name lookup
      )
      
      const distParams = new URLSearchParams({
        '$filter': distFilter,
        '$select': GRAPH_SELECT_FIELDS.group.join(','),
        '$top': entraConfig.search.batchSize.toString()
      })
      
      // Add $count=true for advanced queries that use endsWith
      if (distFilter.includes('endsWith')) {
        distParams.append('$count', 'true')
      }
      
      const distEndpoint = `/groups?${distParams}`
      const distGroups = await getAllPages<EntraGroup>(event, distEndpoint, options)
      allGroups = [...groups, ...distGroups]
    }
    
    // Parse and organize groups
    const parsed = groupByAccount(allGroups)
    
    // Cache the results with proper tags
    if (!options.maxPages) await accountCache.set(
      cacheKey,
      parsed,
      {
        ttl: entraConfig.cache.ttl,
        tags: [CacheTags.ACCOUNTS, EntraCacheTags.ENTRA, EntraCacheTags.ENTRA_GROUPS]
      }
    )
    
    return { data: parsed, fromCache: false }
  } catch (error) {
    logger.error('Failed to fetch AWS groups:', error)
    throw error
  }
}

/**
 * Get members of a specific group with caching
 */
export async function getGroupMembers(
  event: H3Event,
  groupId: string,
  includeDetails: boolean = false,
  options: { limit?: number; maxPages?: number; signal?: AbortSignal } = {}
): Promise<GroupMembersResponse> {
  const cacheKey = getCacheKey('members', groupId)
  
  // Check cache first
  const cached = await accountCache.get(cacheKey)
  if (cached && !options.limit) {
    logger.info(`Cache hit for group members ${groupId}`)
    return cached
  }
  
  logger.info(`Cache miss for group members ${groupId}, fetching from Graph API...`)
  
  try {
    // First get the group details
    const groupEndpoint = `/groups/${groupId}?$select=${GRAPH_SELECT_FIELDS.group.join(',')}`
    const group = await graphRequest<EntraGroup>(event, groupEndpoint, { signal: options.signal })
    
    // Then get the members
    const queryParams = new URLSearchParams({
      '$select': GRAPH_SELECT_FIELDS.member.join(','),
      '$top': Math.min(entraConfig.search.batchSize, options.limit || entraConfig.search.batchSize).toString()
    })
    
    const membersEndpoint = `/groups/${groupId}/members?${queryParams}`
    const members = await getAllPages<EntraUser>(event, membersEndpoint, options)
    
    // Transform members to include just essential info
    const memberList = includeDetails ? members : members.map(m => ({
      id: m.id,
      displayName: m.displayName,
      email: m.mail || m.userPrincipalName
    }))
    
    const response: GroupMembersResponse = {
      groupId,
      displayName: group.displayName,
      members: memberList as any,
      totalCount: members.length
    }
    
    // Cache the results
    if (!options.limit) await accountCache.set(
      cacheKey,
      response,
      {
        ttl: entraConfig.cache.ttl,
        tags: [CacheTags.ACCOUNTS, EntraCacheTags.ENTRA, EntraCacheTags.ENTRA_USERS, EntraCacheTags.ENTRA_MEMBERS]
      }
    )
    
    return response
  } catch (error) {
    logger.error(`Failed to fetch members for group ${groupId}:`, error)
    throw error
  }
}

/**
 * Get user details
 */
export async function getUserDetails(
  event: H3Event,
  userId: string
): Promise<EntraUser> {
  const cacheKey = getCacheKey('user', userId)
  
  // Check cache first
  const cached = await accountCache.get(cacheKey)
  if (cached) {
    return cached
  }
  
  try {
    const endpoint = `/users/${userId}?$select=${GRAPH_SELECT_FIELDS.user.join(',')}`
    const user = await graphRequest<EntraUser>(event, endpoint)
    
    // Cache for longer as user details don't change often
    await accountCache.set(
      cacheKey,
      user,
      {
        ttl: 86400, // 24 hours
        tags: [CacheTags.ACCOUNTS, EntraCacheTags.ENTRA, EntraCacheTags.ENTRA_USERS]
      }
    )
    
    return user
  } catch (error) {
    logger.error(`Failed to fetch user ${userId}:`, error)
    throw error
  }
}

/**
 * Search users by name or email
 */
export async function searchUsers(
  event: H3Event,
  searchTerm: string
): Promise<EntraUser[]> {
  try {
    const filter = `startsWith(displayName, '${searchTerm}') or startsWith(mail, '${searchTerm}') or startsWith(userPrincipalName, '${searchTerm}')`
    
    const queryParams = new URLSearchParams({
      '$filter': filter,
      '$select': GRAPH_SELECT_FIELDS.user.join(','),
      '$top': '50'
    })
    
    const endpoint = `/users?${queryParams}`
    const users = await getAllPages<EntraUser>(event, endpoint)
    
    return users
  } catch (error) {
    logger.error(`Failed to search users with term "${searchTerm}":`, error)
    throw error
  }
}

/**
 * Get groups for a specific user
 */
export async function getUserGroups(
  event: H3Event,
  userId: string
): Promise<EntraGroup[]> {
  const cacheKey = `entra:usergroups:${userId}`
  
  // Check cache first
  const cached = await accountCache.get(cacheKey)
  if (cached) {
    return cached
  }
  
  try {
    const queryParams = new URLSearchParams({
      '$select': GRAPH_SELECT_FIELDS.group.join(','),
      '$top': entraConfig.search.batchSize.toString()
    })
    
    const endpoint = `/users/${userId}/transitiveMemberOf/microsoft.graph.group?${queryParams}`
    const groups = await getAllPages<EntraGroup>(event, endpoint)
    
    // Filter to only AWS-related groups
    const awsGroups = groups.filter(g => 
      isAwsAuthorizationGroupName(g.displayName) ||
      g.displayName.endsWith(entraConfig.search.distributionSuffix)
    )
    
    // Cache the results
    await accountCache.set(
      cacheKey,
      awsGroups,
      {
        ttl: entraConfig.cache.ttl,
        tags: [CacheTags.ACCOUNTS, EntraCacheTags.ENTRA, EntraCacheTags.ENTRA_GROUPS, EntraCacheTags.ENTRA_USERS]
      }
    )
    
    return awsGroups
  } catch (error) {
    logger.error(`Failed to fetch groups for user ${userId}:`, error)
    throw error
  }
}

/**
 * Clear Entra-related cache entries
 */
export async function clearEntraCache(pattern?: string): Promise<number> {
  let tags: string[]
  
  if (pattern === 'groups') {
    tags = [EntraCacheTags.ENTRA_GROUPS]
  } else if (pattern === 'users') {
    tags = [EntraCacheTags.ENTRA_USERS]
  } else {
    // 'all' — clear everything tagged ENTRA
    tags = [EntraCacheTags.ENTRA]
  }
  
  const invalidated = await accountCache.invalidateByTags(tags)
  logger.debug(`Cleared ${invalidated} Entra cache entries (pattern: ${pattern || 'all'})`)
  
  return invalidated
}
