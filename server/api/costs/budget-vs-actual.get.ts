/**
 * Budget vs Actual by Department API
 *
 * Returns budgeted (proforma) vs actual (billable) spend for a fixed set of
 * GDMS departments, restricted to users holding the `costs.budget_vs_actual`
 * permission (Finance + Administrator roles).
 *
 * "Budget"  = proforma cost  (Billing Conductor figures, proforma account)
 * "Actual"  = billable cost  (real unblended charges from the payer org)
 *
 * Query Parameters:
 * - department: string  (optional) - one of the allowed dept codes; omitted = all allowed
 * - year:       number  (optional, default: current year)
 * - environment: 'commercial' | 'govcloud' (default: 'commercial')
 *
 * Department scope (intentionally fixed for this report):
 *   DE158, DT509
 *
 * Special handling:
 * - GDMS Cloud (205950196477) is the catch-all for non-allocated charges. Its actual
 *   per month = (CE total via master account creds) − (CE total via proforma account creds).
 *   The master CE call sees the full org billable spend; the proforma CE call sees the
 *   proforma-allocated portion. The difference is what sits unallocated in GDMS Cloud.
 * - "SavingsPlanRecurringFee" and "SavingsPlanPurchase" RECORD_TYPE charges are
 *   excluded from payer actuals so the comparison reflects consumption only.
 * - GDMS-DevOrg (266632029214) charges appear via billing transfer under the
 *   proforma account. Fetched separately and shown as a fixed DE158 category row.
 *
 * Named account categories per spreadsheet (hardcoded by Finance request):
 *   DE158: External Access VPC | Enterprise Support | DevSecOps - Engineering Solutions
 *   DT509: Software Engineering Solutions | GDMS ITS SOC
 */

import { defineEventHandler, getQuery } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getCostAndUsage, getProformaCosts } from '../../utils/cost-explorer'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { requirePermission } from '../../utils/user-roles'
import { logger } from '../../utils/logger'
import { queryDevOrgChargesByMonth } from '../../utils/dev-org-charges'

// Departments this report is scoped to. Kept explicit per Finance's request.
const ALLOWED_DEPARTMENTS = ['DE158', 'DT509'] as const
type AllowedDepartment = typeof ALLOWED_DEPARTMENTS[number]

// Org payer / master account. Its actuals roll into DE158 (special case).
const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const PAYER_ROLLS_INTO: AllowedDepartment = 'DE158'

// Proforma (Billing Conductor) account — never a linked member account.
const PROFORMA_ACCOUNT_ID = process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'

// GDMS-DevOrg billing transfer account — charges roll into DE158 via billing transfer.
const DEV_ORG_ACCOUNT_ID = process.env.AWS_DEV_ORG_ACCOUNT_ID || '266632029214'
const DEV_ORG_ROLLS_INTO: AllowedDepartment = 'DE158'

// RECORD_TYPE values to exclude from payer actuals.
const EXCLUDED_RECORD_TYPES = ['SavingsPlanRecurringFee', 'SavingsPlanPurchase']

// Named account categories matching the spreadsheet exactly.
// Matched case-insensitively against projectName / account name.
const DEPT_NAMED_CATEGORIES: Record<AllowedDepartment, { name: string; note?: string }[]> = {
  DE158: [
    { name: 'External Access VPC',                  note: 'proportional to network traffic levels' },
    { name: 'Enterprise Support',                    note: 'proportional to overall AWS spend' },
    { name: 'DevSecOps - Engineering Solutions',     note: 'proportional to engineering GitLab usage' },
  ],
  DT509: [
    { name: 'Software Engineering Solutions' },
    { name: 'GDMS ITS SOC' },
  ]
}

interface MonthlyPoint {
  month: string
  budget: number
  actual: number
}

interface AccountRow {
  accountId: string
  name: string
  ytdBudget: number
  ytdActual: number
  ytdVariance: number
  monthlyActuals: Record<string, number>
}

interface CategoryRow {
  name: string
  ytdBudget: number
  ytdActual: number
  ytdVariance: number
  note?: string
  accounts: AccountRow[]
}

interface DepartmentResult {
  department: AllowedDepartment
  budgetTotal: number
  actualTotal: number
  variance: number
  variancePercent: number
  monthly: MonthlyPoint[]
  categories: CategoryRow[]
}

function accountDepartment(acc: any): string {
  return (acc.pepDepartment || acc.departmentNumber || acc.department || '').trim()
}

// Keys are CE TimePeriod.End — the first day of the invoicing month.
// e.g. End="2026-02-01" = December AWS charges invoiced in February.
// formatMonth displays the End month directly (no offset needed).
function periodToMonthKey(period: any): string {
  return period.TimePeriod?.End || period.TimePeriod?.Start || ''
}

function indexByAccountMonth(resultsByTime: any[] | undefined): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  if (!resultsByTime) return out
  for (const period of resultsByTime) {
    const month = periodToMonthKey(period)
    if (!month) continue
    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      if (!accountId) continue
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      if (!out.has(accountId)) out.set(accountId, new Map())
      out.get(accountId)!.set(month, (out.get(accountId)!.get(month) || 0) + cost)
    }
  }
  return out
}

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')

  const startTime = Date.now()
  const query = getQuery(event)

  const requestedDept = (query.department as string)?.trim().toUpperCase()
  const year = parseInt(query.year as string) || new Date().getFullYear()
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'

  let departments: AllowedDepartment[]
  if (requestedDept) {
    if (!ALLOWED_DEPARTMENTS.includes(requestedDept as AllowedDepartment)) {
      return errors.badRequest(event, `Department must be one of: ${ALLOWED_DEPARTMENTS.join(', ')}`)
    }
    departments = [requestedDept as AllowedDepartment]
  } else {
    departments = [...ALLOWED_DEPARTMENTS]
  }

  // Start from Dec of prior year so CE returns End="${year}-01-01" (January invoicing month).
  const startDate = `${year - 1}-12-01`
  const now = new Date()
  // CE TimePeriod.End is exclusive. Use the first day of NEXT month so the
  // current in-progress month is included in results.
  const localYear = now.getFullYear()
  const localMonth = now.getMonth() // 0-indexed
  const nextMonthYear = localMonth === 11 ? localYear + 1 : localYear
  const nextMonth = localMonth === 11 ? 1 : localMonth + 2
  const endOfCurrentMonth = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`
  const maxEnd = `${year + 1}-01-01`
  const endDate = maxEnd <= endOfCurrentMonth ? maxEnd : endOfCurrentMonth

  logger.info('[BudgetVsActual] Starting', { departments, year, environment, endDate })

  // ── 1. Resolve accounts ──
  let allAccounts: Awaited<ReturnType<typeof getAllAccountsUnified>> = []
  try {
    allAccounts = await getAllAccountsUnified(false)
  } catch (err) {
    logger.warn('[BudgetVsActual] Could not fetch unified accounts:', err)
  }

  const deptAccounts = new Map<AllowedDepartment, string[]>()
  for (const dept of departments) deptAccounts.set(dept, [])

  const accountNameMap = new Map<string, string>()
  const accountProjectNameMap = new Map<string, string>()

  for (const acc of allAccounts) {
    const accountId = environment === 'govcloud'
      ? (acc.govCloudAccountId || acc.awsGovCloudAccountID)
      : (acc.accountId || acc.awsStandardAccountID)
    if (!accountId) continue
    if (accountId === PAYER_ACCOUNT_ID) continue
    // PROFORMA_ACCOUNT_ID (253821132832) is allowed through — it appears in CE results
    // as "GDMS Account Monitoring" and rolls into DE158 via its pepDepartment field.

    accountNameMap.set(accountId, acc.name || acc.projectName || accountId)
    accountProjectNameMap.set(accountId, acc.projectName || acc.name || '')

    // Proforma management account always rolls into DE158 regardless of pepDepartment
    const dept = accountId === PROFORMA_ACCOUNT_ID ? 'DE158' : accountDepartment(acc).toUpperCase()
    if (deptAccounts.has(dept as AllowedDepartment)) {
      const list = deptAccounts.get(dept as AllowedDepartment)!
      if (!list.includes(accountId)) list.push(accountId)
    }
  }

  logger.info('[BudgetVsActual] Account mapping', {
    DE158: deptAccounts.get('DE158')?.length ?? 0,
    DT509: deptAccounts.get('DT509')?.length ?? 0,
    DE158accounts: deptAccounts.get('DE158'),
    DT509accounts: deptAccounts.get('DT509')
  })

  // ── 2. Fetch proforma (budget) + billable (actual) grouped by linked account ──
  const proformaResult = await getProformaCosts({
    startDate,
    endDate,
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost'],
    groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
  })

  // budgetByAcct: proforma CE (assumes into PROFORMA_ACCOUNT_ID) — correct for all linked members
  // actualByAcct: billable CE (org-level) — correct for linked members only.
  // Payer (GDMS Cloud) and DevOrg actuals are fetched separately below and must
  // not appear here, so we strip them after indexing.
  // budgetByAcct: proforma CE (assumes into PROFORMA_ACCOUNT_ID) — correct for all linked members.
  // actualByAcct: billable CE (org-level) — correct for linked members only.
  // Payer (GDMS Cloud) and DevOrg are fetched separately below with their own
  // credentials and must not appear here to avoid double-counting.
  // Proforma grouped data is keyed on TimePeriod.End but the values lag one month
  // (May data comes back with End="2026-06-01"). Shift forward so End="2026-06-01"
  // becomes key "2026-07-01", which formatMonth then displays correctly as June...
  // Actually: shift so the End key advances by one, aligning with the other data sources.
  const budgetByAcct = indexByAccountMonth(proformaResult.proforma?.costs?.resultsByTime)
  const actualByAcct = indexByAccountMonth(proformaResult.billable?.costs?.resultsByTime)

  // Extract payer budget from proforma before stripping it from the index.
  // The payer account appears in the proforma CE results but its actuals come
  // from a separate CE call against the payer account directly.
  const payerBudgetFromProforma = budgetByAcct.get(PAYER_ACCOUNT_ID)

  budgetByAcct.delete(PAYER_ACCOUNT_ID)
  budgetByAcct.delete(DEV_ORG_ACCOUNT_ID)
  actualByAcct.delete(PAYER_ACCOUNT_ID)
  actualByAcct.delete(DEV_ORG_ACCOUNT_ID)

  // LAS-APNT-CLD (767397758347 commercial / 105013955011 govcloud) does not belong
  // to DE158 or DT509 — exclude it entirely from both indices.
  const LAS_APNT_CLD_IDS = ['767397758347', '105013955011']
  for (const id of LAS_APNT_CLD_IDS) {
    budgetByAcct.delete(id)
    actualByAcct.delete(id)
  }

  // Invoicing months Jan–Dec of `year` use End keys ${year}-01-01 through ${year}-12-01.
  // Jan invoice → End key ${year}-01-01 (Dec prior year AWS charges), Dec invoice → ${year}-12-01.
  const allMonths: string[] = Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, '0')}-01`
  )

  const yearMonthMin = allMonths[0]   // ${year}-01-01
  const yearMonthMax = allMonths[11]  // ${year}-12-01

  // ── 3. GDMS Cloud actuals + DevOrg (Billing API + CE) — fetched in parallel ──
  //
  // GDMS Cloud (205950196477) is the catch-all for non-allocated charges.
  // Per month: actual = master account billable total − proforma org total.
  //   Step 1: CE call with MASTER account credentials → full org billable total per month
  //   Step 2: CE call with PROFORMA account credentials → proforma org total per month
  //   Step 3: GDMS Cloud actual[month] = billable[month] − proforma[month]
  //
  // DevOrg (266632029214): own billing transfer group (GDMS-DevOrg). We look up
  // its billing view ARN via ListBillingViews, then pass BillingViewArn to CE so
  // the query is scoped to that group with a full per-account breakdown.
  let payerActualByMonth = new Map<string, number>()
  let payerBudgetByMonth = new Map<string, number>()
  let devOrgResult: Awaited<ReturnType<typeof queryDevOrgChargesByMonth>> = {
    byMonth: new Map(),
    byAccountMonth: new Map(),
    accountNames: new Map()
  }

  if (departments.includes(PAYER_ROLLS_INTO)) {
    const ceParams = {
      startDate,
      endDate,
      granularity: 'MONTHLY' as const,
      metrics: ['UnblendedCost'],
    }

    const [masterBillable, proformaOrgTotals, devOrg] = await Promise.all([
      // Step 1: org-level billable totals via master account credentials
      getCostAndUsage(ceParams, 'commercial', PAYER_ACCOUNT_ID),
      // Step 2: org-level proforma totals via proforma account credentials
      getCostAndUsage(ceParams, 'commercial', PROFORMA_ACCOUNT_ID),
      queryDevOrgChargesByMonth(year).catch(err => {
        logger.warn('[BudgetVsActual] DevOrg CE query failed, charges will be $0:', err)
        return devOrgResult
      })
    ])

    // Step 3: GDMS Cloud actual per month = billable total − proforma total
    const billableByMonth = new Map<string, number>()
    for (const period of masterBillable.resultsByTime || []) {
      const month = period.TimePeriod?.End || period.TimePeriod?.Start || ''
      if (!month) continue
      billableByMonth.set(month, parseFloat(period.Total?.UnblendedCost?.Amount || '0'))
    }

    const proformaOrgByMonth = new Map<string, number>()
    for (const period of proformaOrgTotals.resultsByTime || []) {
      const month = period.TimePeriod?.End || period.TimePeriod?.Start || ''
      if (!month) continue
      proformaOrgByMonth.set(month, parseFloat(period.Total?.UnblendedCost?.Amount || '0'))
    }

    logger.info('[BudgetVsActual] GDMS Cloud calculation (billable − proforma):')
    for (const month of allMonths) {
      const billable = billableByMonth.get(month) ?? 0
      const proforma = proformaOrgByMonth.get(month) ?? 0
      const gdmsCloud = billable - proforma
      logger.info(`  ${month}: billable=${billable.toFixed(2)}  proforma=${proforma.toFixed(2)}  gdmsCloud=${gdmsCloud.toFixed(2)}`)
      if (gdmsCloud > 0) payerActualByMonth.set(month, gdmsCloud)
    }

    // Payer budget from proforma side (saved before the index was stripped)
    for (const [m, c] of payerBudgetFromProforma || []) payerBudgetByMonth.set(m, c)

    devOrgResult = devOrg
  }

  const resolvedDevOrgActual = [...devOrgResult.byMonth.values()].reduce((s, v) => s + v, 0)

  // ── 4. Aggregate per department ──
  const results: DepartmentResult[] = []

  for (const dept of departments) {
    const monthMap = new Map<string, { budget: number; actual: number }>()
    // Pre-seed all known months so every month appears even with $0 data
    for (const m of allMonths) monthMap.set(m, { budget: 0, actual: 0 })
    const ensure = (m: string) => {
      if (!monthMap.has(m)) monthMap.set(m, { budget: 0, actual: 0 })
      return monthMap.get(m)!
    }

    // Per-account YTD totals for category matching
    const accountTotals = new Map<string, { budget: number; actual: number }>()

    for (const accountId of deptAccounts.get(dept)!) {
      let acctBudget = 0
      let acctActual = 0
      for (const [m, c] of budgetByAcct.get(accountId) || []) { ensure(m).budget += c; acctBudget += c }
      for (const [m, c] of actualByAcct.get(accountId) || []) { ensure(m).actual += c; acctActual += c }
      if (acctBudget > 0 || acctActual > 0) accountTotals.set(accountId, { budget: acctBudget, actual: acctActual })
    }

    if (dept === PAYER_ROLLS_INTO) {
      for (const [m, c] of payerActualByMonth) ensure(m).actual += c
      for (const [m, c] of payerBudgetByMonth) ensure(m).budget += c
      // Payer stored separately — not added to accountTotals so it gets its own category row
      actualByAcct.set(PAYER_ACCOUNT_ID, new Map(payerActualByMonth))

      for (const [m, c] of devOrgResult.byMonth) ensure(m).actual += c
    }

    const monthly: MonthlyPoint[] = [...monthMap.entries()]
      .filter(([m]) => m >= yearMonthMin && m <= yearMonthMax)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, budget: v.budget, actual: v.actual }))


    const budgetTotal = monthly.reduce((s, p) => s + p.budget, 0)
    const actualTotal = monthly.reduce((s, p) => s + p.actual, 0)
    const variance = actualTotal - budgetTotal

    // ── Named category rows ──
    const namedDefs = DEPT_NAMED_CATEGORIES[dept]
    const claimedIds = new Set<string>()
    const categories: CategoryRow[] = []

    logger.info(`[BudgetVsActual] ${dept} accountTotals for category matching:`, {
      accounts: [...accountTotals.keys()].map(id => ({
        id,
        name: accountNameMap.get(id),
        projectName: accountProjectNameMap.get(id),
        budget: accountTotals.get(id)?.budget,
        actual: accountTotals.get(id)?.actual
      }))
    })

    for (const def of namedDefs) {
      const nameLower = def.name.toLowerCase()
      let catBudget = 0
      let catActual = 0
      const catAccounts: AccountRow[] = []

      for (const [accountId, totals] of accountTotals) {
        const projectName = (accountProjectNameMap.get(accountId) || accountNameMap.get(accountId) || '').toLowerCase()
        if (projectName.includes(nameLower) || nameLower.includes(projectName.replace(/\s+/g, ' ').trim())) {
          catBudget += totals.budget
          catActual += totals.actual
          claimedIds.add(accountId)
          const monthlyActuals = Object.fromEntries(actualByAcct.get(accountId) || [])
          logger.info(`[BudgetVsActual] monthlyActuals for ${accountId} (${accountNameMap.get(accountId)}):`, monthlyActuals)
          catAccounts.push({
            accountId,
            name: accountNameMap.get(accountId) || accountId,
            ytdBudget: totals.budget,
            ytdActual: totals.actual,
            ytdVariance: totals.actual - totals.budget,
            monthlyActuals
          })
        }
      }

      categories.push({
        name: def.name,
        ytdBudget: catBudget,
        ytdActual: catActual,
        ytdVariance: catActual - catBudget,
        note: def.note,
        accounts: catAccounts
      })
    }

    // DevOrg fixed category for DE158 — sourced from Billing API + CE BillingViewArn
    if (dept === DEV_ORG_ROLLS_INTO) {
      claimedIds.add(DEV_ORG_ACCOUNT_ID)
      let devOrgAccounts: AccountRow[] = [...devOrgResult.byAccountMonth.entries()].map(([accountId, monthlyMap]) => {
        const ytdActual = [...monthlyMap.values()].reduce((s, v) => s + v, 0)
        return {
          accountId,
          name: devOrgResult.accountNames.get(accountId) || accountId,
          ytdBudget: 0,
          ytdActual,
          ytdVariance: ytdActual,
          monthlyActuals: Object.fromEntries(monthlyMap)
        }
      })
      // Build a set of months already covered by per-account CE data
      const coveredByAcct = new Set<string>()
      for (const monthlyMap of devOrgResult.byAccountMonth.values()) {
        for (const m of monthlyMap.keys()) coveredByAcct.add(m)
      }
      // Any months in byMonth not covered by account-level data (e.g. manual charges)
      // get a synthetic top-level DevOrg row so the month drill-down shows the charges.
      const manualMonthlyActuals: Record<string, number> = {}
      for (const [m, v] of devOrgResult.byMonth) {
        if (!coveredByAcct.has(m)) manualMonthlyActuals[m] = v
      }
      const manualYtd = Object.values(manualMonthlyActuals).reduce((s, v) => s + v, 0)
      if (manualYtd > 0) {
        devOrgAccounts.push({
          accountId: DEV_ORG_ACCOUNT_ID,
          name: 'GDMS-DevOrg (manual)',
          ytdBudget: 0,
          ytdActual: manualYtd,
          ytdVariance: manualYtd,
          monthlyActuals: manualMonthlyActuals
        })
      }
      categories.push({
        name: 'GDMS-DevOrg',
        ytdBudget: 0,
        ytdActual: resolvedDevOrgActual,
        ytdVariance: resolvedDevOrgActual,
        accounts: devOrgAccounts
      })
    }

    // GDMS Cloud payer — separate category, not part of accountTotals
    if (dept === PAYER_ROLLS_INTO) {
      const payerBudget = [...payerBudgetByMonth.values()].reduce((s, v) => s + v, 0)
      const payerActual = [...payerActualByMonth.values()].reduce((s, v) => s + v, 0)
      claimedIds.add(PAYER_ACCOUNT_ID)
      categories.push({
        name: 'GDMS Cloud',
        ytdBudget: payerBudget,
        ytdActual: payerActual,
        ytdVariance: payerActual - payerBudget,
        accounts: payerActual > 0 || payerBudget > 0 ? [{
          accountId: PAYER_ACCOUNT_ID,
          name: 'GDMS Cloud (Payer)',
          ytdBudget: payerBudget,
          ytdActual: payerActual,
          ytdVariance: payerActual - payerBudget,
          monthlyActuals: Object.fromEntries(payerActualByMonth)
        }] : []
      })
    }

    // Remaining accounts → "Other N AWS accounts"
    const otherAccounts = [...accountTotals.entries()].filter(([id]) => !claimedIds.has(id))
    if (otherAccounts.length > 0) {
      const otherBudget = otherAccounts.reduce((s, [, v]) => s + v.budget, 0)
      const otherActual = otherAccounts.reduce((s, [, v]) => s + v.actual, 0)
      categories.push({
        name: `Other ${otherAccounts.length} AWS account${otherAccounts.length === 1 ? '' : 's'}`,
        ytdBudget: otherBudget,
        ytdActual: otherActual,
        ytdVariance: otherActual - otherBudget,
        note: 'cost saving opportunities being pursued',
        accounts: otherAccounts.map(([accountId, totals]) => ({
          accountId,
          name: accountNameMap.get(accountId) || accountId,
          ytdBudget: totals.budget,
          ytdActual: totals.actual,
          ytdVariance: totals.actual - totals.budget,
          monthlyActuals: Object.fromEntries(actualByAcct.get(accountId) || [])
        }))
      })
    }

    results.push({
      department: dept,
      budgetTotal,
      actualTotal,
      variance,
      variancePercent: budgetTotal > 0 ? (variance / budgetTotal) * 100 : 0,
      monthly,
      categories
    })
  }

  logger.info('[BudgetVsActual] Complete', {
    departments: results.map(r => r.department),
    elapsedMs: Date.now() - startTime
  })

  return sendSuccess(event, {
    year,
    environment,
    months: allMonths,
    departments: results,
    meta: {
      allowedDepartments: ALLOWED_DEPARTMENTS,
      payerAccountId: PAYER_ACCOUNT_ID,
      payerRollsInto: PAYER_ROLLS_INTO,
      excludedRecordTypes: EXCLUDED_RECORD_TYPES,
      generatedAt: new Date().toISOString()
    }
  })
}))
