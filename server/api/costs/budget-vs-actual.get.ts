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
 * - The GDMS Cloud payer account 205950196477 is the org payer and is therefore
 *   NOT a linked account inside the proforma billing group. Its *actual* spend
 *   does not appear in the per-account proforma/billable comparison. For this
 *   report the payer's actuals are fetched separately and rolled into DE158.
 * - "Saving Plan Recurring Fee" RECORD_TYPE charges are excluded from the
 *   payer actuals so the comparison reflects consumption, not SP amortization.
 */

import { defineEventHandler, getQuery } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getCostAndUsage, getProformaCosts } from '../../utils/cost-explorer'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { requirePermission } from '../../utils/user-roles'
import { logger } from '../../utils/logger'

// Departments this report is scoped to. Kept explicit per Finance's request.
const ALLOWED_DEPARTMENTS = ['DE158', 'DT509'] as const
type AllowedDepartment = typeof ALLOWED_DEPARTMENTS[number]

// Org payer / master account. Its actuals roll into DE158 (special case).
const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const PAYER_ROLLS_INTO: AllowedDepartment = 'DE158'

// Proforma (Billing Conductor) account — never a linked member account.
const PROFORMA_ACCOUNT_ID = process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'

// RECORD_TYPE (charge type) value to exclude from payer actuals.
// Cost Explorer's RECORD_TYPE dimension stores the savings-plan recurring charge
// as the no-spaces token 'SavingsPlanRecurringFee' (matches CUR line_item_type).
// If GDMS Cost Explorer ever surfaces a different spelling, correct this constant.
const EXCLUDED_RECORD_TYPE = 'SavingsPlanRecurringFee'

interface MonthlyPoint {
  month: string
  budget: number
  actual: number
}

interface DepartmentResult {
  department: AllowedDepartment
  budgetTotal: number
  actualTotal: number
  variance: number          // actual - budget (positive = over budget)
  variancePercent: number   // variance / budget * 100
  monthly: MonthlyPoint[]
}

/**
 * Resolve the department code for an account using the same precedence the
 * rest of the dashboard uses (useSidebarGroups / proforma endpoint):
 *   pepDepartment -> departmentNumber -> department
 */
function accountDepartment(acc: any): string {
  return (acc.pepDepartment || acc.departmentNumber || acc.department || '').trim()
}

/** Map an AWS resultsByTime structure (grouped by LINKED_ACCOUNT) into
 * { accountId -> { month -> cost } }. */
function indexByAccountMonth(resultsByTime: any[] | undefined): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  if (!resultsByTime) return out
  for (const period of resultsByTime) {
    const month = period.TimePeriod?.Start || ''
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
  // ── Server-side authorization (the page-level guard is client-only) ──
  await requirePermission(event, 'costs.budget_vs_actual')

  const startTime = Date.now()
  const query = getQuery(event)

  const requestedDept = (query.department as string)?.trim().toUpperCase()
  const year = parseInt(query.year as string) || new Date().getFullYear()
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'

  // Validate requested department against the allowed set.
  let departments: AllowedDepartment[]
  if (requestedDept) {
    if (!ALLOWED_DEPARTMENTS.includes(requestedDept as AllowedDepartment)) {
      return errors.badRequest(
        event,
        `Department must be one of: ${ALLOWED_DEPARTMENTS.join(', ')}`
      )
    }
    departments = [requestedDept as AllowedDepartment]
  } else {
    departments = [...ALLOWED_DEPARTMENTS]
  }

  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  logger.info('[BudgetVsActual] Starting', { departments, year, environment })

  // ── 1. Resolve accounts for the requested departments ──
  const allAccounts = await getAllAccountsUnified(false)

  // Build dept -> [accountId] map (excluding payer/proforma synthetic accounts).
  const deptAccounts = new Map<AllowedDepartment, string[]>()
  for (const dept of departments) deptAccounts.set(dept, [])

  for (const acc of allAccounts) {
    const accountId = environment === 'govcloud'
      ? (acc.govCloudAccountId || acc.awsGovCloudAccountID)
      : (acc.accountId || acc.awsStandardAccountID)
    if (!accountId) continue
    if (accountId === PAYER_ACCOUNT_ID || accountId === PROFORMA_ACCOUNT_ID) continue

    const dept = accountDepartment(acc).toUpperCase()
    if (deptAccounts.has(dept as AllowedDepartment)) {
      deptAccounts.get(dept as AllowedDepartment)!.push(accountId)
    }
  }

  // ── 2. Fetch proforma (budget) + billable (actual) for the whole org, monthly ──
  // getProformaCosts groups by LINKED_ACCOUNT and returns both sides.
  const proformaResult = await getProformaCosts({
    startDate,
    endDate,
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost'],
    groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
  })

  const budgetByAcct = indexByAccountMonth(proformaResult.proforma?.costs?.resultsByTime)
  const actualByAcct = indexByAccountMonth(proformaResult.billable?.costs?.resultsByTime)

  // ── 3. Payer special-case: fetch payer actuals separately, excluding SP fee ──
  // The payer (205950196477) is the org payer, not a proforma linked account,
  // so its actuals are absent above. Fetch directly and roll into DE158.
  let payerActualByMonth = new Map<string, number>()
  if (departments.includes(PAYER_ROLLS_INTO)) {
    const payerActuals = await getCostAndUsage(
      {
        startDate,
        endDate,
        granularity: 'MONTHLY',
        metrics: ['UnblendedCost'],
        filter: {
          And: [
            { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [PAYER_ACCOUNT_ID] } },
            { Not: { Dimensions: { Key: 'RECORD_TYPE', Values: [EXCLUDED_RECORD_TYPE] } } }
          ]
        }
      },
      environment
    )
    // No GroupBy here -> read root totals per period.
    for (const period of payerActuals.resultsByTime || []) {
      const month = period.TimePeriod?.Start || ''
      if (!month) continue
      const cost = parseFloat(period.Total?.UnblendedCost?.Amount || '0')
      payerActualByMonth.set(month, cost)
    }
  }

  // ── 4. Aggregate per department ──
  const results: DepartmentResult[] = []

  for (const dept of departments) {
    const monthMap = new Map<string, { budget: number; actual: number }>()
    const ensure = (m: string) => {
      if (!monthMap.has(m)) monthMap.set(m, { budget: 0, actual: 0 })
      return monthMap.get(m)!
    }

    for (const accountId of deptAccounts.get(dept)!) {
      for (const [m, c] of budgetByAcct.get(accountId) || []) ensure(m).budget += c
      for (const [m, c] of actualByAcct.get(accountId) || []) ensure(m).actual += c
    }

    // Roll payer actuals into DE158.
    if (dept === PAYER_ROLLS_INTO) {
      for (const [m, c] of payerActualByMonth) ensure(m).actual += c
    }

    const monthly: MonthlyPoint[] = [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, budget: v.budget, actual: v.actual }))

    const budgetTotal = monthly.reduce((s, p) => s + p.budget, 0)
    const actualTotal = monthly.reduce((s, p) => s + p.actual, 0)
    const variance = actualTotal - budgetTotal

    results.push({
      department: dept,
      budgetTotal,
      actualTotal,
      variance,
      variancePercent: budgetTotal > 0 ? (variance / budgetTotal) * 100 : 0,
      monthly
    })
  }

  logger.info('[BudgetVsActual] Complete', {
    departments: results.map(r => r.department),
    elapsedMs: Date.now() - startTime
  })

  return sendSuccess(event, {
    year,
    environment,
    departments: results,
    meta: {
      allowedDepartments: ALLOWED_DEPARTMENTS,
      payerAccountId: PAYER_ACCOUNT_ID,
      payerRollsInto: PAYER_ROLLS_INTO,
      excludedRecordType: EXCLUDED_RECORD_TYPE,
      generatedAt: new Date().toISOString()
    }
  })
}))
