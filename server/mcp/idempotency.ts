import { getItem, putItem } from '../utils/dynamodb'
import { getOAuthTableConfig } from './config'
import type { GhostMcpPrincipal } from './types'

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60

function key(principal: GhostMcpPrincipal, tool: string, idempotencyKey: string) {
  return {
    artifactId: `McpIdempotency#${principal.subject}#${principal.clientId}#${tool}#${idempotencyKey}`
  }
}

export async function runIdempotent<T>(
  principal: GhostMcpPrincipal,
  tool: string,
  idempotencyKey: string,
  execute: () => Promise<T>
): Promise<{ value: T; replayed: boolean }> {
  const config = getOAuthTableConfig()
  const artifactKey = key(principal, tool, idempotencyKey)
  const existing = await getItem(config.tableName, artifactKey, config.environment) as { payload?: { value: T } } | null
  if (existing?.payload) return { value: existing.payload.value, replayed: true }

  const value = await execute()
  await putItem(config.tableName, {
    ...artifactKey,
    model: 'McpIdempotency',
    payload: { value },
    ttl: Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS
  }, config.environment)
  return { value, replayed: false }
}

