/**
 * User Cache for Entra ID
 * Caches user information for quick ID-to-name lookups
 */

import type { H3Event } from 'h3'
import type { EntraUser } from '../../types/entra'
import { accountCache, CacheTags } from '../cache-manager'
import { getUserDetails, searchUsers } from './graph-client'

// In-memory cache for ultra-fast lookups during request
const memoryCache = new Map<string, EntraUser>()
const MEMORY_TTL = 300000 // 5 minutes in milliseconds
const memoryTimestamps = new Map<string, number>()

/**
 * Get user from cache or fetch from Graph API
 */
export async function getCachedUser(
  event: H3Event,
  userId: string
): Promise<EntraUser | null> {
  // Check memory cache first
  const memoryCached = memoryCache.get(userId)
  const timestamp = memoryTimestamps.get(userId)
  
  if (memoryCached && timestamp && Date.now() - timestamp < MEMORY_TTL) {
    console.log(`Memory cache hit for user ${userId}`)
    return memoryCached
  }
  
  // Check persistent cache
  const cacheKey = `entra:user:${userId}`
  const cached = await accountCache.get(cacheKey)
  
  if (cached) {
    console.log(`Persistent cache hit for user ${userId}`)
    // Update memory cache
    memoryCache.set(userId, cached)
    memoryTimestamps.set(userId, Date.now())
    return cached
  }
  
  // Fetch from Graph API
  console.log(`Cache miss for user ${userId}, fetching from Graph API`)
  
  try {
    const user = await getUserDetails(event, userId)
    
    if (user) {
      // Cache in both memory and persistent cache
      memoryCache.set(userId, user)
      memoryTimestamps.set(userId, Date.now())
      
      await accountCache.set(
        cacheKey,
        user,
        {
          ttl: 86400, // 24 hours for user data
          tags: [CacheTags.ACCOUNTS, 'ENTRA', 'ENTRA_USERS']
        }
      )
    }
    
    return user
  } catch (error) {
    console.error(`Failed to fetch user ${userId}:`, error)
    return null
  }
}

/**
 * Batch fetch users and cache them
 */
export async function getCachedUsers(
  event: H3Event,
  userIds: string[]
): Promise<Map<string, EntraUser>> {
  const results = new Map<string, EntraUser>()
  const uncachedIds: string[] = []
  
  // Check memory cache first
  for (const userId of userIds) {
    const memoryCached = memoryCache.get(userId)
    const timestamp = memoryTimestamps.get(userId)
    
    if (memoryCached && timestamp && Date.now() - timestamp < MEMORY_TTL) {
      results.set(userId, memoryCached)
    } else {
      uncachedIds.push(userId)
    }
  }
  
  // Fetch uncached users
  if (uncachedIds.length > 0) {
    console.log(`Fetching ${uncachedIds.length} uncached users`)
    
    // Fetch in parallel but limit concurrency
    const batchSize = 5
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      const batch = uncachedIds.slice(i, i + batchSize)
      const batchPromises = batch.map(userId => getCachedUser(event, userId))
      const batchResults = await Promise.all(batchPromises)
      
      batchResults.forEach((user, index) => {
        if (user) {
          results.set(batch[index], user)
        }
      })
    }
  }
  
  return results
}

/**
 * Search users and cache results
 */
export async function searchAndCacheUsers(
  event: H3Event,
  searchTerm: string
): Promise<EntraUser[]> {
  const cacheKey = `entra:search:${searchTerm.toLowerCase()}`
  
  // Check cache first
  const cached = await accountCache.get(cacheKey)
  if (cached) {
    console.log(`Cache hit for user search "${searchTerm}"`)
    return cached
  }
  
  console.log(`Cache miss for user search "${searchTerm}", fetching from Graph API`)
  
  try {
    const users = await searchUsers(event, searchTerm)
    
    // Cache the search results
    await accountCache.set(
      cacheKey,
      users,
      {
        ttl: 1800, // 30 minutes for search results
        tags: [CacheTags.ACCOUNTS, 'ENTRA', 'ENTRA_USERS', 'ENTRA_SEARCH']
      }
    )
    
    // Also cache individual users
    for (const user of users) {
      memoryCache.set(user.id, user)
      memoryTimestamps.set(user.id, Date.now())
      
      const userCacheKey = `entra:user:${user.id}`
      await accountCache.set(
        userCacheKey,
        user,
        {
          ttl: 86400, // 24 hours
          tags: [CacheTags.ACCOUNTS, 'ENTRA', 'ENTRA_USERS']
        }
      )
    }
    
    return users
  } catch (error) {
    console.error(`Failed to search users with term "${searchTerm}":`, error)
    return []
  }
}

/**
 * Clear user cache
 */
export async function clearUserCache(): Promise<void> {
  memoryCache.clear()
  memoryTimestamps.clear()
  
  await accountCache.invalidateByTags(['ENTRA_USERS'])
  console.log('User cache cleared')
}

/**
 * Get cache statistics
 */
export function getUserCacheStats() {
  return {
    memoryCacheSize: memoryCache.size,
    memoryCacheKeys: Array.from(memoryCache.keys())
  }
}

/**
 * Transform user ID list to user details with names
 */
export async function enrichUserIds(
  event: H3Event,
  userIds: string[]
): Promise<Array<{ id: string; name: string; email: string }>> {
  const users = await getCachedUsers(event, userIds)
  
  return userIds.map(userId => {
    const user = users.get(userId)
    return {
      id: userId,
      name: user?.displayName || user?.userPrincipalName || 'Unknown User',
      email: user?.mail || user?.userPrincipalName || ''
    }
  })
}