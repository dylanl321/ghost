/**
 * Intelligent Caching System
 * 
 * Provides high-performance caching with intelligent invalidation,
 * TTL management, and analytics for reuse across APIs
 */

// Cache entry interface
import { logger } from './logger'

interface CacheEntry<T = any> {
  data: T
  timestamp: number
  ttl: number
  key: string
  tags: string[]
  accessCount: number
  lastAccessed: number
  metadata?: Record<string, any>
}

// Cache statistics
interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  entries: number
  memoryUsage: number
  oldestEntry: number
  newestEntry: number
}

// Cache configuration
interface CacheConfig {
  defaultTTL: number // seconds
  maxEntries: number
  enableAnalytics: boolean
  enableCompression: boolean
}

interface InflightFetch<T = any> {
  promise: Promise<T>
  tags: string[]
  // Set when the key is invalidated while the fetch is running, so the
  // result (read before the invalidation) is returned but not cached.
  invalidated: boolean
}

class CacheManager {
  private cache = new Map<string, CacheEntry>()
  private inflight = new Map<string, InflightFetch>()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    entries: 0,
    memoryUsage: 0,
    oldestEntry: 0,
    newestEntry: 0
  }

  private config: CacheConfig = {
    defaultTTL: 300, // 5 minutes
    maxEntries: 1000,
    enableAnalytics: true,
    enableCompression: false
  }

  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }

    // Start cleanup interval with proper reference for cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // Clean every minute

    // Cache cleanup should never be the only reason a CLI/test process stays alive.
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  /**
   * Destroy the cache manager and clear the cleanup interval
   * Call this when the cache manager is no longer needed
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.cache.clear()
    this.inflight.clear()
    this.resetStats()
  }
  
  /**
   * Get data from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    return this.getSync<T>(key)
  }

  // Synchronous so getOrSet can check the cache and register its in-flight
  // fetch without yielding in between.
  private getSync<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      this.stats.misses++
      this.updateHitRate()
      return null
    }
    
    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key)
      this.stats.misses++
      this.updateHitRate()
      return null
    }
    
    // Update access statistics
    entry.accessCount++
    entry.lastAccessed = Date.now()
    
    this.stats.hits++
    this.updateHitRate()
    
    return entry.data
  }
  
  /**
   * Set data in cache
   */
  async set<T = any>(
    key: string, 
    data: T, 
    options?: {
      ttl?: number
      tags?: string[]
      metadata?: Record<string, any>
    }
  ): Promise<void> {
    const ttl = options?.ttl || this.config.defaultTTL
    const tags = options?.tags || []
    const metadata = options?.metadata || {}
    
    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU()
    }
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl * 1000, // Convert to milliseconds
      key,
      tags,
      accessCount: 0,
      lastAccessed: Date.now(),
      metadata
    }
    
    this.cache.set(key, entry)
    // Track newestEntry incrementally — the entry just written is always a candidate
    if (entry.timestamp > this.stats.newestEntry) {
      this.stats.newestEntry = entry.timestamp
    }
    this.updateStats()
  }
  
  /**
   * Delete specific key from cache
   */
  async delete(key: string): Promise<boolean> {
    this.invalidateInflight((inflightKey) => inflightKey === key)
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.updateStats()
    }
    return deleted
  }
  
  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    this.invalidateInflight((_key, fetch) => fetch.tags.some(tag => tags.includes(tag)))
    let invalidated = 0
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.some(tag => tags.includes(tag))) {
        this.cache.delete(key)
        invalidated++
      }
    }
    
    this.updateStats()
    return invalidated
  }
  
  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.invalidateInflight(() => true)
    this.cache.clear()
    this.resetStats()
  }
  
  /**
   * Clear cache entries matching a pattern
   */
  async clearPattern(pattern: string): Promise<number> {
    this.invalidateInflight((key) => key.includes(pattern))
    let cleared = 0
    const keysToDelete: string[] = []
    
    for (const [key] of this.cache.entries()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key)
      }
    }
    
    keysToDelete.forEach(key => {
      this.cache.delete(key)
      cleared++
    })
    
    if (cleared > 0) {
      this.updateStats()
    }
    
    return cleared
  }
  
  /**
   * Get or set data with automatic caching and stampede protection
   * If multiple concurrent requests hit the same key, only one fetcher runs
   */
  async getOrSet<T = any>(
    key: string,
    fetcher: () => Promise<T>,
    options?: {
      ttl?: number
      tags?: string[]
      metadata?: Record<string, any>
      forceRefresh?: boolean
    }
  ): Promise<T> {
    if (!options?.forceRefresh) {
      const cached = this.getSync<T>(key)
      if (cached !== null) {
        return cached
      }
    }
    
    // Stampede protection: if an in-flight request exists for this key, wait for it
    const existing = this.inflight.get(key)
    if (existing) {
      return existing.promise
    }
    
    // Execute the fetcher and track the in-flight promise
    const inflight: InflightFetch<T> = {
      promise: undefined as unknown as Promise<T>,
      tags: options?.tags || [],
      invalidated: false
    }
    inflight.promise = Promise.resolve()
      .then(fetcher)
      .then(async (data) => {
        // Callers treat null as "fetch failed", and get() reports a cached
        // null as a miss anyway, so only real results are stored.
        if (!inflight.invalidated && data !== null && data !== undefined) {
          await this.set(key, data, options)
        }
        return data
      })
      .finally(() => {
        if (this.inflight.get(key) === inflight) {
          this.inflight.delete(key)
        }
      })
    
    this.inflight.set(key, inflight)
    return inflight.promise
  }

  /**
   * Drop matching in-flight fetches so their (pre-invalidation) results are
   * not written back to the cache, and the next caller fetches fresh data.
   */
  private invalidateInflight(matches: (key: string, fetch: InflightFetch) => boolean): void {
    for (const [key, fetch] of this.inflight) {
      if (matches(key, fetch)) {
        fetch.invalidated = true
        this.inflight.delete(key)
      }
    }
  }
  
  /**
   * Get cache statistics
   * Computes expensive stats (oldestEntry, memoryUsage) lazily on demand
   */
  getStats(): CacheStats {
    // Compute oldestEntry and memoryUsage lazily (only when stats are requested)
    if (this.cache.size > 0) {
      let oldest = Infinity
      let memUsage = 0
      for (const entry of this.cache.values()) {
        if (entry.timestamp < oldest) {
          oldest = entry.timestamp
        }
        memUsage += this.estimateSize(entry.data)
      }
      this.stats.oldestEntry = oldest
      this.stats.memoryUsage = memUsage
    } else {
      this.stats.oldestEntry = 0
      this.stats.memoryUsage = 0
    }
    return { ...this.stats }
  }
  
  /**
   * Get cache entry info
   */
  /** Whether key holds an unexpired entry, without touching hit/miss stats. */
  isFresh(key: string): boolean {
    const entry = this.cache.get(key)
    return Boolean(entry && !this.isExpired(entry))
  }

  getEntryInfo(key: string): {
    exists: boolean
    age?: string
    ttl?: string
    accessCount?: number
    tags?: string[]
    size?: number
  } {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return { exists: false }
    }
    
    const age = Date.now() - entry.timestamp
    const ttlRemaining = entry.ttl - age
    
    return {
      exists: true,
      age: this.formatDuration(age),
      ttl: this.formatDuration(ttlRemaining),
      accessCount: entry.accessCount,
      tags: entry.tags,
      size: this.estimateSize(entry.data)
    }
  }
  
  /**
   * Generate cache key from parameters
   */
  static generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${JSON.stringify(params[key])}`)
      .join('&')
    
    return `${prefix}:${Buffer.from(sortedParams).toString('base64')}`
  }
  
  // Private methods
  
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl
  }
  
  private evictLRU(): void {
    let oldest: string | null = null
    let oldestTime = Date.now()
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldest = key
      }
    }
    
    if (oldest) {
      this.cache.delete(oldest)
    }
  }
  
  private cleanup(): void {
    const now = Date.now()
    const keysToDelete: string[] = []
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key)
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key))
    
    if (keysToDelete.length > 0) {
      logger.debug(`Cache cleanup: removed ${keysToDelete.length} expired entries`)
      this.updateStats()
    }
  }
  
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0
  }
  
  private updateStats(): void {
    this.stats.entries = this.cache.size
    this.updateHitRate()
  }
  
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      entries: 0,
      memoryUsage: 0,
      oldestEntry: 0,
      newestEntry: 0
    }
  }
  
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }
  
  private estimateSize(data: any): number {
    return JSON.stringify(data).length * 2 // Rough estimate in bytes
  }
}

// Track all cache instances for cleanup on HMR
const allCacheInstances: CacheManager[] = []
const MAX_CACHE_INSTANCES = 20 // Prevent unbounded growth

function createTrackedCache(config?: Partial<CacheConfig>): CacheManager {
  const cache = new CacheManager(config)
  allCacheInstances.push(cache)

  // Prevent memory leak from unbounded array growth
  if (allCacheInstances.length > MAX_CACHE_INSTANCES) {
    logger.warn(`Cache instance limit exceeded (${allCacheInstances.length}/${MAX_CACHE_INSTANCES}). Destroying oldest instance.`)
    const oldest = allCacheInstances.shift()
    oldest?.destroy()
  }

  return cache
}

// Clean up on module reload (Hot Module Replacement)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    allCacheInstances.forEach(cache => cache.destroy())
    allCacheInstances.length = 0
  })
}

// No SIGTERM handler: requests still draining during graceful shutdown need
// their caches, and process exit frees the memory anyway.

// Create global cache instances with proper cleanup tracking
export const organizationCache = createTrackedCache({
  defaultTTL: 300, // 5 minutes for organization data
  maxEntries: 500,
  enableAnalytics: true
})

export const accountCache = createTrackedCache({
  defaultTTL: 600, // 10 minutes for account data
  maxEntries: 1000,
  enableAnalytics: true
})

export const costCache = createTrackedCache({
  defaultTTL: 900, // 15 minutes for cost data
  maxEntries: 200,
  enableAnalytics: true
})

export const insightCache = createTrackedCache({
  defaultTTL: 1800, // 30 minutes for AI-generated insights
  maxEntries: 100,
  enableAnalytics: true
})

// Cache key generators for common patterns
export const CacheKeys = {
  organizationOverview: (params: { 
    timeRange: number, 
    dataType: string, 
    lob?: string, 
    analysisTimeframe?: string 
  }) =>
    CacheManager.generateKey('org:overview', params),
  
  accountList: (params: { lob?: string, includeDecommissioned?: boolean }) =>
    CacheManager.generateKey('accounts:list', params),
  
  costAnalysis: (params: { 
    startDate: string, 
    endDate: string, 
    dataType?: string, 
    accountIds?: string[], 
    analysisTimeframe?: string 
  }) =>
    CacheManager.generateKey('costs:analysis', params),
  
  serviceUsage: (params: { timeRange: number, environment: string }) =>
    CacheManager.generateKey('services:usage', params),
  
  budgetAnalysis: (params: {
    analysisTimeframe: string,
    lob?: string,
    accountIds?: string[]
  }) =>
    CacheManager.generateKey('budget:analysis', params),
  
  forecast: (params: {
    analysisTimeframe: string,
    forecastPeriod: string,
    dataType?: string,
    accountIds?: string[]
  }) =>
    CacheManager.generateKey('forecast:analysis', params),

  securityOrgSummary: () => 'security:org-summary'
}

// Cache tags for invalidation
export const CacheTags = {
  ACCOUNTS: 'accounts',
  COSTS: 'costs',
  ORGANIZATION: 'organization',
  SERVICES: 'services',
  BUDGETS: 'budgets',
  SECURITY: 'security'
}

// Default cache manager instance with cleanup tracking
const defaultCacheManager = createTrackedCache({
  defaultTTL: 600, // 10 minutes default
  maxEntries: 2000,
  enableAnalytics: true
})

/**
 * Get the default cache manager instance
 */
export function getCacheManager(): CacheManager {
  return defaultCacheManager
}

/**
 * Create a new cache manager with custom configuration
 */
export function createCacheManager(config?: Partial<CacheConfig>): CacheManager {
  return new CacheManager(config)
}

/**
 * Clear every tracked cache (the named caches, the default cache and any
 * created with createTrackedCache). Returns the number of entries removed.
 */
export async function clearAllCaches(): Promise<number> {
  let cleared = 0
  for (const cache of allCacheInstances) {
    cleared += cache.getStats().entries
    await cache.clear()
  }
  return cleared
}

/**
 * Clear pattern-based cache entries
 */
export async function clearPattern(pattern: string): Promise<number> {
  const cache = getCacheManager()
  return cache.clearPattern(pattern)
}

export { CacheManager }
