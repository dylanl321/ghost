/**
 * CloudTrail event reader backed by the organization trail's CloudWatch log group.
 * Account-specific stream prefixes keep bounded lookups from scanning the full organization log.
 */
import { FilterLogEventsCommand, type FilteredLogEvent } from '@aws-sdk/client-cloudwatch-logs'
import { getCloudWatchLogsClient } from '../lib/aws-client-factory'
import type {
  CloudTrailDatasetFilters,
  CloudTrailEventRecord,
  DatasetQueryOptions,
  DatasetQueryResult
} from '../../shared/types/dataset-reports'
import { getAllAccountsUnified, type UnifiedAccount } from './accounts-consolidated'
import { logger } from './logger'

const DEFAULT_LOOKBACK_DAYS = 7
const MAX_LOOKBACK_DAYS = 90
const MAX_FILTER_PAGES = 20
const ACCOUNT_QUERY_CONCURRENCY = 4

export interface OrganizationCloudTrailConfig {
  environment: 'commercial' | 'govcloud'
  managementAccountId: string
  organizationId: string
  region: string
  logGroupName: string
}

interface CloudTrailCursor {
  environment: 'commercial' | 'govcloud'
  tokens: Record<string, string>
}

function accountIds(account: UnifiedAccount) {
  return {
    commercial: account.accountId || account.awsStandardAccountID,
    govcloud: account.govCloudAccountId || account.awsGovCloudAccountID
  }
}

function accountName(account: UnifiedAccount): string {
  return account.name || account.projectName || account.accountName || account.accountId || account.govCloudAccountId || 'Unknown account'
}

export async function getOrganizationCloudTrailConfig(
  environment: 'commercial' | 'govcloud'
): Promise<OrganizationCloudTrailConfig> {
  const defaults = environment === 'govcloud'
    ? {
        managementAccountId: '374673712317',
        organizationId: 'o-oiu9mwd7zf',
        region: 'us-gov-west-1',
        logGroupName: 'aws-cloudtrail-logs-374673712317-d7a04176'
      }
    : {
        managementAccountId: '205950196477',
        organizationId: 'o-sb7o7424ts',
        region: 'us-east-1',
        logGroupName: 'CloudTrail/DefaultLogGroup'
      }
  const prefix = environment === 'govcloud' ? 'GOVCLOUD' : 'COMMERCIAL'
  return {
    environment,
    managementAccountId: process.env[`GHOST_CLOUDTRAIL_${prefix}_ACCOUNT_ID`] || defaults.managementAccountId,
    organizationId: process.env[`GHOST_CLOUDTRAIL_${prefix}_ORGANIZATION_ID`] || defaults.organizationId,
    region: process.env[`GHOST_CLOUDTRAIL_${prefix}_REGION`] || defaults.region,
    logGroupName: process.env[`GHOST_CLOUDTRAIL_${prefix}_LOG_GROUP`] || defaults.logGroupName
  }
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function anyOf(expressions: string[]): string | undefined {
  if (!expressions.length) return undefined
  return expressions.length === 1 ? expressions[0] : `(${expressions.join(' || ')})`
}

export function buildCloudTrailFilterPattern(filters: CloudTrailDatasetFilters): string | undefined {
  const conditions: string[] = []
  const eventNames = anyOf((filters.eventNames || []).map(value => `$.eventName = ${quote(value)}`))
  const eventSources = anyOf((filters.eventSources || []).map(value => `$.eventSource = ${quote(value)}`))
  const eventTypes = anyOf((filters.eventTypes || []).map(value => `$.eventType = ${quote(value)}`))
  const regions = anyOf((filters.regions || []).map(value => `$.awsRegion = ${quote(value)}`))
  const identities = anyOf((filters.userIdentities || []).flatMap(value => [
    `$.userIdentity.userName = ${quote(value)}`,
    `$.userIdentity.sessionContext.sessionIssuer.userName = ${quote(value)}`,
    `$.userIdentity.principalId = ${quote(value)}`
  ]))
  for (const condition of [eventNames, eventSources, eventTypes, regions, identities]) {
    if (condition) conditions.push(condition)
  }
  if (filters.writeEventsOnly) conditions.push('$.readOnly = false')
  if (filters.errorsOnly) conditions.push('$.errorCode = *')
  if (!conditions.length) return undefined
  return `{ ${conditions.map(condition => `(${condition})`).join(' && ')} }`
}

function normalizeEvent(event: FilteredLogEvent, target: { accountId: string; accountName: string }): CloudTrailEventRecord | null {
  let raw: any
  try {
    raw = JSON.parse(event.message || '')
  } catch {
    return null
  }
  const identity = raw.userIdentity || {}
  const sessionIssuer = identity.sessionContext?.sessionIssuer || {}
  const eventName = raw.eventName || ''
  const readOnly = typeof raw.readOnly === 'boolean'
    ? raw.readOnly
    : /^(Get|List|Describe|Lookup|Head|BatchGet)/.test(eventName)
  return {
    accountId: raw.recipientAccountId || identity.accountId || target.accountId,
    accountName: target.accountName,
    region: raw.awsRegion || 'unknown',
    eventId: raw.eventID || event.eventId || '',
    eventName,
    eventType: raw.eventType || 'AwsApiCall',
    eventTime: raw.eventTime || new Date(event.timestamp || 0).toISOString(),
    eventSource: raw.eventSource || '',
    userIdentityType: identity.type || 'Unknown',
    userIdentityPrincipalId: identity.principalId,
    userIdentityArn: identity.arn,
    userIdentityUserName: identity.userName || sessionIssuer.userName,
    sourceIPAddress: raw.sourceIPAddress,
    userAgent: raw.userAgent,
    errorCode: raw.errorCode,
    errorMessage: raw.errorMessage,
    readOnly,
    resources: Array.isArray(raw.resources) ? raw.resources.map((resource: any) => ({
      type: resource.type || resource.resourceType || '',
      name: resource.resourceName || resource.ARN || '',
      arn: resource.ARN
    })) : undefined,
    requestParameters: raw.requestParameters,
    responseElements: raw.responseElements
  }
}

function encodeCursor(cursor: CloudTrailCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string | undefined, environment: 'commercial' | 'govcloud'): CloudTrailCursor {
  if (!cursor) return { environment, tokens: {} }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CloudTrailCursor
    if (parsed.environment !== environment || !parsed.tokens || typeof parsed.tokens !== 'object') throw new Error('scope mismatch')
    return parsed
  } catch {
    const error = new Error('Invalid or mismatched CloudTrail pagination cursor.')
    error.name = 'INVALID_CURSOR'
    throw error
  }
}

async function resolveTargets(accountIdsInput: string[], environment: 'commercial' | 'govcloud') {
  const accounts = await getAllAccountsUnified(true)
  const byId = new Map<string, UnifiedAccount>()
  for (const account of accounts) {
    const ids = accountIds(account)
    if (ids.commercial) byId.set(ids.commercial, account)
    if (ids.govcloud) byId.set(ids.govcloud, account)
  }
  const selected = accountIdsInput.length ? accountIdsInput.map(id => byId.get(id)).filter((account): account is UnifiedAccount => Boolean(account)) : accounts
  if (accountIdsInput.length && selected.length !== accountIdsInput.length) {
    const resolvedIds = new Set(selected.flatMap(account => Object.values(accountIds(account)).filter(Boolean)))
    const missing = accountIdsInput.filter(id => !resolvedIds.has(id))
    const error = new Error(`CloudTrail account scope could not resolve: ${missing.join(', ')}`)
    error.name = 'ACCOUNT_NOT_FOUND'
    throw error
  }
  return selected.map(account => {
    const id = accountIds(account)[environment]
    return id ? { accountId: id, accountName: accountName(account) } : null
  }).filter((target): target is { accountId: string; accountName: string } => Boolean(target))
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index++
      results[current] = await task(items[current]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

async function queryAccount(
  client: Awaited<ReturnType<typeof getCloudWatchLogsClient>>,
  config: OrganizationCloudTrailConfig,
  target: { accountId: string; accountName: string },
  filters: CloudTrailDatasetFilters,
  startTime: number,
  endTime: number,
  limit: number,
  nextToken?: string,
  signal?: AbortSignal
) {
  const records: CloudTrailEventRecord[] = []
  let token = nextToken
  let pages = 0
  const filterPattern = buildCloudTrailFilterPattern(filters)
  do {
    const response = await client.send(new FilterLogEventsCommand({
      logGroupName: config.logGroupName,
      logStreamNamePrefix: `${config.organizationId}_${target.accountId}_CloudTrail_`,
      startTime,
      endTime,
      filterPattern,
      limit: Math.min(10_000, Math.max(limit - records.length, 1)),
      nextToken: token
    }), { abortSignal: signal })
    for (const event of response.events || []) {
      const normalized = normalizeEvent(event, target)
      if (normalized) records.push(normalized)
      if (records.length >= limit) break
    }
    const previous = token
    token = response.nextToken
    pages++
    if (token === previous) break
  } while (token && records.length < limit && pages < MAX_FILTER_PAGES)
  return { records, nextToken: token }
}

export async function getCloudTrailEvents(
  accountIds: string[],
  filters: CloudTrailDatasetFilters = {},
  options: DatasetQueryOptions = {}
): Promise<CloudTrailEventRecord[]> {
  return (await queryCloudTrailEvents(accountIds, filters, options)).records
}

export async function queryCloudTrailEvents(
  accountIds: string[],
  filters: CloudTrailDatasetFilters = {},
  options: DatasetQueryOptions = {}
): Promise<DatasetQueryResult<CloudTrailEventRecord>> {
  const environment = options.environment || (process.env.AWS_CLOUDTRAIL_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
  const lookbackDays = filters.lookbackDays || DEFAULT_LOOKBACK_DAYS
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > MAX_LOOKBACK_DAYS) {
    const error = new Error(`CloudTrail lookbackDays must be between 1 and ${MAX_LOOKBACK_DAYS}.`)
    error.name = 'OUT_OF_RANGE'
    throw error
  }
  const endDate = filters.endTime ? new Date(filters.endTime) : new Date()
  const startDate = filters.startTime ? new Date(filters.startTime) : new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
    const error = new Error('CloudTrail start time must be before the end time.')
    error.name = 'INVALID_TIME_RANGE'
    throw error
  }

  const [config, targets] = await Promise.all([
    getOrganizationCloudTrailConfig(environment),
    resolveTargets(accountIds, environment)
  ])
  const client = await getCloudWatchLogsClient(environment, config.region)
  const cursor = decodeCursor(options.cursor, environment)
  const limit = options.limit || 25
  const perAccountLimit = Math.max(limit, Math.ceil(limit / Math.max(targets.length, 1)))

  logger.info('[CloudTrail CloudWatch] Querying organization trail log group', {
    environment,
    managementAccountId: config.managementAccountId,
    region: config.region,
    logGroupName: config.logGroupName,
    accountCount: targets.length,
    lookbackDays
  })

  const results = await mapWithConcurrency(targets, ACCOUNT_QUERY_CONCURRENCY, target => queryAccount(
    client,
    config,
    target,
    filters,
    startDate.getTime(),
    endDate.getTime(),
    perAccountLimit,
    cursor.tokens[target.accountId],
    options.signal
  ))
  const allRecords = results.flatMap(result => result.records)
    .sort((left, right) => Date.parse(right.eventTime) - Date.parse(left.eventTime))
  const records = allRecords.slice(0, limit)
  const tokens = Object.fromEntries(results.flatMap((result, index) => result.nextToken
    ? [[targets[index]!.accountId, result.nextToken] as const]
    : []))
  const hasMore = Object.keys(tokens).length > 0 || allRecords.length > limit
  await options.onProgress?.({ phase: 'cloudwatch-cloudtrail', processed: records.length, total: limit })
  return {
    records,
    sampleCount: records.length,
    hasMore,
    truncated: hasMore,
    nextCursor: Object.keys(tokens).length ? encodeCursor({ environment, tokens }) : undefined
  }
}

export async function getCloudTrailEventStatistics(accountIds: string[], filters: CloudTrailDatasetFilters = {}) {
  const events = await getCloudTrailEvents(accountIds, filters)
  const eventsByType: Record<string, number> = {}
  const eventsByService: Record<string, number> = {}
  const eventsByName: Record<string, number> = {}
  const errorsByCode: Record<string, number> = {}
  const eventsByRegion: Record<string, number> = {}
  const userCounts = new Map<string, number>()
  let writeEvents = 0
  let readEvents = 0
  let errorEvents = 0
  for (const event of events) {
    eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1
    eventsByService[event.eventSource] = (eventsByService[event.eventSource] || 0) + 1
    eventsByName[event.eventName] = (eventsByName[event.eventName] || 0) + 1
    eventsByRegion[event.region] = (eventsByRegion[event.region] || 0) + 1
    if (event.userIdentityUserName) userCounts.set(event.userIdentityUserName, (userCounts.get(event.userIdentityUserName) || 0) + 1)
    if (event.readOnly) readEvents++
    else writeEvents++
    if (event.errorCode) {
      errorEvents++
      errorsByCode[event.errorCode] = (errorsByCode[event.errorCode] || 0) + 1
    }
  }
  const top = (values: Record<string, number>, key: string) => Object.entries(values)
    .map(([label, eventCount]) => ({ [key]: label, eventCount }))
    .sort((left, right) => right.eventCount - left.eventCount).slice(0, 10)
  return {
    totalEvents: events.length, eventsByType, eventsByService, eventsByName,
    topUsers: Array.from(userCounts, ([userName, eventCount]) => ({ userName, eventCount })).sort((a, b) => b.eventCount - a.eventCount).slice(0, 10),
    topServices: top(eventsByService, 'service') as Array<{ service: string; eventCount: number }>,
    topEventNames: top(eventsByName, 'eventName') as Array<{ eventName: string; eventCount: number }>,
    writeEvents, readEvents, errorEvents, errorsByCode, eventsByRegion
  }
}

export async function getSuspiciousCloudTrailActivities(accountIds: string[], filters: CloudTrailDatasetFilters = {}) {
  const events = await getCloudTrailEvents(accountIds, filters)
  const suspicious: Array<{ type: string; description: string; count: number; examples: string[] }> = []
  const rootEvents = events.filter(event => event.userIdentityType === 'Root')
  if (rootEvents.length) suspicious.push({ type: 'RootAccountActivity', description: 'Root account was used for API calls', count: rootEvents.length, examples: rootEvents.slice(0, 5).map(event => `${event.eventName} at ${event.eventTime}`) })
  const errorEvents = events.filter(event => event.errorCode)
  if (errorEvents.length > events.length * 0.1) suspicious.push({ type: 'HighErrorRate', description: `High error rate detected (${errorEvents.length} errors out of ${events.length} events)`, count: errorEvents.length, examples: errorEvents.slice(0, 5).map(event => `${event.eventName}: ${event.errorCode}`) })
  const accessDenied = events.filter(event => ['AccessDenied', 'UnauthorizedOperation', 'AccessDeniedException'].includes(event.errorCode || ''))
  if (accessDenied.length > 5) suspicious.push({ type: 'UnauthorizedAccessAttempts', description: 'Multiple access denied errors detected', count: accessDenied.length, examples: accessDenied.slice(0, 5).map(event => `${event.eventName} by ${event.userIdentityUserName || 'unknown'}`) })
  return suspicious
}
