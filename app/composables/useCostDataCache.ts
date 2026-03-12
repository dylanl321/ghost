import type { NormalizedDataset, DataMode } from '~/types/costs'

interface CacheEntry {
  dataset: NormalizedDataset
  timestamp: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_ENTRIES = 10

// Module-level Map survives component unmount but clears on full page refresh
const cache = new Map<string, CacheEntry>()

function buildKey(accounts: string[], timeframe: string, mode: DataMode): string {
  const sortedIds = [...accounts].sort().join(',')
  return `${mode}:${timeframe}:${sortedIds}`
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS
}

function evictOldest() {
  if (cache.size <= MAX_ENTRIES) return
  // Evict the oldest entry by timestamp
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

export function getCachedDataset(accounts: string[], timeframe: string, mode: DataMode): NormalizedDataset | null {
  const key = buildKey(accounts, timeframe, mode)
  const entry = cache.get(key)
  if (!entry) return null
  if (isExpired(entry)) {
    cache.delete(key)
    return null
  }
  return entry.dataset
}

export function setCachedDataset(accounts: string[], timeframe: string, mode: DataMode, dataset: NormalizedDataset): void {
  const key = buildKey(accounts, timeframe, mode)
  cache.set(key, { dataset, timestamp: Date.now() })
  evictOldest()
}

export function invalidateByMode(mode: DataMode): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${mode}:`)) {
      cache.delete(key)
    }
  }
}

export function clearCostDataCache(): void {
  cache.clear()
}
