/**
 * GET /api/admin/validate-costs
 * Validate cost API responses against direct AWS queries
 */

import { defineEventHandler, getQuery, setHeader } from 'h3'
import { runValidation, generateCsvReport } from '../../utils/cost-validation'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import type { RelativePeriod } from '../../utils/date-helpers'

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const { environment } = parseQueryParams(event)

  // Parse query parameters
  const period = (query.period as RelativePeriod) || 'lastMonth'
  const includeProforma = query.includeProforma !== 'false' && query.includeProforma !== false
  const downloadCsv = query.downloadCsv === 'true' || query.downloadCsv === true
  const masterAccountId = (query.masterAccountId as string) || process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
  const proformaAccountId = (query.proformaAccountId as string) || process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'

  // Run validation (uses server utilities directly, no HTTP calls)
  const result = await runValidation(
    period,
    environment,
    includeProforma,
    masterAccountId,
    proformaAccountId
  )

  // Return CSV if requested
  if (downloadCsv) {
    const csv = generateCsvReport(result)
    const filename = `cost-validation-${result.dateRange.startDate}_${result.dateRange.endDate}.csv`

    setHeader(event, 'Content-Type', 'text/csv')
    setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)

    return csv
  }

  // Return JSON response
  return sendSuccess(event, result, {
    validation: {
      period,
      environment,
      includeProforma,
      status: result.summary.overallStatus
    }
  })
}))
