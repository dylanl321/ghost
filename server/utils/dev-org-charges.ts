/**
 * GDMS-DevOrg Charges via Billing API + Cost Explorer
 *
 * The DevOrg (266632029214) has its own AWS billing transfer group (GDMS-DevOrg).
 * Transfer billing groups don't expose members via Billing Conductor APIs, but
 * they do create a named Billing View. We:
 *   1. Call ListBillingViews to find the GDMS-DevOrg view ARN
 *   2. Pass that BillingViewArn to GetCostAndUsage so Cost Explorer scopes its
 *      results to that billing group, grouped by LINKED_ACCOUNT
 *
 * Returns monthly totals keyed by ISO month start date ("YYYY-MM-01") and a
 * per-account monthly breakdown for the category row expansion.
 *
 * Hardcoded overrides for Jan–Apr 2026: billing data was not available via the
 * Billing View API for those months. These values should be replaced with a
 * DynamoDB lookup once the config table is in place.
 */

// Manual DevOrg charges keyed by invoicing month (YYYY-MM-01).
// January invoice = 2026-01-01, February = 2026-02-01, etc.
const MANUAL_DEVORG_CHARGES_2026: Record<string, number> = {
  '2026-01-01': 9270.18,  // January 2026 invoice
  '2026-02-01': 9306.05,  // February 2026 invoice
  '2026-03-01': 9465.05,  // March 2026 invoice
  '2026-04-01': 10332.34, // April 2026 invoice
  '2026-05-01': 8280.47,  // May 2026 invoice
}

import { ListBillingViewsCommand } from '@aws-sdk/client-billing'
import { GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer'
import { getBillingClient, getCostExplorerClient } from '../lib/aws-client-factory'
import { logger } from './logger'

const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'

// Cache the ARN for the process lifetime — it won't change between requests.
let cachedDevOrgBillingViewArn: string | null | undefined = undefined

async function getDevOrgBillingViewArn(): Promise<string | null> {
  if (cachedDevOrgBillingViewArn !== undefined) return cachedDevOrgBillingViewArn

  const billingClient = await getBillingClient('commercial', 'us-east-1', PAYER_ACCOUNT_ID)
  const response = await billingClient.send(new ListBillingViewsCommand({}))

  const views = response.billingViews || []
  logger.info('[DevOrgCharges] Available billing views:', views.map(v => ({ name: v.name, arn: v.arn })))

  const match = views.find(v => v.name && (v.name.includes('DevOrg') || v.name.includes('GDMS-DevOrg')))
  cachedDevOrgBillingViewArn = match?.arn ?? null

  if (cachedDevOrgBillingViewArn) {
    logger.info('[DevOrgCharges] Found billing view:', { name: match!.name, arn: cachedDevOrgBillingViewArn })
  } else {
    logger.warn('[DevOrgCharges] No GDMS-DevOrg billing view found. Available:', views.map(v => v.name))
  }

  return cachedDevOrgBillingViewArn
}

export interface DevOrgMonthlyResult {
  /** Total actual per month: Map<"YYYY-MM-01", amount> */
  byMonth: Map<string, number>
  /** Per-account breakdown: Map<accountId, Map<"YYYY-MM-01", amount>> */
  byAccountMonth: Map<string, Map<string, number>>
  /** Account ID -> display name from Cost Explorer dimension attributes */
  accountNames: Map<string, string>
}

/**
 * Fetch GDMS-DevOrg charges from Cost Explorer scoped to the DevOrg billing view.
 * Returns monthly totals and per-account monthly breakdown for the given year.
 */
export async function queryDevOrgChargesByMonth(year: number): Promise<DevOrgMonthlyResult> {
  const empty: DevOrgMonthlyResult = {
    byMonth: new Map(),
    byAccountMonth: new Map(),
    accountNames: new Map()
  }

  const billingViewArn = await getDevOrgBillingViewArn()
  if (!billingViewArn) {
    logger.warn('[DevOrgCharges] Skipping DevOrg CE query — billing view ARN not found. Returning manual charges only.')
    return { byMonth: new Map(Object.entries(MANUAL_DEVORG_CHARGES_2026)), byAccountMonth: new Map(), accountNames: new Map() }
  }

  // Start from Dec of prior year so CE returns End="${year}-01-01" (January invoicing month).
  const startDate = `${year - 1}-12-01`
  const now = new Date()
  const localYear = now.getFullYear()
  const localMonth = now.getMonth()
  const nextMonthYear = localMonth === 11 ? localYear + 1 : localYear
  const nextMonth = localMonth === 11 ? 1 : localMonth + 2
  const endOfCurrentMonth = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`
  const maxEnd = `${year + 1}-01-01`
  const endDate = maxEnd <= endOfCurrentMonth ? maxEnd : endOfCurrentMonth

  if (startDate >= endDate) return empty

  const ceClient = await getCostExplorerClient('commercial', undefined, PAYER_ACCOUNT_ID)

  const response = await ceClient.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: startDate, End: endDate },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' }],
    Filter: {
      Not: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Refund'] } }
    },
    BillingViewArn: billingViewArn
  }))

  const byMonth = new Map<string, number>()
  const byAccountMonth = new Map<string, Map<string, number>>()
  const accountNames = new Map<string, string>()

  // Capture account display names from dimension attributes
  for (const attr of response.DimensionValueAttributes || []) {
    if (attr.Value && attr.Attributes?.description) {
      accountNames.set(attr.Value, attr.Attributes.description)
    }
  }

  for (const period of response.ResultsByTime || []) {
    const month = period.TimePeriod?.End || period.TimePeriod?.Start
    if (!month) continue

    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      if (!accountId) continue
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')

      byMonth.set(month, (byMonth.get(month) || 0) + cost)

      if (!byAccountMonth.has(accountId)) byAccountMonth.set(accountId, new Map())
      byAccountMonth.get(accountId)!.set(month, (byAccountMonth.get(accountId)!.get(month) || 0) + cost)
    }
  }

  // Overlay manual charges for months where CE data is not available.
  // Manual entries take precedence; CE data is used for all other months.
  // Per-account breakdown is not available for manual months — they appear
  // as a top-level DevOrg total only (byAccountMonth is left as-is from CE).
  // Manual charges always override CE data for the listed invoicing months
  for (const [month, amount] of Object.entries(MANUAL_DEVORG_CHARGES_2026)) {
    if (month >= `${year}-01-01` && month <= `${year + 1}-01-01`) {
      byMonth.set(month, amount)
      for (const acctMap of byAccountMonth.values()) acctMap.delete(month)
    }
  }

  const ytdTotal = [...byMonth.values()].reduce((s, v) => s + v, 0)
  logger.info('[DevOrgCharges] CE query complete', {
    billingViewArn,
    months: byMonth.size,
    accounts: byAccountMonth.size,
    ytdTotal: ytdTotal.toFixed(2),
    manualMonths: Object.keys(MANUAL_DEVORG_CHARGES_2026).filter(m => m.startsWith(`${year}-`))
  })

  return { byMonth, byAccountMonth, accountNames }
}
