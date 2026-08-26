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
 *   DE158, DT509, DT328
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
import { CLASSIFIED_CLOUD_CHARGES_2026 } from '../../utils/classified-cloud-charges'
import { getAnnualBudgetArray } from '../../../shared/utils/budget-utils'

// Departments this report is scoped to. Kept explicit per Finance's request.
const ALLOWED_DEPARTMENTS = ['DE158', 'DT509', 'DT328'] as const
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
  ],
  DT328: []
}

interface MonthlyPoint {
  month: string
  budget: number
  actual: number
}

// Accounts whose PEP records are being created but don't have budgets yet.
// Their proforma allocation is treated as $0 plan and flows back to GDMS Cloud residual.
const PENDING_PEP_NAME_FRAGMENTS = [
  'gdms account monitoring',
  'gdms amibuilder',
  'gdms account auditing',
]

interface AccountRow {
  accountId: string
  name: string
  ytdBudget: number
  ytdActual: number
  ytdVariance: number
  monthlyActuals: Record<string, number>
  pepExpectedSpend?: number
  pepMonthlyExpected?: Record<string, number> // CE month key (YYYY-MM-01) → pep value
  pendingPep?: boolean // true = PEP record in progress, no historical budget; show $0 plan with explanation
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
  const accountPepMonthlyMap = new Map<string, string>() // accountId → pepBudget2026Monthly JSON

  for (const acc of allAccounts) {
    const accountId = environment === 'govcloud'
      ? (acc.govCloudAccountId || acc.awsGovCloudAccountID)
      : (acc.accountId || acc.awsStandardAccountID)
    if (!accountId) continue
    if (accountId === PAYER_ACCOUNT_ID) continue
    if (accountId === '110317593805') continue // Dance Monkey — decommissioned, pre-chargeback
    // PROFORMA_ACCOUNT_ID (253821132832) is allowed through — it appears in CE results
    // as "GDMS Account Monitoring" and rolls into DE158 via its pepDepartment field.

    accountNameMap.set(accountId, acc.name || acc.projectName || accountId)
    accountProjectNameMap.set(accountId, acc.projectName || acc.name || '')
    if (acc.pepBudget2026Monthly) accountPepMonthlyMap.set(accountId, acc.pepBudget2026Monthly)

    // Proforma management account always rolls into DE158 regardless of pepDepartment
    const dept = accountId === PROFORMA_ACCOUNT_ID ? 'DE158' : accountDepartment(acc).toUpperCase()
    if (deptAccounts.has(dept as AllowedDepartment)) {
      const list = deptAccounts.get(dept as AllowedDepartment)!
      if (!list.includes(accountId)) list.push(accountId)
    }
  }

  // Accounts whose PEP records are being built but have no historical budget data yet.
  // We zero out their plan and exclude their proforma allocation from linkedAccountBudgetByMonth
  // so the budget flows back to GDMS Cloud's residual rather than appearing as perfect tracking.
  const pendingPepAccountIds = new Set<string>()
  for (const [accountId, name] of accountNameMap) {
    const nameLower = name.toLowerCase()
    if (
      !accountPepMonthlyMap.has(accountId) &&
      PENDING_PEP_NAME_FRAGMENTS.some(frag => nameLower.includes(frag))
    ) {
      pendingPepAccountIds.add(accountId)
    }
  }
  if (pendingPepAccountIds.size) {
    logger.info('[BudgetVsActual] Pending PEP accounts (plan zeroed, proforma to GDMS Cloud):', [...pendingPepAccountIds].map(id => `${id} (${accountNameMap.get(id)})`))
  }

  logger.info('[BudgetVsActual] Account mapping', {
    DE158: deptAccounts.get('DE158')?.length ?? 0,
    DT509: deptAccounts.get('DT509')?.length ?? 0,
    DT328: deptAccounts.get('DT328')?.length ?? 0,
    DE158accounts: deptAccounts.get('DE158'),
    DT509accounts: deptAccounts.get('DT509')
    ,DT328accounts: deptAccounts.get('DT328')
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

  // Sum all linked account proforma budgets per month (before stripping exclusions).
  // Pending-PEP accounts are intentionally excluded: their proforma allocation stays in
  // GDMS Cloud's residual so GDMS Cloud absorbs it rather than those rows showing $0 plan
  // with the budget perfectly matching actual.
  const linkedAccountBudgetByMonth = new Map<string, number>()
  for (const [accountId, acctMonths] of budgetByAcct) {
    if (pendingPepAccountIds.has(accountId)) continue
    for (const [month, cost] of acctMonths) {
      linkedAccountBudgetByMonth.set(month, (linkedAccountBudgetByMonth.get(month) || 0) + cost)
    }
  }

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

  // Dance Monkey AWS account (110317593805) — decommissioned account previously assigned
  // to DE158 before the chargeback billing model switchover. Exclude from all reporting.
  budgetByAcct.delete('110317593805')
  actualByAcct.delete('110317593805')

  // Invoicing months Jan–Dec of `year` use End keys ${year}-01-01 through ${year}-12-01.
  // Jan invoice → End key ${year}-01-01 (Dec prior year AWS charges), Dec invoice → ${year}-12-01.
  const allMonths: string[] = Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, '0')}-01`
  )

  const yearMonthMin = allMonths[0]   // ${year}-01-01
  const yearMonthMax = allMonths[11]  // ${year}-12-01

  // YTD cap: include up to and including the current month, exclude future months.
  // CE End keys are YYYY-MM-01. The current month key is the first day of now's month.
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  // Cap to the year being viewed — don't exceed Dec of selected year
  const ytdMonthMax = currentMonthKey > yearMonthMax ? yearMonthMax : currentMonthKey

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
  const payerActualByMonth = new Map<string, number>()
  const payerBudgetByMonth = new Map<string, number>()
  const enterpriseSupportActualByMonth = new Map<string, number>()
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

    const [masterBillable, proformaOrgTotals, devOrg, enterpriseSupportRaw] = await Promise.all([
      // Step 1: org-level billable totals via master account credentials
      getCostAndUsage(ceParams, 'commercial', PAYER_ACCOUNT_ID),
      // Step 2: org-level proforma totals via proforma account credentials
      getCostAndUsage(ceParams, 'commercial', PROFORMA_ACCOUNT_ID),
      queryDevOrgChargesByMonth(year).catch(err => {
        logger.warn('[BudgetVsActual] DevOrg CE query failed, charges will be $0:', err)
        return devOrgResult
      }),
      // Step 4: Enterprise Support billed to payer — extracted separately so it gets its own category
      getCostAndUsage({
        ...ceParams,
        groupBy: [{ type: 'DIMENSION', key: 'SERVICE' }],
        filter: { Dimensions: { Key: 'SERVICE', Values: ['AWS Support (Enterprise)'] } }
      }, 'commercial', PAYER_ACCOUNT_ID).catch(err => {
        logger.warn('[BudgetVsActual] Enterprise Support CE query failed:', err)
        return { resultsByTime: [] }
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

    // Build Enterprise Support by month from the grouped CE response
    const enterpriseSupportByMonth = enterpriseSupportActualByMonth
    for (const period of enterpriseSupportRaw.resultsByTime || []) {
      const month = period.TimePeriod?.End || period.TimePeriod?.Start || ''
      if (!month) continue
      const cost = (period.Groups || []).reduce((s: number, g: any) =>
        s + parseFloat(g.Metrics?.UnblendedCost?.Amount || '0'), 0)
        || parseFloat(period.Total?.UnblendedCost?.Amount || '0')
      if (cost > 0) enterpriseSupportByMonth.set(month, cost)
    }

    logger.info('[BudgetVsActual] proformaOrgByMonth:', Object.fromEntries(proformaOrgByMonth))
    logger.info('[BudgetVsActual] linkedAccountBudgetByMonth:', Object.fromEntries(linkedAccountBudgetByMonth))
    logger.info('[BudgetVsActual] GDMS Cloud calculation (billable − proforma − enterprise support):')
    for (const month of allMonths) {
      const billable = billableByMonth.get(month) ?? 0
      const proforma = proformaOrgByMonth.get(month) ?? 0
      const entSupport = enterpriseSupportByMonth.get(month) ?? 0
      // GDMS Cloud actual = payer charges not allocated to linked accounts, minus Enterprise Support
      // (which gets its own category row). Savings plan fees are excluded by EXCLUDED_RECORD_TYPES.
      const gdmsCloudActual = billable - proforma - entSupport
      // GDMS Cloud budget = same residual on the proforma side: org proforma total minus what
      // proforma allocated to linked accounts, minus Enterprise Support hardcoded budget.
      // proformaLinked = sum of linked account proforma budgets for this month (pre-strip).
      const proformaLinked = linkedAccountBudgetByMonth.get(month) ?? 0
      const ENT_SUPPORT_MONTHLY_BUDGET = 56900
      const gdmsCloudBudget = Math.max(0, proforma - proformaLinked - ENT_SUPPORT_MONTHLY_BUDGET)
      logger.info(`  ${month}: billable=${billable.toFixed(2)}  proforma=${proforma.toFixed(2)}  proformaLinked=${proformaLinked.toFixed(2)}  entSupport=${entSupport.toFixed(2)}  gdmsCloudActual=${gdmsCloudActual.toFixed(2)}  gdmsCloudBudget=${gdmsCloudBudget.toFixed(2)}`)
      if (gdmsCloudActual > 0) payerActualByMonth.set(month, gdmsCloudActual)
      if (gdmsCloudBudget > 0) payerBudgetByMonth.set(month, gdmsCloudBudget)
    }

    // Payer budget from proforma side (saved before the index was stripped)
    for (const [m, c] of payerBudgetFromProforma || []) payerBudgetByMonth.set(m, c)

    devOrgResult = devOrg
  }

  const resolvedDevOrgActual = [...devOrgResult.byMonth.entries()]
    .filter(([m]) => m >= yearMonthMin && m <= ytdMonthMax)
    .reduce((s, [, v]) => s + v, 0)

  // Compute pep expected spend fields for an account given the months that have actual data.
  // Only covers months present in monthlyActuals so it stays in sync with what's been billed.
  function calcPepFields(accountId: string, monthlyActuals: Record<string, number>): { pepExpectedSpend: number; pepMonthlyExpected: Record<string, number> } | undefined {
    const pepJson = accountPepMonthlyMap.get(accountId)
    if (!pepJson) return undefined
    const { monthlyArray } = getAnnualBudgetArray({ pepBudget2026Monthly: pepJson })
    const pepMonthlyExpected: Record<string, number> = {}
    let pepExpectedSpend = 0
    for (const m of Object.keys(monthlyActuals).filter(m => m >= yearMonthMin && m <= ytdMonthMax)) {
      const idx = parseInt(m.split('-')[1]) - 1
      const val = monthlyArray[idx] ?? 0
      pepMonthlyExpected[m] = val
      pepExpectedSpend += val
    }
    return { pepExpectedSpend, pepMonthlyExpected }
  }

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

      // Collect months with actual data first so pep budget aligns to the same months
      const acctActualMonths = new Set<string>()
      for (const [m, c] of actualByAcct.get(accountId) || []) {
        ensure(m).actual += c
        if (m >= yearMonthMin && m <= ytdMonthMax) {
          acctActual += c
          acctActualMonths.add(m)
        }
      }

      const pepJson = accountPepMonthlyMap.get(accountId)
      if (pendingPepAccountIds.has(accountId)) {
        // PEP in progress — no historical budget. Show $0 plan; proforma stays in GDMS Cloud residual.
      } else if (pepJson) {
        // Use pep values as the plan — only for months with actual data
        const { monthlyArray } = getAnnualBudgetArray({ pepBudget2026Monthly: pepJson })
        for (const m of acctActualMonths) {
          const idx = parseInt(m.split('-')[1]) - 1
          const pepVal = monthlyArray[idx] ?? 0
          ensure(m).budget += pepVal
          acctBudget += pepVal
        }
      } else {
        // Fall back to proforma budget
        for (const [m, c] of budgetByAcct.get(accountId) || []) {
          ensure(m).budget += c
          if (m >= yearMonthMin && m <= ytdMonthMax) acctBudget += c
        }
      }

      if (acctBudget > 0 || acctActual > 0) accountTotals.set(accountId, { budget: acctBudget, actual: acctActual })
    }

    if (dept === PAYER_ROLLS_INTO) {
      for (const [m, c] of payerActualByMonth) ensure(m).actual += c
      for (const [m, c] of payerBudgetByMonth) ensure(m).budget += c
      // Payer stored separately — not added to accountTotals so it gets its own category row
      actualByAcct.set(PAYER_ACCOUNT_ID, new Map(payerActualByMonth))

      // Enterprise Support is subtracted from GDMS Cloud but still counts toward dept actual
      for (const [m, c] of enterpriseSupportActualByMonth) ensure(m).actual += c

      for (const [m, c] of devOrgResult.byMonth) ensure(m).actual += c

      // Secret Cloud — not accessible via CE; actuals provided directly by Finance
      const classifiedCharges = year === 2026 ? CLASSIFIED_CLOUD_CHARGES_2026 : {}
      for (const [m, c] of Object.entries(classifiedCharges)) ensure(m).actual += c
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
      // Enterprise Support is a service charge on the payer account, not an account itself.
      // Extract it directly from the CE service query rather than account name matching.
      if (def.name === 'Enterprise Support') {
        const ENT_SUPPORT_MONTHLY_BUDGET = 56900
        const entMonthlyActuals: Record<string, number> = Object.fromEntries(
          [...enterpriseSupportActualByMonth.entries()].filter(([m]) => m >= yearMonthMin && m <= ytdMonthMax)
        )
        const entYtdActual = Object.values(entMonthlyActuals).reduce((s, v) => s + v, 0)
        const entYtdBudget = Object.keys(entMonthlyActuals).length * ENT_SUPPORT_MONTHLY_BUDGET
        categories.push({
          name: def.name,
          ytdBudget: entYtdBudget,
          ytdActual: entYtdActual,
          ytdVariance: entYtdActual - entYtdBudget,
          note: def.note,
          accounts: entYtdActual > 0 ? [{
            accountId: PAYER_ACCOUNT_ID,
            name: 'Enterprise Support',
            ytdBudget: entYtdBudget,
            ytdActual: entYtdActual,
            ytdVariance: entYtdActual - entYtdBudget,
            monthlyActuals: entMonthlyActuals
          }] : []
        })
        continue
      }

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
          const pepFields = calcPepFields(accountId, monthlyActuals)
          catAccounts.push({
            accountId,
            name: accountNameMap.get(accountId) || accountId,
            ytdBudget: totals.budget,
            ytdActual: totals.actual,
            ytdVariance: totals.actual - totals.budget,
            monthlyActuals,
            ...pepFields
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

    // DevOrg fixed category for DE158 — $10,000/month hardcoded budget, actuals from Billing API + CE
    if (dept === DEV_ORG_ROLLS_INTO) {
      claimedIds.add(DEV_ORG_ACCOUNT_ID)
      const DEV_ORG_MONTHLY_BUDGET = 10000
      // Only include months that have actual data (same as other accounts — no future months)
      const monthsWithDevOrgData = allMonths.filter(m => m <= ytdMonthMax && devOrgResult.byMonth.has(m))
      const devOrgMonthlyActuals: Record<string, number> = Object.fromEntries(
        monthsWithDevOrgData.map(m => [m, devOrgResult.byMonth.get(m) ?? 0])
      )
      const devOrgYtdBudget = monthsWithDevOrgData.length * DEV_ORG_MONTHLY_BUDGET
      categories.push({
        name: 'GDMS-DevOrg',
        ytdBudget: devOrgYtdBudget,
        ytdActual: resolvedDevOrgActual,
        ytdVariance: resolvedDevOrgActual - devOrgYtdBudget,
        accounts: [{
          accountId: DEV_ORG_ACCOUNT_ID,
          name: 'GDMS-DevOrg',
          ytdBudget: devOrgYtdBudget,
          ytdActual: resolvedDevOrgActual,
          ytdVariance: resolvedDevOrgActual - devOrgYtdBudget,
          monthlyActuals: devOrgMonthlyActuals
        }]
      })
    }

    // Secret Cloud — hardcoded Finance-supplied actuals, no plan available
    if (dept === DEV_ORG_ROLLS_INTO) {
      const classifiedCharges = year === 2026 ? CLASSIFIED_CLOUD_CHARGES_2026 : {}
      const classifiedMonthlyActuals: Record<string, number> = Object.fromEntries(
        Object.entries(classifiedCharges).filter(([m]) => m >= yearMonthMin && m <= ytdMonthMax)
      )
      const classifiedYtdActual = Object.values(classifiedMonthlyActuals).reduce((s, v) => s + v, 0)
      if (classifiedYtdActual > 0) {
        categories.push({
          name: 'Secret Cloud',
          ytdBudget: 0,
          ytdActual: classifiedYtdActual,
          ytdVariance: classifiedYtdActual,
          note: 'Finance-supplied actuals — not accessible via Cost Explorer',
          accounts: [{
            accountId: 'classified',
            name: 'Secret Cloud',
            ytdBudget: 0,
            ytdActual: classifiedYtdActual,
            ytdVariance: classifiedYtdActual,
            monthlyActuals: classifiedMonthlyActuals
          }]
        })
      }
    }

    // Remaining accounts — each gets its own category row, sorted by largest YTD variance (absolute)
    const otherAccounts = [...accountTotals.entries()]
      .filter(([id]) => !claimedIds.has(id))
      .sort(([, a], [, b]) => Math.abs(b.actual - b.budget) - Math.abs(a.actual - a.budget))
    for (const [accountId, totals] of otherAccounts) {
      const monthlyActuals = Object.fromEntries(actualByAcct.get(accountId) || [])
      const pepFields = calcPepFields(accountId, monthlyActuals)
      const isPendingPep = pendingPepAccountIds.has(accountId)
      const acctRow: AccountRow = {
        accountId,
        name: accountNameMap.get(accountId) || accountId,
        ytdBudget: totals.budget,
        ytdActual: totals.actual,
        ytdVariance: totals.actual - totals.budget,
        monthlyActuals,
        ...pepFields,
        ...(isPendingPep ? { pendingPep: true } : {})
      }
      categories.push({
        name: accountNameMap.get(accountId) || accountId,
        ytdBudget: totals.budget,
        ytdActual: totals.actual,
        ytdVariance: totals.actual - totals.budget,
        accounts: [acctRow]
      })
    }

    // GDMS Cloud payer — budget = DE158 total plan minus the sum of all linked account proforma
    // budgets (named cats + other accounts). DevOrg is excluded — it's not a proforma account.
    // budgetTotal already includes payerBudgetByMonth, so stripping linked account budgets
    // and DevOrg leaves the remainder for GDMS Cloud.
    if (dept === PAYER_ROLLS_INTO) {
      const payerActual = [...payerActualByMonth.entries()].filter(([m]) => m >= yearMonthMin && m <= ytdMonthMax).reduce((s, [, v]) => s + v, 0)
      // GDMS Cloud budget = YTD dept budget total minus all other category budgets (residual).
      const ytdDeptBudget = monthly.filter(m => m.month >= yearMonthMin && m.month <= ytdMonthMax).reduce((s, m) => s + m.budget, 0)
      // Exclude hardcoded-budget categories (Enterprise Support, GDMS-DevOrg) — their budgets
      // are not sourced from monthMap so subtracting them would make the residual go negative.
      const HARDCODED_CATS = new Set(['Enterprise Support', 'GDMS-DevOrg', 'Secret Cloud'])
      const linkedCategoryBudgets = categories.filter(c => !HARDCODED_CATS.has(c.name)).reduce((s, c) => s + c.ytdBudget, 0)
      const gdmsCloudBudget = Math.max(0, ytdDeptBudget - linkedCategoryBudgets)
      logger.info('[BudgetVsActual] GDMS Cloud budget:', { ytdDeptBudget, linkedCategoryBudgets, gdmsCloudBudget, payerActual })
      claimedIds.add(PAYER_ACCOUNT_ID)
      categories.push({
        name: 'GDMS Cloud',
        ytdBudget: gdmsCloudBudget,
        ytdActual: payerActual,
        ytdVariance: payerActual - gdmsCloudBudget,
        accounts: payerActual > 0 || gdmsCloudBudget > 0 ? [{
          accountId: PAYER_ACCOUNT_ID,
          name: 'GDMS Cloud (Payer)',
          ytdBudget: gdmsCloudBudget,
          ytdActual: payerActual,
          ytdVariance: payerActual - gdmsCloudBudget,
          monthlyActuals: Object.fromEntries(payerActualByMonth)
        }] : []
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
