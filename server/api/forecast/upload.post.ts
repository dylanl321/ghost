/**
 * POST /api/forecast/upload
 * Upload and process forecast data from Excel files
 */

import { defineEventHandler, readBody } from 'h3'
import { batchPutItems } from '../../utils/dynamodb'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { requireScope } from '../../middleware/entra-auth'

// Register OpenAPI documentation
registerEndpoint('/api/forecast/upload', 'POST', {
  summary: 'Upload forecast data',
  description: 'Upload and process forecast data from Excel files',
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
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  accountName: { type: 'string' },
                  forecastAmount: { type: 'number' },
                  period: { type: 'string' },
                  status: { type: 'string' }
                },
                required: ['accountId', 'forecastAmount']
              }
            },
            source: { type: 'string' },
            timestamp: { type: 'string' }
          },
          required: ['data']
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Forecast data uploaded successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  uploadedCount: { type: 'number' },
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
  // Require admin scope for write operations
  await requireScope(event, 'admin')

  // Forecast table is in GovCloud
  const environment = 'govcloud'
  const body = await readBody(event)
  
  if (!body || !body.data || !Array.isArray(body.data)) {
    return errors.badRequest(event, 'Request body must contain a data array')
  }

  const forecastData = body.data
  const source = body.source || 'excel_upload'
  const timestamp = body.timestamp || new Date().toISOString()

  // Validate forecast data
  const validationErrors: string[] = []
  
  forecastData.forEach((item: any, index: number) => {
    if (!item.accountId) {
      validationErrors.push(`Item ${index + 1}: accountId is required`)
    }
    if (!item.forecasts || typeof item.forecasts !== 'object') {
      validationErrors.push(`Item ${index + 1}: forecasts object is required`)
    }
  })

  if (validationErrors.length > 0) {
    return errors.badRequest(event, `Validation errors: ${validationErrors.join(', ')}`)
  }

  try {
    // Generate base timestamp for this batch
    const baseTimestamp = Date.now()
    
    // Prepare items for DynamoDB - one record per account
    const items = forecastData.map((item: any, index: number) => {
      const uniqueTimestamp = baseTimestamp + index
      const itemId = item.id || `forecast-account-${item.accountId}-${uniqueTimestamp}`
      
      // Calculate total forecast amount across all months
      const totalAmount = Object.values(item.forecasts || {}).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0)
      
      return {
        id: itemId,
        accountId: item.accountId,
        accountName: item.accountName || '',
        enclaveId: item.enclaveId,
        projectType: item.projectType,
        lob: item.lob,
        deptNumber: item.deptNumber,
        projNumber: item.projNumber,
        taskNumber: item.taskNumber,
        govAccountId: item.govAccountId,
        comAccountId: item.comAccountId,
        forecasts: item.forecasts || {}, // Monthly forecasts object
        totalAmount, // Sum of all forecasts
        status: item.status || 'active',
        source,
        uploadedAt: timestamp,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // DynamoDB attributes
        PK: `FORECAST#${item.accountId}`,
        SK: `ACCOUNT#${uniqueTimestamp}`,
        GSI1PK: `STATUS#${item.status || 'active'}`,
        GSI1SK: `ACCOUNT#${item.accountId}#${uniqueTimestamp}`,
        GSI2PK: `ENCLAVE#${item.enclaveId || 'UNKNOWN'}`,
        GSI2SK: `ACCOUNT#${item.accountId}#${uniqueTimestamp}`
      }
    })

    // Use batch write for better performance
    const result = await batchPutItems('ghost-dashboard-forecast-data', items, environment)
    
    // Calculate totals
    const totalAmount = items.reduce((sum: number, item: any) => sum + item.totalAmount, 0)

    return sendSuccess(event, {
      uploadedCount: forecastData.length,
      totalAmount,
      items: result
    }, {
      action: 'forecast_uploaded',
      count: forecastData.length
    })

  } catch (err: any) {
    logger.error('Forecast upload error:', err)
    return errors.serverError(event, `Failed to upload forecast data: ${err.message}`)
  }
}))
