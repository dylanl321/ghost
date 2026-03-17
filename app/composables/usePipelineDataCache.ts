interface CacheEntry {
  data: any
  timestamp: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes - matches server cache TTL
const MAX_ENTRIES = 20

// Module-level Map survives component unmount but clears on full page refresh
const cache = new Map<string, CacheEntry>()

function buildKey(endpoint: string, params: Record<string, string | number>): string {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return `${endpoint}:${sorted}`
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS
}

function evictOldest() {
  if (cache.size <= MAX_ENTRIES) return
  let oldestKey: string | null = null
  let oldestTime = Infinity
  for (const [key, entry] of cache) {
    if (entry.timestamp < oldestTime) {
      oldestTime = entry.timestamp
      oldestKey = key
    }
  }
  if (oldestKey) cache.delete(oldestKey)
}

export function getCachedPipelineData<T = any>(endpoint: string, params: Record<string, string | number>): T | null {
  const key = buildKey(endpoint, params)
  const entry = cache.get(key)
  if (!entry) return null
  if (isExpired(entry)) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

export function setCachedPipelineData(endpoint: string, params: Record<string, string | number>, data: any): void {
  const key = buildKey(endpoint, params)
  cache.set(key, { data, timestamp: Date.now() })
  evictOldest()
}

export function invalidatePipelineCache(endpoint?: string): void {
  if (!endpoint) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${endpoint}:`)) {
      cache.delete(key)
    }
  }
}

export function clearPipelineCache(): void {
  cache.clear()
}
