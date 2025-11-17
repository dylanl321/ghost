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
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      DATE(from_iso8601_timestamp(timestamp_start)) as date,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status IN ('failure', 'partial_failure') THEN 1 ELSE 0 END) as failed
    FROM ${config.database}.pipeline_runs
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
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
        WHERE year >= CAST(year(date_add('day', -90, current_date)) AS VARCHAR)
          AND month >= CAST(month(date_add('day', -90, current_date)) AS VARCHAR)
          AND pipeline_id = '${pipelineId}'
          AND job_id = '${jobId}'
        LIMIT 1
      `,
      `
        SELECT *
        FROM ${config.database}.resource_changes
        WHERE year >= CAST(year(date_add('day', -90, current_date)) AS VARCHAR)
          AND month >= CAST(month(date_add('day', -90, current_date)) AS VARCHAR)
          AND plan_pipeline_id = '${pipelineId}'
          AND plan_job_id = '${jobId}'
          AND account_id = '${accountId}'
        ORDER BY timestamp DESC
        LIMIT 100
      `,
      `
        SELECT *
        FROM ${config.database}.error_details
        WHERE year >= CAST(year(date_add('day', -90, current_date)) AS VARCHAR)
          AND month >= CAST(month(date_add('day', -90, current_date)) AS VARCHAR)
          AND pipeline_id = '${pipelineId}'
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
      WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
        AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
    ),
    plan_stats AS (
      SELECT
        SUM(changes_total) as total_changes,
        COUNT(DISTINCT account_id) as unique_accounts
      FROM ${config.database}.account_plans
      WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
        AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
    )
    SELECT
      r.total_runs,
      r.successful_runs,
      r.failed_runs,
      CAST(r.successful_runs AS DOUBLE) / NULLIF(r.total_runs, 0) * 100 as success_rate,
      r.avg_duration,
      COALESCE(p.unique_accounts, 0) as unique_accounts,
      COALESCE(p.total_changes, 0) as total_changes
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
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
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
    WHERE pipeline_id = '${pipelineId}'
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
        .slice(0, 10) // Top 10 resource types
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
    WHERE year >= CAST(year(date_add('day', -90, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -90, current_date)) AS VARCHAR)
      AND plan_pipeline_id = '${pipelineId}'
    ORDER BY plan_created_at ASC
  `

  return executeAthenaQuery(sql, `account-plans-pipeline-${pipelineId}`, environment, cacheKey) as Promise<AccountPlan[]>
}

/**
 * Get resource changes for a specific pipeline
 * NOTE: The resource_changes table does not have pipeline_id columns in the schema.
 * Resources can only be queried by account_id. This function returns empty array.
 * To get resources for a pipeline, query by account_id from account_plans instead.
 */
export async function getResourceChangesForPipeline(
  pipelineId: string,
  limit: number = 500,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<ResourceChange[]> {
  // Resource changes table doesn't have pipeline_id column - return empty array
  logger.info(`[Pipeline Queries] Skipping resource changes query - table has no pipeline_id column`)
  return []
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
    WHERE year >= CAST(year(date_add('day', -90, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -90, current_date)) AS VARCHAR)
      AND pipeline_id = '${pipelineId}'
    ORDER BY timestamp ASC
  `

  return executeAthenaQuery(sql, `error-details-pipeline-${pipelineId}`, environment, cacheKey) as Promise<ErrorDetail[]>
}

/**
 * Get module-level breakdown for a specific pipeline
 * NOTE: The resource_changes table does not have pipeline_id columns in the schema.
 * Resources can only be queried by account_id. This function returns empty array.
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
  // Resource changes table doesn't have pipeline_id column - return empty array
  logger.info(`[Pipeline Queries] Skipping module breakdown query - table has no pipeline_id column`)
  return []
}

/**
 * Get account-level breakdown for organization view
 */
export async function getAccountBreakdown(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<any[]> {
  const cacheKey = `pipelines:account-breakdown:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      account_id,
      account_name,
      COUNT(*) as total_runs,
      SUM(CASE WHEN plan_status = 'applied' THEN 1 ELSE 0 END) as successful_runs,
      CAST(SUM(CASE WHEN plan_status = 'applied' THEN 1 ELSE 0 END) AS DOUBLE) / NULLIF(COUNT(*), 0) * 100 as success_rate,
      MAX(plan_created_at) as last_run
    FROM ${config.database}.account_plans
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
    GROUP BY account_id, account_name
    ORDER BY total_runs DESC
    LIMIT 50
  `

  return executeAthenaQuery(sql, 'account-breakdown', environment, cacheKey)
}

/**
 * Get resource breakdown for organization view
 */
export async function getOrganizationResourceBreakdown(
  days: number = 30,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<any[]> {
  const cacheKey = `pipelines:org-resources:${days}`
  const config = getPipelineEnvironmentConfig(environment)

  const sql = `
    SELECT
      resource_type,
      change_action,
      COUNT(*) as count
    FROM ${config.database}.resource_changes
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
    GROUP BY resource_type, change_action
    ORDER BY count DESC
    LIMIT 20
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
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
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
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
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
    WHERE year >= CAST(year(date_add('day', -${days}, current_date)) AS VARCHAR)
      AND month >= CAST(month(date_add('day', -${days}, current_date)) AS VARCHAR)
    GROUP BY DATE(from_iso8601_timestamp(timestamp_start)), HOUR(from_iso8601_timestamp(timestamp_start)), DAY_OF_WEEK(from_iso8601_timestamp(timestamp_start))
    ORDER BY date DESC, hour DESC
  `

  return executeAthenaQuery(sql, 'heatmap', environment, cacheKey)
}
