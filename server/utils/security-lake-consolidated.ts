/**
 * Security Lake V2 - Consolidated Implementation
 * This file contains all Security Lake functionality in a single file to avoid duplicate import issues
 */

import { getAthenaClient } from '../lib/aws-client-factory'
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
  }
}

export interface EnvironmentConfig {
  region: string
  database: string
  athenaResultsBucket: string
  monitoringAccountId: string
}

// Configuration
export function getEnvironmentConfig(environment: 'commercial' | 'govcloud'): EnvironmentConfig {
  if (environment === 'govcloud') {
    return {
      region: process.env.AWS_GOVCLOUD_SECURITY_LAKE_REGION || 'us-gov-west-1',
      database: process.env.AWS_GOVCLOUD_SECURITY_LAKE_DATABASE || 'amazon_security_lake_glue_db_us_gov_west_1',
      athenaResultsBucket: process.env.AWS_GOVCLOUD_ATHENA_RESULTS_BUCKET || 'aws-athena-query-results-us-gov-west-1',
      monitoringAccountId: process.env.AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT || '083876038518'
    }
  }
  
  return {
    region: process.env.AWS_COMMERCIAL_SECURITY_LAKE_REGION || 'us-east-1',
    database: process.env.AWS_COMMERCIAL_SECURITY_LAKE_DATABASE || 'amazon_security_lake_glue_db_us_east_1',
    athenaResultsBucket: process.env.AWS_COMMERCIAL_ATHENA_RESULTS_BUCKET || 'aws-athena-query-results-us-east-1-253821132832',
    monitoringAccountId: process.env.AWS_COMMERCIAL_SECURITY_LAKE_ACCOUNT || '253821132832'
  }
}

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
const DEFAULT_TIMEOUT_SECONDS = parseInt(process.env.ATHENA_TIMEOUT_SECONDS || '60')

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
      error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)
    }
  }
}

function validateParameters(query: StoredQuery, parameters: Record<string, any>): { valid: boolean, error?: string } {
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
    }
  }

  return { valid: true }
}

function buildSQL(query: StoredQuery, parameters: Record<string, any>, environment: 'commercial' | 'govcloud'): string {
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
  const limit = parameters.limit || query.parameters.find(p => p.name === 'limit')?.defaultValue || 100
  sql = sql.replace(/\{\{LIMIT\}\}/g, String(limit))

  // Build account filter
  if (parameters.accountIds && Array.isArray(parameters.accountIds) && parameters.accountIds.length > 0) {
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
  const cache = getCacheManager()
  const cacheKey = `security-lake:${query.id}:${Buffer.from(sql).toString('base64').slice(0, 32)}`

  // Check cache first
  const cached = await cache.get(cacheKey)
  if (cached) {
    return { ...cached, metadata: { ...cached.metadata, cached: true } }
  }

  const startTime = Date.now()
  const config = getEnvironmentConfig(environment)

  try {
    // Get Athena client
    const athenaClient = await getAthenaClient(environment, config.region, config.monitoringAccountId)

    logger.info(`[Security Lake V2] Executing query '${query.id}' in ${environment}`)

    // Start query execution
    const { StartQueryExecutionCommand } = await import('@aws-sdk/client-athena')
    const startResponse = await athenaClient.send(new StartQueryExecutionCommand({
      QueryString: sql,
      WorkGroup: 'primary',
      ResultConfiguration: {
        OutputLocation: `s3://${config.athenaResultsBucket}/security-lake/`
      }
    }))

    if (!startResponse.QueryExecutionId) {
      throw new Error('Failed to start Athena query')
    }

    const queryExecutionId = startResponse.QueryExecutionId

    // If async mode, return query ID immediately
    if (async) {
      return {
        success: true,
        data: [],
        metadata: {
          queryId: query.id,
          queryName: query.name,
          recordCount: 0,
          dataScannedBytes: 0,
          queryExecutionId: queryExecutionId
        }
      }
    }

    // Wait for completion
    const { GetQueryExecutionCommand } = await import('@aws-sdk/client-athena')
    let attempts = 0
    const pollIntervalMs = 2000 // Check status every 2 seconds
    const maxAttempts = Math.ceil(DEFAULT_TIMEOUT_SECONDS * 1000 / pollIntervalMs) // Dynamic based on timeout

    while (attempts < maxAttempts) {
      const statusResponse = await athenaClient.send(new GetQueryExecutionCommand({
        QueryExecutionId: startResponse.QueryExecutionId
      }))

      const state = statusResponse.QueryExecution?.Status?.State

      if (state === 'SUCCEEDED') {
        break
      } else if (state === 'FAILED' || state === 'CANCELLED') {
        const reason = statusResponse.QueryExecution?.Status?.StateChangeReason || 'Unknown error'
        throw new Error(`Query failed: ${reason}`)
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    }

    if (attempts >= maxAttempts) {
      throw new Error(`Query timeout after ${DEFAULT_TIMEOUT_SECONDS} seconds`)
    }

    // Get results
    const { GetQueryResultsCommand } = await import('@aws-sdk/client-athena')
    const resultsResponse = await athenaClient.send(new GetQueryResultsCommand({
      QueryExecutionId: startResponse.QueryExecutionId
    }))

    // Parse results
    const rows = resultsResponse.ResultSet?.Rows || []
    const columns = rows[0]?.Data || []
    const data = rows.slice(1).map(row => {
      const record: Record<string, any> = {}
      row.Data?.forEach((cell, index) => {
        const columnName = columns[index]?.VarCharValue || `column_${index}`
        record[columnName] = cell.VarCharValue || null
      })
      return record
    })

    const executionTimeMs = Date.now() - startTime
    const result: QueryResult = {
      success: true,
      data,
      executionTimeMs,
      metadata: {
        queryId: query.id,
        queryName: query.name,
        recordCount: data.length,
        dataScannedBytes: 0 // Would need to get this from query execution details
      }
    }

    // Cache result
    await cache.set(cacheKey, result, { ttl: CACHE_TTL_MS / 1000 })

    return result

  } catch (error) {
    logger.error(`[Security Lake V2] SQL execution failed:`, error)
    throw error
  }
}

export async function getAsyncQueryStatus(
  queryExecutionId: string,
  queryName: string,
  environment: 'commercial' | 'govcloud' = 'commercial'
): Promise<QueryStatusResponse> {
  const config = getEnvironmentConfig(environment)

  try {
    const athenaClient = await getAthenaClient(environment, config.region, config.monitoringAccountId)
    const { GetQueryExecutionCommand, GetQueryResultsCommand } = await import('@aws-sdk/client-athena')

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
        const resultsResponse = await athenaClient.send(new GetQueryResultsCommand({
          QueryExecutionId: queryExecutionId
        }))

        const rows = resultsResponse.ResultSet?.Rows || []
        const columns = rows[0]?.Data || []
        const data = rows.slice(1).map(row => {
          const record: Record<string, any> = {}
          row.Data?.forEach((cell, index) => {
            const columnName = columns[index]?.VarCharValue || `column_${index}`
            record[columnName] = cell.VarCharValue || null
          })
          return record
        })

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
      error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error),
      metadata: { queryName }
    }
  }
}

// Default export
export { executeStoredQuery as default }

