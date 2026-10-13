import { TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { getDynamoDBClient } from '../lib/aws-client-factory'
import { getDynamoDBConfig } from '../lib/dynamodb-config'
import { getItem, queryItems } from './dynamodb'
import { logger } from './logger'

export type FinancialPlanChangeType = 'manual-save' | 'forecast-generated' | 'reverted'

export interface FinancialPlanHistoryEntry {
  pk: string
  sk: string
  department: string
  year: number
  action: FinancialPlanChangeType
  actor: string
  createdAt: string
  monthlyValues: Record<string, number>
  previousMonthlyValues: Record<string, number>
  sourceHistoryKey?: string
  forecastComposition?: Record<string, unknown>
}

export function financialPlanKey(department: string, year: number) {
  return `PLAN#${department}#${year}`
}

function monthlyValueAttributes(monthlyValues: Record<string, number>) {
  const attributes: Record<string, number> = {}
  for (const [isoMonth, value] of Object.entries(monthlyValues)) {
    const match = isoMonth.match(/^(\d{4})-(\d{2})-01$/)
    if (match) attributes[`${match[2]}/${match[1]}`] = Math.round(value * 100) / 100
  }
  return attributes
}

function readMonthlyValues(item: Record<string, any> | null, years: Set<number>) {
  const monthlyValues: Record<string, number> = {}
  for (const [key, value] of Object.entries(item || {})) {
    const match = key.match(/^(\d{2})\/(\d{4})$/)
    if (match && years.has(Number(match[2]))) monthlyValues[`${match[2]}-${match[1]}-01`] = Number(value)
  }
  return monthlyValues
}

export async function saveFinancialPlan(input: {
  department: string
  year: number
  monthlyValues: Record<string, number>
  action: FinancialPlanChangeType
  actor: string
  sourceHistoryKey?: string
  forecastComposition?: Record<string, unknown>
}) {
  const config = await getDynamoDBConfig()
  const plan = config.financialPlanOverrides
  const history = config.financialPlanHistory
  const current = await getItem(plan.tableName, { pk: input.department }, plan.environment, plan.accountId)
  const affectedYears = new Set(Object.keys(input.monthlyValues).map(month => Number(month.slice(0, 4))).filter(Number.isInteger))
  const previousMonthlyValues = readMonthlyValues(current, affectedYears.size ? affectedYears : new Set([input.year]))
  const createdAt = new Date().toISOString()
  const entry: FinancialPlanHistoryEntry = {
    pk: financialPlanKey(input.department, input.year),
    sk: `${createdAt}#${crypto.randomUUID()}`,
    department: input.department,
    year: input.year,
    action: input.action,
    actor: input.actor || 'Unknown user',
    createdAt,
    monthlyValues: input.monthlyValues,
    previousMonthlyValues,
    sourceHistoryKey: input.sourceHistoryKey,
    forecastComposition: input.forecastComposition
  }
  const planItem = { ...(current || {}), pk: input.department, ...monthlyValueAttributes(input.monthlyValues) }
  const client = await getDynamoDBClient(plan.environment, undefined, plan.accountId)
  await client.send(new TransactWriteItemsCommand({
    TransactItems: [
      { Put: { TableName: plan.tableName, Item: marshall(planItem, { removeUndefinedValues: true }) } },
      { Put: { TableName: history.tableName, Item: marshall(entry, { removeUndefinedValues: true }) } }
    ]
  }))
  return entry
}

export async function getFinancialPlanHistory(department: string, year: number) {
  const startedAt = Date.now()
  let table: Awaited<ReturnType<typeof getDynamoDBConfig>>['financialPlanHistory'] | undefined
  try {
    const config = await getDynamoDBConfig()
    table = config.financialPlanHistory
    const response = await queryItems({
      tableName: table.tableName,
      queryExpression: 'pk = :pk',
      expressionAttributeValues: { ':pk': financialPlanKey(department, year) },
      scanIndexForward: false
    }, table.environment, table.accountId)
    logger.debug('financial_plan_history_read_succeeded', {
      signature: 'financial_plan_history_read_succeeded',
      operation: 'query',
      department: department.slice(0, 32),
      year,
      tableName: table.tableName,
      environment: table.environment,
      accountId: table.accountId,
      count: response.items.length,
      durationMs: Date.now() - startedAt
    })
    return response.items as FinancialPlanHistoryEntry[]
  } catch (error) {
    const candidate = error as { name?: unknown, message?: unknown }
    logger.error('financial_plan_history_read_failed', {
      signature: 'financial_plan_history_read_failed',
      operation: 'query',
      department: department.slice(0, 32),
      year,
      tableName: table?.tableName,
      environment: table?.environment,
      accountId: table?.accountId,
      errorName: typeof candidate?.name === 'string' ? candidate.name.slice(0, 80) : 'UnknownError',
      errorMessage: typeof candidate?.message === 'string' ? candidate.message.slice(0, 500) : 'Unknown error',
      durationMs: Date.now() - startedAt
    })
    throw error
  }
}
