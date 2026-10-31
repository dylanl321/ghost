/**
 * GET /api/costs/projections
 * Get AWS ML cost projections with optional proforma analysis
 * 
 * PROJECTION PERIODS:
 * - next-month: AWS projection for the upcoming month (default)
 * - 3-months: Short-term quarterly projection
 * - 6-months: Medium-term planning projection
 * - 12-months: Annual budget planning projection
 * - custom: User-defined period (1-12 months)
 * 
 * All projections start from the beginning of next month and extend forward
 * by the specified period. This is more intuitive than arbitrary start/end dates.
 * 
 * PROFORMA PROJECTIONS:
 * - Standard: Projection based on raw AWS billing data
 * - Proforma: Projection based on Billing Conductor managed data (when implemented)
 */

import { defineEventHandler } from 'h3'
import { handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { handleForecastRequest } from '../../utils/forecast-handler'

// Register OpenAPI documentation
registerEndpoint('/api/costs/projections', 'GET', {
  summary: 'Get AWS ML cost projections',
  description: 'Retrieve AWS machine learning cost projections for a future date range',
  tags: ['Costs'],
  parameters: [
    {
      name: 'period',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['current-month-remainder', 'next-month', '3-months', '6-months', '12-months', 'rest-of-year', 'custom'],
        default: 'next-month'
      },
      description: 'Projection period - current month remainder, next month, rest of year, or longer periods'
    },
    {
      name: 'months',
      in: 'query',
      required: false,
      schema: { 
        type: 'integer',
        minimum: 1,
        maximum: 12
      },
      description: 'Number of months to project (only used when period=custom)'
    },
    {
      name: 'metric',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['BLENDED_COST', 'UNBLENDED_COST', 'AMORTIZED_COST', 'NET_UNBLENDED_COST', 'NET_AMORTIZED_COST'],
        default: 'UNBLENDED_COST'
      }
    },
    {
      name: 'granularity',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['DAILY', 'MONTHLY'],
        default: 'MONTHLY'
      }
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['commercial', 'govcloud'],
        default: 'commercial'
      }
    },
    {
      name: 'proforma',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include proforma account projection (commercial environment only)'
    },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: { 
        type: 'string'
      },
      description: 'Comma-separated list of account identifiers to filter (supports request IDs, 12-digit account IDs, or email addresses)'
    },
    {
      name: 'proformaAccountId',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        default: '253821132832'
      },
      description: 'Proforma account ID for projection analysis'
    }
  ],
  responses: {
    200: {
      description: 'AWS ML projection data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  period: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      months: { type: 'number' },
                      startDate: { type: 'string' },
                      endDate: { type: 'string' }
                    }
                  },
                  projection: {
                    type: 'object',
                    properties: {
                      total: { type: 'object' },
                      forecastResultsByTime: { type: 'array' }
                    },
                    description: 'Normalized projection data (works for both standard and proforma modes)'
                  },
                  masterAccount: {
                    type: 'object',
                    description: 'Master account projection details (proforma mode only)'
                  },
                  proformaAccount: {
                    type: 'object',
                    description: 'Proforma account projection details (proforma mode only)'
                  },
                  masterOnlyProjection: {
                    type: 'object',
                    description: 'Master-only projection (master minus proforma, proforma mode only)'
                  },
                  combinedTotals: {
                    type: 'object',
                    properties: {
                      master: { type: 'number' },
                      proforma: { type: 'number' },
                      masterOnly: { type: 'number' },
                      grandTotal: { type: 'number' }
                    },
                    description: 'Combined totals (proforma mode only)'
                  },
                  note: { type: 'string' }
                }
              }
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
  return handleForecastRequest(event, {
    responseKey: 'projection',
    logPrefix: '[Projections API]'
  })
}))
