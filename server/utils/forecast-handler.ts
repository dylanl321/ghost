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
import { resolveToCommercialAccountIds } from './account-filters'

export interface ForecastDateRange {
  startDate: string
  endDate: string // exclusive, as Cost Explorer expects
  months: number // 0 for the partial current month
}

const ACCOUNT_ID_PATTERN = /^\d{12}$/

const isoDate = (date: Date) => date.toISOString().slice(0, 10)

/**
 * Forecast window for a period, in UTC. Cost Explorer forecasts must start
 * today or later; every period other than current-month-remainder starts on
 * the first of next month.
 *
 * Month arithmetic is done on the first of the month: setMonth() on the 29th-31st
 * overflows (Oct 31 + 1 month = Dec 1), which used to push the
 * current-month-remainder window a whole month too far.
 */
export function getForecastDateRange(
  period: string,
  customMonths: number = 1,
  referenceDate: Date = new Date()
): ForecastDateRange | null {
  const year = referenceDate.getUTCFullYear()
  const month = referenceDate.getUTCMonth()
  const today = new Date(Date.UTC(year, month, referenceDate.getUTCDate()))
  const monthStart = (offset: number) => new Date(Date.UTC(year, month + offset, 1))

  if (period === 'current-month-remainder') {
    return { startDate: isoDate(today), endDate: isoDate(monthStart(1)), months: 0 }
  }

  let months: number
  switch (period) {
    case 'next-month': months = 1; break
    case '3-months': months = 3; break
    case '6-months': months = 6; break
    case '12-months': months = 12; break
    // Next month through December; in December, January only
    case 'rest-of-year': months = Math.max(1, 11 - month); break
    case 'custom':
      if (customMonths < 1 || customMonths > 12) return null
      months = customMonths
      break
    default:
      return null
  }

  return { startDate: isoDate(monthStart(1)), endDate: isoDate(monthStart(1 + months)), months }
}

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
  const requestedAccountIds = accountIdsParam.split(',').map(id => id.trim()).filter(Boolean)
  // Cost Explorer only accepts 12-digit account IDs. Request IDs and emails are
  // documented as accepted, so resolve them (commercial only) instead of passing
  // them through and failing in AWS.
  const unresolvedIdentifiers = requestedAccountIds.filter(id => !ACCOUNT_ID_PATTERN.test(id))
  const resolvedIdentifiers = unresolvedIdentifiers.length && environment === 'commercial'
    ? await resolveToCommercialAccountIds(unresolvedIdentifiers)
    : []
  if (unresolvedIdentifiers.length && !resolvedIdentifiers.length) {
    return errors.badRequest(event, `Could not resolve account identifiers to AWS account IDs: ${unresolvedIdentifiers.join(', ')}`)
  }
  const accountIds = [...new Set([...requestedAccountIds.filter(id => ACCOUNT_ID_PATTERN.test(id)), ...resolvedIdentifiers])]

  // ================================
  // BUILD FILTER FOR ACCOUNT SELECTION
  // ================================

  let filter: any = undefined
  if (accountIds.length > 0) {
    logger.info(`${logPrefix} Filtering ${responseKey} for ${accountIds.length} accounts:`, accountIds)
    // Multiple dimension values use OR semantics and avoid deeply nested expressions.
    filter = {
      Dimensions: {
        Key: 'LINKED_ACCOUNT',
        Values: accountIds
      }
    }
  } else {
    logger.info(`${logPrefix} No account filter - returning org-wide ${responseKey}`)
  }

  // ================================
  // CALCULATE DATE RANGE
  // ================================

  if (period === 'custom' && (customMonths < 1 || customMonths > 12)) {
    return errors.badRequest(event, 'Custom months must be between 1 and 12')
  }
  const range = getForecastDateRange(period, customMonths)
  if (!range) {
    return errors.badRequest(event, 'Invalid period. Must be one of: current-month-remainder, next-month, 3-months, 6-months, 12-months, rest-of-year, custom')
  }
  const { startDate: startDateStr, endDate: endDateStr, months: monthsToAdd } = range

  // ================================
  // FORECAST / PROJECTION GENERATION
  // ================================

  // Validate proforma requirements
  if (proforma && environment !== 'commercial') {
    return errors.badRequest(event, `Proforma ${responseKey} analysis is only available for commercial environment`)
  }

  try {
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
      forecastMetadata: {
        source: 'aws-cost-explorer',
        allocation: 'direct',
        estimated: true,
        scope: accountIds.length > 0 ? 'filtered-aggregate' : 'organization'
      },
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
      environment,
      environment === 'commercial' ? masterAccountId : undefined
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
      forecastMetadata: {
        source: 'aws-cost-explorer',
        allocation: 'direct',
        estimated: true,
        scope: accountIds.length > 0 ? 'filtered-aggregate' : 'organization'
      },
      note: accountIds.length > 0
        ? `${responseKey === 'forecast' ? 'Forecast' : 'AWS ML projection'} for ${accountIds.length} selected account(s): ${accountIds.join(', ')}`
        : `${responseKey === 'forecast' ? 'Forecast' : 'AWS ML projection'} based on raw AWS billing data from master account (all accounts)`
    }

      return sendSuccess(event, result)
    }
  } catch (error: any) {
    // Attach endpoint context to otherwise opaque AWS forecast failures so the
    // resulting 500 is diagnosable in CloudWatch. Never log account IDs or
    // secrets — only the count of accounts requested. Rethrow so the existing
    // HTTP error handling / status semantics are unchanged.
    logger.error(`${logPrefix} ${responseKey} generation failed`, {
      logPrefix,
      responseKey,
      environment,
      period,
      accountCount: accountIds.length,
      proforma,
      errorName: error?.name,
      errorMessage: error?.message
    })
    throw error
  }
}
