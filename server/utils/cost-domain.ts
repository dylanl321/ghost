import {
  GetCostAndUsageCommand,
  type CostExplorerClient,
  type Expression,
  type GetCostAndUsageCommandInput,
  type GetCostAndUsageCommandOutput,
  type Group,
  type GroupDefinition,
  type MetricValue,
  type ResultByTime
} from '@aws-sdk/client-cost-explorer'
import type {
  CostAmount,
  CostDataset,
  CostGroup,
  CostMetric,
  CostPeriod,
  CostSource,
  Reconciliation
} from '../../shared/types/cost-domain'
import type { CostExplorerParams } from '../types'
import { getCostExplorerClient } from '../lib/aws-client-factory'
import { logger } from './logger'

export interface LegacyCostResponse {
  resultsByTime: ResultByTime[]
  dimensionValueAttributes: Array<Record<string, unknown>>
  total: Record<string, MetricValue>
  dataset: CostDataset
}

interface QueryOptions {
  environment?: 'commercial' | 'govcloud'
  source?: CostSource
  accountId?: string
  client?: CostExplorerClient
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const AUTHORITATIVE_METRIC: CostMetric = 'UnblendedCost'

function numberValue(value?: string): number {
  const parsed = Number.parseFloat(value || '0')
  return Number.isFinite(parsed) ? parsed : 0
}

function periodKey(period?: { Start?: string; End?: string }): string {
  return `${period?.Start || ''}|${period?.End || ''}`
}

function groupKey(group: Group): string {
  return JSON.stringify(group.Keys || [])
}

function addMetricValues(
  target: Record<string, MetricValue>,
  source: Record<string, MetricValue> | undefined
): void {
  for (const [metric, value] of Object.entries(source || {})) {
    const current = target[metric]
    target[metric] = {
      Amount: String(numberValue(current?.Amount) + numberValue(value?.Amount)),
      Unit: value?.Unit || current?.Unit
    }
  }
}

function cloneMetricValues(values?: Record<string, MetricValue>): Record<string, MetricValue> {
  return Object.fromEntries(Object.entries(values || {}).map(([metric, value]) => [metric, { ...value }]))
}

/** Merge Cost Explorer pages by their full time interval, not array position. */
export function mergeCostExplorerPeriods(pages: ResultByTime[][]): ResultByTime[] {
  const periods = new Map<string, ResultByTime>()
  const groupMaps = new Map<string, Map<string, Group>>()

  for (const page of pages) {
    for (const incoming of page || []) {
      const key = periodKey(incoming.TimePeriod)
      if (!key || key === '|') continue

      let period = periods.get(key)
      if (!period) {
        period = {
          ...incoming,
          TimePeriod: incoming.TimePeriod ? { ...incoming.TimePeriod } : undefined,
          Total: cloneMetricValues(incoming.Total),
          Groups: []
        }
        periods.set(key, period)
        groupMaps.set(key, new Map())
      } else {
        period.Estimated = Boolean(period.Estimated || incoming.Estimated)
        if (incoming.Total && Object.keys(incoming.Total).length > 0) {
          period.Total = cloneMetricValues(incoming.Total)
        }
      }

      const groups = groupMaps.get(key)!
      for (const incomingGroup of incoming.Groups || []) {
        const identity = groupKey(incomingGroup)
        const existing = groups.get(identity)
        if (!existing) {
          groups.set(identity, {
            ...incomingGroup,
            Keys: [...(incomingGroup.Keys || [])],
            Metrics: cloneMetricValues(incomingGroup.Metrics)
          })
          continue
        }

        // A logical group may be split across pages. Aggregate its signed metrics once.
        const metrics = cloneMetricValues(existing.Metrics)
        addMetricValues(metrics, incomingGroup.Metrics)
        existing.Metrics = metrics
      }

      period.Groups = [...groups.values()]
    }
  }

  return [...periods.values()].sort((a, b) => periodKey(a.TimePeriod).localeCompare(periodKey(b.TimePeriod)))
}

export function sumPeriodMetric(periods: ResultByTime[], metric: string): number {
  return periods.reduce((sum, period) => sum + numberValue(period.Total?.[metric]?.Amount), 0)
}

export function sumGroupedMetric(periods: ResultByTime[], metric: string): number {
  return periods.reduce((periodSum, period) => periodSum + (period.Groups || []).reduce(
    (groupSum, group) => groupSum + numberValue(group.Metrics?.[metric]?.Amount),
    0
  ), 0)
}

export function buildReconciliation(
  periods: ResultByTime[],
  metric: string = AUTHORITATIVE_METRIC
): Reconciliation {
  const authoritativeTotal = sumPeriodMetric(periods, metric)
  const hasGroups = periods.some(period => (period.Groups?.length || 0) > 0)
  const groupedTotal = hasGroups ? sumGroupedMetric(periods, metric) : authoritativeTotal
  const delta = authoritativeTotal - groupedTotal
  return {
    authoritativeTotal,
    groupedTotal,
    delta,
    reconciled: Math.abs(delta) <= 0.01
  }
}

function canonicalAmount(value?: MetricValue): CostAmount {
  return { amount: numberValue(value?.Amount), unit: value?.Unit || 'USD' }
}

function canonicalMetrics(values?: Record<string, MetricValue>): Record<string, CostAmount> {
  return Object.fromEntries(Object.entries(values || {}).map(([metric, value]) => [metric, canonicalAmount(value)]))
}

function canonicalGroup(group: Group): CostGroup {
  return {
    keys: [...(group.Keys || [])],
    metrics: canonicalMetrics(group.Metrics)
  }
}

function canonicalPeriod(period: ResultByTime): CostPeriod {
  return {
    start: period.TimePeriod?.Start || '',
    end: period.TimePeriod?.End || '',
    total: canonicalMetrics(period.Total),
    groups: (period.Groups || []).map(canonicalGroup),
    estimated: Boolean(period.Estimated)
  }
}

export function validateCostQuery(params: CostExplorerParams): void {
  if (!DATE_PATTERN.test(params.startDate) || !DATE_PATTERN.test(params.endDate)) {
    throw new Error('Cost Explorer dates must use YYYY-MM-DD format')
  }
  if (params.startDate > params.endDate) {
    throw new Error('Cost Explorer startDate must be before endDate')
  }
  if (!params.metrics.includes(AUTHORITATIVE_METRIC)) {
    throw new Error('UnblendedCost is required for authoritative cost queries')
  }
}

export function buildCostFilter(options: {
  accountIds?: string[]
  tagKey?: string
  tagValues?: string[]
}): Expression | undefined {
  const expressions: Expression[] = []
  if (options.accountIds?.length) {
    expressions.push({
      Dimensions: {
        Key: 'LINKED_ACCOUNT',
        Values: [...new Set(options.accountIds)].sort(),
        MatchOptions: ['EQUALS']
      }
    })
  }
  if (options.tagKey && options.tagValues?.length) {
    expressions.push({
      Tags: {
        Key: options.tagKey,
        Values: [...new Set(options.tagValues)].sort(),
        MatchOptions: ['EQUALS']
      }
    })
  }
  if (expressions.length === 0) return undefined
  return expressions.length === 1 ? expressions[0] : { And: expressions }
}

export function createCostCacheKey(params: CostExplorerParams, source: CostSource, accountId: string): string {
  return JSON.stringify({
    source,
    accountId,
    metric: AUTHORITATIVE_METRIC,
    startDate: params.startDate,
    endDate: params.endDate,
    granularity: params.granularity,
    groupBy: params.groupBy || [],
    filter: params.filter || null
  })
}

async function fetchPages(
  client: CostExplorerClient,
  input: Omit<GetCostAndUsageCommandInput, 'NextPageToken'>
): Promise<{ pages: ResultByTime[][]; attributes: Array<Record<string, unknown>> }> {
  const pages: ResultByTime[][] = []
  const attributes = new Map<string, Record<string, unknown>>()
  let nextPageToken: string | undefined

  do {
    const response: GetCostAndUsageCommandOutput = await client.send(new GetCostAndUsageCommand({
      ...input,
      NextPageToken: nextPageToken
    }))
    pages.push(response.ResultsByTime || [])
    for (const attribute of response.DimensionValueAttributes || []) {
      attributes.set(JSON.stringify(attribute), attribute as unknown as Record<string, unknown>)
    }
    nextPageToken = response.NextPageToken
  } while (nextPageToken)

  return { pages, attributes: [...attributes.values()] }
}

function emptyLegacyResponse(params: CostExplorerParams, source: CostSource, accountId: string): LegacyCostResponse {
  return {
    resultsByTime: [],
    dimensionValueAttributes: [],
    total: {},
    dataset: {
      source,
      billingDomain: source,
      accountId,
      metric: AUTHORITATIVE_METRIC,
      granularity: params.granularity,
      startDate: params.startDate,
      endDate: params.endDate,
      dataThroughDate: null,
      estimated: false,
      empty: true,
      periods: [],
      reconciliation: {
        authoritativeTotal: 0,
        groupedTotal: 0,
        delta: 0,
        reconciled: true
      }
    }
  }
}

export async function queryCostDataset(
  params: CostExplorerParams,
  options: QueryOptions = {}
): Promise<LegacyCostResponse> {
  validateCostQuery(params)
  const environment = options.environment || 'commercial'
  const source = options.source || 'billable'
  const targetAccountId = options.accountId || (environment === 'commercial'
    ? source === 'proforma'
      ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
      : process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
    : undefined)
  const accountId = targetAccountId || process.env.AWS_GOVCLOUD_MASTER_ACCOUNT_ID || 'current-credentials'

  // Current periods are explicitly empty when their exclusive end equals their start.
  if (params.startDate === params.endDate) return emptyLegacyResponse(params, source, accountId)

  const client = options.client || await getCostExplorerClient(environment, undefined, targetAccountId)
  const groupBy: GroupDefinition[] | undefined = params.groupBy?.map(group => ({
    Type: group.type,
    Key: group.key
  }))
  const input: Omit<GetCostAndUsageCommandInput, 'NextPageToken'> = {
    TimePeriod: { Start: params.startDate, End: params.endDate },
    Granularity: params.granularity,
    Metrics: params.metrics,
    GroupBy: groupBy,
    Filter: params.filter
  }

  const groupedPromise = fetchPages(client, input)
  const totalsPromise = groupBy?.length
    ? fetchPages(client, { ...input, GroupBy: undefined })
    : null
  const [{ pages, attributes }, totalsResult] = await Promise.all([groupedPromise, totalsPromise])
  const resultsByTime = mergeCostExplorerPeriods(pages)

  if (totalsResult) {
    const totalsByPeriod = new Map(
      mergeCostExplorerPeriods(totalsResult.pages).map(period => [periodKey(period.TimePeriod), period.Total || {}])
    )
    for (const period of resultsByTime) {
      const authoritative = totalsByPeriod.get(periodKey(period.TimePeriod))
      if (authoritative) period.Total = cloneMetricValues(authoritative)
    }
  }

  const total: Record<string, MetricValue> = {}
  for (const metric of params.metrics) {
    const firstUnit = resultsByTime.find(period => period.Total?.[metric])?.Total?.[metric]?.Unit || 'USD'
    total[metric] = { Amount: String(sumPeriodMetric(resultsByTime, metric)), Unit: firstUnit }
  }
  const reconciliation = buildReconciliation(resultsByTime)
  const canonicalPeriods = resultsByTime.map(canonicalPeriod)
  const dataset: CostDataset = {
    source,
    billingDomain: source,
    accountId,
    metric: AUTHORITATIVE_METRIC,
    granularity: params.granularity,
    startDate: params.startDate,
    endDate: params.endDate,
    dataThroughDate: canonicalPeriods.at(-1)?.end
      ? new Date(new Date(`${canonicalPeriods.at(-1)!.end}T00:00:00.000Z`).getTime() - 86400000).toISOString().slice(0, 10)
      : null,
    estimated: canonicalPeriods.some(period => period.estimated),
    empty: canonicalPeriods.length === 0,
    periods: canonicalPeriods,
    reconciliation
  }

  logger.debug('Cost domain query complete', {
    source,
    accountId,
    periods: resultsByTime.length,
    authoritativeTotal: reconciliation.authoritativeTotal,
    groupedTotal: reconciliation.groupedTotal,
    delta: reconciliation.delta
  })

  return { resultsByTime, dimensionValueAttributes: attributes, total, dataset }
}

export async function queryBillingDomains(
  params: CostExplorerParams,
  proformaAccountId: string,
  masterAccountId: string
): Promise<{ billable: LegacyCostResponse; proforma: LegacyCostResponse }> {
  const [billable, proforma] = await Promise.all([
    queryCostDataset(params, {
      environment: 'commercial',
      source: 'billable',
      accountId: masterAccountId
    }),
    queryCostDataset(params, {
      environment: 'commercial',
      source: 'proforma',
      accountId: proformaAccountId
    })
  ])
  return { billable, proforma }
}
