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
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  const client = await getDynamoDBClient(environment)
  
  const command = new GetItemCommand({
    TableName: tableName,
    Key: marshall(key)
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
  environment: 'commercial' | 'govcloud' = 'commercial'
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
  environment: 'commercial' | 'govcloud' = 'commercial'
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
    expressionAttributeValues[attrValue] = marshall(value)
  })

  const command = new UpdateItemCommand({
    TableName: tableName,
    Key: marshall(key),
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
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  const client = await getDynamoDBClient(environment)
  
  const command = new DeleteItemCommand({
    TableName: tableName,
    Key: marshall(key),
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
  environment: 'commercial' | 'govcloud' = 'commercial'
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
  environment: 'commercial' | 'govcloud' = 'commercial'
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
  environment: 'commercial' | 'govcloud' = 'commercial'
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
          return { PutRequest: { Item: marshall(item.putRequest) } }
        } else if (item.deleteRequest) {
          return { DeleteRequest: { Key: marshall(item.deleteRequest) } }
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
  environment: 'commercial' | 'govcloud' = 'commercial'
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
          Keys: batch.map(key => marshall(key))
        }
      }
    })

    const response = await client.send(command)
    const items = response.Responses?.[tableName]?.map(item => unmarshall(item)) || []
    allItems.push(...items)
  }
  
  return allItems
}