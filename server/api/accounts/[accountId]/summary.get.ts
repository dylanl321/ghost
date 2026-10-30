/**
 * GET /api/accounts/:accountId/summary
 *
 * Get account summary for entity popover
 * Returns basic account info and current month cost estimate
 */

import { defineEventHandler } from 'h3'
import { lookupAccountOptimized } from '../../../utils/account-lookup-optimized'
import { getCostAndUsage } from '../../../utils/cost-explorer'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  const accountId = event.context.params?.accountId

  if (!accountId) {
    throw createError({
      statusCode: 400,
      message: 'Account ID parameter required'
    })
  }

  try {
    // Look up account using the optimized lookup system
    const lookupResult = await lookupAccountOptimized(event, accountId, {
      includeDecommissioned: false
    })

    if (!lookupResult || !lookupResult.account) {
      throw createError({
        statusCode: 404,
        message: 'Account not found'
      })
    }

    const { account } = lookupResult

    // Always use commercial ID for links (GHOST UI uses commercial IDs everywhere)
    const commercialId = account.accountId || account.awsStandardAccountID || account.id
    const govcloudId = account.govCloudAccountId || account.awsGovCloudAccountID

    // Month-to-date cost (non-blocking - if it fails, just omit). Cost
    // Explorer only exists in commercial and bills GovCloud usage to the
    // paired commercial account, so always query the commercial ID.
    let monthlyCost: number | undefined
    if (commercialId) {
      try {
        const now = new Date()
        const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        // Cost Explorer's end date is exclusive.
        const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

        const costData = await getCostAndUsage({
          startDate: startDate.toISOString().split('T')[0]!,
          endDate: endDate.toISOString().split('T')[0]!,
          granularity: 'MONTHLY',
          metrics: ['UnblendedCost'],
          filter: { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [commercialId] } }
        }, 'commercial')

        const amount = costData?.total?.UnblendedCost?.Amount
        if (amount) {
          monthlyCost = parseFloat(amount)
        }
      } catch (costError: any) {
        logger.warn(`[Account Summary] Could not fetch costs for ${accountId}:`, costError.message)
        // Continue without cost data
      }
    }

    // Determine which ID was queried
    const wasGovcloudQuery = accountId === govcloudId

    // Return summary with available data
    return {
      id: commercialId, // Always use commercial ID for links
      commercialId, // Explicit commercial ID
      govcloudId, // May be undefined
      queriedId: accountId, // The ID that was used in the query
      wasGovcloudQuery, // Flag to indicate if govcloud ID was queried
      name: account.projectName || account.name || 'Unknown',
      alias: account.accountAlias || undefined,
      email: account.email || account.accountEmail || undefined,
      status: account.status === 'ACTIVE' ? 'Active' : 'Inactive',
      environment: account.environment === 'govcloud' ? 'GovCloud' : 'Commercial',
      monthlyCost, // May be undefined if cost fetch failed
      region: account.region || undefined
    }
  } catch (error: any) {
    logger.error(`[Account Summary] Error for ${accountId}:`, error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to fetch account summary'
    })
  }
})
