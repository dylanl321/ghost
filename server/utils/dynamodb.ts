/**
 * DynamoDB Utility Functions
 * Common operations for DynamoDB interactions
 */

import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  BatchWriteItemCommand,
  type AttributeValue
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { getDynamoDBClient } from '../lib/aws-client-factory'
import type { DynamoDBQueryParams } from '../types'
import { logger } from './logger'

/**
 * Recursively sanitize data for DynamoDB
 * Removes undefined values, null values, and empty strings
 * DynamoDB does not support empty strings as attribute values
 */
export function sanitizeForDynamoDB(obj: any): any {
  if (obj === null || obj === undefined) {
    return undefined
  }

  if (typeof obj === 'string') {
    // Convert empty strings to undefined (will be removed)
    return obj === '' ? undefined : obj
  }

  if (Array.isArray(obj)) {
    // Filter out undefined/null values and recursively sanitize
    const sanitizedArray = obj
      .map(item => sanitizeForDynamoDB(item))
      .filter(item => item !== undefined && item !== null)
    // Return undefined for empty arrays (they will be filtered out)
    return sanitizedArray.length === 0 ? undefined : sanitizedArray
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedValue = sanitizeForDynamoDB(value)
      // Only include if not undefined or null
      if (sanitizedValue !== undefined && sanitizedValue !== null) {
        sanitized[key] = sanitizedValue
      }
    }
    // Return undefined for empty objects (they will be filtered out)
    return Object.keys(sanitized).length === 0 ? undefined : sanitized
  }

  return obj
}

/**
 * Get a single item from DynamoDB
 */
export async function getItem(
  tableName: string,
  key: Record<string, any>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
) {
  const client = await getDynamoDBClient(environment, undefined, accountId)

  const command = new GetItemCommand({
    TableName: tableName,
    Key: marshall(key, { removeUndefinedValues: true, convertEmptyValues: true })
  })

  const response = await client.send(command)
  return response.Item ? unmarshall(response.Item, { wrapNumbers: false }) : null
}

/**
 * Put an item into DynamoDB
 */
export async function putItem(
  tableName: string,
  item: Record<string, any>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
) {
  const client = await getDynamoDBClient(environment, undefined, accountId)

  // Sanitize item before marshalling
  const sanitizedItem = sanitizeForDynamoDB(item)

  const command = new PutItemCommand({
    TableName: tableName,
    Item: marshall(sanitizedItem, { removeUndefinedValues: true, convertEmptyValues: true })
  })

  await client.send(command)
  return sanitizedItem
}

/**
 * Update an item in DynamoDB
 */
export async function updateItem(
  tableName: string,
  key: Record<string, any>,
  updates: Record<string, any>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
) {
  const client = await getDynamoDBClient(environment, undefined, accountId)
  
  // Sanitize updates before marshalling. sanitizeForDynamoDB returns
  // undefined when every field is empty, so default to an empty object.
  const sanitizedUpdates: Record<string, any> = sanitizeForDynamoDB(updates) ?? {}

  if (Object.keys(sanitizedUpdates).length === 0) {
    logger.warn('[DynamoDB updateItem] All update fields were removed during sanitization', {
      tableName,
      fields: Object.keys(updates)
    })
    throw new Error('No valid fields to update after sanitization')
  }

  // Build update expression
  const updateExpressionParts: string[] = []
  const expressionAttributeNames: Record<string, string> = {}
  const valueMap: Record<string, any> = {}

  Object.entries(sanitizedUpdates).forEach(([field, value], index) => {
    const attrName = `#attr${index}`
    const attrValue = `:val${index}`

    updateExpressionParts.push(`${attrName} = ${attrValue}`)
    expressionAttributeNames[attrName] = field
    valueMap[attrValue] = value
  })

  // Marshall all values at once to ensure proper DynamoDB format
  const expressionAttributeValues = marshall(valueMap, {
    removeUndefinedValues: true,
    convertEmptyValues: true  // Convert empty strings to NULL
  }) as Record<string, AttributeValue>

  const commandParams = {
    TableName: tableName,
    Key: marshall(key, { removeUndefinedValues: true, convertEmptyValues: true }),
    UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW' as const
  }

  // Field names only: values can hold user content and must not reach the logs.
  logger.debug('[DynamoDB updateItem] Updating item', {
    tableName,
    keyFields: Object.keys(key),
    fields: Object.values(expressionAttributeNames)
  })

  const command = new UpdateItemCommand(commandParams)

  try {
    const response = await client.send(command)
    return response.Attributes ? unmarshall(response.Attributes, { wrapNumbers: false }) : null
  } catch (error: any) {
    logger.error('[DynamoDB updateItem] Command send failed:', {
      tableName,
      error: error.message,
      errorName: error.name,
      httpStatusCode: error.$metadata?.httpStatusCode,
      updateExpression: commandParams.UpdateExpression,
      keyFields: Object.keys(key)
    })

    throw error
  }
}

/**
 * Delete an item from DynamoDB
 */
export async function deleteItem(
  tableName: string,
  key: Record<string, any>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
) {
  const client = await getDynamoDBClient(environment, undefined, accountId)
  
  const command = new DeleteItemCommand({
    TableName: tableName,
    Key: marshall(key, { removeUndefinedValues: true, convertEmptyValues: true }),
    ReturnValues: 'ALL_OLD'
  })

  const response = await client.send(command)
  return response.Attributes ? unmarshall(response.Attributes, { wrapNumbers: false }) : null
}

/**
 * Query items from DynamoDB
 */
export async function queryItems(
  params: DynamoDBQueryParams,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
) {
  const startedAt = Date.now()
  const client = await getDynamoDBClient(environment, undefined, accountId)

  const command = new QueryCommand({
    TableName: params.tableName,
    IndexName: params.indexName,
    KeyConditionExpression: params.queryExpression,
    FilterExpression: params.filterExpression,
    ProjectionExpression: params.projectionExpression,
    ExpressionAttributeNames: params.expressionAttributeNames,
    ExpressionAttributeValues: params.expressionAttributeValues
      ? marshall(params.expressionAttributeValues, { removeUndefinedValues: true, convertEmptyValues: true })
      : undefined,
    Limit: params.limit,
    ScanIndexForward: params.scanIndexForward,
    ExclusiveStartKey: params.nextToken ? JSON.parse(Buffer.from(params.nextToken, 'base64').toString()) : undefined
  })

  const response = await client.send(command)
  logger.debug('[DynamoDB] queryItems completed', {
    tableName: params.tableName,
    indexName: params.indexName,
    environment,
    accountId,
    count: response.Count ?? response.Items?.length ?? 0,
    hasLastKey: !!response.LastEvaluatedKey,
    durationMs: Date.now() - startedAt
  })

  return {
    items: response.Items?.map(item => unmarshall(item, { wrapNumbers: false })) || [],
    nextToken: response.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64')
      : undefined,
    count: response.Count || 0
  }
}

/**
 * Scan items from DynamoDB (use sparingly)
 */
export async function scanItems(
  tableName: string,
  filterExpression?: string,
  limit?: number,
  nextToken?: string,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  expressionAttributeNames?: Record<string, string>,
  expressionAttributeValues?: Record<string, any>,
  accountId?: string
) {
  const client = await getDynamoDBClient(environment, undefined, accountId)

  // Marshall expression attribute values if provided
  let marshalledValues
  if (expressionAttributeValues) {
    marshalledValues = marshall(expressionAttributeValues, { removeUndefinedValues: true, convertEmptyValues: true })
    // Check if marshalling resulted in empty object
    if (Object.keys(marshalledValues).length === 0) {
      marshalledValues = undefined
    }
  }

  const command = new ScanCommand({
    TableName: tableName,
    FilterExpression: filterExpression,
    Limit: limit,
    ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: marshalledValues
  })

  const response = await client.send(command)

  return {
    items: response.Items?.map(item => unmarshall(item, { wrapNumbers: false })) || [],
    nextToken: response.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64')
      : undefined,
    count: response.Count || 0
  }
}

/**
 * Scan every page of a table. scanItems returns a single page (at most 1 MB),
 * so callers that need the whole table must use this instead.
 */
export async function scanAllItems(
  tableName: string,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
): Promise<any[]> {
  const items: any[] = []
  let nextToken: string | undefined
  do {
    const page = await scanItems(tableName, undefined, undefined, nextToken, environment, undefined, undefined, accountId)
    items.push(...page.items)
    nextToken = page.nextToken
  } while (nextToken)
  return items
}

type WriteRequest =
  | { PutRequest: { Item: Record<string, AttributeValue> } }
  | { DeleteRequest: { Key: Record<string, AttributeValue> } }

const BATCH_WRITE_SIZE = 25 // DynamoDB limit for BatchWriteItem
const BATCH_WRITE_MAX_ATTEMPTS = 6

/**
 * Write requests in batches of 25, a few batches at a time, retrying
 * UnprocessedItems and throughput errors with backoff. Returns how many
 * requests were written and how many were given up on.
 */
async function runBatchWrites(
  tableName: string,
  requests: WriteRequest[],
  environment: 'commercial' | 'govcloud',
  accountId: string | undefined,
  parallelLimit: number
): Promise<{ written: number, failed: number }> {
  const client = await getDynamoDBClient(environment, undefined, accountId)
  let written = 0
  let failed = 0

  const writeBatch = async (batch: WriteRequest[]) => {
    let pending = batch
    for (let attempt = 1; attempt <= BATCH_WRITE_MAX_ATTEMPTS && pending.length > 0; attempt++) {
      try {
        const response = await client.send(new BatchWriteItemCommand({
          RequestItems: { [tableName]: pending as any }
        }))
        const unprocessed = (response.UnprocessedItems?.[tableName] ?? []) as WriteRequest[]
        written += pending.length - unprocessed.length
        pending = unprocessed
      } catch (error: any) {
        const retryable = error?.name === 'ProvisionedThroughputExceededException' ||
          error?.name === 'ThrottlingException'
        if (!retryable) {
          logger.error('[DynamoDB] Batch write error', { tableName, error: error?.message, errorName: error?.name })
          break
        }
      }
      if (pending.length > 0 && attempt < BATCH_WRITE_MAX_ATTEMPTS) {
        const delay = Math.min(100 * 2 ** attempt, 5000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    failed += pending.length
  }

  const batches: WriteRequest[][] = []
  for (let i = 0; i < requests.length; i += BATCH_WRITE_SIZE) {
    batches.push(requests.slice(i, i + BATCH_WRITE_SIZE))
  }
  for (let i = 0; i < batches.length; i += parallelLimit) {
    await Promise.all(batches.slice(i, i + parallelLimit).map(writeBatch))
  }

  return { written, failed }
}

/**
 * Batch put items into DynamoDB with parallel processing and retry logic.
 * Throws when any item could not be written, so callers never report a
 * partial write as a success.
 */
export async function batchPutItems(
  tableName: string,
  items: Array<Record<string, any>>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
): Promise<{ processedCount: number, failedCount: number }> {
  const requests: WriteRequest[] = items.map(item => ({
    PutRequest: { Item: marshall(item, { removeUndefinedValues: true, convertEmptyValues: true }) }
  }))

  const { written, failed } = await runBatchWrites(tableName, requests, environment, accountId, 3)
  const summary = { tableName, environment, processedCount: written, failedCount: failed }

  if (failed > 0) {
    logger.error(`Batch put completed with failures: ${written} written, ${failed} failed`, summary)
    throw new Error(`Batch put to ${tableName} failed for ${failed} of ${items.length} items`)
  }
  logger.info(`Batch put completed: ${written} written`, summary)
  return { processedCount: written, failedCount: 0 }
}

/**
 * Batch delete items from DynamoDB with parallel processing
 */
export async function batchDeleteItems(
  tableName: string,
  keys: Array<Record<string, any>>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
): Promise<{ deletedCount: number, failedCount: number }> {
  const requests: WriteRequest[] = keys.map(key => ({
    DeleteRequest: { Key: marshall(key, { removeUndefinedValues: true, convertEmptyValues: true }) }
  }))

  const { written, failed } = await runBatchWrites(tableName, requests, environment, accountId, 4)

  // Mirror batchPutItems: a clean completion is info, failures are error.
  const deleteSummary = { deletedCount: written, failedCount: failed, tableName, environment }
  if (failed === 0) {
    logger.info(`Batch delete completed: ${written} deleted, 0 failed`, deleteSummary)
  } else {
    logger.error(`Batch delete completed with failures: ${written} deleted, ${failed} failed`, deleteSummary)
  }

  return { deletedCount: written, failedCount: failed }
}
