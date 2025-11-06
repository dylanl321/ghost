/**
 * GET /api/costs/test-direct
 * Direct test of getProformaCosts + enhanceCostData (no caching)
 */

import { defineEventHandler } from 'h3'
import { getProformaCosts, enhanceCostData } from '../../utils/cost-explorer'
import { getRelativeDateRange } from '../../utils/date-helpers'
import { sendSuccess, handleAsync } from '../../utils/api-response'

export default defineEventHandler(handleAsync(async (event) => {
  const { startDate, endDate } = getRelativeDateRange('lastMonth')

  // Step 1: Call getProformaCosts (same as API does)
  const proformaData = await getProformaCosts(
    {
      startDate,
      endDate,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost', 'UsageQuantity'], // TWO METRICS like summary endpoint
      groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
    },
    '253821132832',
    '205950196477'
  )

  // Step 2: Call enhanceCostData (same as API does)
  const proformaEnhanced = await enhanceCostData(
    proformaData.proforma.costs,
    false, // includeDecommissioned
    'LINKED_ACCOUNT' // groupByDimension
  )

  return sendSuccess(event, {
    rawProformaTotal: proformaData.proforma.total,
    enhancedProformaTotal: proformaEnhanced.summary.totalCost,
    expected: 1021955.92,
    rawMatch: Math.abs(proformaData.proforma.total - 1021955.92) < 1,
    enhancedMatch: Math.abs(proformaEnhanced.summary.totalCost - 1021955.92) < 1
  })
}))
