/**
 * POST /api/dynamodb/[table]/items
 * Create a new item in DynamoDB table
 */

import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { putItem } from '../../../utils/dynamodb'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/dynamodb/[table]/items', 'POST', {
  summary: 'Create DynamoDB item',
  description: 'Create a new item in a DynamoDB table',
  tags: ['DynamoDB'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'table',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'DynamoDB table name'
    }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          description: 'Item data to insert'
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Created item',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' }
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
  
  const { environment } = parseQueryParams(event)
  const body = await readBody(event)
  
  if (!body || typeof body !== 'object') {
    return errors.badRequest(event, 'Request body must be a valid object')
  }
  
  // Create the item
  const result = await putItem(tableName, body, environment)
  
  return sendSuccess(event, result, {
    action: 'created',
    table: tableName
  })
}))