import { defineEventHandler, readBody } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getUserEmail, requirePermission } from '../../utils/user-roles'
import { getFinancialPlanHistory, saveFinancialPlan } from '../../utils/financial-plan-history'

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')
  const body = await readBody(event)
  const department = String(body?.department || '').trim().toUpperCase()
  const year = Number(body?.year)
  const historyKey = String(body?.historyKey || '')
  const restorePrevious = body?.restorePrevious === true
  if (!department || !Number.isInteger(year) || !historyKey) return errors.badRequest(event, 'department, year, and historyKey are required')
  const entry = (await getFinancialPlanHistory(department, year)).find(item => item.sk === historyKey)
  if (!entry) return errors.notFound(event, 'Historical plan version was not found')
  const monthlyValues = restorePrevious && Object.keys(entry.previousMonthlyValues).length > 0
    ? entry.previousMonthlyValues
    : entry.monthlyValues
  const saved = await saveFinancialPlan({
    department,
    year,
    monthlyValues,
    action: 'reverted',
    actor: getUserEmail(event) || 'Unknown user',
    sourceHistoryKey: entry.sk
  })
  return sendSuccess(event, { department, year, monthlyValues: saved.monthlyValues, entry: saved })
}))
