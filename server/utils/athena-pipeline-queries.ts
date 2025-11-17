/**
 * Pipeline Data - Athena Query Utilities
 * Query GitLab pipeline telemetry data stored in S3 and queryable via Athena
 */

import { getAthenaClient } from '../lib/aws-client-factory'
import { getCacheManager } from './cache-manager'
import { logger } from './logger'

// Types
export interface PipelineEnvironmentConfig {
  region: string
  database: string
  athenaResultsBucket: string
  accountId: string
}

export interface PipelineRun {
  pipeline_id: string
  job_id: string
  job_name: string
  job_url: string
  job_stage: string
  timestamp_start: string
  timestamp_end: string
  duration_total_seconds: number
  status: string
  account_count: number
  accounts_processed: string[]
  commit_author: string
  terraform_version: string
}

export interface AccountPlan {
  account_id: string
  account_name: string
  plan_created_at: string
  plan_pipeline_id: string
  changes_create: number
  changes_update: number
  changes_destroy: number
  changes_total: number
  plan_status: string
  applied_at?: string
}

export interface ResourceChange {
  account_id: string
  resource_address: string
  resource_type: string
  module_name: string
  change_action: string
  applied: boolean
  apply_success: boolean
  timestamp: string
}

export interface ErrorDetail {
  pipeline_id: string
  account_id: string
  timestamp: string
  error_phase: string
  error_category: string
  error_severity: string
  error_message: string
  error_resource_type?: string
}

export interface PipelineSummary {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  avgDurationSeconds: number
  totalChanges: number
  resourceBreakdown: Array<{
    resourceType: string
    action: string
    count: number
  }>
  errorBreakdown: Array<{
    category: string
    count: number
  }>
  recentRuns: PipelineRun[]
}

// Configuration
export function getPipelineEnvironmentConfig(environment: 'commercial' | 'govcloud' = 'commercial'): PipelineEnvironmentConfig {
  // Pipeline data is stored in commercial environment by default
  return {
    region: process.env.AWS_COMMERCIAL_REGION || 'us-east-1',
    database: process.env.ATHENA_PIPELINE_DATABASE || 'default',
    athenaResultsBucket: process.env.ATHENA_PIPELINE_RESULTS_BUCKET || 'gdlz-gitlab-pipeline-data',
    accountId: process.env.AWS_COMMERCIAL_ACCOUNT_ID || '253821132832'
  }
}

// Constants
const CACHE_TTL_SECONDS = 300 // 5 minutes cache for pipeline data
const DEFAULT_TIMEOUT_SECONDS = 60
const POLL_INTERVAL_MS = 2000

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

  try {
    // Get Athena client
    const athenaClient = await getAthenaClient(environment, config.region, config.accountId)

    logger.info(`[Pipeline Queries] Executing query '${queryName}' in ${environment}`)

    // Start query execution
    const { StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = await import('@aws-sdk/client-athena')

    const startResponse = await athenaClient.send(new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: {
        Database: config.database
      },
      WorkGroup: process.env.ATHENA_PIPELINE_WORKGROUP || 'primary',
      ResultConfiguration: {
        OutputLocation: `s3://${config.athenaResultsBucket}/query-results/`
      }
    }))

    if (!startResponse.QueryExecutionId) {
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
}

/**
 * Get pipeline runs for a specific account within a date range
 */
export async function getPipelineRunsForAccount(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial'
): Promise<PipelineRun[]> {
  const cacheKey = `pipelines:runs:${accountId}:${days}`

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
    FROM pipeline_runs
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND contains(accounts_processed, '${accountId}')
    ORDER BY timestamp_start DESC
    LIMIT 100
  `

  return executeAthenaQuery(sql, `pipeline-runs-${accountId}`, environment, cacheKey) as Promise<PipelineRun[]>
}

/**
 * Get account plans for a specific account
 */
export async function getAccountPlansForAccount(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial'
): Promise<AccountPlan[]> {
  const cacheKey = `pipelines:plans:${accountId}:${days}`

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
    FROM account_plans
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND account_id = '${accountId}'
    ORDER BY plan_created_at DESC
    LIMIT 100
  `

  return executeAthenaQuery(sql, `account-plans-${accountId}`, environment, cacheKey) as Promise<AccountPlan[]>
}

/**
 * Get resource changes for a specific account
 */
export async function getResourceChangesForAccount(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial'
): Promise<ResourceChange[]> {
  const cacheKey = `pipelines:resources:${accountId}:${days}`

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
    FROM resource_changes
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND account_id = '${accountId}'
    ORDER BY timestamp DESC
    LIMIT 500
  `

  return executeAthenaQuery(sql, `resource-changes-${accountId}`, environment, cacheKey) as Promise<ResourceChange[]>
}

/**
 * Get error details for a specific account
 */
export async function getErrorDetailsForAccount(
  accountId: string,
  days: number = 7,
  environment: 'commercial' | 'govcloud' = 'commercial'
): Promise<ErrorDetail[]> {
  const cacheKey = `pipelines:errors:${accountId}:${days}`

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
    FROM error_details
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND account_id = '${accountId}'
    ORDER BY timestamp DESC
    LIMIT 100
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

  // Group resources by type and action
  const resourceMap = new Map<string, number>()
  resources.forEach(r => {
    const key = `${r.resource_type}:${r.change_action}`
    resourceMap.set(key, (resourceMap.get(key) || 0) + 1)
  })

  const resourceBreakdown = Array.from(resourceMap.entries())
    .map(([key, count]) => {
      const [resourceType, action] = key.split(':')
      return { resourceType, action, count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10) // Top 10

  // Group errors by category
  const errorMap = new Map<string, number>()
  errors.forEach(e => {
    errorMap.set(e.error_category, (errorMap.get(e.error_category) || 0) + 1)
  })

  const errorBreakdown = Array.from(errorMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalRuns,
    successfulRuns,
    failedRuns,
    avgDurationSeconds,
    totalChanges,
    resourceBreakdown,
    errorBreakdown,
    recentRuns: runs.slice(0, 10) // Most recent 10
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

  const sql = `
    SELECT
      DATE(CAST(timestamp_start AS TIMESTAMP)) as date,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status IN ('failure', 'partial_failure') THEN 1 ELSE 0 END) as failed
    FROM pipeline_runs
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND contains(accounts_processed, '${accountId}')
    GROUP BY DATE(CAST(timestamp_start AS TIMESTAMP))
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

  try {
    // Fetch run details, resource changes, and errors in parallel
    const [runSql, resourceSql, errorSql] = [
      `
        SELECT *
        FROM pipeline_runs
        WHERE pipeline_id = '${pipelineId}'
          AND job_id = '${jobId}'
        LIMIT 1
      `,
      `
        SELECT *
        FROM resource_changes
        WHERE plan_pipeline_id = '${pipelineId}'
          AND plan_job_id = '${jobId}'
          AND account_id = '${accountId}'
        ORDER BY timestamp DESC
        LIMIT 100
      `,
      `
        SELECT *
        FROM error_details
        WHERE pipeline_id = '${pipelineId}'
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
