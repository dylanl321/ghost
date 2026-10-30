/**
 * PUT /api/forecast/update
 * Update forecast data
 */

import { defineEventHandler, readBody } from 'h3'
import { updateItem } from '../../utils/dynamodb'
import { findForecastItemById, FORECAST_TABLE, FORECAST_ENVIRONMENT, FORECAST_KEY_ATTRIBUTES } from '../../utils/forecast-data'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { requireScope } from '../../middleware/entra-auth'

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
  // Require admin scope for write operations
  await requireScope(event, 'admin')

  const body = await readBody(event)
  
  if (!body || !body.id || !body.updates) {
    return errors.badRequest(event, 'Request body must contain id and updates')
  }

  const { id, updates, timestamp } = body

  try {
    const item = await findForecastItemById(id)
    if (!item) {
      return errors.notFound(event, `Forecast data with ID ${id} not found`)
    }

    // Key and index attributes identify the record and are never client-editable
    const fieldUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key, value]) => value !== undefined && !FORECAST_KEY_ATTRIBUTES.has(key))
    )
    if (Object.keys(fieldUpdates).length === 0) {
      return errors.badRequest(event, 'No valid fields to update')
    }

    const result = await updateItem(
      FORECAST_TABLE,
      { PK: item.PK, SK: item.SK },
      { ...fieldUpdates, updatedAt: timestamp || new Date().toISOString() },
      FORECAST_ENVIRONMENT
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
