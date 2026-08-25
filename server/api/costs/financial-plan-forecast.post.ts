import { defineEventHandler, readBody } from 'h3'
import { GetCostAndUsageCommand, type Expression } from '@aws-sdk/client-cost-explorer'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getUserEmail, requirePermission } from '../../utils/user-roles'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { resolveBillingView } from '../../utils/billing-views'
import { getCostForecast } from '../../utils/cost-explorer'
import { getCostExplorerClient } from '../../lib/aws-client-factory'
import { saveFinancialPlan } from '../../utils/financial-plan-history'
import { logger } from '../../utils/logger'

const DEPARTMENTS = new Set(['DE158', 'DT509', 'DT328'])
const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const DEV_ORG_ACCOUNT_ID = process.env.AWS_DEV_ORG_ACCOUNT_ID || '266632029214'
const CHARGEBACK_VIEW_NAME = process.env.AWS_GDMS_CHARGEBACK_BILLING_VIEW_NAME || 'GDMS_Chargeback'
const DEV_ORG_VIEW_NAME = process.env.AWS_DEV_ORG_BILLING_VIEW_NAME || 'GDMS-DevOrg'
const SAVINGS_PLAN_SERVICE = 'Savings Plans for AWS Compute usage'
const EXCLUDED_RECORD_TYPES = ['SavingsPlanRecurringFee', 'SavingsPlanPurchase']
const EXCLUDED_ACCOUNT_IDS = new Set(['110317593805'])

interface ForecastComponent {
  id: string
  filter?: Expression
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

async function loadHistoryDiagnostics(accountIds: string[], billingViewArn: string, today: Date) {
  const start = new Date(today)
  start.setMonth(start.getMonth() - 18, 1)
  const client = await getCostExplorerClient('commercial', 'us-east-1')
  const result = await client.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: start.toISOString().slice(0, 10), End: today.toISOString().slice(0, 10) },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' }],
    Filter: { Dimensions: { Key: 'LINKED_ACCOUNT', Values: accountIds } },
    BillingViewArn: billingViewArn
  }))
  const monthsByAccount = new Map<string, number>()
  for (const period of result.ResultsByTime || []) {
    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      const amount = Number(group.Metrics?.UnblendedCost?.Amount || 0)
      if (accountId && amount !== 0) monthsByAccount.set(accountId, (monthsByAccount.get(accountId) || 0) + 1)
    }
  }
  return accountIds.map(accountId => ({ accountId, nonZeroMonthlyPeriods: monthsByAccount.get(accountId) || 0 }))
}

async function forecastComponents(components: ForecastComponent[], startDate: string, endDate: string, granularity: 'DAILY' | 'MONTHLY') {
  const byMonth: Record<string, number> = {}
  const failures: Array<{ id: string; message: string }> = []
  const batchSize = 5
  for (let start = 0; start < components.length; start += batchSize) {
    const batch = components.slice(start, start + batchSize)
    logger.info('[FinancialPlanForecast] Starting component batch', {
      granularity,
      startDate,
      endDate,
      components: batch.map(component => ({ id: component.id, billingViewArn: component.billingViewArn, filter: component.filter }))
    })
    const settled = await Promise.allSettled(batch.map(async component => ({
      component,
      forecast: await getCostForecast(
        startDate,
        endDate,
        'UNBLENDED_COST',
        granularity,
        component.filter,
        'commercial',
        component.billingViewArn ? undefined : PAYER_ACCOUNT_ID,
        { billingViewArn: component.billingViewArn }
      )
    })))
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') addForecast(byMonth, result.value.forecast)
      else {
        const component = batch[index]
        logger.warn(`[FinancialPlanForecast] ${component.id} forecast failed:`, result.reason)
        failures.push({
          id: component.id,
          message: result.reason instanceof Error ? result.reason.message : 'Unknown Cost Explorer error'
        })
      }
    })
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
  const chargebackResolution = await resolveBillingView(CHARGEBACK_VIEW_NAME)
  const chargebackViewArn = process.env.AWS_GDMS_CHARGEBACK_BILLING_VIEW_ARN || chargebackResolution.arn
  if (!chargebackViewArn) {
    const detail = chargebackResolution.error
      ? `ListBillingViews failed: ${chargebackResolution.error}`
      : `Available views: ${chargebackResolution.availableNames.join(', ') || 'none'}`
    return errors.badRequest(event, `Could not resolve the ${CHARGEBACK_VIEW_NAME} billing view. ${detail}`)
  }
  logger.info('[FinancialPlanForecast] Resolved chargeback view', {
    department,
    viewName: CHARGEBACK_VIEW_NAME,
    billingViewArn: chargebackViewArn
  })

  const accounts = await getAllAccountsUnified(false)
  const components: ForecastComponent[] = accounts
    .filter(account => accountDepartment(account) === department)
    .map(account => account.accountId || account.awsStandardAccountID)
    .filter((id): id is string => Boolean(id) && id !== PAYER_ACCOUNT_ID && id !== DEV_ORG_ACCOUNT_ID && !EXCLUDED_ACCOUNT_IDS.has(id))
    .map(accountId => ({
      id: accountId,
      filter: { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [accountId] } },
      billingViewArn: chargebackViewArn
    }))

  if (department === 'DE158') {
    const devOrgResolution = await resolveBillingView(DEV_ORG_VIEW_NAME)
    const devOrgViewArn = process.env.AWS_DEV_ORG_BILLING_VIEW_ARN || devOrgResolution.arn
    if (!devOrgViewArn) return errors.badRequest(event, `Could not resolve the ${DEV_ORG_VIEW_NAME} billing view`)
    components.push({
      id: 'GDMS Cloud',
      filter: {
        And: [
          { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [PAYER_ACCOUNT_ID] } },
          { Not: { Dimensions: { Key: 'SERVICE', Values: [SAVINGS_PLAN_SERVICE] } } },
          { Not: { Dimensions: { Key: 'RECORD_TYPE', Values: EXCLUDED_RECORD_TYPES } } }
        ]
      }
    })
    components.push({ id: 'GDMS-DevOrg', billingViewArn: devOrgViewArn })
  }
  if (!components.length) return errors.badRequest(event, `No forecastable components are mapped to ${department}`)

  const currentMonth = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(today)
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
  const currentEnd = nextMonth.toISOString().slice(0, 10)
  const futureStart = currentEnd
  const futureEnd = `${year + 1}-01-01`
  const [current, future] = await Promise.all([
    forecastComponents(components, today.toISOString().slice(0, 10), currentEnd, 'DAILY'),
    futureStart < futureEnd ? forecastComponents(components, futureStart, futureEnd, 'MONTHLY') : Promise.resolve({ byMonth: {}, failures: [] as Array<{ id: string; message: string }> })
  ])
  const failures = [...current.failures, ...future.failures]
  if (failures.length) {
    const byMessage = new Map<string, string[]>()
    for (const failure of failures) {
      const ids = byMessage.get(failure.message) || []
      if (!ids.includes(failure.id)) ids.push(failure.id)
      byMessage.set(failure.message, ids)
    }
    const details = [...byMessage.entries()]
      .map(([message, ids]) => `${ids.join(', ')}: ${message}`)
      .join(' | ')
    logger.warn('[FinancialPlanForecast] Component forecasts failed', {
      department,
      currentRange: { start: today.toISOString().slice(0, 10), end: currentEnd },
      futureRange: { start: futureStart, end: futureEnd },
      failures
    })
    const failedAccountIds = [...new Set(failures.map(failure => failure.id).filter(id => /^\d{12}$/.test(id)))]
    let historyDiagnostics: Array<{ accountId: string; nonZeroMonthlyPeriods: number }> | undefined
    let historyDiagnosticError: string | undefined
    try {
      historyDiagnostics = await loadHistoryDiagnostics(failedAccountIds, chargebackViewArn, today)
    } catch (error) {
      historyDiagnosticError = error instanceof Error ? error.message : 'Unknown Cost Explorer error'
    }
    return errors.badRequest(event, `AWS could not forecast required components. ${details}`, {
      billingView: { name: CHARGEBACK_VIEW_NAME, arn: chargebackViewArn },
      currentRange: { start: today.toISOString().slice(0, 10), end: currentEnd },
      futureRange: { start: futureStart, end: futureEnd },
      historyDiagnostics,
      historyDiagnosticError
    })
  }

  const monthlyValues: Record<string, number> = {}
  for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, '0')}-01`
    if (key < currentMonth) monthlyValues[key] = Number(monthlyActuals[key] || 0)
    else if (key === currentMonth) monthlyValues[key] = Number(monthlyActuals[key] || 0) + (current.byMonth[key] || 0)
    else monthlyValues[key] = future.byMonth[key] || 0
  }
  const entry = await saveFinancialPlan({
    department, year, monthlyValues, action: 'forecast-generated', actor: getUserEmail(event) || 'Unknown user'
  })
  return sendSuccess(event, { monthlyValues, entry, components: components.map(component => component.id) })
}))
