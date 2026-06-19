/**
 * CloudWatch Rate Limiter
 *
 * Provides concurrency limiting (semaphore) and optional token-bucket rate limiting
 * for CloudWatch GetMetricData API calls to prevent throttling.
 */

import { logger } from './logger'

// Configuration constants
export const DEFAULT_CW_CONCURRENCY = 5
export const DEFAULT_CW_MAX_RPS = 10

// Parse and clamp environment variables
const parseEnvInt = (envVar: string | undefined, defaultValue: number, min: number, max: number): number => {
  if (!envVar) return defaultValue
  const parsed = parseInt(envVar, 10)
  if (isNaN(parsed)) return defaultValue
  return Math.max(min, Math.min(max, parsed))
}

export const CW_MAX_CONCURRENCY = parseEnvInt(
  process.env.CLOUDWATCH_MAX_CONCURRENCY,
  DEFAULT_CW_CONCURRENCY,
  1,
  20
)

export const CW_MAX_RPS = parseEnvInt(
  process.env.CLOUDWATCH_MAX_RPS,
  DEFAULT_CW_MAX_RPS,
  0,
  100
)

// Semaphore state
let active = 0
const queue: Array<() => void> = []

function acquire(): Promise<void> {
  if (active < CW_MAX_CONCURRENCY) {
    active++
    return Promise.resolve()
  }
  return new Promise(resolve => queue.push(resolve))
}

function release(): void {
  active--
  const next = queue.shift()
  if (next) {
    active++
    next()
  }
}

// Token bucket state (only used if CW_MAX_RPS > 0)
let tokens = CW_MAX_RPS
let lastRefill = Date.now()

function waitForToken(): Promise<void> {
  if (CW_MAX_RPS === 0) return Promise.resolve() // Rate limiting disabled

  const now = Date.now()
  const elapsed = (now - lastRefill) / 1000
  tokens = Math.min(CW_MAX_RPS, tokens + elapsed * CW_MAX_RPS)
  lastRefill = now

  if (tokens >= 1) {
    tokens--
    return Promise.resolve()
  }

  const wait = Math.ceil(((1 - tokens) / CW_MAX_RPS) * 1000)
  return new Promise(resolve => setTimeout(resolve, wait)).then(() => waitForToken())
}

/**
 * Acquires concurrency slot and rate limit token, executes fn, then releases slot.
 */
export async function acquireLimiter<T>(fn: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    await waitForToken()
    return await fn()
  } finally {
    release()
  }
}

// Log configuration once at module init
logger.info(
  `[CloudWatch Limiter] Initialized: maxConcurrency=${CW_MAX_CONCURRENCY}, maxRPS=${CW_MAX_RPS}${CW_MAX_RPS === 0 ? ' (rate limiting disabled)' : ''}`
)
