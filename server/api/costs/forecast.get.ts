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
import { logger } from '../../utils/logger'

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
        enum: ['current-month-remainder', 'next-month', '3-months', '6-months', '12-months', 'rest-of-year', 'custom'],
        default: 'next-month'
      },
      description: 'Forecast period - current month remainder, next month, rest of year, or longer periods'
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
                  forecast: {
                    type: 'object',
                    properties: {
                      total: { type: 'object' },
                      forecastResultsByTime: { type: 'array' }
                    },
                    description: 'Normalized forecast data (works for both standard and proforma modes)'
                  },
                  masterAccount: {
                    type: 'object',
                    description: 'Master account forecast details (proforma mode only)'
                  },
                  proformaAccount: {
                    type: 'object',
                    description: 'Proforma account forecast details (proforma mode only)'
                  },
                  masterOnlyForecast: {
                    type: 'object',
                    description: 'Master-only forecast (master minus proforma, proforma mode only)'
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
    logger.info(`[Forecast API] Filtering forecast for ${accountIds.length} accounts:`, accountIds)
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
    logger.info('[Forecast API] No account filter - returning org-wide forecast')
  }
  
  // ================================
  // CALCULATE FORECAST DATE RANGE
  // ================================
  
  const today = new Date()
  let startDate: Date
  let endDate: Date
  let monthsToAdd = 1 // Default value, will be overridden for most periods
  
  if (period === 'current-month-remainder') {
    // For current month remainder, AWS forecasts can only start from today (not past dates)
    // So we'll forecast from today through end of current month
    startDate = new Date(today)
    // AWS forecast API requires start date to be today or future
    // Set to today's date (keeping time at 00:00:00)
    startDate.setHours(0, 0, 0, 0)
    
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
      case 'rest-of-year':
        // Calculate months from next month to December
        const currentMonth = today.getMonth() + 1 // 1-12
        const monthsUntilDecember = 12 - currentMonth
        monthsToAdd = Math.max(1, monthsUntilDecember) // At least 1 month

        logger.info('[Forecast API] rest-of-year calculation:', {
          currentMonth,
          monthsUntilDecember,
          monthsToAdd,
          today: today.toISOString()
        })

        // Override endDate to be end of current calendar year
        endDate = new Date(today.getFullYear(), 11, 31) // Dec 31 of current year
        endDate.setDate(endDate.getDate() + 1) // Make it Jan 1 next year for exclusive end

        logger.info('[Forecast API] rest-of-year date range:', {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
        break
      case 'custom':
        if (customMonths < 1 || customMonths > 12) {
          return errors.badRequest(event, 'Custom months must be between 1 and 12')
        }
        monthsToAdd = customMonths
        break
      default:
        return errors.badRequest(event, 'Invalid period. Must be one of: current-month-remainder, next-month, 3-months, 6-months, 12-months, rest-of-year, custom')
    }

    // Don't adjust endDate for rest-of-year since it's already set to Dec 31
    if (period !== 'rest-of-year') {
      endDate.setMonth(endDate.getMonth() + monthsToAdd)
    }
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
      // Normalized forecast property (same structure as standard mode)
      // For proforma mode, use proformaAccount.forecast which represents linked accounts
      // with enterprise discounts allocated. This is the "true" cost forecast.
      // If account filtering is applied, this will be the filtered forecast.
      // For org-wide view, this represents total linked account costs with discounts.
      forecast: proformaForecastData.proformaAccount.forecast,
      // Keep all proforma-specific data for reference
      masterAccount: proformaForecastData.masterAccount,
      proformaAccount: proformaForecastData.proformaAccount,
      masterOnlyForecast: proformaForecastData.masterOnlyForecast,
      combinedTotals: proformaForecastData.totals,
      note: 'Proforma forecast represents linked account costs with enterprise savings plans ' +
            'and discounts allocated from the master account. MasterOnlyForecast ($' +
            Math.round(proformaForecastData.totals.masterOnly).toLocaleString() +
            ') shows master account overhead (enterprise support, RI/SP purchases, etc.).'
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

    // Log forecast details for debugging
    logger.info('[Forecast API] Forecast total:', forecast?.total?.Amount || 'No total',
                'for accounts:', accountIds.length > 0 ? accountIds : 'All')

    // Log forecast periods (especially for rest-of-year to check December)
    if (period === 'rest-of-year' && forecast?.forecastResultsByTime) {
      logger.info('[Forecast API] rest-of-year returned', forecast.forecastResultsByTime.length, 'periods:')
      forecast.forecastResultsByTime.forEach((period: any, idx: number) => {
        const start = period?.TimePeriod?.Start
        const end = period?.TimePeriod?.End
        const mean = period?.MeanValue
        logger.info(`  Period ${idx + 1}: ${start} to ${end}, Mean: $${mean}`)
      })
    }
    
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