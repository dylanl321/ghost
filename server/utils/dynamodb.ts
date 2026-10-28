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
  BatchGetItemCommand,
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
  
  // Sanitize updates before marshalling
  const sanitizedUpdates = sanitizeForDynamoDB(updates)

  // Check if all fields were removed during sanitization
  if (Object.keys(sanitizedUpdates).length === 0) {
    logger.warn('[DynamoDB updateItem] All update fields were removed during sanitization', {
      tableName,
      originalUpdates: updates
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

  // Metadata-only diagnostics. Never log key values, update values, attribute
  // names, or marshalled payloads — these carry high-cardinality application
  // data (and were the source of INFO-level false-positive "error" matches and
  // potential data exposure in CloudWatch). Counts and sizes are safe.
  logger.debug('[DynamoDB updateItem] prepared command', {
    tableName,
    environment,
    updateFieldCount: Object.keys(sanitizedUpdates).length,
    attributeNameCount: Object.keys(expressionAttributeNames).length,
    attributeValueCount: Object.keys(expressionAttributeValues).length,
    keySize: JSON.stringify(commandParams.Key).length,
    valuesSize: JSON.stringify(commandParams.ExpressionAttributeValues).length
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
      errorCode: error.code,
      errorType: error.$metadata?.httpStatusCode,
      updateExpression: commandParams.UpdateExpression,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 1000)
    })

    // Log the full command for debugging serialization issues
    logger.error('[DynamoDB updateItem] Failed command details:', {
      key: JSON.stringify(commandParams.Key),
      expressionAttributeNames: JSON.stringify(commandParams.ExpressionAttributeNames),
      expressionAttributeValuesKeys: Object.keys(commandParams.ExpressionAttributeValues)
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
 * Batch write items to DynamoDB
 */
export async function batchWriteItems(
  tableName: string,
  items: Array<{ putRequest?: Record<string, any>, deleteRequest?: Record<string, any> }>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
) {
  const client = await getDynamoDBClient(environment, undefined, accountId)
  
  // Process in batches of 25 (DynamoDB limit)
  const batchSize = 25
  const results = []
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    
    const requestItems = {
      [tableName]: batch.map(item => {
        if (item.putRequest) {
          return { PutRequest: { Item: marshall(item.putRequest, { removeUndefinedValues: true, convertEmptyValues: true }) } }
        } else if (item.deleteRequest) {
          return { DeleteRequest: { Key: marshall(item.deleteRequest, { removeUndefinedValues: true, convertEmptyValues: true }) } }
        }
        throw new Error('Invalid batch item')
      })
    }

    const command = new BatchWriteItemCommand({
      RequestItems: requestItems
    })

    const response = await client.send(command)
    results.push(response)
  }
  
  return results
}

/**
 * Batch get items from DynamoDB
 */
export async function batchGetItems(
  tableName: string,
  keys: Array<Record<string, any>>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
) {
  const client = await getDynamoDBClient(environment, undefined, accountId)
  
  // Process in batches of 100 (DynamoDB limit)
  const batchSize = 100
  const allItems: any[] = []
  
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize)
    
    const command = new BatchGetItemCommand({
      RequestItems: {
        [tableName]: {
          Keys: batch.map(key => marshall(key, { removeUndefinedValues: true, convertEmptyValues: true }))
        }
      }
    })

    const response = await client.send(command)
    const items = response.Responses?.[tableName]?.map(item => unmarshall(item, { wrapNumbers: false })) || []
    allItems.push(...items)
  }
  
  return allItems
}

/**
 * Batch put items into DynamoDB with parallel processing and retry logic
 */
export async function batchPutItems(
  tableName: string,
  items: Array<Record<string, any>>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
) {
  const client = await getDynamoDBClient(environment, undefined, accountId)
  
  const batchSize = 25 // DynamoDB limit
  const results: any[] = []
  let processedCount = 0
  let failedCount = 0
  
  // Split items into batches
  const batches: Array<Array<Record<string, any>>> = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize))
  }
  
  logger.info(`Processing ${items.length} items in ${batches.length} batches`)
  
  // Process batches with controlled parallelism
  const parallelLimit = 3 // Process 3 batches at a time
  for (let i = 0; i < batches.length; i += parallelLimit) {
    const parallelBatches = batches.slice(i, i + parallelLimit)
    
    const batchPromises = parallelBatches.map(async (batch) => {
      let retryCount = 0
      const maxRetries = 3
      let currentBatch = batch
      
      while (currentBatch.length > 0 && retryCount < maxRetries) {
        try {
          const requestItems = {
            [tableName]: currentBatch.map(item => ({
              PutRequest: {
                Item: marshall(item, { removeUndefinedValues: true, convertEmptyValues: true })
              }
            }))
          }

          const command = new BatchWriteItemCommand({
            RequestItems: requestItems
          })

          const response = await client.send(command)

          // Check for unprocessed items
          if (response.UnprocessedItems && response.UnprocessedItems[tableName]) {
            currentBatch = response.UnprocessedItems[tableName].map((req: any) =>
              unmarshall(req.PutRequest.Item, { wrapNumbers: false })
            )
            retryCount++
            
            if (currentBatch.length > 0) {
              const delay = Math.pow(2, retryCount) * 100
              await new Promise(resolve => setTimeout(resolve, delay))
            }
          } else {
            processedCount += batch.length
            currentBatch = []
          }
          
          return response
        } catch (error: any) {
          if (error.name === 'ProvisionedThroughputExceededException' && retryCount < maxRetries) {
            retryCount++
            const delay = Math.pow(2, retryCount) * 200
            logger.info(`Throttled - waiting ${delay}ms before retry ${retryCount}/${maxRetries}`)
            await new Promise(resolve => setTimeout(resolve, delay))
          } else {
            logger.error('Batch put error:', error.message)
            failedCount += currentBatch.length
            throw error
          }
        }
      }
      
      if (currentBatch.length > 0) {
        failedCount += currentBatch.length
      }
    })
    
    // Wait for this set of parallel batches to complete
    const batchResults = await Promise.allSettled(batchPromises)
    results.push(...batchResults)
    
    // Progress update
    logger.info(`Processed ${Math.min((i + parallelLimit) * batchSize, items.length)}/${items.length} items`)
    
    // Add delay between parallel batch sets
    if (i + parallelLimit < batches.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  const completionSummary = `Batch put completed: ${processedCount} processed, ${failedCount} failed`
  if (failedCount > 0) {
    logger.error(completionSummary)
  } else {
    logger.info(completionSummary)
  }

  return results
}

/**
 * Batch delete items from DynamoDB with parallel processing
 */
export async function batchDeleteItems(
  tableName: string,
  keys: Array<Record<string, any>>,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  accountId?: string
) {
  const client = await getDynamoDBClient(environment, undefined, accountId)
  
  // Use smaller batch size for deletes
  const batchSize = 25 // DynamoDB limit for batch write
  const results: any[] = []
  let deletedCount = 0
  let failedCount = 0
  
  // Process batches in parallel for better performance
  const batches: Array<Array<Record<string, any>>> = []
  for (let i = 0; i < keys.length; i += batchSize) {
    batches.push(keys.slice(i, i + batchSize))
  }
  
  // Process up to 4 batches in parallel to avoid overwhelming DynamoDB
  const parallelLimit = 4
  for (let i = 0; i < batches.length; i += parallelLimit) {
    const parallelBatches = batches.slice(i, i + parallelLimit)
    
    const batchPromises = parallelBatches.map(async (batch) => {
      let retryCount = 0
      const maxRetries = 3
      let currentBatch = batch
      
      while (currentBatch.length > 0 && retryCount < maxRetries) {
        try {
          const requestItems = {
            [tableName]: currentBatch.map(key => ({
              DeleteRequest: {
                Key: marshall(key, { removeUndefinedValues: true, convertEmptyValues: true })
              }
            }))
          }

          const command = new BatchWriteItemCommand({
            RequestItems: requestItems
          })

          const response = await client.send(command)

          // Check for unprocessed items
          if (response.UnprocessedItems && response.UnprocessedItems[tableName]) {
            currentBatch = response.UnprocessedItems[tableName].map((req: any) =>
              unmarshall(req.DeleteRequest.Key, { wrapNumbers: false })
            )
            retryCount++
            
            if (currentBatch.length > 0) {
              // Exponential backoff
              const delay = Math.pow(2, retryCount) * 100
              await new Promise(resolve => setTimeout(resolve, delay))
            }
          } else {
            deletedCount += batch.length
            currentBatch = []
          }
          
          return response
        } catch (error: any) {
          if (error.name === 'ProvisionedThroughputExceededException' && retryCount < maxRetries) {
            retryCount++
            const delay = Math.pow(2, retryCount) * 200
            logger.info(`Throttled during delete - waiting ${delay}ms before retry`)
            await new Promise(resolve => setTimeout(resolve, delay))
          } else {
            logger.error('Batch delete error:', error.message)
            failedCount += currentBatch.length
            throw error
          }
        }
      }
      
      if (currentBatch.length > 0) {
        failedCount += currentBatch.length
      }
    })
    
    // Wait for this set of parallel batches to complete
    const batchResults = await Promise.allSettled(batchPromises)
    results.push(...batchResults)
    
    // Add delay between parallel batch sets to avoid throttling
    if (i + parallelLimit < batches.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  // Mirror batchPutItems: a clean completion is info, failures are error.
  const deleteSummary = { deletedCount, failedCount, tableName, environment }
  if (failedCount === 0) {
    logger.info(`Batch delete completed: ${deletedCount} deleted, 0 failed`, deleteSummary)
  } else {
    logger.error(`Batch delete completed with failures: ${deletedCount} deleted, ${failedCount} failed`, deleteSummary)
  }

  return {
    deletedCount,
    failedCount,
    results
  }
}
