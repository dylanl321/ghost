/**
 * PUT /api/forecast/update
 * Update forecast data
 */

import { defineEventHandler, readBody } from 'h3'
import { updateItem } from '../../utils/dynamodb'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/forecast/update', 'PUT', {
  summary: 'Update forecast data',
  description: 'Update forecast data by ID',
  tags: ['Forecast'],
  parameters: [
    { $ref: '#/components/parameters/Environment' }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Forecast data ID to update' },
            updates: {
              type: 'object',
              properties: {
                accountId: { type: 'string' },
                accountName: { type: 'string' },
                forecastAmount: { type: 'number' },
                period: { type: 'string' },
                status: { type: 'string' }
              }
            },
            timestamp: { type: 'string' }
          },
          required: ['id', 'updates']
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Forecast data updated successfully',
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
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Forecast table is in GovCloud
  const environment = 'govcloud'
  const body = await readBody(event)
  
  if (!body || !body.id || !body.updates) {
    return errors.badRequest(event, 'Request body must contain id and updates')
  }

  const { id, updates, timestamp } = body

  try {
    // First, find the item by ID
    const scanResult = await scanItems(
      'ghost-dashboard-forecast-data',
      'id = :id',
      1,
      undefined,
      environment,
      { ':id': id }
    )

    if (scanResult.items.length === 0) {
      return errors.notFound(event, `Forecast data with ID ${id} not found`)
    }

    const item = scanResult.items[0]
    
    // Prepare update expression
    const updateExpression: string[] = []
    const expressionAttributeNames: Record<string, string> = {}
    const expressionAttributeValues: Record<string, any> = {}

    // Add updatedAt timestamp
    updateExpression.push('updatedAt = :updatedAt')
    expressionAttributeValues[':updatedAt'] = timestamp || new Date().toISOString()

    // Process each update field
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        const attributeName = `#${key}`
        const attributeValue = `:${key}`
        
        updateExpression.push(`${attributeName} = ${attributeValue}`)
        expressionAttributeNames[attributeName] = key
        expressionAttributeValues[attributeValue] = value
      }
    })

    if (updateExpression.length === 1) { // Only updatedAt
      return errors.badRequest(event, 'No valid fields to update')
    }

    // Update the item
    const result = await updateItem(
      'ghost-dashboard-forecast-data',
      {
        PK: item.PK,
        SK: item.SK
      },
      updateExpression.join(', '),
      expressionAttributeNames,
      expressionAttributeValues,
      environment
    )

    return sendSuccess(event, result, {
      action: 'forecast_updated',
      id
    })

  } catch (err: any) {
    logger.error('Forecast update error:', err)
    return errors.serverError(event, `Failed to update forecast data: ${err.message}`)
  }
}))
