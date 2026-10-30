/**
 * Athena query runner for the Security Lake monitoring account.
 *
 * One implementation of start → poll → read every result page, used by the
 * Security Hub summary and instance activity detection. A query that times
 * out is stopped so it does not keep scanning.
 */

import {
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StopQueryExecutionCommand,
  type ResultSet
} from '@aws-sdk/client-athena'
import { getAthenaClient } from '../lib/aws-client-factory'

export interface EnvironmentConfig {
  region: string
  database: string
  athenaResultsBucket: string
  monitoringAccountId: string
}

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

/** Fully qualified Security Lake OCSF table for a source, e.g. "cloud_trail_mgmt". */
export function buildTableName(environment: 'commercial' | 'govcloud', dataSource: string): string {
  const config = getEnvironmentConfig(environment)
  const regionUnderscore = config.region.replace(/-/g, '_')
  return `${config.database}.amazon_security_lake_table_${regionUnderscore}_${dataSource}_2_0`
}

export interface AthenaQueryOptions {
  environment: 'commercial' | 'govcloud'
  /** Default database for unqualified table names */
  database?: string
  /** Folder under the results bucket */
  outputPrefix?: string
  timeoutMs?: number
  pollIntervalMs?: number
  /** Stop reading pages after this many rows (the query itself still completes) */
  maxRows?: number
}

export interface AthenaQueryResult<T = Record<string, string | null>> {
  rows: T[]
  queryExecutionId: string
  dataScannedBytes: number
  executionTimeMs: number
  /** True when maxRows cut the result short */
  truncated: boolean
}

async function athenaClientFor(environment: 'commercial' | 'govcloud') {
  const config = getEnvironmentConfig(environment)
  return { config, client: await getAthenaClient(environment, config.region, config.monitoringAccountId) }
}

/** Submit a query and return its execution ID without waiting. */
async function startAthenaQuery(sql: string, options: AthenaQueryOptions): Promise<string> {
  const { config, client } = await athenaClientFor(options.environment)
  const response = await client.send(new StartQueryExecutionCommand({
    QueryString: sql,
    WorkGroup: 'primary',
    ...(options.database ? { QueryExecutionContext: { Database: options.database } } : {}),
    ResultConfiguration: {
      OutputLocation: `s3://${config.athenaResultsBucket}/${options.outputPrefix || 'security-lake'}/`
    }
  }))
  if (!response.QueryExecutionId) {
    throw new Error('Failed to start Athena query')
  }
  return response.QueryExecutionId
}

/** Convert result pages to records keyed by column name. Cells with no value become null. */
export function parseAthenaRows(resultSet: ResultSet | undefined, skipHeader: boolean): Record<string, string | null>[] {
  const columns = resultSet?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name || '') || []
  const rows = resultSet?.Rows || []
  return (skipHeader ? rows.slice(1) : rows).map(row => {
    const record: Record<string, string | null> = {}
    row.Data?.forEach((cell, index) => {
      record[columns[index] || `column_${index}`] = cell.VarCharValue ?? null
    })
    return record
  })
}

/** Read every result page of a finished query, up to maxRows. */
async function getAthenaQueryRows(
  queryExecutionId: string,
  environment: 'commercial' | 'govcloud',
  maxRows = Number.POSITIVE_INFINITY
): Promise<{ rows: Record<string, string | null>[]; truncated: boolean }> {
  const { client } = await athenaClientFor(environment)
  const rows: Record<string, string | null>[] = []
  let nextToken: string | undefined
  let firstPage = true

  do {
    const page = await client.send(new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
      MaxResults: 1000,
      ...(nextToken ? { NextToken: nextToken } : {})
    }))
    // Only the first page of a SELECT starts with the header row
    rows.push(...parseAthenaRows(page.ResultSet, firstPage))
    firstPage = false
    nextToken = page.NextToken
  } while (nextToken && rows.length < maxRows)

  const truncated = rows.length > maxRows || !!nextToken
  return { rows: rows.slice(0, maxRows), truncated }
}

/** Run a query to completion and return all of its rows. */
export async function runAthenaQuery(sql: string, options: AthenaQueryOptions): Promise<AthenaQueryResult> {
  const started = Date.now()
  const timeoutMs = options.timeoutMs ?? 240_000
  const pollIntervalMs = options.pollIntervalMs ?? 2000
  const queryExecutionId = await startAthenaQuery(sql, options)
  const { client } = await athenaClientFor(options.environment)

  let dataScannedBytes: number
  for (;;) {
    const status = await client.send(new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }))
    const state = status.QueryExecution?.Status?.State
    if (state === 'SUCCEEDED') {
      dataScannedBytes = status.QueryExecution?.Statistics?.DataScannedInBytes ?? 0
      break
    }
    if (state === 'FAILED' || state === 'CANCELLED') {
      const reason = status.QueryExecution?.Status?.StateChangeReason || 'Unknown error'
      throw new Error(`Athena query ${state.toLowerCase()}: ${reason}`)
    }
    if (Date.now() - started >= timeoutMs) {
      await client.send(new StopQueryExecutionCommand({ QueryExecutionId: queryExecutionId })).catch(() => undefined)
      throw new Error(`Athena query timeout after ${Math.round(timeoutMs / 1000)} seconds`)
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  const { rows, truncated } = await getAthenaQueryRows(queryExecutionId, options.environment, options.maxRows)
  return { rows, queryExecutionId, dataScannedBytes, executionTimeMs: Date.now() - started, truncated }
}
