import { createHash, randomUUID } from 'node:crypto'
import { GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { getDynamoDBClient } from '../lib/aws-client-factory'
import { sanitizeErrorExplanation } from './audit'
import { getOAuthTableConfig } from './config'
import type { GhostMcpPrincipal } from './types'

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60

interface IdempotencyRecord<R> {
  artifactId: string
  payload: {
    state: 'pending' | 'completed' | 'failed'
    requestHash: string
    ownerToken: string
    reference?: R
    errorCode?: string
    errorMessage?: string
  }
}

function key(principal: GhostMcpPrincipal, tool: string, idempotencyKey: string) {
  return { artifactId: `McpIdempotency#${principal.subject}#${principal.clientId}#${tool}#${idempotencyKey}` }
}

function requestHash(request: unknown): string {
  return createHash('sha256').update(JSON.stringify(request) || 'null').digest('hex')
}

function idempotencyError(code: string, message: string, retryable = false) {
  const error = new Error(message) as Error & { code: string; retryable: boolean }
  error.name = code
  error.code = code
  error.retryable = retryable
  return error
}

export async function runIdempotent<T, R>(
  principal: GhostMcpPrincipal,
  tool: string,
  idempotencyKey: string,
  request: unknown,
  execute: () => Promise<T>,
  toReference: (value: T) => R,
  replay: (reference: R) => Promise<T>
): Promise<{ value: T; replayed: boolean }> {
  const config = getOAuthTableConfig()
  const artifactKey = key(principal, tool, idempotencyKey)
  const hash = requestHash(request)
  const ownerToken = randomUUID()
  const ttl = Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS
  const client = await getDynamoDBClient(config.environment, undefined, config.accountId)

  try {
    await client.send(new PutItemCommand({
      TableName: config.tableName,
      Item: marshall({ ...artifactKey, model: 'McpIdempotency', payload: { state: 'pending', requestHash: hash, ownerToken }, ttl }),
      ConditionExpression: 'attribute_not_exists(artifactId)'
    }))
  } catch (error: any) {
    if (error?.name !== 'ConditionalCheckFailedException') throw error
    const existingResult = await client.send(new GetItemCommand({ TableName: config.tableName, Key: marshall(artifactKey), ConsistentRead: true }))
    const existing = existingResult.Item ? unmarshall(existingResult.Item) as IdempotencyRecord<R> : null
    if (!existing || existing.payload.requestHash !== hash) throw idempotencyError('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with different arguments.')
    if (existing.payload.state === 'pending') throw idempotencyError('IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is still in progress.', true)
    if (existing.payload.state === 'failed') throw idempotencyError('IDEMPOTENCY_PREVIOUSLY_FAILED', existing.payload.errorMessage || 'The previous request failed; use a new idempotency key.')
    if (existing.payload.reference === undefined) throw idempotencyError('IDEMPOTENCY_RESULT_MISSING', 'The completed request has no replay reference.')
    return { value: await replay(existing.payload.reference), replayed: true }
  }

  try {
    const value = await execute()
    await client.send(new UpdateItemCommand({
      TableName: config.tableName,
      Key: marshall(artifactKey),
      UpdateExpression: 'SET #payload = :payload, #ttl = :ttl',
      ConditionExpression: '#payload.#ownerToken = :ownerToken AND #payload.#state = :pending',
      ExpressionAttributeNames: { '#payload': 'payload', '#ownerToken': 'ownerToken', '#state': 'state', '#ttl': 'ttl' },
      ExpressionAttributeValues: marshall({ ':payload': { state: 'completed', requestHash: hash, ownerToken, reference: toReference(value) }, ':ttl': ttl, ':ownerToken': ownerToken, ':pending': 'pending' })
    }))
    return { value, replayed: false }
  } catch (error: any) {
    await client.send(new UpdateItemCommand({
      TableName: config.tableName,
      Key: marshall(artifactKey),
      UpdateExpression: 'SET #payload = :payload, #ttl = :ttl',
      ConditionExpression: '#payload.#ownerToken = :ownerToken',
      ExpressionAttributeNames: { '#payload': 'payload', '#ownerToken': 'ownerToken', '#ttl': 'ttl' },
      ExpressionAttributeValues: marshall({ ':payload': { state: 'failed', requestHash: hash, ownerToken, errorCode: error?.code || error?.name || 'TOOL_ERROR', errorMessage: sanitizeErrorExplanation(error?.message) }, ':ttl': ttl, ':ownerToken': ownerToken })
    })).catch(() => undefined)
    throw error
  }
}
