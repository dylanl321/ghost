/**
 * GET /api/dynamodb/[table]/items
 * Query or scan items from a DynamoDB table
 */

import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { scanItems, queryItems } from '../../../utils/dynamodb'
import { sendPaginated, parseQueryParams, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/dynamodb/[table]/items', 'GET', {
  summary: 'List DynamoDB items',
  description: 'Query or scan items from a DynamoDB table',
  tags: ['DynamoDB'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    { $ref: '#/components/parameters/Limit' },
    { $ref: '#/components/parameters/NextToken' },
    {
      name: 'table',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'DynamoDB table name'
    },
    {
      name: 'filterExpression',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'DynamoDB filter expression'
    }
  ],
  responses: {
    200: {
      description: 'List of DynamoDB items',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: { type: 'object' }
              },
              pagination: { $ref: '#/components/schemas/PaginationInfo' }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const tableName = getRouterParam(event, 'table')
  if (!tableName) {
    return errors.badRequest(event, 'Table name is required')
  }
  
  const query = getQuery(event)
  const { environment, limit, nextToken } = parseQueryParams(event)
  const filterExpression = query.filterExpression as string | undefined
  
  // Perform scan operation
  const result = await scanItems(
    tableName,
    filterExpression,
    limit,
    nextToken,
    environment
  )
  
  // Calculate pagination
  const page = nextToken ? 2 : 1 // Simplified pagination
  
  return sendPaginated(
    event,
    result.items,
    {
      page,
      limit,
      total: result.count // Note: This is count of returned items, not total in table
    },
    {
      nextToken: result.nextToken
    }
  )
}))