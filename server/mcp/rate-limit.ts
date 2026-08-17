import { createHash } from 'node:crypto'
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { getDynamoDBClient } from '../lib/aws-client-factory'
import { getOAuthTableConfig, useDurableOAuthStore } from './config'

interface RateBucket {
  count: number
  resetAt: number
}

const localBuckets = new Map<string, RateBucket>()

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
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
    localBuckets.set(key, { count: increment, resetAt: now + windowSeconds * 1000 })
    return { allowed: increment <= limit, retryAfterSeconds: increment <= limit ? 0 : windowSeconds }
  }
  bucket.count += increment
  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: bucket.count <= limit ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
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

  const windowMs = windowSeconds * 1000
  const windowStart = Math.floor(now / windowMs) * windowMs
  const resetAt = windowStart + windowMs
  const keyHash = createHash('sha256').update(key).digest('hex').slice(0, 32)
  const config = getOAuthTableConfig()
  const client = await getDynamoDBClient(config.environment, undefined, config.accountId)
  const response = await client.send(new UpdateItemCommand({
    TableName: config.tableName,
    Key: marshall({ artifactId: `McpRateLimit#${keyHash}#${windowStart}` }),
    UpdateExpression: 'SET #model = :model, #resetAt = :resetAt, #ttl = :ttl ADD #count :increment',
    ExpressionAttributeNames: { '#model': 'model', '#resetAt': 'resetAt', '#ttl': 'ttl', '#count': 'count' },
    ExpressionAttributeValues: marshall({
      ':model': 'McpRateLimit',
      ':resetAt': new Date(resetAt).toISOString(),
      ':ttl': Math.floor(resetAt / 1000) + windowSeconds,
      ':increment': increment
    }),
    ReturnValues: 'ALL_NEW'
  }))
  const count = Number(response.Attributes ? unmarshall(response.Attributes).count : increment)
  return {
    allowed: count <= limit,
    retryAfterSeconds: count <= limit ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000))
  }
}
