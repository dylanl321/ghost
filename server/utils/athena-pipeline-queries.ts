/**
 * Pipeline Data - Athena Query Utilities
 * Query GitLab pipeline telemetry data stored in S3 and queryable via Athena
 *
 * Performance Optimizations:
 * - Application-level caching with 5-minute TTL using cache-manager
 * - Athena query result reuse enabled (60 minutes) to avoid re-executing identical queries
 * - Parallel query execution for fetching multiple related datasets
 */

import { getAthenaClient } from '../lib/aws-client-factory'
import { getCacheManager } from './cache-manager'
import { logger } from './logger'
import type {
  PipelineEnvironmentConfig,
  PipelineRun,
  AccountPlan,
  ResourceChange,
  ErrorDetail,
  PipelineSummary,
  ResourceSearchResult,
  ResourceDeploymentStatus,
  UnappliedResource,
  PlannedVsAppliedSummary,
  RecurringErrorPattern,
  CrossAccountError,
  AccountDeploymentHealth
} from '../../shared/types/pipelines'

// Configuration
export function getPipelineEnvironmentConfig(environment: 'commercial' | 'govcloud' = 'govcloud'): PipelineEnvironmentConfig {
  // Pipeline data is ALWAYS stored in GovCloud deployment/storage account (461760157232)
  // The telemetry_db database with pipeline data tables is in us-gov-west-1
  // We use GovCloud credentials to query the telemetry_db Athena database
  return {
    region: process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1',
    database: process.env.ATHENA_PIPELINE_DATABASE || 'telemetry_db',
    athenaResultsBucket: process.env.ATHENA_PIPELINE_RESULTS_BUCKET || 'gdlz-gitlab-pipeline-data',
    accountId: '461760157232' // GovCloud deployment account
  }
}

// Constants
const CACHE_TTL_SECONDS = 300 // 5 minutes cache for pipeline data
const DEFAULT_TIMEOUT_SECONDS = 60
const POLL_INTERVAL_MS = 2000
const ATHENA_RESULT_REUSE_MAX_AGE_MINUTES = 60 // Reuse Athena query results up to 60 minutes old

export function pipelineIdPredicate(column: 'pipeline_id' | 'plan_pipeline_id', pipelineId: string): string {
  if (!/^\d+$/.test(pipelineId)) throw new Error('Pipeline ID must contain only digits')
  // Telemetry table revisions disagree on numeric vs varchar IDs; varchar casting works for both.
  return `CAST(${column} AS varchar) = '${pipelineId}'`
}

// ---------------------------------------------------------------------------
// Athena concurrency limiter
// Caps total in-flight StartQueryExecution calls across all callers in this
// module so we stay below the account-level concurrent-query quota (~20-25).
// Configurable via ATHENA_MAX_CONCURRENT_QUERIES env var (default: 6).
// ---------------------------------------------------------------------------
const ATHENA_MAX_CONCURRENT = parseInt(process.env.ATHENA_MAX_CONCURRENT_QUERIES || '6', 10)

class AthenaQuerySemaphore {
  private running = 0
  private queue: Array<() => void> = []

  async acquire(): Promise<void> {
    if (this.running < ATHENA_MAX_CONCURRENT) {
      this.running++
      return
    }
    await new Promise<void>(resolve => this.queue.push(resolve))
    this.running++
  }

  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

/** Shared module-level semaphore - one instance for the entire process. */
const athenaSemaphore = new AthenaQuerySemaphore()

// ---------------------------------------------------------------------------
// Retry helper for throttled StartQueryExecution calls
// ---------------------------------------------------------------------------
const START_QUERY_MAX_ATTEMPTS = 5
const START_QUERY_BASE_DELAY_MS = 500  // 500 ms base; doubles each attempt
const START_QUERY_MAX_DELAY_MS = 15000 // cap at 15 s

/** Returns true for error names that Athena treats as retryable throttles. */
function isAthenaThrottleError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  const name = (e.name as string) || ''
  const meta = e.$metadata as { httpStatusCode?: number } | undefined
  return (
    name === 'TooManyRequestsException' ||
    name === 'ThrottlingException' ||
    name === 'RequestThrottledException' ||
    (typeof meta?.httpStatusCode === 'number' && meta.httpStatusCode === 429)
  )
}

/**
 * Paginate an array of results (Athena has no OFFSET support)
 */
export function paginateResults<T>(data: T[], page: number, limit: number): { items: T[], total: number, page: number, limit: number } {
  const start = (page - 1) * limit
  return { items: data.slice(start, start + limit), total: data.length, page, limit }
}

/**
 * Sanitize a string for use in SQL LIKE clauses (escape single quotes)
 */
function sanitizeSqlString(input: string): string {
  return input.replace(/'/g, "''")
}

/**
 * Execute an Athena SQL query and return results
 */
async function executeAthenaQuery(
  sql: string,
  queryName: string,
  environment: 'commercial' | 'govcloud' = 'commercial',
  cacheKey?: string
): Promise<any[]> {
  const cache = getCacheManager()

  // Check cache first
  if (cacheKey) {
    const cached = await cache.get(cacheKey)
    if (cached) {
      logger.info(`[Pipeline Queries] Cache hit for ${queryName}`)
      return cached as any[]
    }
  }

  const config = getPipelineEnvironmentConfig(environment)
  const startTime = Date.now()

  // Gate actual query execution through the shared semaphore.
  // Cache hits above bypass this entirely - only real Athena queries are counted.
  return athenaSemaphore.run(async () => {
  try {
    // Get Athena client
    const athenaClient = await getAthenaClient(environment, config.region, config.accountId)

    logger.info(`[Pipeline Queries] Executing query '${queryName}' in ${environment}`)
    logger.debug(`[Pipeline Queries] SQL: ${sql}`)

    // Start query execution with exponential-backoff retry for throttle errors
    const { GetQueryExecutionCommand, GetQueryResultsCommand } = await import('@aws-sdk/client-athena')

    // Retry loop for TooManyRequestsException / ThrottlingException
    let startAttempt = 0
    let startResponse: import('@aws-sdk/client-athena').StartQueryExecutionCommandOutput | undefined
    while (true) {
      try {
        const { StartQueryExecutionCommand } = await import('@aws-sdk/client-athena')
        startResponse = await athenaClient.send(new StartQueryExecutionCommand({
          QueryString: sql,
          QueryExecutionContext: {
            Database: config.database
          },
          WorkGroup: process.env.ATHENA_PIPELINE_WORKGROUP || 'primary',
          ResultConfiguration: {
            OutputLocation: `s3://${config.athenaResultsBucket}/query-results/`
          },
          // Enable query result reuse to speed up repeated queries
          // Athena will reuse results from identical queries within the time window
          ResultReuseConfiguration: {
            ResultReuseByAgeConfiguration: {
              Enabled: true,
              MaxAgeInMinutes: ATHENA_RESULT_REUSE_MAX_AGE_MINUTES
            }
          }
        }))
        break // success
      } catch (startErr) {
        startAttempt++
        if (!isAthenaThrottleError(startErr) || startAttempt >= START_QUERY_MAX_ATTEMPTS) {
          throw startErr
        }
        const base = Math.min(START_QUERY_BASE_DELAY_MS * Math.pow(2, startAttempt - 1), START_QUERY_MAX_DELAY_MS)
        const delay = Math.random() * base
        logger.warn(
          `[Pipeline Queries] StartQueryExecution throttled for '${queryName}' ` +
          `(attempt ${startAttempt}/${START_QUERY_MAX_ATTEMPTS}), retrying in ${Math.round(delay)}ms`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    if (!startResponse?.QueryExecutionId) {
      throw new Error('Failed to start Athena query')
    }

    const queryExecutionId = startResponse.QueryExecutionId
    logger.info(`[Pipeline Queries] Started query ${queryExecutionId}`)

    // Wait for completion
    let attempts = 0
    const maxAttempts = Math.ceil(DEFAULT_TIMEOUT_SECONDS * 1000 / POLL_INTERVAL_MS)

    while (attempts < maxAttempts) {
      const statusResponse = await athenaClient.send(new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId
      }))

      const state = statusResponse.QueryExecution?.Status?.State

      if (state === 'SUCCEEDED') {
        logger.info(`[Pipeline Queries] Query ${queryExecutionId} succeeded`)
        break
      } else if (state === 'FAILED' || state === 'CANCELLED') {
        const reason = statusResponse.QueryExecution?.Status?.StateChangeReason || 'Unknown error'
        throw new Error(`Query failed: ${reason}`)
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      attempts++
    }

    if (attempts >= maxAttempts) {
      throw new Error(`Query timeout after ${DEFAULT_TIMEOUT_SECONDS} seconds`)
    }

    // Get results
    const resultsResponse = await athenaClient.send(new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId
    }))

    // Parse results
    const rows = resultsResponse.ResultSet?.Rows || []
    if (rows.length === 0) {
      return []
    }

    const columns = rows[0]?.Data || []
    const columnNames = columns.map(col => col.VarCharValue || '')

    const data = rows.slice(1).map(row => {
      const record: Record<string, any> = {}
      row.Data?.forEach((cell, index) => {
        const columnName = columnNames[index]
        const value = cell.VarCharValue || null

        // Try to parse numbers
        if (value !== null && !isNaN(Number(value)) && value !== '') {
          record[columnName] = Number(value)
        } else if (value !== null && value.startsWith('[') && value.endsWith(']')) {
          // Parse Athena array format: [item1, item2, item3]
          try {
            const arrayContent = value.slice(1, -1).trim()
            if (arrayContent) {
              record[columnName] = arrayContent.split(',').map(item => item.trim())
            } else {
              record[columnName] = []
            }
          } catch {
            record[columnName] = value
          }
        } else {
          record[columnName] = value
        }
      })
      return record
    })

    const executionTimeMs = Date.now() - startTime
    logger.info(`[Pipeline Queries] Query completed in ${executionTimeMs}ms, returned ${data.length} rows`)

    // Cache result
    if (cacheKey) {
      await cache.set(cacheKey, data, { ttl: CACHE_TTL_SECONDS })
    }

    return data

  } catch (error) {
    logger.error(`[Pipeline Queries] Query execution failed:`, error)
    throw error
  }
  }) // end athenaSemaphore.run
}

/**
 * Get pipeline runs for a specific account within a date range
 */
export async function getPipelineRunsForAccount(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial',
  maxRows: number = 1000
): Promise<PipelineRun[]> {
  const cacheKey = `pipelines:runs:${accountId}:${days}:${maxRows}`

  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      pipeline_id,
      job_id,
      job_name,
      job_url,
      job_stage,
      timestamp_start,
      timestamp_end,
      duration_total_seconds,
      status,
      account_count,
      accounts_processed,
      commit_author,
      terraform_version
    FROM ${config.database}.pipeline_runs
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND contains(accounts_processed, '${accountId}')
    ORDER BY timestamp_start DESC
    LIMIT ${maxRows}
  `

  return executeAthenaQuery(sql, `pipeline-runs-${accountId}`, environment, cacheKey) as Promise<PipelineRun[]>
}

/**
 * Get account plans for a specific account
 */
export async function getAccountPlansForAccount(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial',
  maxRows: number = 500
): Promise<AccountPlan[]> {
  const cacheKey = `pipelines:plans:${accountId}:${days}:${maxRows}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      account_id,
      account_name,
      plan_created_at,
      plan_pipeline_id,
      changes_create,
      changes_update,
      changes_destroy,
      changes_total,
      plan_status,
      applied_at
    FROM ${config.database}.account_plans
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND account_id = '${accountId}'
    ORDER BY plan_created_at DESC
    LIMIT ${maxRows}
  `

  return executeAthenaQuery(sql, `account-plans-${accountId}`, environment, cacheKey) as Promise<AccountPlan[]>
}

/**
 * Get resource changes for a specific account
 */
export async function getResourceChangesForAccount(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial',
  maxRows: number = 2000
): Promise<ResourceChange[]> {
  const cacheKey = `pipelines:resources:${accountId}:${days}:${maxRows}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      account_id,
      resource_address,
      resource_type,
      module_name,
      change_action,
      applied,
      apply_success,
      timestamp
    FROM ${config.database}.resource_changes
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND account_id = '${accountId}'
    ORDER BY timestamp DESC
    LIMIT ${maxRows}
  `

  return executeAthenaQuery(sql, `resource-changes-${accountId}`, environment, cacheKey) as Promise<ResourceChange[]>
}

/**
 * Get error details for a specific account
 */
export async function getErrorDetailsForAccount(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial',
  maxRows: number = 500
): Promise<ErrorDetail[]> {
  const cacheKey = `pipelines:errors:${accountId}:${days}:${maxRows}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      pipeline_id,
      account_id,
      timestamp,
      error_phase,
      error_category,
      error_severity,
      error_message,
      error_resource_type
    FROM ${config.database}.error_details
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND account_id = '${accountId}'
    ORDER BY timestamp DESC
    LIMIT ${maxRows}
  `

  return executeAthenaQuery(sql, `error-details-${accountId}`, environment, cacheKey) as Promise<ErrorDetail[]>
}

/**
 * Get comprehensive pipeline summary for an account
 */
export async function getPipelineSummary(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial'
): Promise<PipelineSummary> {
  // Fetch all data in parallel
  const [runs, plans, resources, errors] = await Promise.all([
    getPipelineRunsForAccount(accountId, days, environment),
    getAccountPlansForAccount(accountId, days, environment),
    getResourceChangesForAccount(accountId, days, environment),
    getErrorDetailsForAccount(accountId, days, environment)
  ])

  // Calculate summary statistics
  const totalRuns = runs.length
  const successfulRuns = runs.filter(r => r.status === 'success').length
  const failedRuns = runs.filter(r => r.status === 'failure' || r.status === 'partial_failure').length

  const avgDurationSeconds = runs.length > 0
    ? Math.round(runs.reduce((sum, r) => sum + (r.duration_total_seconds || 0), 0) / runs.length)
    : 0

  const totalChanges = plans.reduce((sum, p) => sum + (p.changes_total || 0), 0)

  // Group resources by address (name), type, and action
  const resourceMap = new Map<string, { resourceAddress: string, resourceType: string, action: string, count: number }>()
  resources.forEach(r => {
    const key = `${r.resource_address}:${r.resource_type}:${r.change_action}`
    const existing = resourceMap.get(key)
    if (existing) {
      existing.count += 1
    } else {
      resourceMap.set(key, {
        resourceAddress: r.resource_address,
        resourceType: r.resource_type,
        action: r.change_action,
        count: 1
      })
    }
  })

  const resourceBreakdown = Array.from(resourceMap.values())
    .sort((a, b) => b.count - a.count)

  // Group errors by category
  const errorMap = new Map<string, number>()
  errors.forEach(e => {
    errorMap.set(e.error_category, (errorMap.get(e.error_category) || 0) + 1)
  })

  const errorBreakdown = Array.from(errorMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  // Count unique resource types for totals
  const uniqueResourceTypes = new Set(resources.map(r => r.resource_type))

  // Account-level metrics from plans: a plan with applied_at set counts as successful
  const successfulAccounts = plans.filter(p => p.applied_at).length
  const failedAccounts = plans.filter(p =>
    p.plan_status === 'failed' || p.plan_status === 'error'
  ).length
  const totalAccountPlans = plans.length
  const accountSuccessRate = totalAccountPlans > 0
    ? Math.round((successfulAccounts / totalAccountPlans) * 1000) / 10
    : 0

  return {
    totalRuns,
    successfulRuns,
    failedRuns,
    avgDurationSeconds,
    totalChanges,
    successfulAccounts,
    failedAccounts,
    accountSuccessRate,
    resourceBreakdown,
    errorBreakdown,
    recentRuns: runs,
    // Total counts so UI knows if there's more data
    totalRecentRuns: runs.length,
    totalResourceTypes: uniqueResourceTypes.size,
    totalErrors: errors.length
  }
}

/**
 * Get daily pipeline success metrics for charting
 */
export async function getDailyPipelineMetrics(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial'
): Promise<Array<{ date: string, total: number, successful: number, failed: number }>> {
  const cacheKey = `pipelines:daily-metrics:${accountId}:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      DATE(from_iso8601_timestamp(timestamp_start)) as date,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status IN ('failure', 'partial_failure') THEN 1 ELSE 0 END) as failed
    FROM ${config.database}.pipeline_runs
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND contains(accounts_processed, '${accountId}')
    GROUP BY DATE(from_iso8601_timestamp(timestamp_start))
    ORDER BY date DESC
  `

  return executeAthenaQuery(sql, `daily-metrics-${accountId}`, environment, cacheKey) as Promise<Array<{ date: string, total: number, successful: number, failed: number }>>
}

/**
 * Get detailed information for a specific pipeline run
 */
export async function getPipelineRunDetails(
  pipelineId: string,
  jobId: string,
  accountId: string,
  environment: 'commercial' | 'govcloud' = 'commercial'
): Promise<{
  run: PipelineRun | null
  resourceChanges: ResourceChange[]
  errors: ErrorDetail[]
}> {
  const cacheKey = `pipelines:details:${pipelineId}:${jobId}`
  const config = getPipelineEnvironmentConfig(environment)

  try {
    // Fetch run details, resource changes, and errors in parallel
    // All queries need partition filtering for Athena - use a 90 day lookback
    const [runSql, resourceSql, errorSql] = [
      `
        SELECT *
        FROM ${config.database}.pipeline_runs
        WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -90, current_date), '%Y%m')
          AND ${pipelineIdPredicate('pipeline_id', pipelineId)}
          AND job_id = '${jobId}'
        LIMIT 1
      `,
      `
        SELECT *
        FROM ${config.database}.resource_changes
        WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -90, current_date), '%Y%m')
          AND ${pipelineIdPredicate('plan_pipeline_id', pipelineId)}
          AND plan_job_id = '${jobId}'
          AND account_id = '${accountId}'
        ORDER BY timestamp DESC
        LIMIT 100
      `,
      `
        SELECT *
        FROM ${config.database}.error_details
        WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -90, current_date), '%Y%m')
          AND ${pipelineIdPredicate('pipeline_id', pipelineId)}
          AND job_id = '${jobId}'
          AND account_id = '${accountId}'
        ORDER BY timestamp DESC
        LIMIT 100
      `
    ]

    const [runs, resourceChanges, errors] = await Promise.all([
      executeAthenaQuery(runSql, `pipeline-run-${pipelineId}-${jobId}`, environment),
      executeAthenaQuery(resourceSql, `resource-changes-${pipelineId}-${jobId}`, environment),
      executeAthenaQuery(errorSql, `errors-${pipelineId}-${jobId}`, environment)
    ])

    return {
      run: runs.length > 0 ? (runs[0] as PipelineRun) : null,
      resourceChanges: resourceChanges as ResourceChange[],
      errors: errors as ErrorDetail[]
    }

  } catch (error) {
    logger.error(`[Pipeline Queries] Failed to fetch details for pipeline ${pipelineId}, job ${jobId}:`, error)
    throw error
  }
}

/**
 * Get organization-wide pipeline summary (all accounts)
 */
export async function getOrganizationSummary(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<any> {
  const cacheKey = `pipelines:org-summary:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    WITH run_stats AS (
      SELECT
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
        SUM(CASE WHEN status IN ('failure', 'partial_failure') THEN 1 ELSE 0 END) as failed_runs,
        AVG(duration_total_seconds) as avg_duration,
        COUNT(DISTINCT pipeline_id) as unique_pipelines
      FROM ${config.database}.pipeline_runs
      WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    ),
    plan_stats AS (
      SELECT
        COUNT(*) as total_account_plans,
        SUM(CASE WHEN plan_status = 'applied' THEN 1 ELSE 0 END) as successful_accounts,
        SUM(CASE WHEN plan_status = 'failed' THEN 1 ELSE 0 END) as failed_accounts,
        SUM(CASE WHEN plan_status = 'pending' THEN 1 ELSE 0 END) as pending_accounts,
        SUM(changes_total) as total_changes,
        COUNT(DISTINCT account_id) as unique_accounts
      FROM ${config.database}.account_plans
      WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    )
    SELECT
      r.total_runs,
      r.successful_runs as successful_pipelines,
      r.failed_runs as failed_pipelines,
      CAST(r.successful_runs AS DOUBLE) / NULLIF(r.total_runs, 0) * 100 as pipeline_success_rate,
      r.avg_duration,
      COALESCE(p.unique_accounts, 0) as unique_accounts,
      COALESCE(p.total_changes, 0) as total_changes,
      COALESCE(p.total_account_plans, 0) as total_account_plans,
      COALESCE(p.successful_accounts, 0) as successful_accounts,
      COALESCE(p.failed_accounts, 0) as failed_accounts,
      COALESCE(p.pending_accounts, 0) as pending_accounts,
      CAST(COALESCE(p.successful_accounts, 0) AS DOUBLE) / NULLIF(COALESCE(p.total_account_plans, 0), 0) * 100 as account_success_rate
    FROM run_stats r
    CROSS JOIN plan_stats p
  `

  const results = await executeAthenaQuery(sql, 'org-summary', environment, cacheKey)
  return results.length > 0 ? results[0] : null
}

/**
 * Get organization-wide pipeline timeline (all accounts, recent runs)
 */
export async function getOrganizationTimeline(
  days: number = 30,
  limit: number = 200,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<PipelineRun[]> {
  const cacheKey = `pipelines:org-timeline:${days}:${limit}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      pipeline_id,
      job_id,
      job_name,
      job_url,
      job_stage,
      timestamp_start,
      timestamp_end,
      duration_total_seconds,
      status,
      account_count,
      accounts_processed,
      commit_author,
      terraform_version
    FROM ${config.database}.pipeline_runs
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    ORDER BY timestamp_start DESC
    LIMIT ${limit}
  `

  return executeAthenaQuery(sql, 'org-timeline', environment, cacheKey) as Promise<PipelineRun[]>
}

/**
 * Get a specific pipeline run by pipeline ID
 */
export async function getPipelineById(
  pipelineId: string,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<PipelineRun | null> {
  const cacheKey = `pipelines:by-id:${pipelineId}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      pipeline_id,
      job_id,
      job_name,
      job_url,
      job_stage,
      timestamp_start,
      timestamp_end,
      duration_total_seconds,
      status,
      account_count,
      accounts_processed,
      commit_author,
      terraform_version
    FROM ${config.database}.pipeline_runs
    WHERE ${pipelineIdPredicate('pipeline_id', pipelineId)}
    LIMIT 1
  `

  const results = await executeAthenaQuery(sql, `pipeline-${pipelineId}`, environment, cacheKey) as Promise<PipelineRun[]>
  return results.length > 0 ? results[0] : null
}

/**
 * Get comprehensive pipeline details with all related data using JOINs
 * Fetches pipeline run with account plans, resource changes summary, and error details
 */
export async function getPipelineByIdWithDetails(
  pipelineId: string,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<{
  pipeline: PipelineRun | null
  accountPlans: AccountPlan[]
  accountStats: {
    total: number
    applied: number
    failed: number
    pending: number
    expired: number
  }
  resourceStats: {
    totalResources: number
    byAction: Array<{ action: string, count: number }>
    byType: Array<{ type: string, count: number }>
  }
  errorStats: {
    totalErrors: number
    byCategory: Array<{ category: string, count: number }>
    bySeverity: Array<{ severity: string, count: number }>
  }
}> {
  const cacheKey = `pipelines:details-full:${pipelineId}`
  const config = getPipelineEnvironmentConfig(environment)

  try {
    // Fetch all data in parallel
    const [pipeline, accountPlans, resourceChanges, errorDetails] = await Promise.all([
      getPipelineById(pipelineId, environment),
      getAccountPlansForPipeline(pipelineId, environment),
      getResourceChangesForPipeline(pipelineId, environment),
      getErrorDetailsForPipeline(pipelineId, environment)
    ])

    // Aggregate resource statistics
    const resourceActionMap = new Map<string, number>()
    const resourceTypeMap = new Map<string, number>()

    resourceChanges.forEach(r => {
      resourceActionMap.set(r.change_action, (resourceActionMap.get(r.change_action) || 0) + 1)
      resourceTypeMap.set(r.resource_type, (resourceTypeMap.get(r.resource_type) || 0) + 1)
    })

    const resourceStats = {
      totalResources: resourceChanges.length,
      byAction: Array.from(resourceActionMap.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
      byType: Array.from(resourceTypeMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
    }

    // Aggregate account statistics by plan_status
    const accountStats = {
      total: accountPlans.length,
      applied: accountPlans.filter(p => p.plan_status === 'applied').length,
      failed: accountPlans.filter(p => p.plan_status === 'failed').length,
      pending: accountPlans.filter(p => p.plan_status === 'pending').length,
      expired: accountPlans.filter(p => p.plan_status === 'expired').length
    }

    // Aggregate error statistics
    const errorCategoryMap = new Map<string, number>()
    const errorSeverityMap = new Map<string, number>()

    errorDetails.forEach(e => {
      errorCategoryMap.set(e.error_category, (errorCategoryMap.get(e.error_category) || 0) + 1)
      errorSeverityMap.set(e.error_severity, (errorSeverityMap.get(e.error_severity) || 0) + 1)
    })

    const errorStats = {
      totalErrors: errorDetails.length,
      byCategory: Array.from(errorCategoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      bySeverity: Array.from(errorSeverityMap.entries())
        .map(([severity, count]) => ({ severity, count }))
        .sort((a, b) => b.count - a.count)
    }

    return {
      pipeline,
      accountPlans,
      accountStats,
      resourceStats,
      errorStats
    }

  } catch (error) {
    logger.error(`[Pipeline Queries] Failed to fetch comprehensive details for pipeline ${pipelineId}:`, error)
    throw error
  }
}

/**
 * Get account plans for a specific pipeline
 */
export async function getAccountPlansForPipeline(
  pipelineId: string,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<AccountPlan[]> {
  const cacheKey = `pipelines:plans:${pipelineId}`
  const config = getPipelineEnvironmentConfig(environment)

  // Query needs partition filtering for Athena - use a 90 day lookback
  // The cast supports both historical varchar partitions and newer numeric schemas.
  const sql = `
    SELECT
      account_id,
      account_name,
      plan_created_at,
      plan_pipeline_id,
      changes_create,
      changes_update,
      changes_destroy,
      changes_total,
      plan_status,
      applied_at,
      failed_at,
      failure_reason
    FROM ${config.database}.account_plans
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -90, current_date), '%Y%m')
      AND ${pipelineIdPredicate('plan_pipeline_id', pipelineId)}
    ORDER BY plan_created_at ASC
  `

  return executeAthenaQuery(sql, `account-plans-pipeline-${pipelineId}`, environment, cacheKey) as Promise<AccountPlan[]>
}

/**
 * Get resource changes for a specific pipeline
 * First gets account IDs from account_plans, then queries resources separately
 */
export async function getResourceChangesForPipeline(
  pipelineId: string,
  limit: number = 500,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<ResourceChange[]> {
  const cacheKey = `pipelines:resources:${pipelineId}`

  try {
    // First, get the account plans for this pipeline to get the list of accounts
    const accountPlans = await getAccountPlansForPipeline(pipelineId, environment)

    if (accountPlans.length === 0) {
      logger.info(`[Pipeline Queries] No account plans found for pipeline ${pipelineId}`)
      return []
    }

    // Get unique account IDs
    const accountIds = [...new Set(accountPlans.map(p => p.account_id))]
    logger.info(`[Pipeline Queries] Found ${accountIds.length} accounts for pipeline ${pipelineId}: ${accountIds.join(', ')}`)

    // Query resources for each account with this pipeline_id
    const config = getPipelineEnvironmentConfig(environment)
    const accountIdList = accountIds.map(id => `'${id}'`).join(',')

    const sql = `
      SELECT
        account_id,
        resource_address,
        resource_type,
        module_name,
        change_action,
        applied,
        apply_success,
        timestamp
      FROM ${config.database}.resource_changes
      WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -90, current_date), '%Y%m')
        AND account_id IN (${accountIdList})
        AND ${pipelineIdPredicate('plan_pipeline_id', pipelineId)}
      LIMIT ${limit}
    `

    logger.info(`[Pipeline Queries] Querying resources for pipeline ${pipelineId} with ${accountIds.length} accounts`)
    const results = await executeAthenaQuery(sql, `resource-changes-pipeline-${pipelineId}`, environment, cacheKey) as ResourceChange[]
    logger.info(`[Pipeline Queries] Found ${results.length} resource changes for pipeline ${pipelineId}`)

    return results
  } catch (error) {
    logger.error(`[Pipeline Queries] Failed to fetch resources for pipeline ${pipelineId}:`, error)
    throw error
  }
}

/**
 * Get error details for a specific pipeline
 */
export async function getErrorDetailsForPipeline(
  pipelineId: string,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<ErrorDetail[]> {
  const cacheKey = `pipelines:errors:${pipelineId}`
  const config = getPipelineEnvironmentConfig(environment)

  // Query needs partition filtering for Athena - use a 90 day lookback
  // The cast supports both historical varchar partitions and newer numeric schemas.
  const sql = `
    SELECT
      pipeline_id,
      account_id,
      timestamp,
      error_phase,
      error_category,
      error_severity,
      error_message,
      error_resource_type
    FROM ${config.database}.error_details
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -90, current_date), '%Y%m')
      AND ${pipelineIdPredicate('pipeline_id', pipelineId)}
    ORDER BY timestamp ASC
  `

  return executeAthenaQuery(sql, `error-details-pipeline-${pipelineId}`, environment, cacheKey) as Promise<ErrorDetail[]>
}

/**
 * Get module-level breakdown for a specific pipeline
 * First gets account IDs from account_plans, then queries resources separately
 */
export async function getModuleBreakdownForPipeline(
  pipelineId: string,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<Array<{
  module_name: string
  total_changes: number
  creates: number
  updates: number
  destroys: number
}>> {
  const cacheKey = `pipelines:modules:${pipelineId}`

  try {
    // First, get the account plans for this pipeline to get the list of accounts
    const accountPlans = await getAccountPlansForPipeline(pipelineId, environment)

    if (accountPlans.length === 0) {
      logger.info(`[Pipeline Queries] No account plans found for pipeline ${pipelineId}`)
      return []
    }

    // Get unique account IDs
    const accountIds = [...new Set(accountPlans.map(p => p.account_id))]

    // Query module breakdown for these accounts with this pipeline_id
    const config = getPipelineEnvironmentConfig(environment)
    const accountIdList = accountIds.map(id => `'${id}'`).join(',')

    const sql = `
      SELECT
        module_name,
        COUNT(*) as total_changes,
        SUM(CASE WHEN change_action = 'create' THEN 1 ELSE 0 END) as creates,
        SUM(CASE WHEN change_action = 'update' THEN 1 ELSE 0 END) as updates,
        SUM(CASE WHEN change_action = 'delete' OR change_action = 'destroy' THEN 1 ELSE 0 END) as destroys
      FROM ${config.database}.resource_changes
      WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -90, current_date), '%Y%m')
        AND account_id IN (${accountIdList})
        AND ${pipelineIdPredicate('plan_pipeline_id', pipelineId)}
      GROUP BY module_name
      ORDER BY total_changes DESC
      LIMIT 500
    `

    return executeAthenaQuery(sql, `module-breakdown-pipeline-${pipelineId}`, environment, cacheKey) as Promise<Array<{
      module_name: string
      total_changes: number
      creates: number
      updates: number
      destroys: number
    }>>
  } catch (error) {
    logger.error(`[Pipeline Queries] Failed to fetch module breakdown for pipeline ${pipelineId}:`, error)
    throw error
  }
}

/**
 * Get account-level breakdown for organization view
 */
export async function getAccountBreakdown(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  maxRows: number = 500
): Promise<any[]> {
  const cacheKey = `pipelines:account-breakdown:${days}:${maxRows}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      account_id,
      account_name,
      COUNT(*) as total_runs,
      SUM(CASE WHEN plan_status = 'applied' THEN 1 ELSE 0 END) as successful_runs,
      SUM(CASE WHEN plan_status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
      SUM(CASE WHEN plan_status = 'pending' THEN 1 ELSE 0 END) as pending_runs,
      CAST(SUM(CASE WHEN plan_status = 'applied' THEN 1 ELSE 0 END) AS DOUBLE) / NULLIF(COUNT(*), 0) * 100 as success_rate,
      MAX(plan_created_at) as last_run
    FROM ${config.database}.account_plans
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    GROUP BY account_id, account_name
    ORDER BY total_runs DESC
    LIMIT ${maxRows}
  `

  return executeAthenaQuery(sql, 'account-breakdown', environment, cacheKey)
}

/**
 * Get resource breakdown for organization view
 * Groups by specific resource address (name) instead of just type
 */
export async function getOrganizationResourceBreakdown(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud',
  maxRows: number = 500
): Promise<any[]> {
  const cacheKey = `pipelines:org-resources:${days}:${maxRows}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      resource_address,
      resource_type,
      change_action,
      COUNT(*) as count
    FROM ${config.database}.resource_changes
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    GROUP BY resource_address, resource_type, change_action
    ORDER BY count DESC
    LIMIT ${maxRows}
  `

  return executeAthenaQuery(sql, 'org-resources', environment, cacheKey)
}

/**
 * Get error breakdown for organization view
 */
export async function getOrganizationErrorBreakdown(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<any[]> {
  const cacheKey = `pipelines:org-errors:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      error_category,
      COUNT(*) as count
    FROM ${config.database}.error_details
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    GROUP BY error_category
    ORDER BY count DESC
  `

  return executeAthenaQuery(sql, 'org-errors', environment, cacheKey)
}

/**
 * Get daily metrics for organization (all accounts)
 */
export async function getOrganizationDailyMetrics(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<Array<{ date: string, total: number, successful: number, failed: number }>> {
  const cacheKey = `pipelines:org-daily-metrics:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      DATE(from_iso8601_timestamp(timestamp_start)) as date,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status IN ('failure', 'partial_failure') THEN 1 ELSE 0 END) as failed
    FROM ${config.database}.pipeline_runs
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    GROUP BY DATE(from_iso8601_timestamp(timestamp_start))
    ORDER BY date DESC
  `

  return executeAthenaQuery(sql, 'org-daily-metrics', environment, cacheKey) as Promise<Array<{ date: string, total: number, successful: number, failed: number }>>
}

/**
 * Get activity heat map data (hour-by-hour or day-by-day)
 */
export async function getActivityHeatMap(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<any[]> {
  const cacheKey = `pipelines:heatmap:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      DATE(from_iso8601_timestamp(timestamp_start)) as date,
      HOUR(from_iso8601_timestamp(timestamp_start)) as hour,
      DAY_OF_WEEK(from_iso8601_timestamp(timestamp_start)) as day_of_week,
      COUNT(*) as count,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status IN ('failure', 'partial_failure') THEN 1 ELSE 0 END) as failure_count
    FROM ${config.database}.pipeline_runs
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    GROUP BY DATE(from_iso8601_timestamp(timestamp_start)), HOUR(from_iso8601_timestamp(timestamp_start)), DAY_OF_WEEK(from_iso8601_timestamp(timestamp_start))
    ORDER BY date DESC, hour DESC
  `

  return executeAthenaQuery(sql, 'heatmap', environment, cacheKey)
}

/**
 * Get repository breakdown with account-level success/failure metrics
 * Returns aggregated stats by repository, tracking account success/failure rather than pipeline status
 */
export async function getRepositoryBreakdownWithAccounts(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<any[]> {
  const cacheKey = `pipelines:repo-breakdown-accounts:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      plan_pipeline_id,
      COUNT(DISTINCT account_id) as total_accounts,
      SUM(CASE WHEN plan_status = 'applied' THEN 1 ELSE 0 END) as successful_accounts,
      SUM(CASE WHEN plan_status = 'failed' THEN 1 ELSE 0 END) as failed_accounts,
      SUM(CASE WHEN plan_status = 'pending' THEN 1 ELSE 0 END) as pending_accounts,
      CAST(SUM(CASE WHEN plan_status = 'applied' THEN 1 ELSE 0 END) AS DOUBLE) / NULLIF(COUNT(*), 0) * 100 as account_success_rate,
      MAX(plan_created_at) as last_run
    FROM ${config.database}.account_plans
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    GROUP BY plan_pipeline_id
    ORDER BY COUNT(DISTINCT account_id) DESC
    LIMIT 100
  `

  return executeAthenaQuery(sql, 'repo-breakdown-accounts', environment, cacheKey)
}

/**
 * Get all unique pipeline authors with their aggregate metrics
 */
export async function getAllPipelineAuthors(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<Array<{
  commit_author: string
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  total_accounts: number
  last_run: string
}>> {
  const cacheKey = `pipelines:authors-list:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      commit_author,
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
      SUM(CASE WHEN status IN ('failure', 'partial_failure') THEN 1 ELSE 0 END) as failed_runs,
      CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS DOUBLE) / NULLIF(COUNT(*), 0) * 100 as success_rate,
      SUM(account_count) as total_accounts,
      MAX(timestamp_start) as last_run
    FROM ${config.database}.pipeline_runs
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND commit_author IS NOT NULL
      AND commit_author != ''
    GROUP BY commit_author
    ORDER BY total_runs DESC
  `

  return executeAthenaQuery(sql, 'authors-list', environment, cacheKey) as Promise<Array<{
    commit_author: string
    total_runs: number
    successful_runs: number
    failed_runs: number
    success_rate: number
    total_accounts: number
    last_run: string
  }>>
}

/**
 * Get pipeline runs for a specific author
 */
export async function getPipelineRunsByAuthor(
  authorEmail: string,
  days: number = 30,
  limit: number = 200,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<PipelineRun[]> {
  const cacheKey = `pipelines:author-runs:${authorEmail}:${days}:${limit}`
  const config = getPipelineEnvironmentConfig(environment)

  // Use LOWER() for case-insensitive matching since email addresses should be case-insensitive
  const sql = `
    SELECT
      pipeline_id,
      job_id,
      job_name,
      job_url,
      job_stage,
      timestamp_start,
      timestamp_end,
      duration_total_seconds,
      status,
      account_count,
      accounts_processed,
      commit_author,
      terraform_version
    FROM ${config.database}.pipeline_runs
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND LOWER(commit_author) LIKE LOWER('%${authorEmail}%')
    ORDER BY timestamp_start DESC
    LIMIT ${limit}
  `

  return executeAthenaQuery(sql, `author-runs-${authorEmail}`, environment, cacheKey) as Promise<PipelineRun[]>
}

/**
 * Get author-specific summary metrics
 */
export async function getAuthorSummary(
  authorEmail: string,
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<{
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  avg_duration: number
  total_accounts: number
  unique_accounts: number
  repositories: string[]
} | null> {
  const cacheKey = `pipelines:author-summary:${authorEmail}:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
      SUM(CASE WHEN status IN ('failure', 'partial_failure') THEN 1 ELSE 0 END) as failed_runs,
      CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS DOUBLE) / NULLIF(COUNT(*), 0) * 100 as success_rate,
      AVG(duration_total_seconds) as avg_duration,
      SUM(account_count) as total_accounts,
      COUNT(DISTINCT pipeline_id) as unique_pipelines
    FROM ${config.database}.pipeline_runs
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND LOWER(commit_author) LIKE LOWER('%${authorEmail}%')
  `

  const results = await executeAthenaQuery(sql, `author-summary-${authorEmail}`, environment, cacheKey)
  return results.length > 0 ? results[0] : null
}

// --- New query functions for pipeline analytics enhancements ---

/**
 * Search for a resource by address or type across all accounts (or scoped to one)
 */
export async function searchResourceAcrossAccounts(
  search: string,
  days: number = 30,
  accountId?: string,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<ResourceSearchResult[]> {
  const sanitized = sanitizeSqlString(search)
  const accountFilter = accountId ? `AND account_id = '${sanitizeSqlString(accountId)}'` : ''
  const cacheKey = `pipelines:resource-search:${search}:${accountId || 'all'}:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      account_id,
      resource_address,
      resource_type,
      module_name,
      change_action,
      applied,
      apply_success,
      timestamp,
      plan_pipeline_id
    FROM ${config.database}.resource_changes
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND (LOWER(resource_address) LIKE LOWER('%${sanitized}%') OR LOWER(resource_type) LIKE LOWER('%${sanitized}%'))
      ${accountFilter}
    ORDER BY timestamp DESC
    LIMIT 2000
  `

  return executeAthenaQuery(sql, `resource-search-${search}`, environment, cacheKey) as Promise<ResourceSearchResult[]>
}

/**
 * Get deployment status for a resource type across accounts
 */
export async function getResourceDeploymentStatus(
  resourceType: string,
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<ResourceDeploymentStatus[]> {
  const sanitized = sanitizeSqlString(resourceType)
  const cacheKey = `pipelines:resource-deploy-status:${resourceType}:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  // Use window function to get the chronologically latest record per account
  // MAX(change_action) returns alphabetical max, not the most recent action
  // MAX(applied) masks recent failures if any older row was applied
  const sql = `
    SELECT account_id, latest_action, latest_applied, latest_apply_success, total_attempts, last_seen
    FROM (
      SELECT
        account_id,
        change_action as latest_action,
        applied as latest_applied,
        apply_success as latest_apply_success,
        timestamp as last_seen,
        COUNT(*) OVER (PARTITION BY account_id) as total_attempts,
        ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY timestamp DESC) as rn
      FROM ${config.database}.resource_changes
      WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
        AND LOWER(resource_type) LIKE LOWER('%${sanitized}%')
    )
    WHERE rn = 1
    ORDER BY total_attempts DESC
    LIMIT 500
  `

  return executeAthenaQuery(sql, `resource-deploy-status-${resourceType}`, environment, cacheKey) as Promise<ResourceDeploymentStatus[]>
}

/**
 * Get resources where applied=false for an account (unapplied/drift)
 */
export async function getUnappliedResources(
  accountId: string,
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<UnappliedResource[]> {
  const cacheKey = `pipelines:unapplied:${accountId}:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      resource_address,
      resource_type,
      module_name,
      change_action,
      MAX(plan_pipeline_id) as plan_pipeline_id,
      MAX(timestamp) as latest_timestamp,
      COUNT(*) as occurrence_count
    FROM ${config.database}.resource_changes
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND account_id = '${sanitizeSqlString(accountId)}'
      AND (applied = false OR applied IS NULL)
    GROUP BY resource_address, resource_type, module_name, change_action
    ORDER BY occurrence_count DESC
    LIMIT 1000
  `

  return executeAthenaQuery(sql, `unapplied-${accountId}`, environment, cacheKey) as Promise<UnappliedResource[]>
}

/**
 * Get planned vs applied summary counts by resource_type for an account
 */
export async function getPlannedVsAppliedSummary(
  accountId: string,
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<PlannedVsAppliedSummary> {
  const cacheKey = `pipelines:drift-summary:${accountId}:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      resource_type,
      COUNT(*) as total_planned,
      SUM(CASE WHEN applied = true AND apply_success = true THEN 1 ELSE 0 END) as total_applied,
      SUM(CASE WHEN applied = true AND (apply_success = false OR apply_success IS NULL) THEN 1 ELSE 0 END) as total_failed,
      SUM(CASE WHEN applied = false OR applied IS NULL THEN 1 ELSE 0 END) as total_pending
    FROM ${config.database}.resource_changes
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND account_id = '${sanitizeSqlString(accountId)}'
    GROUP BY resource_type
    ORDER BY total_planned DESC
  `

  const results = await executeAthenaQuery(sql, `drift-summary-${accountId}`, environment, cacheKey) as Array<{
    resource_type: string
    total_planned: number
    total_applied: number
    total_failed: number
    total_pending: number
  }>

  // Aggregate totals
  const totalPlanned = results.reduce((sum, r) => sum + (r.total_planned || 0), 0)
  const totalApplied = results.reduce((sum, r) => sum + (r.total_applied || 0), 0)
  const totalFailed = results.reduce((sum, r) => sum + (r.total_failed || 0), 0)
  const totalPending = results.reduce((sum, r) => sum + (r.total_pending || 0), 0)

  return {
    totalPlanned,
    totalApplied,
    totalFailed,
    totalPending,
    byResourceType: results.map(r => ({
      resource_type: r.resource_type,
      planned: r.total_planned || 0,
      applied: r.total_applied || 0,
      failed: r.total_failed || 0,
      pending: r.total_pending || 0
    }))
  }
}

/**
 * Get recurring error patterns for an account (same error appearing multiple times)
 */
export async function getRecurringErrors(
  accountId: string,
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<RecurringErrorPattern[]> {
  const cacheKey = `pipelines:recurring-errors:${accountId}:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      error_category,
      error_message,
      error_severity,
      COUNT(*) as occurrence_count,
      MIN(timestamp) as first_seen,
      MAX(timestamp) as last_seen,
      COUNT(DISTINCT pipeline_id) as affected_pipelines
    FROM ${config.database}.error_details
    WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND account_id = '${sanitizeSqlString(accountId)}'
    GROUP BY error_category, error_message, error_severity
    HAVING COUNT(*) > 1
    ORDER BY occurrence_count DESC
    LIMIT 100
  `

  return executeAthenaQuery(sql, `recurring-errors-${accountId}`, environment, cacheKey) as Promise<RecurringErrorPattern[]>
}

/**
 * Cross-account error check: does this error pattern appear in other accounts?
 */
export async function getCrossAccountErrorComparison(
  errorCategory: string,
  errorMessagePattern: string,
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<CrossAccountError[]> {
  const sanitizedCategory = sanitizeSqlString(errorCategory)
  const sanitizedMessage = sanitizeSqlString(errorMessagePattern)
  const cacheKey = `pipelines:cross-account-error:${errorCategory}:${errorMessagePattern.substring(0, 50)}:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      e.account_id,
      ap.account_name,
      COUNT(*) as occurrence_count,
      MAX(e.timestamp) as last_seen
    FROM ${config.database}.error_details e
    LEFT JOIN (
      SELECT DISTINCT account_id, account_name
      FROM ${config.database}.account_plans
      WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
    ) ap ON e.account_id = ap.account_id
    WHERE CONCAT(e.year, LPAD(e.month, 2, '0')) >= date_format(date_add('day', -${days}, current_date), '%Y%m')
      AND e.error_category = '${sanitizedCategory}'
      AND LOWER(e.error_message) LIKE LOWER('%${sanitizedMessage}%')
    GROUP BY e.account_id, ap.account_name
    ORDER BY occurrence_count DESC
    LIMIT 200
  `

  return executeAthenaQuery(sql, `cross-account-error`, environment, cacheKey) as Promise<CrossAccountError[]>
}

/**
 * Compute a composite health score for an account's deployment state
 */
export async function getAccountDeploymentHealthData(
  accountId: string,
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<AccountDeploymentHealth> {
  // Fetch all health-related data in parallel
  const [runs, plans, recurringErrors, driftSummary] = await Promise.all([
    getPipelineRunsForAccount(accountId, days, environment, 100),
    getAccountPlansForAccount(accountId, days, environment, 500),
    getRecurringErrors(accountId, days, environment),
    getPlannedVsAppliedSummary(accountId, days, environment)
  ])

  // Latest pipeline status
  const latestRun = runs.length > 0 ? runs[0] : null
  const latestPipelineStatus = latestRun?.status || 'unknown'

  // Plan success rate
  const totalPlans = plans.length
  const appliedPlans = plans.filter(p => p.plan_status === 'applied').length
  const planSuccessRate = totalPlans > 0 ? (appliedPlans / totalPlans) * 100 : 0

  // Recurring error count
  const recurringErrorCount = recurringErrors.length

  // Unapplied resource count
  const unappliedResourceCount = driftSummary.totalPending

  // Compute health score (0-100)
  let healthScore = 100

  // Deduct for failed latest pipeline (-20)
  if (latestPipelineStatus === 'failure' || latestPipelineStatus === 'partial_failure') {
    healthScore -= 20
  }

  // Deduct for low plan success rate (up to -30)
  if (planSuccessRate < 100) {
    healthScore -= Math.round((100 - planSuccessRate) * 0.3)
  }

  // Deduct for recurring errors (up to -25, -5 per recurring error pattern)
  healthScore -= Math.min(recurringErrorCount * 5, 25)

  // Deduct for unapplied resources (up to -25, -1 per unapplied resource)
  healthScore -= Math.min(unappliedResourceCount, 25)

  // Clamp to 0-100
  healthScore = Math.max(0, Math.min(100, healthScore))

  // Determine rating
  let healthRating: 'healthy' | 'warning' | 'critical' | 'unknown' = 'unknown'
  if (runs.length === 0 && plans.length === 0) {
    healthRating = 'unknown'
  } else if (healthScore >= 80) {
    healthRating = 'healthy'
  } else if (healthScore >= 50) {
    healthRating = 'warning'
  } else {
    healthRating = 'critical'
  }

  return {
    healthScore,
    healthRating,
    factors: {
      latestPipelineStatus,
      planSuccessRate: Math.round(planSuccessRate * 10) / 10,
      recurringErrorCount,
      unappliedResourceCount
    },
    recurringErrors
  }
}
