/**
 * GET /api/costs/diagnostic
 * Diagnostic endpoint to validate proforma data structure
 */

import { defineEventHandler, getQuery } from 'h3'
import { getProformaCosts } from '../../utils/cost-explorer'
import { getRelativeDateRange } from '../../utils/date-helpers'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'

export default defineEventHandler(handleAsync(async (event) => {
  const { startDate, endDate } = getRelativeDateRange('lastMonth')

  // Call getProformaCosts directly (no caching)
  const rawData = await getProformaCosts(
    {
      startDate,
      endDate,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost'],
      groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
    },
    '253821132832',
    '205950196477'
  )

  // Check proforma data structure
  const diagnostic = {
    proformaTotal: rawData.proforma.total,
    proformaCostsTotal: rawData.proforma.costs.total?.UnblendedCost?.Amount,
    hasResultsByTime: !!rawData.proforma.costs.resultsByTime,
    resultsByTimeLength: rawData.proforma.costs.resultsByTime?.length || 0,
    firstPeriodHasTotal: !!rawData.proforma.costs.resultsByTime?.[0]?.Total,
    firstPeriodTotalAmount: rawData.proforma.costs.resultsByTime?.[0]?.Total?.UnblendedCost?.Amount,
    firstPeriodGroupsCount: rawData.proforma.costs.resultsByTime?.[0]?.Groups?.length || 0,
    expected: 1021955.92,
    actual: rawData.proforma.total,
    match: Math.abs(rawData.proforma.total - 1021955.92) < 1
  }

  return sendSuccess(event, diagnostic)
}))
