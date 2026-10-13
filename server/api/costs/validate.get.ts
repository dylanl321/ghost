/**
 * GET /api/costs/validate
 * Validation endpoint for cost data accuracy monitoring
 *
 * This endpoint runs simplified validation checks comparing our API
 * responses with AWS Cost Explorer to ensure data accuracy.
 *
 * ADMIN ONLY
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { requireScope } from '../../middleware/entra-auth'
import { runValidation } from '../../utils/cost-validation'

// Register OpenAPI documentation
registerEndpoint('/api/costs/validate', 'GET', {
  summary: 'Validate cost data accuracy',
  description: 'Compare our API responses with AWS Cost Explorer to verify data accuracy (Admin only)',
  tags: ['Costs', 'Admin'],
  responses: {
    200: {
      description: 'Validation results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string' },
                  checks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        passed: { type: 'boolean' },
                        message: { type: 'string' },
                        ourValue: { type: 'number' },
                        awsValue: { type: 'number' },
                        difference: { type: 'number' }
                      }
                    }
                  },
                  summary: {
                    type: 'object',
                    properties: {
                      totalChecks: { type: 'number' },
                      passed: { type: 'number' },
                      failed: { type: 'number' },
                      overallStatus: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  await requireScope(event, 'admin')
  const query = getQuery(event)
  const period = (query.period as any) || 'lastMonth'
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'
  const result = await runValidation(
    period,
    environment,
    query.includeProforma !== 'false',
    (query.masterAccountId as string) || process.env.AWS_MASTER_ACCOUNT_ID || '205950196477',
    (query.proformaAccountId as string) || process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
  )
  return sendSuccess(event, result, {
    deprecated: true,
    replacement: '/api/admin/validate-costs'
  })
}))
