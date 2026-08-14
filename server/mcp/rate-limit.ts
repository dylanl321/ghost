interface RateBucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateBucket>()

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

export function checkMcpRateLimit(key: string, limit: number, windowSeconds: number): RateLimitDecision {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  bucket.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

