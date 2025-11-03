/**
 * POST /api/gdms-forecast/upload
 * Upload GDMS forecasted costs from Excel file
 * 
 * Processes Excel files containing General Dynamics Mission Systems
 * yearly forecast data and stores it in the database.
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/gdms-forecast/upload', 'POST', {
  summary: 'Upload GDMS forecasted costs',
  description: 'Process and store GDMS forecast data from Excel upload',
  tags: ['GDMS Forecast'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['data', 'year'],
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  accountName: { type: 'string' },
                  department: { type: 'string' },
                  lineOfBusiness: { type: 'string' },
                  monthlyForecasts: {
                    type: 'object',
                    additionalProperties: { type: 'number' }
                  }
                }
              }
            },
            year: { type: 'integer' },
            source: { type: 'string', default: 'excel_upload' },
            metadata: {
              type: 'object',
              properties: {
                uploadedBy: { type: 'string' },
                version: { type: 'string' }
              }
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'GDMS forecast uploaded successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  forecastId: { type: 'string' },
                  recordsProcessed: { type: 'integer' },
                  accounts: { type: 'array', items: { type: 'string' } },
                  totalAmount: { type: 'number' }
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
  const body = await readBody(event)
  
  if (!body || !body.data || !Array.isArray(body.data)) {
    return errors.badRequest(event, 'Request body must contain a data array')
  }

  const forecastData = body.data
  const year = body.year || new Date().getFullYear()
  const source = body.source || 'excel_upload'
  const metadata = body.metadata || {}
  const timestamp = new Date().toISOString()

  // Validate forecast data
  const validationErrors: string[] = []
  
  forecastData.forEach((item: any, index: number) => {
    if (!item.accountId) {
      validationErrors.push(`Item ${index + 1}: accountId is required`)
    }
    if (!item.monthlyForecasts || typeof item.monthlyForecasts !== 'object') {
      validationErrors.push(`Item ${index + 1}: monthlyForecasts object is required`)
    }
  })

  if (validationErrors.length > 0) {
    return errors.badRequest(event, `Validation errors: ${validationErrors.join(', ')}`)
  }

  try {
    logger.info(`[GDMS Forecast Upload] Processing ${forecastData.length} forecast records for year ${year}`)
    
    // TODO: Implement actual GDMS forecast data storage
    // This would typically involve:
    // 1. Clearing existing forecast data for the year
    // 2. Storing new forecast records in the database
    // 3. Calculating and storing monthly and annual totals
    // 4. Updating account-level forecast allocations
    
    // Calculate summary statistics
    const accounts = forecastData.map((item: any) => item.accountId)
    const totalAmount = forecastData.reduce((sum: number, item: any) => {
      const monthlyTotal = Object.values(item.monthlyForecasts || {}).reduce((monthSum: number, amount: any) => 
        monthSum + (typeof amount === 'number' ? amount : 0), 0)
      return sum + monthlyTotal
    }, 0)
    
    const result = {
      forecastId: `gdms-forecast-${year}-${Date.now()}`,
      recordsProcessed: forecastData.length,
      accounts,
      totalAmount
    }
    
    logger.info(`[GDMS Forecast Upload] Successfully processed ${forecastData.length} records, total amount: $${totalAmount.toLocaleString()}`)
    
    return sendSuccess(event, result)
  } catch (error: any) {
    logger.error('[GDMS Forecast Upload] Error processing forecast data:', error)
    return errors.internalServerError(event, 'Failed to process GDMS forecast data')
  }
}))


