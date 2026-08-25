import { defineEventHandler, readBody } from 'h3'
import type { Expression } from '@aws-sdk/client-cost-explorer'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getUserEmail, requirePermission } from '../../utils/user-roles'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { resolveBillingView } from '../../utils/billing-views'
import { getCostForecast } from '../../utils/cost-explorer'
import { batchForecastCalls } from '../../utils/forecast-batcher'
import { saveFinancialPlan } from '../../utils/financial-plan-history'

const DEPARTMENTS = new Set(['DE158', 'DT509', 'DT328'])
const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const DEV_ORG_ACCOUNT_ID = process.env.AWS_DEV_ORG_ACCOUNT_ID || '266632029214'
const DEV_ORG_VIEW_NAME = process.env.AWS_DEV_ORG_BILLING_VIEW_NAME || 'GDMS-DevOrg'
const SAVINGS_PLAN_SERVICE = 'Savings Plans for AWS Compute usage'
const EXCLUDED_RECORD_TYPES = ['SavingsPlanRecurringFee', 'SavingsPlanPurchase']
const EXCLUDED_ACCOUNT_IDS = new Set(['110317593805'])

interface SpecialComponent { id: string; filter?: Expression; accountId?: string; billingViewArn?: string }

function accountDepartment(account: any) {
  return String(account.pepDepartment || account.departmentNumber || account.department || '').trim().toUpperCase()
}

function addForecast(target: Record<string, number>, forecast: any) {
  for (const point of forecast?.forecastResultsByTime || []) {
    const start = point.TimePeriod?.Start
    if (start) target[`${start.slice(0, 7)}-01`] = (target[`${start.slice(0, 7)}-01`] || 0) + Number(point.MeanValue || 0)
  }
}

async function forecastAccounts(accountIds: string[], startDate: string, endDate: string, granularity: 'DAILY' | 'MONTHLY') {
  const results = await batchForecastCalls(accountIds.map(accountId => ({
    accountId, startDate, endDate, metric: 'UNBLENDED_COST', granularity, proforma: true, environment: 'commercial' as const
  })), { batchSize: 5, delayBetweenBatches: 300, maxRetries: 2, retryDelay: 1000 })
  const byMonth: Record<string, number> = {}
  const byAccountMonth: Record<string, Record<string, number>> = {}
  const failures = results.filter(result => !result.success).map(result => ({ id: result.accountId, message: result.error || 'Unknown Cost Explorer error' }))
  for (const result of results.filter(result => result.success)) {
    const monthly: Record<string, number> = {}
    addForecast(monthly, result.data)
    byAccountMonth[result.accountId] = monthly
    for (const [month, value] of Object.entries(monthly)) byMonth[month] = (byMonth[month] || 0) + value
  }
  return { byMonth, byAccountMonth, failures }
}

async function forecastSpecial(components: SpecialComponent[], startDate: string, endDate: string, granularity: 'DAILY' | 'MONTHLY') {
  const byMonth: Record<string, number> = {}
  const failures: Array<{ id: string; message: string }> = []
  for (const component of components) {
    try {
      addForecast(byMonth, await getCostForecast(startDate, endDate, 'UNBLENDED_COST', granularity, component.filter, 'commercial', component.accountId, { billingViewArn: component.billingViewArn }))
    } catch (error) {
      failures.push({ id: component.id, message: error instanceof Error ? error.message : 'Unknown Cost Explorer error' })
    }
  }
  return { byMonth, failures }
}

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')
  const body = await readBody(event)
  const department = String(body?.department || '').trim().toUpperCase()
  const year = Number(body?.year)
  const monthlyActuals = body?.monthlyActuals as Record<string, number>
  if (!DEPARTMENTS.has(department) || !Number.isInteger(year) || !monthlyActuals || typeof monthlyActuals !== 'object') return errors.badRequest(event, 'department, year, and monthlyActuals are required')

  const today = new Date()
  if (year !== today.getFullYear()) return errors.badRequest(event, 'AWS forecasts can only be generated for the current year')
  const accountIds = (await getAllAccountsUnified(false))
    .filter(account => accountDepartment(account) === department)
    .map(account => account.awsStandardAccountID || account.accountId)
    .filter((id): id is string => Boolean(id) && id !== PAYER_ACCOUNT_ID && id !== DEV_ORG_ACCOUNT_ID && !EXCLUDED_ACCOUNT_IDS.has(id))
  if (!accountIds.length) return errors.badRequest(event, `No forecastable accounts are mapped to ${department}`)

  const special: SpecialComponent[] = []
  if (department === 'DE158') {
    const devOrg = await resolveBillingView(DEV_ORG_VIEW_NAME)
    if (!devOrg.arn) return errors.badRequest(event, `Could not resolve the ${DEV_ORG_VIEW_NAME} billing view`)
    special.push({ id: 'GDMS Cloud', accountId: PAYER_ACCOUNT_ID, filter: { And: [
      { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [PAYER_ACCOUNT_ID] } },
      { Not: { Dimensions: { Key: 'SERVICE', Values: [SAVINGS_PLAN_SERVICE] } } },
      { Not: { Dimensions: { Key: 'RECORD_TYPE', Values: EXCLUDED_RECORD_TYPES } } }
    ] } })
    special.push({ id: 'GDMS-DevOrg', billingViewArn: devOrg.arn })
  }

  const currentMonth = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(today)
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
  const currentEnd = nextMonth.toISOString().slice(0, 10)
  const futureEnd = `${year + 1}-01-01`
  const normalCurrent = await forecastAccounts(accountIds, today.toISOString().slice(0, 10), currentEnd, 'DAILY')
  const normalFuture = currentEnd < futureEnd ? await forecastAccounts(accountIds, currentEnd, futureEnd, 'MONTHLY') : { byMonth: {}, byAccountMonth: {}, failures: [] as Array<{ id: string; message: string }> }
  const specialCurrent = await forecastSpecial(special, today.toISOString().slice(0, 10), currentEnd, 'DAILY')
  const specialFuture = currentEnd < futureEnd ? await forecastSpecial(special, currentEnd, futureEnd, 'MONTHLY') : { byMonth: {}, failures: [] as Array<{ id: string; message: string }> }
  const failures = [...normalCurrent.failures, ...normalFuture.failures, ...specialCurrent.failures, ...specialFuture.failures]
  if (failures.length) return errors.badRequest(event, `AWS could not forecast: ${failures.map(failure => `${failure.id}: ${failure.message}`).join(' | ')}`)

  const currentByMonth = { ...normalCurrent.byMonth }
  const futureByMonth = { ...normalFuture.byMonth }
  for (const [month, value] of Object.entries(specialCurrent.byMonth)) currentByMonth[month] = (currentByMonth[month] || 0) + value
  for (const [month, value] of Object.entries(specialFuture.byMonth)) futureByMonth[month] = (futureByMonth[month] || 0) + value
  const monthlyValues: Record<string, number> = {}
  for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, '0')}-01`
    monthlyValues[key] = key < currentMonth ? Number(monthlyActuals[key] || 0) : key === currentMonth ? Number(monthlyActuals[key] || 0) + (currentByMonth[key] || 0) : futureByMonth[key] || 0
  }
  const forecastComposition = {
    allocationMethod: 'individual-cost-dashboard-forecast-requests',
    accountMonthlyValues: { ...normalCurrent.byAccountMonth, ...normalFuture.byAccountMonth },
    specialMonthlyValues: { current: specialCurrent.byMonth, future: specialFuture.byMonth }
  }
  const entry = await saveFinancialPlan({ department, year, monthlyValues, action: 'forecast-generated', actor: getUserEmail(event) || 'Unknown user', forecastComposition })
  return sendSuccess(event, { monthlyValues, entry, forecastComposition, components: { normalAccountCount: accountIds.length, special: special.map(component => component.id) } })
}))
