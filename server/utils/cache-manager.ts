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

class CacheManager {
  private cache = new Map<string, CacheEntry>()
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
  
  constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
    
    // Start cleanup interval
    setInterval(() => this.cleanup(), 60000) // Clean every minute
  }
  
  /**
   * Get data from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
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
    this.updateStats()
  }
  
  /**
   * Delete specific key from cache
   */
  async delete(key: string): Promise<boolean> {
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
    this.cache.clear()
    this.resetStats()
  }
  
  /**
   * Clear cache entries matching a pattern
   */
  async clearPattern(pattern: string): Promise<number> {
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
   * Get or set data with automatic caching
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
      const cached = await this.get<T>(key)
      if (cached !== null) {
        return cached
      }
    }
    
    const data = await fetcher()
    await this.set(key, data, options)
    return data
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats }
  }
  
  /**
   * Get cache entry info
   */
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
      logger.info(`Cache cleanup: removed ${keysToDelete.length} expired entries`)
      this.updateStats()
    }
  }
  
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0
  }
  
  private updateStats(): void {
    this.stats.entries = this.cache.size
    
    if (this.cache.size > 0) {
      const timestamps = Array.from(this.cache.values()).map(entry => entry.timestamp)
      this.stats.oldestEntry = Math.min(...timestamps)
      this.stats.newestEntry = Math.max(...timestamps)
    }
    
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

// Create global cache instances
export const organizationCache = new CacheManager({
  defaultTTL: 300, // 5 minutes for organization data
  maxEntries: 500,
  enableAnalytics: true
})

export const accountCache = new CacheManager({
  defaultTTL: 600, // 10 minutes for account data
  maxEntries: 1000,
  enableAnalytics: true
})

export const costCache = new CacheManager({
  defaultTTL: 900, // 15 minutes for cost data
  maxEntries: 200,
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
    CacheManager.generateKey('forecast:analysis', params)
}

// Cache tags for invalidation
export const CacheTags = {
  ACCOUNTS: 'accounts',
  COSTS: 'costs',
  ORGANIZATION: 'organization',
  SERVICES: 'services',
  BUDGETS: 'budgets'
}

// Default cache manager instance
const defaultCacheManager = new CacheManager({
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
 * Clear pattern-based cache entries
 */
export async function clearPattern(pattern: string): Promise<number> {
  const cache = getCacheManager()
  return cache.clearPattern(pattern)
}

export { CacheManager }