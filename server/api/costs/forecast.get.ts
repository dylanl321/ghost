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
import { getCostForecast } from '../../utils/cost-explorer'
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
        enum: ['next-month', '3-months', '6-months', '12-months', 'custom'],
        default: 'next-month'
      },
      description: 'Forecast period - predefined periods or custom'
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
  const proformaAccountId = (query.proformaAccountId as string) || '253821132832'
  
  // ================================
  // CALCULATE FORECAST DATE RANGE
  // ================================
  
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(1) // Start from first of current month
  startDate.setMonth(startDate.getMonth() + 1) // Move to next month
  
  const endDate = new Date(startDate)
  
  // Calculate end date based on period
  let monthsToAdd = 1
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
      return errors.badRequest(event, 'Invalid period. Must be one of: next-month, 3-months, 6-months, 12-months, custom')
  }
  
  endDate.setMonth(endDate.getMonth() + monthsToAdd)
  
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
    // Generate forecasts from both master and proforma accounts for comparison
    
    const [masterForecast, proformaForecast] = await Promise.all([
      getCostForecast(startDateStr, endDateStr, metric, granularity, undefined, environment),
      getCostForecast(startDateStr, endDateStr, metric, granularity, undefined, environment)
      // TODO: Enhance getCostForecast to support role assumption for true proforma account forecasting
    ])
    
    // Validate forecast data was returned
    if (!masterForecast || !proformaForecast) {
      return errors.notFound(event, 'No forecast data available for the specified period')
    }
    
    const masterTotal = parseFloat(masterForecast.total?.Amount || '0')
    const proformaTotal = parseFloat(proformaForecast.total?.Amount || '0')
    
    const result = {
      period: {
        type: period,
        months: monthsToAdd,
        startDate: startDateStr,
        endDate: endDateStr
      },
      masterForecast,        // Raw AWS billing forecast
      proformaForecast,      // Billing Conductor forecast (when implemented)
      combinedTotals: {
        master: masterTotal,
        proforma: proformaTotal,
        grandTotal: masterTotal + proformaTotal
      },
      note: 'Proforma forecast currently uses master account data. Enhancement needed for true Billing Conductor forecasting.'
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
      undefined,
      environment
    )
    
    // Validate forecast data was returned
    if (!forecast) {
      return errors.notFound(event, 'No forecast data available for the specified period')
    }
    
    const result = {
      period: {
        type: period,
        months: monthsToAdd,
        startDate: startDateStr,
        endDate: endDateStr
      },
      forecast,
      note: 'Forecast based on raw AWS billing data from master account'
    }
    
    return sendSuccess(event, result)
  }
}))