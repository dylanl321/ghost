/**
 * DELETE /api/forecast/delete
 * Delete forecast data by IDs
 */

import { defineEventHandler, readBody } from 'h3'
import { deleteItem } from '../../utils/dynamodb'
import { findForecastItemById, FORECAST_TABLE, FORECAST_ENVIRONMENT } from '../../utils/forecast-data'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { requireScope } from '../../middleware/entra-auth'

// Register OpenAPI documentation
registerEndpoint('/api/forecast/delete', 'DELETE', {
  summary: 'Delete forecast data',
  description: 'Delete forecast data by IDs',
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
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of forecast data IDs to delete'
            }
          },
          required: ['ids']
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Forecast data deleted successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  deletedCount: { type: 'number' },
                  deletedIds: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                }
              }
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
  // Require admin scope for delete operations
  await requireScope(event, 'admin')

  const body = await readBody(event)
  
  if (!body || !body.ids || !Array.isArray(body.ids)) {
    return errors.badRequest(event, 'Request body must contain an ids array')
  }

  const ids = body.ids
  if (ids.length === 0) {
    return errors.badRequest(event, 'At least one ID must be provided')
  }

  try {
    const deletedIds: string[] = []
    const deleteErrors: string[] = []

    // Delete items one by one
    for (const id of ids) {
      try {
        const item = await findForecastItemById(id)
        if (item) {
          await deleteItem(FORECAST_TABLE, { PK: item.PK, SK: item.SK }, FORECAST_ENVIRONMENT)
          deletedIds.push(id)
        } else {
          deleteErrors.push(`Item with ID ${id} not found`)
        }
      } catch (err: any) {
        logger.error(`Error deleting item ${id}:`, err)
        deleteErrors.push(`Failed to delete item ${id}: ${err.message}`)
      }
    }

    if (deleteErrors.length > 0 && deletedIds.length === 0) {
      return errors.serverError(event, `Failed to delete any items: ${deleteErrors.join(', ')}`)
    }

    return sendSuccess(event, {
      deletedCount: deletedIds.length,
      deletedIds,
      errors: deleteErrors.length > 0 ? deleteErrors : undefined
    }, {
      action: 'forecast_deleted',
      count: deletedIds.length
    })

  } catch (err: any) {
    logger.error('Forecast delete error:', err)
    return errors.serverError(event, `Failed to delete forecast data: ${err.message}`)
  }
}))
