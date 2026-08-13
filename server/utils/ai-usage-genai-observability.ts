import { GetModelInvocationLoggingConfigurationCommand } from '@aws-sdk/client-bedrock'
import {
  GetQueryResultsCommand,
  StartQueryCommand,
  StopQueryCommand,
  type ResultField
} from '@aws-sdk/client-cloudwatch-logs'
import type { AIUsageEnvironment, AIUsageErrorCause } from '../../shared/types/ai-usage'
import { getBedrockClient, getCloudWatchLogsClient } from '../lib/aws-client-factory'
import type { AIUsageAccountScope } from './ai-usage-scope'
import {
  saveAIUsageErrorCauses,
  withAIUsageErrorCauseKeys,
  type AIUsageCollectorFailure
} from './ai-usage-storage'

const DAY_MS = 24 * 60 * 60 * 1000
const QUERY_WINDOW_MS = 7 * DAY_MS
const QUERY_POLL_MS = 2_000
const QUERY_MAX_POLLS = 60
const MAX_QUERY_RESULTS = 10_000

export type CauseCollectionStatus = 'complete' | 'partial' | 'unavailable'

export interface GenAIObservabilityRow {
  timestamp: string
  pointer?: string
  errorCode: string
  modelId?: string
  operation?: string
  accountId?: string
  region?: string
  requestId?: string
}

interface GenAIObservabilityTarget {
  scope: AIUsageAccountScope
  environment: AIUsageEnvironment
  accountId: string
  region: string
}

interface TargetCollectionResult {
  environment: AIUsageEnvironment
  causes: AIUsageErrorCause[]
  status: 'complete' | 'unavailable'
  failure?: AIUsageCollectorFailure
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function bounded(value: string | undefined, length: number): string | undefined {
  return value?.trim() ? value.slice(0, length) : undefined
}

function causeTtl(timestamp: string): number {
  return Math.floor((new Date(timestamp).getTime() + 90 * DAY_MS) / 1000)
}

function rowMap(row: ResultField[]): Record<string, string> {
  return Object.fromEntries(row.flatMap(field =>
    field.field && field.value !== undefined ? [[field.field, field.value]] : []))
}

/**
 * Logs Insights returns only the selected fields. Keeping this allowlist here
 * prevents prompt and response payloads from entering application storage.
 */
export function genAIObservabilityQuery(): string {
  return [
    'fields @timestamp as timestamp, @ptr as pointer, errorCode, modelId, operation, accountId, region, requestId',
    '| filter ispresent(errorCode)',
    '| sort @timestamp desc'
  ].join(' ')
}

export function parseGenAIObservabilityRows(rows: ResultField[][]): GenAIObservabilityRow[] {
  return rows.flatMap(row => {
    const fields = rowMap(row)
    const timestamp = fields.timestamp
    const errorCode = bounded(fields.errorCode, 200)
    if (!timestamp || Number.isNaN(new Date(timestamp).getTime()) || !errorCode) return []
    return [{
      timestamp,
      pointer: bounded(fields.pointer, 2_000),
      errorCode,
      modelId: bounded(fields.modelId, 300),
      operation: bounded(fields.operation, 200),
      accountId: bounded(fields.accountId, 32),
      region: bounded(fields.region, 64),
      requestId: bounded(fields.requestId, 500)
    }]
  })
}

async function queryWindow(
  target: GenAIObservabilityTarget,
  logGroupName: string,
  startTime: Date,
  endTime: Date
): Promise<GenAIObservabilityRow[]> {
  const client = await getCloudWatchLogsClient(target.environment, target.region, target.accountId)
  const start = Math.floor(startTime.getTime() / 1_000)
  const end = Math.ceil(endTime.getTime() / 1_000)
  const startResponse = await client.send(new StartQueryCommand({
    logGroupName,
    startTime: start,
    endTime: end,
    queryString: genAIObservabilityQuery(),
    limit: MAX_QUERY_RESULTS
  }))
  const queryId = startResponse.queryId
  if (!queryId) throw new Error('CloudWatch Logs Insights did not return a query ID')

  for (let attempt = 0; attempt < QUERY_MAX_POLLS; attempt++) {
    await delay(QUERY_POLL_MS)
    const response = await client.send(new GetQueryResultsCommand({ queryId }))
    if (response.status === 'Complete') {
      const rows = parseGenAIObservabilityRows(response.results || [])
      if (rows.length < MAX_QUERY_RESULTS) return rows

      const duration = endTime.getTime() - startTime.getTime()
      if (duration <= DAY_MS) {
        throw new Error(`CloudWatch Logs Insights returned the ${MAX_QUERY_RESULTS}-event limit for a one-day window`)
      }

      const midpoint = new Date(startTime.getTime() + Math.floor(duration / 2))
      const [first, second] = await Promise.all([
        queryWindow(target, logGroupName, startTime, midpoint),
        queryWindow(target, logGroupName, midpoint, endTime)
      ])
      return [...first, ...second]
    }
    if (response.status === 'Failed' || response.status === 'Cancelled' || response.status === 'Timeout') {
      throw new Error(`CloudWatch Logs Insights query ${response.status.toLowerCase()}`)
    }
  }

  await client.send(new StopQueryCommand({ queryId })).catch(() => undefined)
  throw new Error('CloudWatch Logs Insights query timed out after two minutes')
}

async function queryCauseRows(
  target: GenAIObservabilityTarget,
  logGroupName: string,
  startTime: Date,
  endTime: Date
): Promise<GenAIObservabilityRow[]> {
  const windows: Array<{ start: Date; end: Date }> = []
  for (let start = startTime.getTime(); start < endTime.getTime(); start += QUERY_WINDOW_MS) {
    windows.push({ start: new Date(start), end: new Date(Math.min(start + QUERY_WINDOW_MS, endTime.getTime())) })
  }
  const rows = await Promise.all(windows.map(window => queryWindow(target, logGroupName, window.start, window.end)))
  return rows.flat()
}

function statusByEnvironment(results: TargetCollectionResult[]): Partial<Record<AIUsageEnvironment, CauseCollectionStatus>> {
  const environments: Partial<Record<AIUsageEnvironment, CauseCollectionStatus>> = {}
  for (const environment of ['commercial', 'govcloud'] as const) {
    const scoped = results.filter(result => result.environment === environment)
    if (scoped.length === 0) continue
    environments[environment] = scoped.every(result => result.status === 'complete')
      ? 'complete'
      : scoped.some(result => result.status === 'complete') ? 'partial' : 'unavailable'
  }
  return environments
}

async function collectTarget(target: GenAIObservabilityTarget, startTime: Date, endTime: Date): Promise<TargetCollectionResult> {
  try {
    const bedrock = await getBedrockClient(target.environment, target.region, target.accountId)
    const configuration = await bedrock.send(new GetModelInvocationLoggingConfigurationCommand({}))
    const logGroupName = configuration.loggingConfig?.cloudWatchConfig?.logGroupName
    if (!logGroupName) {
      return {
        environment: target.environment,
        causes: [],
        status: 'unavailable',
        failure: {
          environment: target.environment,
          accountId: target.accountId,
          enclaveName: target.scope.enclaveName,
          region: target.region,
          category: 'GenAI observability configuration',
          message: 'Bedrock model invocation logging is not configured to send events to CloudWatch Logs.'
        }
      }
    }

    const rows = await queryCauseRows(target, logGroupName, startTime, endTime)
    const causes = rows.flatMap(row => {
      const eventId = row.requestId || row.pointer
      if (!eventId) return []
      return [withAIUsageErrorCauseKeys({
        recordType: 'error-cause',
        eventId,
        environment: target.environment,
        enclaveId: target.scope.enclaveId,
        enclaveName: target.scope.enclaveName,
        accountId: target.accountId,
        region: row.region || target.region,
        source: 'cloudwatch-genai',
        modelId: row.modelId,
        operation: row.operation || 'Unknown operation',
        errorCode: row.errorCode,
        timestamp: row.timestamp,
        ttl: causeTtl(row.timestamp)
      })]
    })
    return { environment: target.environment, causes, status: 'complete' }
  } catch (error) {
    return {
      environment: target.environment,
      causes: [],
      status: 'unavailable',
      failure: {
        environment: target.environment,
        accountId: target.accountId,
        enclaveName: target.scope.enclaveName,
        region: target.region,
        category: 'GenAI observability',
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

export async function collectGenAIObservabilityErrorCauses(
  targets: GenAIObservabilityTarget[],
  lookbackDays: number
): Promise<{
  causes: AIUsageErrorCause[]
  failures: AIUsageCollectorFailure[]
  environments: Partial<Record<AIUsageEnvironment, CauseCollectionStatus>>
}> {
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - Math.min(90, Math.max(1, lookbackDays)) * DAY_MS)
  const results: TargetCollectionResult[] = []

  for (let index = 0; index < targets.length; index += 3) {
    results.push(...await Promise.all(targets.slice(index, index + 3).map(target => collectTarget(target, startTime, endTime))))
  }

  const causes = results.flatMap(result => result.causes)
  await saveAIUsageErrorCauses(causes)
  return {
    causes,
    failures: results.flatMap(result => result.failure ? [result.failure] : []),
    environments: statusByEnvironment(results)
  }
}
