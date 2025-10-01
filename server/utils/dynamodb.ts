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

/**
 * Get a single item from DynamoDB
 */
export async function getItem(
  tableName: string,
  key: Record<string, any>,
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
  const command = new GetItemCommand({
    TableName: tableName,
    Key: marshall(key, { removeUndefinedValues: true })
  })

  const response = await client.send(command)
  return response.Item ? unmarshall(response.Item) : null
}

/**
 * Put an item into DynamoDB
 */
export async function putItem(
  tableName: string,
  item: Record<string, any>,
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
  const command = new PutItemCommand({
    TableName: tableName,
    Item: marshall(item, { removeUndefinedValues: true })
  })

  await client.send(command)
  return item
}

/**
 * Update an item in DynamoDB
 */
export async function updateItem(
  tableName: string,
  key: Record<string, any>,
  updates: Record<string, any>,
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
  // Build update expression
  const updateExpressionParts: string[] = []
  const expressionAttributeNames: Record<string, string> = {}
  const expressionAttributeValues: Record<string, AttributeValue> = {}
  
  Object.entries(updates).forEach(([field, value], index) => {
    const attrName = `#attr${index}`
    const attrValue = `:val${index}`
    
    updateExpressionParts.push(`${attrName} = ${attrValue}`)
    expressionAttributeNames[attrName] = field
    expressionAttributeValues[attrValue] = marshall(value, { removeUndefinedValues: true })
  })

  const command = new UpdateItemCommand({
    TableName: tableName,
    Key: marshall(key, { removeUndefinedValues: true }),
    UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  })

  const response = await client.send(command)
  return response.Attributes ? unmarshall(response.Attributes) : null
}

/**
 * Delete an item from DynamoDB
 */
export async function deleteItem(
  tableName: string,
  key: Record<string, any>,
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
  const command = new DeleteItemCommand({
    TableName: tableName,
    Key: marshall(key, { removeUndefinedValues: true }),
    ReturnValues: 'ALL_OLD'
  })

  const response = await client.send(command)
  return response.Attributes ? unmarshall(response.Attributes) : null
}

/**
 * Query items from DynamoDB
 */
export async function queryItems(
  params: DynamoDBQueryParams,
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
  const command = new QueryCommand({
    TableName: params.tableName,
    KeyConditionExpression: params.queryExpression,
    FilterExpression: params.filterExpression,
    ProjectionExpression: params.projectionExpression,
    Limit: params.limit,
    ExclusiveStartKey: params.nextToken ? JSON.parse(Buffer.from(params.nextToken, 'base64').toString()) : undefined
  })

  const response = await client.send(command)
  
  return {
    items: response.Items?.map(item => unmarshall(item)) || [],
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
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
  const command = new ScanCommand({
    TableName: tableName,
    FilterExpression: filterExpression,
    Limit: limit,
    ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined
  })

  const response = await client.send(command)
  
  return {
    items: response.Items?.map(item => unmarshall(item)) || [],
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
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
  // Process in batches of 25 (DynamoDB limit)
  const batchSize = 25
  const results = []
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    
    const requestItems = {
      [tableName]: batch.map(item => {
        if (item.putRequest) {
          return { PutRequest: { Item: marshall(item.putRequest, { removeUndefinedValues: true }) } }
        } else if (item.deleteRequest) {
          return { DeleteRequest: { Key: marshall(item.deleteRequest, { removeUndefinedValues: true }) } }
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
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
  // Process in batches of 100 (DynamoDB limit)
  const batchSize = 100
  const allItems: any[] = []
  
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize)
    
    const command = new BatchGetItemCommand({
      RequestItems: {
        [tableName]: {
          Keys: batch.map(key => marshall(key, { removeUndefinedValues: true }))
        }
      }
    })

    const response = await client.send(command)
    const items = response.Responses?.[tableName]?.map(item => unmarshall(item)) || []
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
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
  const batchSize = 25 // DynamoDB limit
  const results: any[] = []
  let processedCount = 0
  let failedCount = 0
  
  // Split items into batches
  const batches: Array<Array<Record<string, any>>> = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize))
  }
  
  console.log(`Processing ${items.length} items in ${batches.length} batches`)
  
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
                Item: marshall(item, { removeUndefinedValues: true })
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
              unmarshall(req.PutRequest.Item)
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
            console.log(`Throttled - waiting ${delay}ms before retry ${retryCount}/${maxRetries}`)
            await new Promise(resolve => setTimeout(resolve, delay))
          } else {
            console.error('Batch put error:', error.message)
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
    console.log(`Processed ${Math.min((i + parallelLimit) * batchSize, items.length)}/${items.length} items`)
    
    // Add delay between parallel batch sets
    if (i + parallelLimit < batches.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  console.log(`Batch put completed: ${processedCount} processed, ${failedCount} failed`)
  
  return results
}

/**
 * Batch delete items from DynamoDB with parallel processing
 */
export async function batchDeleteItems(
  tableName: string,
  keys: Array<Record<string, any>>,
  environment: 'commercial' | 'govcloud' = 'govcloud'
) {
  const client = await getDynamoDBClient(environment)
  
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
                Key: marshall(key, { removeUndefinedValues: true })
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
              unmarshall(req.DeleteRequest.Key)
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
            console.log(`Throttled during delete - waiting ${delay}ms before retry`)
            await new Promise(resolve => setTimeout(resolve, delay))
          } else {
            console.error('Batch delete error:', error.message)
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
  
  console.log(`Batch delete completed: ${deletedCount} deleted, ${failedCount} failed`)
  
  return {
    deletedCount,
    failedCount,
    results
  }
}