/**
 * Security Lake V2 - Consolidated Implementation
 * This file contains all Security Lake functionality in a single file to avoid duplicate import issues
 */

import { createHash } from 'node:crypto'
import { getAthenaClient } from '../lib/aws-client-factory'
import { getEnvironmentConfig, runAthenaQuery, startAthenaQuery, getAthenaQueryRows } from './athena-query'
import { getCacheManager } from './cache-manager'
import { logger } from './logger'

// Types
export interface QueryParameter {
  name: string
  type: 'string' | 'number' | 'date' | 'array'
  required: boolean
  description: string
  defaultValue?: any
}

export interface StoredQuery {
  id: string
  name: string
  description: string
  category: 'cloudtrail' | 'securityhub' | 'vpcflow' | 'dns' | 's3'
  parameters: QueryParameter[]
  sql: string
  examples: Array<{
    name: string
    description: string
    parameters: Record<string, any>
  }>
}

export interface QueryExecutionRequest {
  queryId: string
  parameters: Record<string, any>
  environment?: 'commercial' | 'govcloud'
  dryRun?: boolean
  async?: boolean // Return query ID instead of waiting for results
}

export interface AsyncQueryRequest {
  queryId: string // Athena query execution ID
  environment?: 'commercial' | 'govcloud'
}

export interface QueryStatusResponse {
  queryId: string
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  startTime?: string
  endTime?: string
  data?: any[]
  error?: string
  executionTimeMs?: number
  metadata?: {
    queryName: string
    recordCount?: number
    dataScannedBytes?: number
  }
}

export interface QueryResult {
  success: boolean
  data?: any[]
  sql?: string
  executionTimeMs?: number
  error?: string
  metadata?: {
    queryId: string
    queryName: string
    recordCount: number
    dataScannedBytes: number
    queryExecutionId?: string
    cached?: boolean
  }
}

export { getEnvironmentConfig, type EnvironmentConfig } from './athena-query'

export function buildTableName(
  environment: 'commercial' | 'govcloud',
  dataSource: string
): string {
  const config = getEnvironmentConfig(environment)
  const regionUnderscore = config.region.replace(/-/g, '_')
  return `${config.database}.amazon_security_lake_table_${regionUnderscore}_${dataSource}_2_0`
}

// Stored Queries
export const STORED_QUERIES: StoredQuery[] = [
  // Table Schema Exploration
  {
    id: 'explore_schema',
    name: 'Explore Table Schema',
    description: 'Explore the structure of available tables',
    category: 'cloudtrail',
    parameters: [
      { name: 'startTime', type: 'date', required: true, description: 'Start time (ISO 8601)' },
      { name: 'endTime', type: 'date', required: true, description: 'End time (ISO 8601)' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', defaultValue: 10 }
    ],
    sql: `
      SELECT *
      FROM {{TABLE_NAME}}
      WHERE time BETWEEN {{START_TIME}} AND {{END_TIME}}
      LIMIT {{LIMIT}}
    `,
    examples: [{
      name: 'Sample data',
      description: 'Get sample data to understand schema',
      parameters: {
        startTime: '2024-12-01T00:00:00Z',
        endTime: '2024-12-02T00:00:00Z',
        limit: 5
      }
    }]
  },
  
  // CloudTrail Queries
  {
    id: 'failed_access',
    name: 'Failed Access Attempts',
    description: 'Find failed API calls and access denied events',
    category: 'cloudtrail',
    parameters: [
      { name: 'startTime', type: 'date', required: true, description: 'Start time (ISO 8601)' },
      { name: 'endTime', type: 'date', required: true, description: 'End time (ISO 8601)' },
      { name: 'accountIds', type: 'array', required: false, description: 'Account IDs to filter' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', defaultValue: 100 }
    ],
    sql: `
      SELECT 
        time,
        time_dt as event_time,
        region,
        accountid as account_id,
        status,
        class_name,
        activity_name,
        severity
      FROM {{TABLE_NAME}}
      WHERE time BETWEEN {{START_TIME}} AND {{END_TIME}}
        AND status != 'Success'
        {{ACCOUNT_FILTER}}
      ORDER BY time DESC
      LIMIT {{LIMIT}}
    `,
    examples: [{
      name: 'Recent failures',
      description: 'Failed access in last 24 hours',
      parameters: {
        startTime: '2024-12-01T00:00:00Z',
        endTime: '2024-12-02T00:00:00Z',
        limit: 50
      }
    }]
  },
  
  {
    id: 'privileged_actions',
    name: 'Privileged Actions',
    description: 'Track high-risk administrative operations',
    category: 'cloudtrail',
    parameters: [
      { name: 'startTime', type: 'date', required: true, description: 'Start time (ISO 8601)' },
      { name: 'endTime', type: 'date', required: true, description: 'End time (ISO 8601)' },
      { name: 'accountIds', type: 'array', required: false, description: 'Account IDs to filter' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', defaultValue: 100 }
    ],
    sql: `
      SELECT 
        time,
        time_dt as event_time,
        region,
        accountid as account_id,
        status,
        class_name,
        activity_name,
        severity
      FROM {{TABLE_NAME}}
      WHERE time BETWEEN {{START_TIME}} AND {{END_TIME}}
        AND class_name = 'API Activity'
        AND activity_name IN ('Create', 'Delete', 'Modify')
        {{ACCOUNT_FILTER}}
      ORDER BY time DESC
      LIMIT {{LIMIT}}
    `,
    examples: [{
      name: 'IAM changes',
      description: 'IAM policy and role modifications',
      parameters: {
        startTime: '2024-12-01T00:00:00Z',
        endTime: '2024-12-02T00:00:00Z'
      }
    }]
  },

  // Security Hub Queries
  {
    id: 'critical_findings',
    name: 'Critical Security Findings',
    description: 'High and critical severity findings',
    category: 'securityhub',
    parameters: [
      { name: 'startTime', type: 'date', required: true, description: 'Start time (ISO 8601)' },
      { name: 'endTime', type: 'date', required: true, description: 'End time (ISO 8601)' },
      { name: 'accountIds', type: 'array', required: false, description: 'Account IDs to filter' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', defaultValue: 100 }
    ],
    sql: `
      SELECT 
        time,
        time_dt as finding_time,
        severity as severity_label,
        severity_id,
        status,
        accountid as account_id,
        region,
        class_name,
        category_name
      FROM {{TABLE_NAME}}
      WHERE time BETWEEN {{START_TIME}} AND {{END_TIME}}
        AND severity_id >= 3
        AND status IN ('NEW', 'NOTIFIED')
        {{ACCOUNT_FILTER}}
      ORDER BY severity_id DESC, time DESC
      LIMIT {{LIMIT}}
    `,
    examples: [{
      name: 'New critical findings',
      description: 'Recently discovered critical issues',
      parameters: {
        startTime: '2024-12-01T00:00:00Z',
        endTime: '2024-12-02T00:00:00Z'
      }
    }]
  },

  {
    id: 'resources_most_findings',
    name: 'Resources with Most Findings',
    description: 'Resources with highest number of security findings',
    category: 'securityhub',
    parameters: [
      { name: 'startTime', type: 'date', required: true, description: 'Start time (ISO 8601)' },
      { name: 'endTime', type: 'date', required: true, description: 'End time (ISO 8601)' },
      { name: 'accountIds', type: 'array', required: false, description: 'Account IDs to filter' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', defaultValue: 50 }
    ],
    sql: `
      SELECT 
        region,
        accountid as account_id,
        class_name,
        category_name,
        COUNT(*) as total_findings,
        COUNT(CASE WHEN severity_id >= 4 THEN 1 END) as high_critical_findings,
        MAX(time) as latest_finding_time,
        MAX(time_dt) as latest_finding_readable
      FROM {{TABLE_NAME}}
      WHERE time BETWEEN {{START_TIME}} AND {{END_TIME}}
        AND severity_id >= 2
        AND status IN ('NEW', 'NOTIFIED')
        {{ACCOUNT_FILTER}}
      GROUP BY region, accountid, class_name, category_name
      HAVING COUNT(*) > 1
      ORDER BY total_findings DESC
      LIMIT {{LIMIT}}
    `,
    examples: [{
      name: 'Most vulnerable resources',
      description: 'Resources with multiple security issues',
      parameters: {
        startTime: '2024-12-01T00:00:00Z',
        endTime: '2024-12-02T00:00:00Z',
        limit: 20
      }
    }]
  },

  // VPC Flow Queries
  {
    id: 'denied_traffic',
    name: 'Denied Network Traffic',
    description: 'Network connections blocked by security groups or NACLs',
    category: 'vpcflow',
    parameters: [
      { name: 'startTime', type: 'date', required: true, description: 'Start time (ISO 8601)' },
      { name: 'endTime', type: 'date', required: true, description: 'End time (ISO 8601)' },
      { name: 'accountIds', type: 'array', required: false, description: 'Account IDs to filter' },
      { name: 'limit', type: 'number', required: false, description: 'Max results', defaultValue: 100 }
    ],
    sql: `
      SELECT 
        time,
        FROM_UNIXTIME(time/1000) as event_time,
        src_endpoint.ip as source_ip,
        src_endpoint.port as source_port,
        dst_endpoint.ip as dest_ip,
        dst_endpoint.port as dest_port,
        connection_info.protocol_name as protocol,
        disposition as action,
        traffic.bytes as bytes,
        cloud.account.uid as account_id,
        cloud.region
      FROM {{TABLE_NAME}}
      WHERE time BETWEEN {{START_TIME}} AND {{END_TIME}}
        AND disposition = 'BLOCKED'
        {{ACCOUNT_FILTER}}
      ORDER BY time DESC
      LIMIT {{LIMIT}}
    `,
    examples: [{
      name: 'Blocked connections',
      description: 'Recent denied network traffic',
      parameters: {
        startTime: '2024-12-01T00:00:00Z',
        endTime: '2024-12-02T00:00:00Z'
      }
    }]
  }
]

// Query Functions
export function getStoredQuery(queryId: string): StoredQuery | undefined {
  return STORED_QUERIES.find(q => q.id === queryId)
}

export function getQueriesByCategory(category: string): StoredQuery[] {
  return STORED_QUERIES.filter(q => q.category === category)
}

export function getAllQueryIds(): string[] {
  return STORED_QUERIES.map(q => q.id)
}

// Execution Functions
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_TIMEOUT_SECONDS = parseInt(process.env.ATHENA_TIMEOUT_SECONDS || '60') || 60
// Stored queries cap LIMIT at 10,000
const MAX_ASYNC_RESULT_ROWS = 10000

export async function executeStoredQuery(request: QueryExecutionRequest): Promise<QueryResult> {
  const { queryId, parameters, environment = 'commercial', dryRun = false, async = false } = request

  try {
    // Get the stored query
    const query = getStoredQuery(queryId)
    if (!query) {
      return { success: false, error: `Query '${queryId}' not found` }
    }

    // Validate parameters
    const validation = validateParameters(query, parameters)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // Build the SQL
    const sql = buildSQL(query, parameters, environment)

    // If dry run, return the SQL
    if (dryRun) {
      return {
        success: true,
        sql,
        metadata: {
          queryId: query.id,
          queryName: query.name,
          recordCount: 0,
          dataScannedBytes: 0
        }
      }
    }

    // Execute the query
    return await executeSQL(sql, query, environment, async)

  } catch (error) {
    logger.error(`[Security Lake] Query execution failed:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function isAwsAccountId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{12}$/.test(value)
}

export function validateParameters(query: StoredQuery, parameters: Record<string, any>): { valid: boolean, error?: string } {
  for (const param of query.parameters) {
    const value = parameters[param.name]

    if (param.required && (value === undefined || value === null)) {
      return { valid: false, error: `Missing required parameter: ${param.name}` }
    }

    if (value !== undefined && value !== null) {
      if (param.type === 'date' && isNaN(new Date(value).getTime())) {
        return { valid: false, error: `Invalid date format for parameter: ${param.name}` }
      }

      if (param.type === 'number' && isNaN(Number(value))) {
        return { valid: false, error: `Invalid number format for parameter: ${param.name}` }
      }

      if (param.type === 'array' && !Array.isArray(value)) {
        return { valid: false, error: `Parameter ${param.name} must be an array` }
      }

      // accountIds are interpolated into SQL, so each one must be a bare
      // 12-digit AWS account id.
      if (param.name === 'accountIds' && !value.every(isAwsAccountId)) {
        return { valid: false, error: 'accountIds must contain only 12-digit AWS account IDs' }
      }
    }
  }

  return { valid: true }
}

export function buildSQL(query: StoredQuery, parameters: Record<string, any>, environment: 'commercial' | 'govcloud'): string {
  let sql = query.sql

  // Get table name based on category
  const dataSourceMap: Record<string, string> = {
    cloudtrail: 'cloud_trail_mgmt',
    securityhub: 'sh_findings',
    vpcflow: 'vpc_flow',
    dns: 'route53',
    lambda: 'lambda_execution'
  }

  const tableName = buildTableName(environment, dataSourceMap[query.category])
  sql = sql.replace(/\{\{TABLE_NAME\}\}/g, tableName)

  // Replace time parameters
  if (parameters.startTime) {
    const startEpoch = new Date(parameters.startTime).getTime()
    sql = sql.replace(/\{\{START_TIME\}\}/g, String(startEpoch))
  }

  if (parameters.endTime) {
    const endEpoch = new Date(parameters.endTime).getTime()
    sql = sql.replace(/\{\{END_TIME\}\}/g, String(endEpoch))
  }

  // Replace limit
  const requestedLimit = Number(parameters.limit || query.parameters.find(p => p.name === 'limit')?.defaultValue || 100)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 10000) : 100
  sql = sql.replace(/\{\{LIMIT\}\}/g, String(limit))

  // Build account filter
  if (parameters.accountIds && Array.isArray(parameters.accountIds) && parameters.accountIds.length > 0) {
    // Re-checked here so no caller can reach the SQL string with an unvalidated id.
    if (!parameters.accountIds.every(isAwsAccountId)) {
      throw new Error('accountIds must contain only 12-digit AWS account IDs')
    }
    const accountList = parameters.accountIds.map((id: string) => `'${id}'`).join(', ')
    // Handle different column names for different data sources
    if (query.category === 'securityhub') {
      sql = sql.replace(/\{\{ACCOUNT_FILTER\}\}/g, `AND accountid IN (${accountList})`)
    } else if (query.category === 'cloudtrail') {
      sql = sql.replace(/\{\{ACCOUNT_FILTER\}\}/g, `AND accountid IN (${accountList})`)
    } else {
      sql = sql.replace(/\{\{ACCOUNT_FILTER\}\}/g, `AND accountid IN (${accountList})`)
    }
  } else {
    sql = sql.replace(/\{\{ACCOUNT_FILTER\}\}/g, '')
  }

  // Clean up whitespace
  return sql.replace(/\s+/g, ' ').trim()
}

async function executeSQL(sql: string, query: StoredQuery, environment: 'commercial' | 'govcloud', async: boolean = false): Promise<QueryResult> {
  const metadata = { queryId: query.id, queryName: query.name }

  if (async) {
    logger.info(`[Security Lake] Starting async query '${query.id}' in ${environment}`)
    const queryExecutionId = await startAthenaQuery(sql, { environment })
    return { success: true, data: [], metadata: { ...metadata, recordCount: 0, dataScannedBytes: 0, queryExecutionId } }
  }

  // Keyed by a hash of the full SQL: parameters (accounts, time window,
  // limit) are part of the statement, so a prefix would collide across them.
  const cache = getCacheManager()
  const cacheKey = `security-lake:${environment}:${query.id}:${createHash('sha256').update(sql).digest('hex')}`
  const cached = await cache.get<QueryResult>(cacheKey)
  if (cached) {
    return { ...cached, metadata: { ...cached.metadata!, cached: true } }
  }

  logger.info(`[Security Lake] Executing query '${query.id}' in ${environment}`)
  const result = await runAthenaQuery(sql, { environment, timeoutMs: DEFAULT_TIMEOUT_SECONDS * 1000 })

  const queryResult: QueryResult = {
    success: true,
    data: result.rows,
    executionTimeMs: result.executionTimeMs,
    metadata: {
      ...metadata,
      recordCount: result.rows.length,
      dataScannedBytes: result.dataScannedBytes,
      queryExecutionId: result.queryExecutionId
    }
  }
  await cache.set(cacheKey, queryResult, { ttl: CACHE_TTL_MS / 1000 })
  return queryResult
}

export async function getAsyncQueryStatus(
  queryExecutionId: string,
  queryName: string,
  environment: 'commercial' | 'govcloud' = 'commercial'
): Promise<QueryStatusResponse> {
  try {
    const config = getEnvironmentConfig(environment)
    const athenaClient = await getAthenaClient(environment, config.region, config.monitoringAccountId)
    const { GetQueryExecutionCommand } = await import('@aws-sdk/client-athena')

    // Get query status
    const statusResponse = await athenaClient.send(new GetQueryExecutionCommand({
      QueryExecutionId: queryExecutionId
    }))

    const queryExecution = statusResponse.QueryExecution
    if (!queryExecution) {
      throw new Error('Query execution not found')
    }

    const status = queryExecution.Status?.State || 'UNKNOWN'
    const startTime = queryExecution.Status?.SubmissionDateTime?.toISOString()
    const endTime = queryExecution.Status?.CompletionDateTime?.toISOString()

    const response: QueryStatusResponse = {
      queryId: queryExecutionId,
      status: status as any,
      startTime,
      endTime,
      metadata: {
        queryName
      }
    }

    // If query succeeded, get results
    if (status === 'SUCCEEDED') {
      try {
        const { rows: data } = await getAthenaQueryRows(queryExecutionId, environment, MAX_ASYNC_RESULT_ROWS)

        response.data = data
        response.metadata!.recordCount = data.length
        response.executionTimeMs = endTime && startTime
          ? new Date(endTime).getTime() - new Date(startTime).getTime()
          : undefined

      } catch (resultsError) {
        logger.error(`[Security Lake] Failed to get results for ${queryExecutionId}:`, resultsError)
        response.error = 'Failed to retrieve results'
      }
    } else if (status === 'FAILED') {
      response.error = queryExecution.Status?.StateChangeReason || 'Query failed'
    }

    return response

  } catch (error) {
    logger.error(`[Security Lake] Failed to get query status:`, error)
    return {
      queryId: queryExecutionId,
      status: 'FAILED',
      error: error instanceof Error ? error.message : String(error),
      metadata: { queryName }
    }
  }
}

// Default export
export { executeStoredQuery as default }

