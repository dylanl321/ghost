import { UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { getDynamoDBClient } from '../lib/aws-client-factory'
import { getOAuthTableConfig, useDurableOAuthStore } from './config'
import {
  computeRetryAfterSeconds,
  deriveDurableRateBucketKey,
  deriveLocalRateBucketKey
} from './rate-limit-buckets'

interface RateBucket {
  count: number
  resetAt: number
}

const localBuckets = new Map<string, RateBucket>()

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * Read-only peek at the local (in-memory) rate bucket for `key`.
 *
 * Returns a COPY of the current bucket, or `undefined` when no bucket exists.
 * This is the non-mutating counterpart the OAuth quota readers use (task 4.2,
 * Requirement 12.2): it never creates, mutates, or deletes a bucket (no
 * `localBuckets.set`) and never exposes the underlying Map. An expired bucket
 * (`resetAt <= now`) is returned as-is; callers apply window-expiry semantics
 * via the shared bucket math rather than mutating state here.
 */
export function peekLocalRateBucket(key: string): { count: number, resetAt: number } | undefined {
  const bucket = localBuckets.get(key)
  return bucket ? { count: bucket.count, resetAt: bucket.resetAt } : undefined
}

export function extractMcpToolNames(payload: unknown): string[] {
  const envelopes = Array.isArray(payload) ? payload : [payload]
  return envelopes.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const value = item as { method?: unknown; params?: { name?: unknown } }
    return value.method === 'tools/call' && typeof value.params?.name === 'string' ? [value.params.name] : []
  })
}

function localDecision(key: string, limit: number, windowSeconds: number, increment: number): RateLimitDecision {
  const now = Date.now()
  const bucket = localBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    const { mapKey, resetAt } = deriveLocalRateBucketKey(key, windowSeconds, now)
    localBuckets.set(mapKey, { count: increment, resetAt })
    // A fresh window's retry hint is the full window length, matching the
    // original limiter behavior (not the elapsed-based computeRetryAfterSeconds).
    return { allowed: increment <= limit, retryAfterSeconds: increment <= limit ? 0 : windowSeconds }
  }
  bucket.count += increment
  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: computeRetryAfterSeconds(bucket.count, limit, bucket.resetAt, now)
  }
}

export async function checkMcpRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  increment = 1,
  now = Date.now()
): Promise<RateLimitDecision> {
  if (!useDurableOAuthStore()) return localDecision(key, limit, windowSeconds, increment)

  const bucket = deriveDurableRateBucketKey(key, windowSeconds, now)
  const config = getOAuthTableConfig()
  const client = await getDynamoDBClient(config.environment, undefined, config.accountId)
  const response = await client.send(new UpdateItemCommand({
    TableName: config.tableName,
    Key: marshall({ artifactId: bucket.artifactId }),
    UpdateExpression: 'SET #model = :model, #resetAt = :resetAt, #ttl = :ttl ADD #count :increment',
    ExpressionAttributeNames: { '#model': 'model', '#resetAt': 'resetAt', '#ttl': 'ttl', '#count': 'count' },
    ExpressionAttributeValues: marshall({
      ':model': 'McpRateLimit',
      ':resetAt': bucket.resetAtIso,
      ':ttl': bucket.ttl,
      ':increment': increment
    }),
    ReturnValues: 'ALL_NEW'
  }))
  const count = Number(response.Attributes ? unmarshall(response.Attributes).count : increment)
  return {
    allowed: count <= limit,
    retryAfterSeconds: computeRetryAfterSeconds(count, limit, bucket.resetAt, now)
  }
}
