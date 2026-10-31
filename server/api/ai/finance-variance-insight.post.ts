/**
 * POST /api/ai/finance-variance-insight
 *
 * Generates a rich, account- and service/usage-type-level AI variance explanation
 * for a GDMS Finance cost category. Fires real Cost Explorer queries grouped by
 * SERVICE + USAGE_TYPE so the AI has granular breakdown data to work from.
 *
 * Each category type is handled specifically:
 *
 *   Regular linked accounts   — CE grouped by SERVICE + USAGE_TYPE, filtered to LINKED_ACCOUNT list
 *   GDMS Cloud (payer)        — diff of payer-creds CE vs proforma-creds CE at service level;
 *                               represents unallocated payer charges (residual after chargeback)
 *   Enterprise Support        — CE on payer creds filtered to the Support service, by USAGE_TYPE
 *   GDMS-DevOrg               — CE via the DevOrg billing view ARN, grouped by SERVICE + USAGE_TYPE
 *   Secret Cloud              — no CE access; Finance-supplied hardcoded actuals only
 *
 * Request body:
 *   category      – CategoryRow from budget-vs-actual response
 *   department    – 'DE158' | 'DT509'
 *   year          – fiscal year (number)
 *   deptPlan      – dept-level YTD plan (for context)
 *   deptActual    – dept-level YTD actual (for context)
 *   refresh       – skip cache (boolean, optional)
 */

import { defineEventHandler, readBody } from 'h3'
import { GetCostAndUsageCommand, type Granularity } from '@aws-sdk/client-cost-explorer'
import { ListBillingViewsCommand } from '@aws-sdk/client-billing'
import { getCostExplorerClient, getBillingClient } from '../../lib/aws-client-factory'
import { invokeBedrock } from '../../utils/bedrock-client'
import { requirePermission } from '../../utils/user-roles'
import { insightCache, CacheManager } from '../../utils/cache-manager'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { logger } from '../../utils/logger'
import {
  CE_MAX_ATTEMPTS,
  CE_OPERATION,
  ceBackoffDelayMs,
  ceErrorCode,
  ceErrorName,
  isCeThrottleError,
} from '../../utils/finance-variance-insight-retry'

const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const PROFORMA_ACCOUNT_ID = process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
const DEV_ORG_ACCOUNT_ID = process.env.AWS_DEV_ORG_ACCOUNT_ID || '266632029214'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Cache the DevOrg billing view ARN for the process lifetime
let cachedDevOrgArn: string | null | undefined = undefined

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

function monthLabel(ceKey: string): string {
  const [, m] = ceKey.split('-').map(Number)
  return MONTHS[m - 1] ?? ceKey
}

interface AccountRow {
  accountId: string
  name: string
  ytdBudget: number
  ytdActual: number
  ytdVariance: number
  monthlyActuals: Record<string, number>
  pepExpectedSpend?: number
  pepMonthlyExpected?: Record<string, number>
}

interface CategoryRow {
  name: string
  ytdBudget: number
  ytdActual: number
  ytdVariance: number
  note?: string
  accounts: AccountRow[]
}

interface ServiceUsageBreakdown {
  service: string
  usageTypes: Array<{ usageType: string; total: number; byMonth: Record<string, number> }>
  total: number
  byMonth: Record<string, number>
}

// ── CE throttle-aware retry helpers ─────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Send one paginated GetCostAndUsage request, retrying only throttle errors up
 * to CE_MAX_ATTEMPTS. Emits concise structured context (no raw errors, ARNs,
 * credentials, or account IDs). The terminal failure is logged at error level.
 */
async function sendCePageWithRetry(
  client: Awaited<ReturnType<typeof getCostExplorerClient>>,
  input: any,
  logCtx: { startDate: string; endDate: string; billingViewPresent: boolean },
): Promise<any> {
  for (let attempt = 1; attempt <= CE_MAX_ATTEMPTS; attempt++) {
    try {
      return await client.send(new GetCostAndUsageCommand(input))
    } catch (err) {
      const throttled = isCeThrottleError(err)
      const context = {
        operation: CE_OPERATION,
        errorName: ceErrorName(err),
        errorCode: ceErrorCode(err),
        attempt,
        maxAttempts: CE_MAX_ATTEMPTS,
        throttled,
        retryable: throttled,
        ...logCtx,
      }
      if (throttled && attempt < CE_MAX_ATTEMPTS) {
        const delayMs = ceBackoffDelayMs(attempt - 1)
        logger.warn('[FinanceVarianceInsight] CE query throttled; retrying', { ...context, delayMs })
        await sleep(delayMs)
        continue
      }
      // Non-retryable error, or throttle retries exhausted — terminal failure.
      logger.error('[FinanceVarianceInsight] CE query failed', context)
      throw err
    }
  }
  // Unreachable: the loop always returns or throws.
  throw new Error('CE retry loop exited unexpectedly')
}

// ── CE helpers ─────────────────────────────────────────────────────────────────

async function runCeQuery(
  params: {
    accountId: string
    startDate: string
    endDate: string
    filter?: any
    billingViewArn?: string
  }
): Promise<any[]> {
  const client = await getCostExplorerClient('commercial', 'us-east-1', params.accountId)
  const input: any = {
    TimePeriod: { Start: params.startDate, End: params.endDate },
    Granularity: 'MONTHLY' as Granularity,
    Metrics: ['UnblendedCost'],
    GroupBy: [
      { Type: 'DIMENSION', Key: 'SERVICE' },
      { Type: 'DIMENSION', Key: 'USAGE_TYPE' }
    ],
    ...(params.filter ? { Filter: params.filter } : {}),
    ...(params.billingViewArn ? { BillingViewArn: params.billingViewArn } : {})
  }

  const logCtx = {
    startDate: params.startDate,
    endDate: params.endDate,
    billingViewPresent: Boolean(params.billingViewArn),
  }

  let resultsByTime: any[] = []
  try {
    let token: string | undefined
    do {
      const res = await sendCePageWithRetry(client, { ...input, NextPageToken: token }, logCtx)
      resultsByTime = resultsByTime.concat(res.ResultsByTime || [])
      token = res.NextPageToken
    } while (token)
  } catch {
    // Terminal failure already logged with structured context in
    // sendCePageWithRetry. Preserve existing fallback behavior: return whatever
    // pages were accumulated (empty when the first page failed).
  }
  return resultsByTime
}

/** Roll up CE resultsByTime (grouped by SERVICE + USAGE_TYPE) into ServiceUsageBreakdown[]. */
function indexServiceUsage(
  resultsByTime: any[],
  ytdCutoff: string,
  minCost = 1
): ServiceUsageBreakdown[] {
  const svcMap = new Map<string, { total: number; byMonth: Record<string, number>; usageMap: Map<string, { total: number; byMonth: Record<string, number> }> }>()

  for (const period of resultsByTime) {
    const month = period.TimePeriod?.End || ''
    if (!month || month > ytdCutoff) continue

    for (const group of period.Groups || []) {
      const [service, usageType] = group.Keys ?? []
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      if (!service || cost < minCost) continue

      if (!svcMap.has(service)) svcMap.set(service, { total: 0, byMonth: {}, usageMap: new Map() })
      const svc = svcMap.get(service)!
      svc.total += cost
      svc.byMonth[month] = (svc.byMonth[month] || 0) + cost

      if (usageType) {
        if (!svc.usageMap.has(usageType)) svc.usageMap.set(usageType, { total: 0, byMonth: {} })
        const ut = svc.usageMap.get(usageType)!
        ut.total += cost
        ut.byMonth[month] = (ut.byMonth[month] || 0) + cost
      }
    }
  }

  return [...svcMap.entries()]
    .map(([service, data]) => ({
      service,
      total: data.total,
      byMonth: data.byMonth,
      usageTypes: [...data.usageMap.entries()]
        .map(([usageType, d]) => ({ usageType, ...d }))
        .filter(u => u.total >= minCost)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5) // top 5 usage types per service
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12) // top 12 services
}

/** Subtract proforma service totals from payer service totals to get GDMS Cloud residual by service. */
function diffServiceBreakdowns(
  payer: ServiceUsageBreakdown[],
  proforma: ServiceUsageBreakdown[]
): ServiceUsageBreakdown[] {
  const proformaMap = new Map(proforma.map(s => [s.service, s]))
  return payer
    .map(payerSvc => {
      const proformaSvc = proformaMap.get(payerSvc.service)
      const residualTotal = payerSvc.total - (proformaSvc?.total ?? 0)
      if (residualTotal < 1) return null

      const residualByMonth: Record<string, number> = {}
      for (const [m, v] of Object.entries(payerSvc.byMonth)) {
        const proformaV = proformaSvc?.byMonth[m] ?? 0
        const diff = v - proformaV
        if (diff > 0.5) residualByMonth[m] = diff
      }

      return {
        service: payerSvc.service,
        total: residualTotal,
        byMonth: residualByMonth,
        usageTypes: payerSvc.usageTypes // usage types come from payer side
      }
    })
    .filter((s): s is ServiceUsageBreakdown => s !== null)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)
}

async function getDevOrgArn(): Promise<string | null> {
  if (cachedDevOrgArn !== undefined) return cachedDevOrgArn
  try {
    const billing = await getBillingClient('commercial', 'us-east-1', PAYER_ACCOUNT_ID)
    const res = await billing.send(new ListBillingViewsCommand({}))
    const match = (res.billingViews || []).find((v: any) => v.name?.includes('DevOrg') || v.name?.includes('GDMS-DevOrg'))
    cachedDevOrgArn = match?.arn ?? null
  } catch {
    cachedDevOrgArn = null
  }
  return cachedDevOrgArn
}

// ── Fetch service+usage breakdown per category type ───────────────────────────

async function fetchBreakdown(
  category: CategoryRow,
  startDate: string,
  endDate: string,
  ytdCutoff: string
): Promise<{ current: ServiceUsageBreakdown[]; note: string }> {

  const catName = category.name

  // Secret Cloud — no CE access at all
  if (catName === 'Secret Cloud' || category.accounts[0]?.accountId === 'classified') {
    return { current: [], note: 'Finance-supplied actuals — not accessible via Cost Explorer. No service-level breakdown available.' }
  }

  // Enterprise Support — payer account, filtered to support service, by usage type
  if (catName === 'Enterprise Support') {
    const raw = await runCeQuery({
      accountId: PAYER_ACCOUNT_ID,
      startDate,
      endDate,
      filter: { Dimensions: { Key: 'SERVICE', Values: ['AWS Support (Enterprise)'] } }
    })
    return { current: indexServiceUsage(raw, ytdCutoff), note: 'Enterprise Support is billed on the payer account (205950196477) as a service charge, not a linked-account charge. Budget is hardcoded at $56,900/month.' }
  }

  // GDMS-DevOrg — CE via billing view ARN
  if (catName === 'GDMS-DevOrg' || category.accounts[0]?.accountId === DEV_ORG_ACCOUNT_ID) {
    const arn = await getDevOrgArn()
    if (!arn) {
      return { current: [], note: 'GDMS-DevOrg uses a billing transfer group (billing view). Could not resolve billing view ARN — service breakdown unavailable. Budget is hardcoded at $10,000/month. Jan–Apr 2026 actuals use manual Finance overrides.' }
    }
    const raw = await runCeQuery({ accountId: PAYER_ACCOUNT_ID, startDate, endDate, billingViewArn: arn })
    return {
      current: indexServiceUsage(raw, ytdCutoff),
      note: `GDMS-DevOrg uses a billing transfer group scoped via its billing view ARN. Budget is hardcoded at $10,000/month. Jan–Apr 2026 actuals use manual Finance overrides; May 2026+ come from the billing view CE query.`
    }
  }

  // GDMS Cloud — payer residual: diff of payer CE vs proforma CE at service level
  if (catName === 'GDMS Cloud' || category.accounts[0]?.accountId === PAYER_ACCOUNT_ID) {
    const [payerRaw, proformaRaw] = await Promise.all([
      runCeQuery({
        accountId: PAYER_ACCOUNT_ID,
        startDate,
        endDate,
        filter: {
          Not: {
            Dimensions: {
              Key: 'RECORD_TYPE',
              Values: ['SavingsPlanRecurringFee', 'SavingsPlanPurchase', 'Credit', 'Refund']
            }
          }
        }
      }),
      runCeQuery({ accountId: PROFORMA_ACCOUNT_ID, startDate, endDate })
    ])
    const payerBreakdown = indexServiceUsage(payerRaw, ytdCutoff)
    const proformaBreakdown = indexServiceUsage(proformaRaw, ytdCutoff)
    const residual = diffServiceBreakdowns(payerBreakdown, proformaBreakdown)
    return {
      current: residual,
      note: 'GDMS Cloud represents unallocated payer charges: full-org billable total minus proforma-allocated total minus Enterprise Support. Actuals are a residual — no per-account breakdown is possible. Budget is derived as the proforma org total minus all linked-account proforma budgets minus the Enterprise Support hardcoded budget.'
    }
  }

  // Regular linked accounts
  const accountIds = category.accounts.map(a => a.accountId).filter(id => id !== PAYER_ACCOUNT_ID && id !== PROFORMA_ACCOUNT_ID)
  if (!accountIds.length) return { current: [], note: '' }

  const filter = accountIds.length === 1
    ? { Dimensions: { Key: 'LINKED_ACCOUNT', Values: accountIds } }
    : { Or: accountIds.map(id => ({ Dimensions: { Key: 'LINKED_ACCOUNT', Values: [id] } })) }

  const raw = await runCeQuery({ accountId: PAYER_ACCOUNT_ID, startDate, endDate, filter })
  return { current: indexServiceUsage(raw, ytdCutoff), note: '' }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(
  category: CategoryRow,
  department: string,
  ytdCutoff: string,
  breakdown: ServiceUsageBreakdown[],
  priorBreakdown: ServiceUsageBreakdown[],
  categoryNote: string
): string {
  const lines: string[] = []

  const variance = category.ytdActual - category.ytdBudget
  const variancePct = category.ytdBudget > 0 ? (variance / category.ytdBudget) * 100 : 0

  lines.push(`Write an executive variance summary for this GDMS Finance category.`)
  lines.push(``)
  lines.push(`## Category Overview`)
  lines.push(`- Category: ${category.name}`)
  lines.push(`- Department: ${department}`)
  lines.push(`- YTD Plan: ${fmt(category.ytdBudget)}`)
  lines.push(`- YTD Actual: ${fmt(category.ytdActual)}`)
  lines.push(`- YTD Variance: ${variance >= 0 ? '+' : ''}${fmt(variance)} (${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(1)}% — ${variance > 0 ? 'over' : 'under'} plan)`)
  if (category.ytdBudget === 0) lines.push(`- Note: No plan budget is set for this category.`)
  if (categoryNote) lines.push(`- Budget/data methodology: ${categoryNote}`)
  lines.push(``)

  // Per-account detail
  const visibleAccounts = category.accounts.filter(a =>
    Object.entries(a.monthlyActuals).some(([m, v]) => m <= ytdCutoff && v > 0.5)
  )
  if (visibleAccounts.length) {
    lines.push(`## Account Breakdown`)
    for (const acct of visibleAccounts.sort((a, b) => b.ytdActual - a.ytdActual).slice(0, 3)) {
      const months = Object.entries(acct.monthlyActuals)
        .filter(([m]) => m <= ytdCutoff)
        .sort(([a], [b]) => a.localeCompare(b))

      const momChanges: string[] = []
      for (let i = 1; i < months.length; i++) {
        const [, prevVal] = months[i - 1]
        const [currKey, currVal] = months[i]
        if (prevVal > 0 && currVal > 0) {
          const delta = currVal - prevVal
          momChanges.push(`${monthLabel(currKey)}: ${delta >= 0 ? '+' : ''}${fmt(delta)} (${((delta / prevVal) * 100).toFixed(1)}%)`)
        }
      }

      lines.push(``)
      lines.push(`### ${acct.name} (${acct.accountId})`)
      lines.push(`- YTD Actual: ${fmt(acct.ytdActual)}`)
      if (acct.ytdBudget > 0) {
        lines.push(`- YTD Plan: ${fmt(acct.ytdBudget)} | Variance: ${(acct.ytdActual - acct.ytdBudget) >= 0 ? '+' : ''}${fmt(acct.ytdActual - acct.ytdBudget)}`)
      }
      if (acct.pepExpectedSpend !== undefined) {
        const pepDelta = acct.ytdActual - acct.pepExpectedSpend
        lines.push(`- PEP Expected YTD: ${fmt(acct.pepExpectedSpend)} | PEP Variance: ${pepDelta >= 0 ? '+' : ''}${fmt(pepDelta)}`)
      }
      const monthTrend = months.slice(-6).map(([m, v]) => `${monthLabel(m)}: ${fmt(v)}`).join(', ')
      if (monthTrend) lines.push(`- Monthly actuals: ${monthTrend}`)
      if (momChanges.length) lines.push(`- MoM changes: ${momChanges.join('; ')}`)
    }
    lines.push(``)
  }

  // Service + usage type breakdown
  if (breakdown.length) {
    const priorMap = new Map(priorBreakdown.map(s => [s.service, s]))
    lines.push(`## Service & Usage Type Breakdown`)
    for (const svc of breakdown.slice(0, 3)) {
      const prior = priorMap.get(svc.service)
      const yoyPct = prior && prior.total > 0
        ? ` | YoY: ${((svc.total - prior.total) / prior.total * 100).toFixed(1)}%`
        : ' | YoY: new this year'

      const recentMonths = Object.entries(svc.byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-4)
        .map(([m, v]) => `${monthLabel(m)}: ${fmt(v)}`)
        .join(', ')

      lines.push(``)
      lines.push(`### ${svc.service}: ${fmt(svc.total)} YTD${yoyPct}`)
      if (recentMonths) lines.push(`Recent: ${recentMonths}`)

      if (svc.usageTypes.length) {
        lines.push(`Usage types:`)
        for (const ut of svc.usageTypes) {
          const utMonths = Object.entries(ut.byMonth)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-3)
            .map(([m, v]) => `${monthLabel(m)}: ${fmt(v)}`)
            .join(', ')
          lines.push(`  - ${ut.usageType}: ${fmt(ut.total)} YTD${utMonths ? ` (${utMonths})` : ''}`)
        }
      }
    }
    lines.push(``)
  }

  return lines.join('\n')
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a GDMS Finance executive analyst writing a variance summary.

Write one or two short sentences, 45 words maximum. State the variance direction and magnitude, then name the single strongest root cause. Mention a recent shift only when material. Do not list evidence, recommend actions, or add caveats.

Your audience is GDMS Finance staff and IT leadership. Write plain prose — no bullet points, no headers, no lists.

To find the root cause, weigh:
1. The primary driver(s) of the variance — name specific AWS services, usage types, or accounts.
2. Any notable shift in the most recent 1–2 months (inflection points, new spend, spend dropping off).
3. YoY context if meaningful ("new this year" or continuing a prior-year trend).
4. PEP comparison if available.

For special categories use the methodology note to accurately frame what the numbers represent (e.g. GDMS Cloud is unallocated payer residual, not a named account).

Rules:
- Bold (**) dollar amounts, service names, account names, and usage types.
- One or two sentences, 45 words maximum. Every sentence must carry new information — no filler.
- Do NOT speculate beyond the data. Do NOT recommend actions.
- Plain prose only. No bullets, no headers, no markdown formatting beyond bold.`

// ── Handler ───────────────────────────────────────────────────────────────────

export default handleAsync(defineEventHandler(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')

  const body = await readBody<{
    category: CategoryRow
    department: string
    year: number
    deptPlan?: number
    deptActual?: number
    refresh?: boolean
  }>(event)

  if (!body?.category || !body?.department || !body?.year) {
    return errors.badRequest(event, 'Missing required fields: category, department, year')
  }

  const { category, department, refresh } = body
  const year = Number(body.year)
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  if (!Number.isInteger(year) || year < 2000 || year > currentYear) {
    return errors.badRequest(event, `year must be a fiscal year no later than ${currentYear}`)
  }
  if (!Array.isArray(category.accounts) || category.accounts.some(a => typeof a?.accountId !== 'string' || !/^(\d{12}|classified)$/.test(a.accountId))) {
    return errors.badRequest(event, 'category.accounts must list 12-digit account IDs')
  }

  const cacheKey = CacheManager.generateKey('finance-variance-insight-v4', {
    dept: department,
    cat: category.name,
    year,
    ytdActual: Math.round(category.ytdActual),
    ytdBudget: Math.round(category.ytdBudget)
  })

  if (!refresh) {
    const cached = await insightCache.get<{ insight: string; generatedAt: string }>(cacheKey)
    if (cached) {
      return sendSuccess(event, { insight: cached.insight, cached: true, generatedAt: cached.generatedAt })
    }
  }

  // Months are keyed by invoicing month (CE TimePeriod.End). A past year runs
  // through December; the current year runs through this month.
  const cutoffMonth = String(year < currentYear ? 12 : now.getUTCMonth() + 1).padStart(2, '0')
  const ytdCutoff = `${year}-${cutoffMonth}-01`
  const startDate = `${year - 1}-12-01`
  const endDate = ytdCutoff
  const priorStartDate = `${year - 2}-12-01`
  const priorEndDate = `${year - 1}-${cutoffMonth}-01`

  logger.info(`[FinanceVarianceInsight] Fetching breakdown for ${department}:${category.name}`)

  const [{ current, note }, priorRaw] = await Promise.all([
    fetchBreakdown(category, startDate, endDate, ytdCutoff),
    fetchBreakdown(category, priorStartDate, priorEndDate, priorEndDate)
  ])

  const prompt = buildPrompt(category, department, ytdCutoff, current, priorRaw.current, note)

  logger.info(`[FinanceVarianceInsight] Invoking Bedrock for ${department}:${category.name} (${prompt.length} chars)`)

  const result = await invokeBedrock({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    model: 'claude-sonnet',
    temperature: 0.2,
    maxTokens: 350
  })

  if (!result.success || !result.content) {
    logger.error(`[FinanceVarianceInsight] Bedrock failed:`, result.error)
    return errors.serverError(event, 'AI insight generation failed. Please try again later.')
  }

  const generatedAt = new Date().toISOString()
  await insightCache.set(cacheKey, { insight: result.content, generatedAt }, { ttl: 3600 })

  return sendSuccess(event, { insight: result.content, cached: false, generatedAt }, {
    model: result.model,
    tokens: { input: result.inputTokens, output: result.outputTokens },
    processingTime: result.processingTime
  })
}))
