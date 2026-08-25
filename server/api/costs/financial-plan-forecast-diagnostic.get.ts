import { defineEventHandler, getQuery } from 'h3'
import { GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { requirePermission } from '../../utils/user-roles'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { resolveBillingView } from '../../utils/billing-views'
import { getCostExplorerClient } from '../../lib/aws-client-factory'
import { getCostForecast } from '../../utils/cost-explorer'

const DEPARTMENTS = new Set(['DE158', 'DT509', 'DT328'])
const CHARGEBACK_VIEW_NAME = process.env.AWS_GDMS_CHARGEBACK_BILLING_VIEW_NAME || 'GDMS_Chargeback'
const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const DEV_ORG_ACCOUNT_ID = process.env.AWS_DEV_ORG_ACCOUNT_ID || '266632029214'
const EXCLUDED_ACCOUNT_IDS = new Set(['110317593805'])

function accountDepartment(account: any) {
  return String(account.pepDepartment || account.departmentNumber || account.department || '').trim().toUpperCase()
}

function nextMonthStart(date: Date) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + 1, 1)
  return next.toISOString().slice(0, 10)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown AWS error'
}

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')
  const query = getQuery(event)
  const department = String(query.department || '').trim().toUpperCase()
  const requestedAccountId = String(query.accountId || '').trim()
  if (!DEPARTMENTS.has(department)) return errors.badRequest(event, 'department must be DE158, DT509, or DT328')

  const view = await resolveBillingView(CHARGEBACK_VIEW_NAME)
  const billingViewArn = process.env.AWS_GDMS_CHARGEBACK_BILLING_VIEW_ARN || view.arn
  if (!billingViewArn) return errors.badRequest(event, `Could not resolve ${CHARGEBACK_VIEW_NAME}`, view)

  const accounts = await getAllAccountsUnified(false)
  const accountIds = accounts
    .filter(account => accountDepartment(account) === department)
    .map(account => account.accountId || account.awsStandardAccountID)
    .filter((id): id is string => Boolean(id) && id !== PAYER_ACCOUNT_ID && id !== DEV_ORG_ACCOUNT_ID && !EXCLUDED_ACCOUNT_IDS.has(id))
    .filter(id => !requestedAccountId || id === requestedAccountId)
  if (!accountIds.length) return errors.badRequest(event, 'No matching chargeback accounts were found')

  const today = new Date()
  const historyStart = new Date(today)
  historyStart.setMonth(historyStart.getMonth() - 18, 1)
  const historyEnd = today.toISOString().slice(0, 10)
  const currentEnd = nextMonthStart(today)
  const futureEnd = `${today.getFullYear() + 1}-01-01`
  const client = await getCostExplorerClient('commercial', 'us-east-1')
  const historical = await client.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: historyStart.toISOString().slice(0, 10), End: historyEnd },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' }],
    Filter: { Dimensions: { Key: 'LINKED_ACCOUNT', Values: accountIds } },
    BillingViewArn: billingViewArn
  }))
  const historyByAccount = new Map<string, Array<{ month: string; amount: number }>>()
  for (const period of historical.ResultsByTime || []) {
    const month = period.TimePeriod?.Start || ''
    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      if (!accountId) continue
      const amount = Number(group.Metrics?.UnblendedCost?.Amount || 0)
      const values = historyByAccount.get(accountId) || []
      values.push({ month, amount })
      historyByAccount.set(accountId, values)
    }
  }

  const components = []
  for (const accountId of accountIds) {
    const filter = { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [accountId] } }
    const [current, future] = await Promise.allSettled([
      getCostForecast(today.toISOString().slice(0, 10), currentEnd, 'UNBLENDED_COST', 'DAILY', filter, 'commercial', undefined, { billingViewArn }),
      currentEnd < futureEnd
        ? getCostForecast(currentEnd, futureEnd, 'UNBLENDED_COST', 'MONTHLY', filter, 'commercial', undefined, { billingViewArn })
        : Promise.resolve({ forecastResultsByTime: [] })
    ])
    const history = historyByAccount.get(accountId) || []
    components.push({
      accountId,
      history: {
        returnedMonths: history.length,
        nonZeroMonths: history.filter(point => point.amount !== 0).length,
        total: history.reduce((sum, point) => sum + point.amount, 0),
        monthly: history
      },
      currentForecast: current.status === 'fulfilled'
        ? { ok: true, periods: current.value.forecastResultsByTime.length }
        : { ok: false, error: errorMessage(current.reason) },
      futureForecast: future.status === 'fulfilled'
        ? { ok: true, periods: future.value.forecastResultsByTime.length }
        : { ok: false, error: errorMessage(future.reason) }
    })
  }

  return sendSuccess(event, {
    department,
    billingView: { name: CHARGEBACK_VIEW_NAME, arn: billingViewArn },
    ranges: { historyStart: historyStart.toISOString().slice(0, 10), historyEnd, currentStart: today.toISOString().slice(0, 10), currentEnd, futureEnd },
    components
  })
}))
