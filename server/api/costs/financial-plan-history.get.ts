import { defineEventHandler, getQuery } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { requirePermission } from '../../utils/user-roles'
import { getFinancialPlanHistory } from '../../utils/financial-plan-history'

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')
  const query = getQuery(event)
  const department = String(query.department || '').trim().toUpperCase()
  const year = Number(query.year)
  if (!department || !Number.isInteger(year)) return errors.badRequest(event, 'department and year are required')
  return sendSuccess(event, { department, year, entries: await getFinancialPlanHistory(department, year) })
}))
