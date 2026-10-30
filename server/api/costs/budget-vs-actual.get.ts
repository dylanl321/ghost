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
 * - Savings Plan purchase and recurring fees on the payer stay in GDMS Cloud actuals
 *   (Finance counts them; confirmed by Dylan in the 2026-10 audit).
 * - GDMS-DevOrg (266632029214) charges appear via billing transfer under the
 *   proforma account. Fetched separately and shown as a fixed DE158 category row.
 *
 * Named account categories per spreadsheet (hardcoded by Finance request):
 *   DE158: External Access VPC | Enterprise Support | DevSecOps - Engineering Solutions
 *   DT509: Software Engineering Solutions | GDMS ITS SOC
 */


import { defineEventHandler, getQuery } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { requirePermission } from '../../utils/user-roles'
import { ALLOWED_DEPARTMENTS, computeBudgetVsActual, type AllowedDepartment } from '../../utils/budget-vs-actual'

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')

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

  return sendSuccess(event, await computeBudgetVsActual({ departments, year, environment }))
}))
