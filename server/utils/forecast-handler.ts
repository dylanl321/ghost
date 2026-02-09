/**
 * Shared handler for forecast and projection endpoints.
 * 
 * Both /api/costs/forecast and /api/costs/projections share ~95% identical logic
 * for parameter parsing, date range calculation, and AWS API calls. This module
 * extracts that common logic so each endpoint is a thin wrapper.
 */

import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import { getCostForecast, getProformaForecast } from './cost-explorer'
import { sendSuccess, errors } from './api-response'
import { logger } from './logger'

export interface ForecastHandlerOptions {
  responseKey: 'forecast' | 'projection'
  logPrefix: string
}

/**
 * Handles the common forecast/projection request logic:
 * - Parses and validates query parameters
 * - Builds account filters
 * - Calculates date ranges
 * - Calls AWS Cost Explorer APIs (standard or proforma)
 * - Returns normalized response data
 */
export async function handleForecastRequest(event: H3Event, options: ForecastHandlerOptions) {
  const { responseKey, logPrefix } = options
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
    logger.info(`${logPrefix} Filtering ${responseKey} for ${accountIds.length} accounts:`, accountIds)
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
    logger.info(`${logPrefix} No account filter - returning org-wide ${responseKey}`)
  }

  // ================================
  // CALCULATE DATE RANGE
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
      case 'rest-of-year': {
        // Calculate months from next month to December
        const currentMonth = today.getMonth() + 1 // 1-12

        if (currentMonth >= 12) {
          // In December, rest-of-year has no remaining months in the current year.
          // Treat as a next-month forecast (January of next year, 1 month ahead).
          monthsToAdd = 1
          endDate = new Date(startDate)
          endDate.setMonth(endDate.getMonth() + 1)

          logger.info(`${logPrefix} rest-of-year in December — falling back to next-month (Jan ${today.getFullYear() + 1}):`, {
            currentMonth,
            monthsToAdd,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          })
          // Skip the rest-of-year endDate override below
          break
        }

        const monthsUntilDecember = 12 - currentMonth
        monthsToAdd = Math.max(1, monthsUntilDecember) // At least 1 month

        logger.info(`${logPrefix} rest-of-year calculation:`, {
          currentMonth,
          monthsUntilDecember,
          monthsToAdd,
          today: today.toISOString()
        })

        // Override endDate to be end of current calendar year
        endDate = new Date(today.getFullYear(), 11, 31) // Dec 31 of current year
        endDate.setDate(endDate.getDate() + 1) // Make it Jan 1 next year for exclusive end

        logger.info(`${logPrefix} rest-of-year date range:`, {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
        break
      }
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
  // FORECAST / PROJECTION GENERATION
  // ================================

  // Validate proforma requirements
  if (proforma && environment !== 'commercial') {
    return errors.badRequest(event, `Proforma ${responseKey} analysis is only available for commercial environment`)
  }

  if (proforma) {
    // ================================
    // PROFORMA MODE
    // ================================
    // Generate proforma forecast/projection using role assumption into proforma account

    const proformaData = await getProformaForecast(
      startDateStr,
      endDateStr,
      metric,
      granularity,
      filter,
      proformaAccountId,
      masterAccountId
    )

    // Validate data was returned
    if (!proformaData) {
      return errors.notFound(event, `No proforma ${responseKey} data available for the specified period`)
    }

    // Build the "masterOnly" key dynamically: masterOnlyForecast or masterOnlyProjection
    const masterOnlyKey = responseKey === 'forecast' ? 'masterOnlyForecast' : 'masterOnlyProjection'

    const result: Record<string, any> = {
      period: {
        type: period,
        months: monthsToAdd,
        startDate: startDateStr,
        endDate: endDateStr
      },
      // Normalized forecast/projection property (same structure for both modes)
      // For proforma mode, use proformaAccount.forecast which represents linked accounts
      // with enterprise discounts allocated. This is the "true" cost forecast/projection.
      [responseKey]: proformaData.proformaAccount.forecast,
      // Keep all proforma-specific data for reference
      masterAccount: proformaData.masterAccount,
      proformaAccount: proformaData.proformaAccount,
      [masterOnlyKey]: proformaData.masterOnlyForecast,
      combinedTotals: proformaData.totals,
      note: `Proforma ${responseKey} represents linked account costs with enterprise savings plans ` +
            `and discounts allocated from the master account. ${masterOnlyKey === 'masterOnlyForecast' ? 'MasterOnlyForecast' : 'MasterOnlyProjection'} ($` +
            Math.round(proformaData.totals.masterOnly).toLocaleString() +
            ') shows master account overhead (enterprise support, RI/SP purchases, etc.).'
    }

    return sendSuccess(event, result)
  } else {
    // ================================
    // STANDARD MODE
    // ================================
    // Generate forecast/projection from master account (raw AWS billing data)

    const data = await getCostForecast(
      startDateStr,
      endDateStr,
      metric,
      granularity,
      filter,
      environment
    )

    // Validate data was returned
    if (!data) {
      return errors.notFound(event, `No ${responseKey} data available for the specified period`)
    }

    // Log details for debugging
    logger.info(`${logPrefix} ${responseKey} total:`, data?.total?.Amount || 'No total',
                'for accounts:', accountIds.length > 0 ? accountIds : 'All')

    // Log periods (especially for rest-of-year to check December)
    if (period === 'rest-of-year' && data?.forecastResultsByTime) {
      logger.info(`${logPrefix} rest-of-year returned`, data.forecastResultsByTime.length, 'periods:')
      data.forecastResultsByTime.forEach((p: any, idx: number) => {
        const start = p?.TimePeriod?.Start
        const end = p?.TimePeriod?.End
        const mean = p?.MeanValue
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
      [responseKey]: data,
      note: accountIds.length > 0
        ? `${responseKey === 'forecast' ? 'Forecast' : 'AWS ML projection'} for ${accountIds.length} selected account(s): ${accountIds.join(', ')}`
        : `${responseKey === 'forecast' ? 'Forecast' : 'AWS ML projection'} based on raw AWS billing data from master account (all accounts)`
    }

    return sendSuccess(event, result)
  }
}
