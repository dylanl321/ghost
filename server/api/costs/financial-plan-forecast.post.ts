import { defineEventHandler, readBody } from 'h3'
import type { Expression } from '@aws-sdk/client-cost-explorer'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getUserEmail, requirePermission } from '../../utils/user-roles'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { resolveBillingView } from '../../utils/billing-views'
import { getCostAndUsage, getCostForecast, getProformaForecast } from '../../utils/cost-explorer'
import { saveFinancialPlan } from '../../utils/financial-plan-history'
import { logger } from '../../utils/logger'

const DEPARTMENTS = new Set(['DE158', 'DT509', 'DT328'])
const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const PROFORMA_ACCOUNT_ID = process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
const DEV_ORG_ACCOUNT_ID = process.env.AWS_DEV_ORG_ACCOUNT_ID || '266632029214'
const DEV_ORG_VIEW_NAME = process.env.AWS_DEV_ORG_BILLING_VIEW_NAME || 'GDMS-DevOrg'
const SAVINGS_PLAN_SERVICE = 'Savings Plans for AWS Compute usage'
const EXCLUDED_RECORD_TYPES = ['SavingsPlanRecurringFee', 'SavingsPlanPurchase']
const EXCLUDED_ACCOUNT_IDS = new Set(['110317593805'])

interface SpecialForecastComponent {
  id: string
  filter?: Expression
  accountId?: string
  billingViewArn?: string
}

function accountDepartment(account: any) {
  return String(account.pepDepartment || account.departmentNumber || account.department || '').trim().toUpperCase()
}

function addForecast(data: Record<string, number>, forecast: any) {
  for (const point of forecast.forecastResultsByTime || []) {
    const start = point.TimePeriod?.Start
    if (!start) continue
    const month = `${start.slice(0, 7)}-01`
    data[month] = (data[month] || 0) + Number(point.MeanValue || 0)
  }
}

async function getAccountShares(accountIds: string[], today: Date) {
  const end = new Date(today.getFullYear(), today.getMonth(), 1)
  const start = new Date(end)
  start.setMonth(start.getMonth() - 3)
  const costs = await getCostAndUsage({
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost'],
    groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
  }, 'commercial', PROFORMA_ACCOUNT_ID)
  const totals = new Map(accountIds.map(id => [id, 0]))
  for (const period of costs.resultsByTime || []) {
    for (const group of period.Groups || []) {
      const id = group.Keys?.[0]
      if (id && totals.has(id)) totals.set(id, (totals.get(id) || 0) + Number(group.Metrics?.UnblendedCost?.Amount || 0))
    }
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0)
  if (!total) throw new Error('No trailing three-month proforma history is available to allocate the department forecast')
  return Object.fromEntries([...totals.entries()].map(([id, value]) => [id, value / total]))
}

async function forecastNormalAccounts(accountIds: string[], startDate: string, endDate: string, granularity: 'DAILY' | 'MONTHLY') {
  const filter: Expression = { Dimensions: { Key: 'LINKED_ACCOUNT', Values: accountIds } }
  // This is the Cost Dashboard proforma path: the proforma account returns
  // the Billing Conductor allocation for the full selected account set.
  const result = await getProformaForecast(startDate, endDate, 'UNBLENDED_COST', granularity, filter, PROFORMA_ACCOUNT_ID, PAYER_ACCOUNT_ID)
  return result.proformaAccount.forecast
}

async function forecastSpecialComponents(components: SpecialForecastComponent[], startDate: string, endDate: string, granularity: 'DAILY' | 'MONTHLY') {
  const byMonth: Record<string, number> = {}
  const failures: Array<{ id: string; message: string }> = []
  for (const component of components) {
    try {
      const forecast = await getCostForecast(
        startDate,
        endDate,
        'UNBLENDED_COST',
        granularity,
        component.filter,
        'commercial',
        component.accountId,
        { billingViewArn: component.billingViewArn }
      )
      addForecast(byMonth, forecast)
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
  if (!DEPARTMENTS.has(department) || !Number.isInteger(year) || !monthlyActuals || typeof monthlyActuals !== 'object') {
    return errors.badRequest(event, 'department, year, and monthlyActuals are required')
  }

  const today = new Date()
  if (year !== today.getFullYear()) return errors.badRequest(event, 'AWS forecasts can only be generated for the current year')

  const accountIds = (await getAllAccountsUnified(false))
    .filter(account => accountDepartment(account) === department)
    .map(account => account.awsStandardAccountID || account.accountId)
    .filter((id): id is string => Boolean(id) && id !== PAYER_ACCOUNT_ID && id !== DEV_ORG_ACCOUNT_ID && !EXCLUDED_ACCOUNT_IDS.has(id))
  if (!accountIds.length) return errors.badRequest(event, `No forecastable accounts are mapped to ${department}`)

  const specialComponents: SpecialForecastComponent[] = []
  if (department === 'DE158') {
    const devOrgResolution = await resolveBillingView(DEV_ORG_VIEW_NAME)
    if (!devOrgResolution.arn) return errors.badRequest(event, `Could not resolve the ${DEV_ORG_VIEW_NAME} billing view`)
    specialComponents.push({
      id: 'GDMS Cloud',
      accountId: PAYER_ACCOUNT_ID,
      filter: {
        And: [
          { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [PAYER_ACCOUNT_ID] } },
          { Not: { Dimensions: { Key: 'SERVICE', Values: [SAVINGS_PLAN_SERVICE] } } },
          { Not: { Dimensions: { Key: 'RECORD_TYPE', Values: EXCLUDED_RECORD_TYPES } } }
        ]
      }
    })
    specialComponents.push({ id: 'GDMS-DevOrg', billingViewArn: devOrgResolution.arn })
  }

  const currentMonth = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(today)
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
  const currentEnd = nextMonth.toISOString().slice(0, 10)
  const futureEnd = `${year + 1}-01-01`
  let normalCurrent: any
  let normalFuture: any
  try {
    normalCurrent = await forecastNormalAccounts(accountIds, today.toISOString().slice(0, 10), currentEnd, 'DAILY')
    normalFuture = currentEnd < futureEnd
      ? await forecastNormalAccounts(accountIds, currentEnd, futureEnd, 'MONTHLY')
      : { forecastResultsByTime: [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Cost Explorer error'
    logger.warn('[FinancialPlanForecast] Normal proforma aggregate failed', { department, accountIds, error })
    return errors.badRequest(event, `AWS could not forecast the ${department} normal-account proforma aggregate: ${message}`)
  }

  try {
    const specialCurrent = await forecastSpecialComponents(specialComponents, today.toISOString().slice(0, 10), currentEnd, 'DAILY')
    const specialFuture = currentEnd < futureEnd
      ? await forecastSpecialComponents(specialComponents, currentEnd, futureEnd, 'MONTHLY')
      : { byMonth: {}, failures: [] as Array<{ id: string; message: string }> }
    const failures = [...specialCurrent.failures, ...specialFuture.failures]
    if (failures.length) return errors.badRequest(event, `AWS could not forecast: ${failures.map(failure => `${failure.id}: ${failure.message}`).join(' | ')}`)

    const currentByMonth: Record<string, number> = {}
    const futureByMonth: Record<string, number> = {}
    addForecast(currentByMonth, normalCurrent)
    addForecast(futureByMonth, normalFuture)
    for (const [month, value] of Object.entries(specialCurrent.byMonth)) currentByMonth[month] = (currentByMonth[month] || 0) + value
    for (const [month, value] of Object.entries(specialFuture.byMonth)) futureByMonth[month] = (futureByMonth[month] || 0) + value

    const accountShares = await getAccountShares(accountIds, today)
    const accountMonthlyValues: Record<string, Record<string, number>> = {}
    for (const month of Object.keys({ ...futureByMonth, ...currentByMonth })) {
      const normalValue = (futureByMonth[month] || currentByMonth[month] || 0) - (specialFuture.byMonth[month] || specialCurrent.byMonth[month] || 0)
      accountMonthlyValues[month] = Object.fromEntries(Object.entries(accountShares).map(([accountId, share]) => [accountId, normalValue * share]))
    }

    const monthlyValues: Record<string, number> = {}
    for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2, '0')}-01`
      if (key < currentMonth) monthlyValues[key] = Number(monthlyActuals[key] || 0)
      else if (key === currentMonth) monthlyValues[key] = Number(monthlyActuals[key] || 0) + (currentByMonth[key] || 0)
      else monthlyValues[key] = futureByMonth[key] || 0
    }
    const forecastComposition = {
      allocationMethod: 'trailing-three-complete-month-proforma-spend-share',
      accountShares,
      accountMonthlyValues,
      specialMonthlyValues: { current: specialCurrent.byMonth, future: specialFuture.byMonth }
    }
    const entry = await saveFinancialPlan({ department, year, monthlyValues, action: 'forecast-generated', actor: getUserEmail(event) || 'Unknown user', forecastComposition })
    return sendSuccess(event, { monthlyValues, entry, forecastComposition, components: { normalAccountCount: accountIds.length, special: specialComponents.map(component => component.id) } })
  } catch (error) {
    logger.warn('[FinancialPlanForecast] Forecast composition failed', { department, accountIds, error })
    return errors.badRequest(event, `AWS forecast composition failed for ${department}: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}))
