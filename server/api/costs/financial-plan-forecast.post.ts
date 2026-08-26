import { defineEventHandler, readBody } from 'h3'
import { GetCostAndUsageCommand, type Expression } from '@aws-sdk/client-cost-explorer'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getUserEmail, requirePermission } from '../../utils/user-roles'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { resolveBillingView } from '../../utils/billing-views'
import { getCostAndUsage, getCostForecast } from '../../utils/cost-explorer'
import { batchForecastCalls } from '../../utils/forecast-batcher'
import { getCostExplorerClient } from '../../lib/aws-client-factory'
import { saveFinancialPlan } from '../../utils/financial-plan-history'
import { logger } from '../../utils/logger'

const DEPARTMENTS = new Set(['DE158', 'DT509', 'DT328'])
const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const DEV_ORG_ACCOUNT_ID = process.env.AWS_DEV_ORG_ACCOUNT_ID || '266632029214'
const DEV_ORG_VIEW_NAME = process.env.AWS_DEV_ORG_BILLING_VIEW_NAME || 'GDMS-DevOrg'
const DEV_ORG_MASTER_ACCOUNT_ID = process.env.AWS_DEV_ORG_MASTER_ACCOUNT_ID
// Cost Explorer has used more than one SERVICE dimension value for Savings
// Plans. Exclude every canonical variant so the payer forecast matches the
// console's Savings Plans exclusion across historical and forecast periods.
const SAVINGS_PLAN_SERVICES = [
  'Savings Plans for Compute usage',
  'Savings Plans for AWS Compute usage',
  'EC2 Instance Savings Plans',
  'Savings Plans'
]
// Finance excludes pre-chargeback and LAS-APNT-CLD accounts from both actuals
// and forecasts. Keep this list aligned with budget-vs-actual reporting.
const EXCLUDED_ACCOUNT_IDS = new Set([
  '110317593805',
  '767397758347',
  '105013955011'
])

interface SpecialComponent { id: string; filter?: Expression; accountId?: string; billingViewArn?: string }

function accountDepartment(account: any) {
  return String(account.pepDepartment || account.departmentNumber || account.department || '').trim().toUpperCase()
}

function isForecastEligibleAccount(account: { pepEnvironmentStatus: string; enclaveStatus: string }) {
  const pepStatus = account.pepEnvironmentStatus.trim().toLowerCase()
  if (pepStatus) return pepStatus === 'sustainment' || pepStatus === 'provisional sustainment'
  return account.enclaveStatus.trim().toLowerCase() === 'active'
}

function addForecast(target: Record<string, number>, forecast: any, postingMonthOffset = 0) {
  for (const point of forecast?.forecastResultsByTime || []) {
    const start = point.TimePeriod?.Start
    if (!start) continue
    const postingMonth = new Date(`${start}T00:00:00Z`)
    postingMonth.setUTCMonth(postingMonth.getUTCMonth() + postingMonthOffset)
    postingMonth.setUTCDate(1)
    const key = postingMonth.toISOString().slice(0, 10)
    target[key] = (target[key] || 0) + Number(point.MeanValue || 0)
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
    addForecast(monthly, result.data, 1)
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
      addForecast(componentMonths, forecast, 1)
      byComponentMonth[component.id] = componentMonths
      for (const [month, value] of Object.entries(componentMonths)) byMonth[month] = (byMonth[month] || 0) + value
    } catch (error) {
      failures.push({ id: component.id, message: error instanceof Error ? error.message : 'Unknown Cost Explorer error' })
    }
  }
  return { byMonth, byComponentMonth, failures }
}

async function loadCurrentAccountActuals(accountIds: string[], startDate: string, endDate: string) {
  if (!accountIds.length) return {} as Record<string, number>
  const response = await getCostAndUsage({
    startDate,
    endDate,
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost'],
    groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }],
    filter: { Dimensions: { Key: 'LINKED_ACCOUNT', Values: accountIds } }
  }, 'commercial', process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832')
  const totals: Record<string, number> = {}
  for (const period of response.resultsByTime || []) {
    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      if (accountId) totals[accountId] = (totals[accountId] || 0) + Number(group.Metrics?.UnblendedCost?.Amount || 0)
    }
  }
  return totals
}

async function loadCurrentSpecialActuals(components: SpecialComponent[], startDate: string, endDate: string) {
  const totals: Record<string, number> = {}
  for (const component of components) {
    const response = await getCostAndUsage({
      startDate,
      endDate,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost'],
      groupBy: [{ type: 'DIMENSION', key: 'SERVICE' }],
      filter: component.filter
    }, 'commercial', component.accountId)
    totals[component.id] = (response.resultsByTime || []).reduce(
      (sum, period) => sum + (period.Groups || []).reduce(
        (periodSum, group) => periodSum + Number(group.Metrics?.UnblendedCost?.Amount || 0),
        0
      ),
      0
    )
  }
  return totals
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
      { Not: { Dimensions: { Key: 'SERVICE', Values: SAVINGS_PLAN_SERVICES } } }
    ] } })
  }

  // Finance posts the preceding usage month in the current month. The Finance
  // page supplies that posted proforma chargeback as an actual, so it must not
  // also receive a forecast remainder.
  const currentMonth = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  // GetCostForecast cannot start before today. The daily forecast covers the
  // remainder of the current usage month and is posted to the next Finance month.
  const currentForecastStart = today.toISOString().slice(0, 10)
  const currentUsageStart = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(today)
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
  const currentEnd = nextMonth.toISOString().slice(0, 10)
  const futureEnd = `${year + 1}-01-01`
  const normalCurrent = normalAccountIds.length ? await forecastAccounts(normalAccountIds, currentForecastStart, currentEnd, 'DAILY') : { byMonth: {}, byAccountMonth: {}, failures: [] as Array<{ id: string; message: string }> }
  const normalFuture = normalAccountIds.length && currentEnd < futureEnd ? await forecastAccounts(normalAccountIds, currentEnd, futureEnd, 'MONTHLY') : { byMonth: {}, byAccountMonth: {}, failures: [] as Array<{ id: string; message: string }> }
  const specialCurrent = await forecastSpecial(special, currentForecastStart, currentEnd, 'DAILY')
  const specialFuture = currentEnd < futureEnd ? await forecastSpecial(special, currentEnd, futureEnd, 'MONTHLY') : { byMonth: {}, byComponentMonth: {}, failures: [] as Array<{ id: string; message: string }> }
  let devOrgFuture: any
  try {
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

  // The next Finance posting month is the current calendar month's accrued
  // chargeback plus its remaining-days forecast. Store one combined value so
  // the ledger cannot double-count or show one row per forecast day.
  const [currentAccountActuals, currentSpecialActuals] = await Promise.all([
    loadCurrentAccountActuals(normalAccountIds, currentUsageStart, currentForecastStart),
    loadCurrentSpecialActuals(special, currentUsageStart, currentForecastStart)
  ])
  for (const [accountId, actual] of Object.entries(currentAccountActuals)) {
    normalCurrent.byAccountMonth[accountId] = normalCurrent.byAccountMonth[accountId] || {}
    normalCurrent.byAccountMonth[accountId][currentEnd] = (normalCurrent.byAccountMonth[accountId][currentEnd] || 0) + actual
    normalCurrent.byMonth[currentEnd] = (normalCurrent.byMonth[currentEnd] || 0) + actual
  }
  for (const [component, actual] of Object.entries(currentSpecialActuals)) {
    specialCurrent.byComponentMonth[component] = specialCurrent.byComponentMonth[component] || {}
    specialCurrent.byComponentMonth[component][currentEnd] = (specialCurrent.byComponentMonth[component][currentEnd] || 0) + actual
    specialCurrent.byMonth[currentEnd] = (specialCurrent.byMonth[currentEnd] || 0) + actual
  }

  const futureByMonth = { ...normalCurrent.byMonth, ...normalFuture.byMonth }
  for (const [month, value] of Object.entries(specialCurrent.byMonth)) futureByMonth[month] = (futureByMonth[month] || 0) + value
  for (const [month, value] of Object.entries(specialFuture.byMonth)) futureByMonth[month] = (futureByMonth[month] || 0) + value
  addForecast(futureByMonth, devOrgFuture, 1)
  const monthlyValues: Record<string, number> = {}
  for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, '0')}-01`
    monthlyValues[key] = key <= currentMonth ? Number(monthlyActuals[key] || 0) : futureByMonth[key] || 0
  }
  const specialComponentMonths: Record<string, Record<string, number>> = Object.fromEntries(
    special.map(component => [component.id, { ...specialCurrent.byComponentMonth[component.id], ...specialFuture.byComponentMonth[component.id] }])
  )
  if (devOrgViewArn) {
    specialComponentMonths['GDMS-DevOrg'] = {}
    addForecast(specialComponentMonths['GDMS-DevOrg'], devOrgFuture, 1)
  }
  for (const accountId of accountIds) {
    const actual = Number(accountMonthlyActuals?.[accountId] || 0)
    if (!actual) continue
    normalFuture.byAccountMonth[accountId] = normalFuture.byAccountMonth[accountId] || {}
    normalFuture.byAccountMonth[accountId][currentMonth] = actual
  }
  for (const [component, value] of Object.entries(specialMonthlyActuals || {})) {
    const actual = Number(value || 0)
    if (actual) {
      specialComponentMonths[component] = specialComponentMonths[component] || {}
      specialComponentMonths[component][currentMonth] = actual
    }
  }
  const forecastComposition = {
    allocationMethod: 'posted-proforma-chargeback-actuals-plus-individual-cost-dashboard-forecast-requests',
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
        'GDMS Cloud': 'Payer-account forecast with the Savings Plans service excluded, matching the Cost Explorer console filter.',
        'GDMS-DevOrg': 'Whole Billing View forecast, matching the AWS console.',
        'Secret Cloud': 'Historical Finance-supplied actuals only; no future forecast is added without Finance-provided values.'
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
    months: Object.keys(monthlyValues).sort(),
    changes,
    reasons: [
      { component: 'Posted chargeback months', reason: 'Plan is reset to the posted proforma chargeback values.' },
      { component: 'Normal accounts', reason: 'Individual Cost Dashboard-style AWS forecasts.' },
      ...(department === 'DE158' ? [
        { component: 'GDMS Cloud', reason: 'Payer-account forecast with the Savings Plans service excluded, matching the Cost Explorer console filter.' },
        { component: 'GDMS-DevOrg', reason: 'Whole Billing View forecast, matching the AWS console.' },
        { component: 'Secret Cloud', reason: 'Finance-supplied historical actuals are included when rebasing completed months; no future Secret Cloud forecast is added without Finance-provided values.' }
      ] : [])
    ],
    forecastComposition,
    historicalActualBreakdown
  }
  if (previewOnly) return sendSuccess(event, { monthlyValues, preview, components: { normalAccountCount: normalAccountIds.length, devOrgMemberCount: devOrgMembers.length, excludedCatalogAccounts } })
  const entry = await saveFinancialPlan({ department, year, monthlyValues, action: 'forecast-generated', actor: getUserEmail(event) || 'Unknown user', forecastComposition })
  return sendSuccess(event, { monthlyValues, entry, forecastComposition, components: { normalAccountCount: normalAccountIds.length, devOrgMemberCount: devOrgMembers.length, excludedCatalogAccounts, special: [...special.map(component => component.id), ...(devOrgViewArn ? ['GDMS-DevOrg'] : [])] } })
}))
