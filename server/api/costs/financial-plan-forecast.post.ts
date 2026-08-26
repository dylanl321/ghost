import { defineEventHandler, readBody } from 'h3'
import { GetCostAndUsageCommand, type Expression } from '@aws-sdk/client-cost-explorer'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getUserEmail, requirePermission } from '../../utils/user-roles'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { resolveBillingView } from '../../utils/billing-views'
import { getCostForecast } from '../../utils/cost-explorer'
import { batchForecastCalls } from '../../utils/forecast-batcher'
import { getCostExplorerClient } from '../../lib/aws-client-factory'
import { saveFinancialPlan } from '../../utils/financial-plan-history'
import { logger } from '../../utils/logger'

const DEPARTMENTS = new Set(['DE158', 'DT509', 'DT328'])
const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const DEV_ORG_ACCOUNT_ID = process.env.AWS_DEV_ORG_ACCOUNT_ID || '266632029214'
const DEV_ORG_VIEW_NAME = process.env.AWS_DEV_ORG_BILLING_VIEW_NAME || 'GDMS-DevOrg'
const DEV_ORG_MASTER_ACCOUNT_ID = process.env.AWS_DEV_ORG_MASTER_ACCOUNT_ID
const SAVINGS_PLAN_SERVICE = 'Savings Plans for AWS Compute usage'
const EXCLUDED_RECORD_TYPES = ['SavingsPlanRecurringFee', 'SavingsPlanPurchase']
const EXCLUDED_ACCOUNT_IDS = new Set(['110317593805'])

interface SpecialComponent { id: string; filter?: Expression; accountId?: string; billingViewArn?: string }

function accountDepartment(account: any) {
  return String(account.pepDepartment || account.departmentNumber || account.department || '').trim().toUpperCase()
}

function isForecastEligibleAccount(account: { pepEnvironmentStatus: string; enclaveStatus: string }) {
  const pepStatus = account.pepEnvironmentStatus.trim().toLowerCase()
  if (pepStatus) return pepStatus === 'sustainment' || pepStatus === 'provisional sustainment'
  return account.enclaveStatus.trim().toLowerCase() === 'active'
}

function addForecast(target: Record<string, number>, forecast: any) {
  for (const point of forecast?.forecastResultsByTime || []) {
    const start = point.TimePeriod?.Start
    if (start) target[`${start.slice(0, 7)}-01`] = (target[`${start.slice(0, 7)}-01`] || 0) + Number(point.MeanValue || 0)
  }
}

async function getBillingViewMembers(billingViewArn: string, today: Date): Promise<Set<string>> {
  const start = new Date(today)
  start.setMonth(start.getMonth() - 18, 1)
  const client = await getCostExplorerClient('commercial', 'us-east-1')
  const response = await client.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: start.toISOString().slice(0, 10), End: today.toISOString().slice(0, 10) },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' }],
    BillingViewArn: billingViewArn
  }))
  return new Set((response.ResultsByTime || []).flatMap(period => period.Groups || []).map(group => group.Keys?.[0]).filter(Boolean) as string[])
}

async function forecastDevOrg(billingViewArn: string, startDate: string, endDate: string, granularity: 'DAILY' | 'MONTHLY') {
  try {
    return await getCostForecast(startDate, endDate, 'UNBLENDED_COST', granularity, undefined, 'commercial', undefined, { billingViewArn })
  } catch (viewError) {
    if (!DEV_ORG_MASTER_ACCOUNT_ID) throw viewError
    logger.warn('[FinancialPlanForecast] DevOrg billing-view forecast failed; trying DevOrg master', { error: viewError })
    return getCostForecast(startDate, endDate, 'UNBLENDED_COST', granularity, undefined, 'commercial', DEV_ORG_MASTER_ACCOUNT_ID)
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
  const byComponentMonth: Record<string, Record<string, number>> = {}
  const failures: Array<{ id: string; message: string }> = []
  for (const component of components) {
    try {
      const forecast = await getCostForecast(startDate, endDate, 'UNBLENDED_COST', granularity, component.filter, 'commercial', component.accountId, { billingViewArn: component.billingViewArn })
      const componentMonths: Record<string, number> = {}
      addForecast(componentMonths, forecast)
      byComponentMonth[component.id] = componentMonths
      for (const [month, value] of Object.entries(componentMonths)) byMonth[month] = (byMonth[month] || 0) + value
    } catch (error) {
      failures.push({ id: component.id, message: error instanceof Error ? error.message : 'Unknown Cost Explorer error' })
    }
  }
  return { byMonth, byComponentMonth, failures }
}

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')
  const body = await readBody(event)
  const department = String(body?.department || '').trim().toUpperCase()
  const year = Number(body?.year)
  const monthlyActuals = body?.monthlyActuals as Record<string, number>
  const currentPlanValues = body?.currentPlanValues as Record<string, number> | undefined
  const accountMonthlyActuals = body?.accountMonthlyActuals as Record<string, number> | undefined
  const specialMonthlyActuals = body?.specialMonthlyActuals as Record<string, number> | undefined
  const historicalActualBreakdown = body?.historicalActualBreakdown as Record<string, unknown> | undefined
  const previewOnly = body?.preview === true
  if (!DEPARTMENTS.has(department) || !Number.isInteger(year) || !monthlyActuals || typeof monthlyActuals !== 'object') return errors.badRequest(event, 'department, year, and monthlyActuals are required')

  const today = new Date()
  if (year !== today.getFullYear()) return errors.badRequest(event, 'AWS forecasts can only be generated for the current year')
  let allAccounts: Awaited<ReturnType<typeof getAllAccountsUnified>>
  try {
    allAccounts = await getAllAccountsUnified(false)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown account catalog error'
    return errors.badRequest(event, 'Could not load the GHOST account catalog for this forecast.', { source: 'GHOST account catalog', message })
  }
  const departmentAccounts = allAccounts
    .filter(account => accountDepartment(account) === department)
    .map(account => ({
      accountId: account.awsStandardAccountID || account.accountId,
      name: account.projectName || account.name || account.accountName || 'Unnamed account',
      source: account.source || 'unknown',
      pepEnvironmentStatus: account.pepEnvironmentStatus || '',
      enclaveStatus: account.enclaveStatus || 'missing'
    }))
    .filter((account): account is { accountId: string; name: string; source: string; pepEnvironmentStatus: string; enclaveStatus: string } => Boolean(account.accountId) && account.accountId !== PAYER_ACCOUNT_ID && account.accountId !== DEV_ORG_ACCOUNT_ID && !EXCLUDED_ACCOUNT_IDS.has(account.accountId))
  const excludedCatalogAccounts = departmentAccounts
    .filter(account => !isForecastEligibleAccount(account))
    .map(account => ({
      ...account,
      reason: account.pepEnvironmentStatus
        ? `PEP environment status is "${account.pepEnvironmentStatus}", not Sustainment or Provisional Sustainment`
        : `PEP environment status is missing and enclaveStatus is "${account.enclaveStatus}", not Active`
    }))
  const financeAccounts = departmentAccounts.filter(isForecastEligibleAccount)
  if (!financeAccounts.length) return errors.badRequest(event, `No forecastable accounts are mapped to ${department}`)
  const accountMetadata = new Map(financeAccounts.map(account => [account.accountId, account]))
  const accountIds = financeAccounts.map(account => account.accountId)

  const special: SpecialComponent[] = []
  let normalAccountIds = accountIds
  let devOrgMembers: string[] = []
  let devOrgViewArn: string | undefined
  if (department === 'DE158') {
    const devOrg = await resolveBillingView(DEV_ORG_VIEW_NAME)
    if (!devOrg.arn) return errors.badRequest(event, `Could not resolve the ${DEV_ORG_VIEW_NAME} billing view`)
    devOrgViewArn = devOrg.arn
    let memberIds: Set<string>
    try {
      memberIds = await getBillingViewMembers(devOrg.arn, today)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Cost Explorer error'
      return errors.badRequest(event, 'Could not read GDMS-DevOrg Billing View membership.', {
        source: 'GDMS-DevOrg membership lookup',
        billingViewArn: devOrg.arn,
        message
      })
    }
    devOrgMembers = accountIds.filter(accountId => memberIds.has(accountId))
    const nonDevOrgAccounts = financeAccounts.filter(account => !memberIds.has(account.accountId))
    normalAccountIds = nonDevOrgAccounts.map(account => account.accountId)
    special.push({ id: 'GDMS Cloud', accountId: PAYER_ACCOUNT_ID, filter: { And: [
      { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [PAYER_ACCOUNT_ID] } },
      { Not: { Dimensions: { Key: 'SERVICE', Values: [SAVINGS_PLAN_SERVICE] } } },
      { Not: { Dimensions: { Key: 'RECORD_TYPE', Values: EXCLUDED_RECORD_TYPES } } }
    ] } })
  }

  const currentMonth = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(today)
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
  const currentEnd = nextMonth.toISOString().slice(0, 10)
  const futureEnd = `${year + 1}-01-01`
  const normalCurrent = normalAccountIds.length ? await forecastAccounts(normalAccountIds, today.toISOString().slice(0, 10), currentEnd, 'DAILY') : { byMonth: {}, byAccountMonth: {}, failures: [] as Array<{ id: string; message: string }> }
  const normalFuture = normalAccountIds.length && currentEnd < futureEnd ? await forecastAccounts(normalAccountIds, currentEnd, futureEnd, 'MONTHLY') : { byMonth: {}, byAccountMonth: {}, failures: [] as Array<{ id: string; message: string }> }
  const specialCurrent = await forecastSpecial(special, today.toISOString().slice(0, 10), currentEnd, 'DAILY')
  const specialFuture = currentEnd < futureEnd ? await forecastSpecial(special, currentEnd, futureEnd, 'MONTHLY') : { byMonth: {}, byComponentMonth: {}, failures: [] as Array<{ id: string; message: string }> }
  let devOrgCurrent: any
  let devOrgFuture: any
  try {
    devOrgCurrent = devOrgViewArn ? await forecastDevOrg(devOrgViewArn, today.toISOString().slice(0, 10), currentEnd, 'DAILY') : undefined
    devOrgFuture = devOrgViewArn && currentEnd < futureEnd ? await forecastDevOrg(devOrgViewArn, currentEnd, futureEnd, 'MONTHLY') : undefined
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Cost Explorer error'
    return errors.badRequest(event, `AWS could not forecast GDMS-DevOrg: ${message}`, { source: 'GDMS-DevOrg', billingViewArn: devOrgViewArn, fallbackAccountId: DEV_ORG_MASTER_ACCOUNT_ID })
  }
  const failures = [...normalCurrent.failures, ...normalFuture.failures, ...specialCurrent.failures, ...specialFuture.failures]
  if (failures.length) {
    const grouped = new Map<string, string[]>()
    for (const failure of failures) {
      const ids = grouped.get(failure.message) || []
      if (!ids.includes(failure.id)) ids.push(failure.id)
      grouped.set(failure.message, ids)
    }
    return errors.badRequest(event, 'AWS could not forecast one or more Finance components.', {
      department,
      normalAccountIds,
      devOrgMemberIds: devOrgMembers,
      currentRange: { start: today.toISOString().slice(0, 10), end: currentEnd },
      futureRange: { start: currentEnd, end: futureEnd },
      failures: [...grouped.entries()].map(([message, accountIds]) => ({
        message,
        accounts: accountIds.map(accountId => accountMetadata.get(accountId) || { accountId, name: 'Unknown GHOST record', source: 'unknown' })
      })),
      excludedCatalogAccounts
    })
  }

  const currentByMonth = { ...normalCurrent.byMonth }
  const futureByMonth = { ...normalFuture.byMonth }
  for (const [month, value] of Object.entries(specialCurrent.byMonth)) currentByMonth[month] = (currentByMonth[month] || 0) + value
  for (const [month, value] of Object.entries(specialFuture.byMonth)) futureByMonth[month] = (futureByMonth[month] || 0) + value
  addForecast(currentByMonth, devOrgCurrent)
  addForecast(futureByMonth, devOrgFuture)
  const monthlyValues: Record<string, number> = {}
  for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, '0')}-01`
    monthlyValues[key] = key < currentMonth ? Number(monthlyActuals[key] || 0) : key === currentMonth ? Number(monthlyActuals[key] || 0) + (currentByMonth[key] || 0) : futureByMonth[key] || 0
  }
  const specialComponentMonths: Record<string, Record<string, number>> = Object.fromEntries(
    special.map(component => [component.id, { ...specialCurrent.byComponentMonth[component.id], ...specialFuture.byComponentMonth[component.id] }])
  )
  if (devOrgViewArn) {
    specialComponentMonths['GDMS-DevOrg'] = {}
    addForecast(specialComponentMonths['GDMS-DevOrg'], devOrgCurrent)
    addForecast(specialComponentMonths['GDMS-DevOrg'], devOrgFuture)
  }
  for (const accountId of accountIds) {
    const actual = Number(accountMonthlyActuals?.[accountId] || 0)
    if (!actual) continue
    normalCurrent.byAccountMonth[accountId] = normalCurrent.byAccountMonth[accountId] || {}
    normalCurrent.byAccountMonth[accountId][currentMonth] = (normalCurrent.byAccountMonth[accountId][currentMonth] || 0) + actual
  }
  for (const [component, value] of Object.entries(specialMonthlyActuals || {})) {
    const actual = Number(value || 0)
    if (actual) {
      specialComponentMonths[component] = specialComponentMonths[component] || {}
      specialComponentMonths[component][currentMonth] = (specialComponentMonths[component][currentMonth] || 0) + actual
    }
  }
  const forecastComposition = {
    allocationMethod: 'current-month-actuals-plus-individual-cost-dashboard-forecast-requests',
    accountMonthlyValues: Object.fromEntries(accountIds.map(accountId => [accountId, {
      ...normalCurrent.byAccountMonth[accountId],
      ...normalFuture.byAccountMonth[accountId]
    }])),
    normalAccounts: accountIds.map(accountId => ({
      accountId,
      name: accountMetadata.get(accountId)?.name || 'Unknown account',
      source: accountMetadata.get(accountId)?.source || 'unknown',
      pepEnvironmentStatus: accountMetadata.get(accountId)?.pepEnvironmentStatus || '',
      enclaveStatus: accountMetadata.get(accountId)?.enclaveStatus || ''
    })),
    specialMonthlyValues: {
      components: specialComponentMonths,
      definitions: {
        'GDMS Cloud': 'Separate payer forecast excluding Savings Plan charges.',
        'GDMS-DevOrg': 'Whole Billing View forecast, matching the AWS console.'
      },
      devOrgMembers,
      excludedCatalogAccounts
    }
  }
  const changes = Object.entries(monthlyValues)
    .map(([month, value]) => ({ month, previous: Number(currentPlanValues?.[month] || 0), next: value, delta: value - Number(currentPlanValues?.[month] || 0) }))
    .filter(change => Math.abs(change.delta) >= 0.01)
  const preview = {
    department,
    changes,
    reasons: [
      { component: 'Completed months', reason: 'Plan is reset to actual charged values.' },
      { component: 'Normal accounts', reason: 'Individual Cost Dashboard-style AWS forecasts.' },
      ...(department === 'DE158' ? [
        { component: 'GDMS Cloud', reason: 'Separate payer forecast excluding Savings Plan charges.' },
        { component: 'GDMS-DevOrg', reason: 'Whole Billing View forecast, matching the AWS console.' }
      ] : [])
    ],
    forecastComposition,
    historicalActualBreakdown
  }
  if (previewOnly) return sendSuccess(event, { monthlyValues, preview, components: { normalAccountCount: normalAccountIds.length, devOrgMemberCount: devOrgMembers.length, excludedCatalogAccounts } })
  const entry = await saveFinancialPlan({ department, year, monthlyValues, action: 'forecast-generated', actor: getUserEmail(event) || 'Unknown user', forecastComposition })
  return sendSuccess(event, { monthlyValues, entry, forecastComposition, components: { normalAccountCount: normalAccountIds.length, devOrgMemberCount: devOrgMembers.length, excludedCatalogAccounts, special: [...special.map(component => component.id), ...(devOrgViewArn ? ['GDMS-DevOrg'] : [])] } })
}))
