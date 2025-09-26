/**
 * GET /api/costs/forecast
 * Get cost forecast with optional proforma analysis
 * 
 * FORECAST PERIODS:
 * - next-month: Forecast for the upcoming month (default)
 * - 3-months: Short-term quarterly forecast
 * - 6-months: Medium-term planning forecast
 * - 12-months: Annual budget planning forecast
 * - custom: User-defined period (1-12 months)
 * 
 * All forecasts start from the beginning of next month and extend forward
 * by the specified period. This is more intuitive than arbitrary start/end dates.
 * 
 * PROFORMA FORECASTING:
 * - Standard: Forecast based on raw AWS billing data
 * - Proforma: Forecast based on Billing Conductor managed data (when implemented)
 */

import { defineEventHandler, getQuery } from 'h3'
import { getCostForecast, getProformaForecast } from '../../utils/cost-explorer'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/costs/forecast', 'GET', {
  summary: 'Get cost forecast',
  description: 'Retrieve AWS cost forecast for a future date range',
  tags: ['Costs'],
  parameters: [
    {
      name: 'period',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['current-month-remainder', 'next-month', '3-months', '6-months', '12-months', 'custom'],
        default: 'next-month'
      },
      description: 'Forecast period - current month remainder, next month, or longer periods'
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
      description: 'Number of months to forecast (only used when period=custom)'
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
        default: 'DAILY'
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
      description: 'Include proforma account forecast (commercial environment only)'
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
      description: 'Proforma account ID for forecast analysis'
    }
  ],
  responses: {
    200: {
      description: 'Cost forecast data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      total: { type: 'object' },
                      forecastResultsByTime: { type: 'array' }
                    },
                    description: 'Standard forecast data'
                  },
                  {
                    type: 'object',
                    properties: {
                      masterForecast: {
                        type: 'object',
                        properties: {
                          total: { type: 'object' },
                          forecastResultsByTime: { type: 'array' }
                        }
                      },
                      proformaForecast: {
                        type: 'object',
                        properties: {
                          total: { type: 'object' },
                          forecastResultsByTime: { type: 'array' }
                        }
                      },
                      combinedTotals: {
                        type: 'object',
                        properties: {
                          master: { type: 'number' },
                          proforma: { type: 'number' },
                          grandTotal: { type: 'number' }
                        }
                      }
                    },
                    description: 'Proforma forecast analysis data'
                  }
                ]
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
  const query = getQuery(event)
  
  // ================================
  // PARAMETER PARSING & VALIDATION
  // ================================
  
  const period = (query.period as string) || 'next-month'
  const customMonths = parseInt(query.months as string) || 1
  const metric = (query.metric as string) || 'UNBLENDED_COST'
  const granularity = (query.granularity as 'DAILY' | 'MONTHLY') || 'MONTHLY'
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'
  const proforma = query.proforma === 'true' || query.proforma === true
  const proformaAccountId = (query.proformaAccountId as string) || process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
  const masterAccountId = (query.masterAccountId as string) || process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
  const accountIdsParam = (query.accountIds as string) || ''
  const accountIds = accountIdsParam ? accountIdsParam.split(',').filter(id => id.trim()) : []
  
  // ================================
  // BUILD FILTER FOR ACCOUNT SELECTION
  // ================================
  
  let filter: any = undefined
  if (accountIds.length > 0) {
    console.log(`[Forecast API] Filtering forecast for ${accountIds.length} accounts:`, accountIds)
    // Create filter for specific accounts
    if (accountIds.length === 1) {
      filter = {
        Dimensions: {
          Key: 'LINKED_ACCOUNT',
          Values: [accountIds[0]]
        }
      }
    } else {
      // Multiple accounts - use OR filter
      filter = {
        Or: accountIds.map(accountId => ({
          Dimensions: {
            Key: 'LINKED_ACCOUNT',
            Values: [accountId]
          }
        }))
      }
    }
  } else {
    console.log('[Forecast API] No account filter - returning org-wide forecast')
  }
  
  // ================================
  // CALCULATE FORECAST DATE RANGE
  // ================================
  
  const today = new Date()
  let startDate: Date
  let endDate: Date
  let monthsToAdd = 1 // Default value, will be overridden for most periods
  
  if (period === 'current-month-remainder') {
    // For current month remainder, start from tomorrow and go to end of current month
    startDate = new Date(today)
    startDate.setDate(startDate.getDate() + 1) // Start from tomorrow
    
    endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 1) // Move to next month
    endDate.setDate(1) // First day of next month
    // No need to subtract a day since AWS API uses exclusive end date
    
    // For current-month-remainder, we're forecasting less than a month
    monthsToAdd = 0 // Indicates partial month
  } else {
    // For all other periods, start from first of next month
    startDate = new Date(today)
    startDate.setDate(1) // Start from first of current month
    startDate.setMonth(startDate.getMonth() + 1) // Move to next month
    
    endDate = new Date(startDate)
    
    // Calculate end date based on period
    switch (period) {
      case 'next-month':
        monthsToAdd = 1
        break
      case '3-months':
        monthsToAdd = 3
        break
      case '6-months':
        monthsToAdd = 6
        break
      case '12-months':
        monthsToAdd = 12
        break
      case 'custom':
        if (customMonths < 1 || customMonths > 12) {
          return errors.badRequest(event, 'Custom months must be between 1 and 12')
        }
        monthsToAdd = customMonths
        break
      default:
        return errors.badRequest(event, 'Invalid period. Must be one of: current-month-remainder, next-month, 3-months, 6-months, 12-months, custom')
    }
    
    endDate.setMonth(endDate.getMonth() + monthsToAdd)
  }
  
  // Format dates for AWS API
  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]
  
  // ================================
  // FORECAST GENERATION
  // ================================
  
  // Validate proforma requirements
  if (proforma && environment !== 'commercial') {
    return errors.badRequest(event, 'Proforma forecast analysis is only available for commercial environment')
  }
  
  if (proforma) {
    // ================================
    // PROFORMA FORECAST
    // ================================
    // Generate proforma forecast using role assumption into proforma account

    const proformaForecastData = await getProformaForecast(
      startDateStr,
      endDateStr,
      metric,
      granularity,
      filter, // Pass account filter
      proformaAccountId,
      masterAccountId
    )

    // Validate forecast data was returned
    if (!proformaForecastData) {
      return errors.notFound(event, 'No proforma forecast data available for the specified period')
    }

    const result = {
      period: {
        type: period,
        months: monthsToAdd,
        startDate: startDateStr,
        endDate: endDateStr
      },
      masterAccount: proformaForecastData.masterAccount,
      proformaAccount: proformaForecastData.proformaAccount,
      masterOnlyForecast: proformaForecastData.masterOnlyForecast,
      combinedTotals: proformaForecastData.totals,
      note: 'Proforma forecast shows master account costs minus proforma account costs. ' +
            'This represents the true forecast per account after enterprise savings plans ' +
            'and discounts are allocated from the master account based on usage patterns.'
    }

    return sendSuccess(event, result)
  } else {
    // ================================
    // STANDARD FORECAST
    // ================================
    // Generate forecast from master account (raw AWS billing data)
    
    const forecast = await getCostForecast(
      startDateStr,
      endDateStr,
      metric,
      granularity,
      filter, // Pass account filter
      environment
    )
    
    // Validate forecast data was returned
    if (!forecast) {
      return errors.notFound(event, 'No forecast data available for the specified period')
    }
    
    // Log forecast total for debugging
    console.log('[Forecast API] Forecast total:', forecast?.total?.Amount || 'No total', 
                'for accounts:', accountIds.length > 0 ? accountIds : 'All')
    
    const result = {
      period: {
        type: period,
        months: monthsToAdd,
        startDate: startDateStr,
        endDate: endDateStr
      },
      forecast,
      note: accountIds.length > 0 
        ? `Forecast for ${accountIds.length} selected account(s): ${accountIds.join(', ')}`
        : 'Forecast based on raw AWS billing data from master account (all accounts)'
    }
    
    return sendSuccess(event, result)
  }
}))