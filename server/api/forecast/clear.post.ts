/**
 * POST /api/forecast/clear
 * Clear all forecast data from the table
 */

import { defineEventHandler, readBody } from 'h3'
import { scanItems, batchDeleteItems } from '../../utils/dynamodb'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/forecast/clear', 'POST', {
  summary: 'Clear all forecast data',
  description: 'Clear all forecast data from the table',
  tags: ['Forecast'],
  parameters: [
    { $ref: '#/components/parameters/Environment' }
  ],
  requestBody: {
    required: false,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            confirm: { 
              type: 'boolean',
              description: 'Confirmation flag to prevent accidental deletion'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Forecast data cleared successfully',
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
                  message: { type: 'string' }
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
  // Forecast table is in GovCloud
  const environment = 'govcloud'
  const body = await readBody(event)
  
  // Require confirmation to prevent accidental deletion
  if (!body?.confirm) {
    return errors.badRequest(event, 'Confirmation required. Set "confirm": true in request body.')
  }

  try {
    logger.info('🗑️  Starting forecast data clear operation...')
    logger.info('Environment:', environment)
    
    // Get all items from the table
    const scanResult = await scanItems(
      'ghost-dashboard-forecast-data',
      undefined, // no filter
      undefined, // no limit
      undefined, // no nextToken
      environment
    )

    const items = scanResult.items
    logger.debug(`📊 Found ${items.length} items to delete`)

    if (items.length === 0) {
      logger.info('✅ No items to delete, table is already empty')
      return sendSuccess(event, {
        deletedCount: 0,
        message: 'No forecast data found to clear'
      }, {
        action: 'forecast_cleared',
        count: 0
      })
    }

    // Extract keys for batch delete
    const keys = items.map(item => ({
      PK: item.PK,
      SK: item.SK
    }))

    logger.info(`🗑️  Deleting ${keys.length} items using batch delete...`)
    
    // Use optimized batch delete with parallel processing
    const deleteResult = await batchDeleteItems(
      'ghost-dashboard-forecast-data',
      keys,
      environment
    )

    logger.info(`✅ Cleared ${deleteResult.deletedCount} forecast records`)
    
    if (deleteResult.failedCount > 0) {
      logger.warn(`⚠️  ${deleteResult.failedCount} items failed to delete`)
    }

    return sendSuccess(event, {
      deletedCount: deleteResult.deletedCount,
      message: `Successfully cleared ${deleteResult.deletedCount} forecast records`,
      failedCount: deleteResult.failedCount > 0 ? deleteResult.failedCount : undefined
    }, {
      action: 'forecast_cleared',
      count: deleteResult.deletedCount
    })

  } catch (err: any) {
    logger.error('Forecast clear error:', err)
    logger.error('Error details:', {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack
    })
    return errors.serverError(event, `Failed to clear forecast data: ${err.message}`)
  }
}))
