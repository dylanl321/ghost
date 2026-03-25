import type { NormalizedDataset, DataMode } from '~/types/costs'

interface CacheEntry {
  dataset: NormalizedDataset
  timestamp: number
  version: number
}

const CACHE_VERSION = 1
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_ENTRIES = 10
const PREFIX = 'ghost:cost-cache:'
const INDEX_KEY = 'ghost:cost-cache:__index__'

// Fallback in-memory Map (used during SSR or when sessionStorage quota is exceeded)
let fallbackMap: Map<string, CacheEntry> | null = null

function useStorage(): boolean {
  return !import.meta.server && typeof sessionStorage !== 'undefined'
}

function getFallback(): Map<string, CacheEntry> {
  if (!fallbackMap) fallbackMap = new Map()
  return fallbackMap
}

function getIndex(): string[] {
  if (!useStorage()) return []
  try {
    const raw = sessionStorage.getItem(INDEX_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function setIndex(keys: string[]): void {
  if (!useStorage()) return
  try {
    sessionStorage.setItem(INDEX_KEY, JSON.stringify(keys))
  } catch {
    // quota exceeded - ignore
  }
}

function buildKey(accounts: string[], timeframe: string, mode: DataMode): string {
  const sortedIds = [...accounts].sort().join(',')
  return `${mode}:${timeframe}:${sortedIds}`
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS
}

function evictOldest(): void {
  if (useStorage()) {
    const index = getIndex()
    while (index.length > MAX_ENTRIES) {
      // Find oldest by timestamp
      let oldestIdx = 0
      let oldestTime = Infinity
      for (let i = 0; i < index.length; i++) {
        try {
          const raw = sessionStorage.getItem(PREFIX + index[i])
          if (raw) {
            const entry: CacheEntry = JSON.parse(raw)
            if (entry.timestamp < oldestTime) {
              oldestTime = entry.timestamp
              oldestIdx = i
            }
          }
        } catch {
          // Corrupted entry - evict it
          oldestIdx = i
          break
        }
      }
      sessionStorage.removeItem(PREFIX + index[oldestIdx])
      index.splice(oldestIdx, 1)
    }
    setIndex(index)
  } else {
    const fb = getFallback()
    if (fb.size <= MAX_ENTRIES) return
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [key, entry] of fb) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp
        oldestKey = key
      }
    }
    if (oldestKey) fb.delete(oldestKey)
  }
}

export function getCachedDataset(accounts: string[], timeframe: string, mode: DataMode): NormalizedDataset | null {
  const key = buildKey(accounts, timeframe, mode)

  if (useStorage()) {
    try {
      const raw = sessionStorage.getItem(PREFIX + key)
      if (!raw) return null
      const entry: CacheEntry = JSON.parse(raw)
      if (isExpired(entry)) {
        sessionStorage.removeItem(PREFIX + key)
        const index = getIndex().filter(k => k !== key)
        setIndex(index)
        return null
      }
      if (entry.version !== CACHE_VERSION) {
        sessionStorage.removeItem(PREFIX + key)
        const index = getIndex().filter(k => k !== key)
        setIndex(index)
        return null
      }
      return entry.dataset
    } catch {
      return null
    }
  }

  const fb = getFallback()
  const entry = fb.get(key)
  if (!entry) return null
  if (isExpired(entry)) {
    fb.delete(key)
    return null
  }
  if (entry.version !== CACHE_VERSION) {
    fb.delete(key)
    return null
  }
  return entry.dataset
}

export function setCachedDataset(accounts: string[], timeframe: string, mode: DataMode, dataset: NormalizedDataset): void {
  const key = buildKey(accounts, timeframe, mode)
  const entry: CacheEntry = { dataset, timestamp: Date.now(), version: CACHE_VERSION }

  if (useStorage()) {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(entry))
      const index = getIndex()
      if (!index.includes(key)) index.push(key)
      setIndex(index)
      evictOldest()
    } catch {
      // Quota exceeded - fall back to in-memory
      const fb = getFallback()
      fb.set(key, entry)
      evictOldest()
    }
    return
  }

  const fb = getFallback()
  fb.set(key, entry)
  evictOldest()
}

export function invalidateByMode(mode: DataMode): void {
  if (useStorage()) {
    const index = getIndex()
    const remaining: string[] = []
    for (const key of index) {
      if (key.startsWith(`${mode}:`)) {
        sessionStorage.removeItem(PREFIX + key)
      } else {
        remaining.push(key)
      }
    }
    setIndex(remaining)
  }

  // Also clear fallback if present
  if (fallbackMap) {
    for (const key of fallbackMap.keys()) {
      if (key.startsWith(`${mode}:`)) {
        fallbackMap.delete(key)
      }
    }
  }
}

export function clearCostDataCache(): void {
  if (useStorage()) {
    const index = getIndex()
    for (const key of index) {
      sessionStorage.removeItem(PREFIX + key)
    }
    sessionStorage.removeItem(INDEX_KEY)
  }

  if (fallbackMap) {
    fallbackMap.clear()
    fallbackMap = null
  }
}
