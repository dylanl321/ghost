import { defineEventHandler, readBody } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getUserEmail, requirePermission } from '../../utils/user-roles'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { getCostForecast } from '../../utils/cost-explorer'
import { saveFinancialPlan } from '../../utils/financial-plan-history'

const DEPARTMENTS = new Set(['DE158', 'DT509', 'DT328'])
const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'

function accountDepartment(account: any) {
  return String(account.pepDepartment || account.departmentNumber || account.department || '').trim().toUpperCase()
}

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')
  const body = await readBody(event)
  const department = String(body?.department || '').trim().toUpperCase()
  const year = Number(body?.year)
  const monthlyActuals = body?.monthlyActuals as Record<string, number>
  if (!DEPARTMENTS.has(department) || !Number.isInteger(year) || !monthlyActuals || typeof monthlyActuals !== 'object') {
    return errors.badRequest(event, 'department, year, and monthlyActuals are required')
  }

  const accounts = await getAllAccountsUnified(false)
  const accountIds = accounts
    .filter(account => accountDepartment(account) === department)
    .map(account => account.accountId || account.awsStandardAccountID)
    .filter((id): id is string => Boolean(id))
  if (!accountIds.length) return errors.badRequest(event, `No commercial accounts are mapped to ${department}`)

  const today = new Date()
  const currentMonth = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const forecastStart = today.toISOString().slice(0, 10)
  const forecastEnd = `${year + 1}-01-01`
  const forecastByMonth: Record<string, number> = {}
  let forecastWarning: string | undefined
  if (year === today.getFullYear() && forecastStart < forecastEnd) {
    try {
      const forecast = await getCostForecast(forecastStart, forecastEnd, 'UNBLENDED_COST', 'DAILY', {
        Dimensions: { Key: 'LINKED_ACCOUNT', Values: accountIds }
      }, 'commercial', PAYER_ACCOUNT_ID)
      for (const point of forecast.forecastResultsByTime) {
        const month = `${point.TimePeriod?.Start?.slice(0, 7)}-01`
        forecastByMonth[month] = (forecastByMonth[month] || 0) + Number(point.MeanValue || 0)
      }
    } catch {
      forecastWarning = 'AWS Cost Explorer could not generate a forecast; the trailing actual average was used for future months.'
    }
  }
  const historical = Object.entries(monthlyActuals)
    .filter(([month, value]) => month < currentMonth && Number(value) > 0)
    .map(([, value]) => Number(value))
  const fallback = historical.length ? historical.reduce((sum, value) => sum + value, 0) / historical.length : 0
  const monthlyValues: Record<string, number> = {}
  for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, '0')}-01`
    if (key < currentMonth) monthlyValues[key] = Number(monthlyActuals[key] || 0)
    else if (key === currentMonth) monthlyValues[key] = Number(monthlyActuals[key] || 0) + (forecastByMonth[key] || 0)
    else monthlyValues[key] = forecastByMonth[key] || fallback
  }
  const entry = await saveFinancialPlan({
    department, year, monthlyValues, action: 'forecast-generated', actor: getUserEmail(event) || 'Unknown user'
  })
  return sendSuccess(event, { monthlyValues, entry, forecastWarning })
}))
