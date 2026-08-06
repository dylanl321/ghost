/**
 * AWS CloudTrail Data Fetcher (via Security Lake)
 *
 * Fetches CloudTrail events from Security Lake using Athena queries.
 * Security Lake stores CloudTrail data in OCSF format, providing better
 * performance and longer historical data retention than direct CloudTrail API.
 *
 * IMPORTANT: Security Lake's OCSF schema has limited queryable fields at the top level.
 * Most CloudTrail data is preserved in the 'unmapped' field as JSON.
 * We query only basic fields (accountid, region, time, class_name, activity_name, status, unmapped)
 * and perform detailed filtering client-side after parsing the unmapped data.
 */

import { getAllAccountsUnified } from './accounts-consolidated'
import { buildTableName, getEnvironmentConfig } from './security-lake-consolidated'
import { getAthenaClient } from '../lib/aws-client-factory'
import { logger } from './logger'
import type {
  CloudTrailEventRecord,
  CloudTrailDatasetFilters,
  DatasetQueryOptions,
  DatasetQueryResult,
} from '../../shared/types/dataset-reports'

import {
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StopQueryExecutionCommand,
} from '@aws-sdk/client-athena'

/**
 * Default lookback period (days)
 */
const DEFAULT_LOOKBACK_DAYS = 7
const MAX_LOOKBACK_DAYS = 365  // Security Lake can store much longer history

/**
 * Normalize Security Lake OCSF CloudTrail event to our simplified record format
 *
 * Security Lake stores CloudTrail in OCSF format with most data in the 'unmapped' field.
 * The unmapped field contains the complete original CloudTrail event as JSON.
 */
function normalizeSecurityLakeEvent(row: any, accountName: string): CloudTrailEventRecord {
  // Athena returns time as epoch milliseconds
  const eventTime = row.time ? new Date(Number(row.time)).toISOString() : ''

  // Parse unmapped field - it's a map<string,string> in Athena, not JSON
  // Athena returns maps as objects, so unmapped should already be an object
  let unmappedData: any = {}
  if (row.unmapped) {
    // If it's already an object, use it directly
    if (typeof row.unmapped === 'object' && !Array.isArray(row.unmapped)) {
      unmappedData = row.unmapped
    } else if (typeof row.unmapped === 'string') {
      // Only try to parse if it's a string
      try {
        unmappedData = JSON.parse(row.unmapped)
      } catch {
        // Not valid JSON, might be empty or malformed
      }
    }
  }

  // Extract data - prioritize OCSF fields over unmapped
  const eventName = row.event_name || row.activity_name || unmappedData.eventName || ''
  const eventType = unmappedData.eventType || row.class_name || 'API Activity'
  const eventSource = row.service_name || unmappedData.eventSource || ''

  // Determine if event is read-only based on operation name
  const readOnly = unmappedData.readOnly === true ||
                    eventName.toLowerCase().includes('get') ||
                    eventName.toLowerCase().includes('list') ||
                    eventName.toLowerCase().includes('describe')

  // Extract user identity - prefer OCSF fields
  const userName = row.user_name || unmappedData.userIdentity?.userName || unmappedData.userName
  const userType = row.user_type || unmappedData.userIdentity?.type || 'Unknown'
  const userUid = row.user_uid || unmappedData.userIdentity?.principalId
  const userArn = unmappedData.userIdentity?.arn

  return {
    accountId: row.accountid || '',
    accountName,
    region: row.region || unmappedData.awsRegion || 'unknown',
    eventId: row.event_id || unmappedData.eventID || '',
    eventName,
    eventType,
    eventTime: row.time_dt || unmappedData.eventTime || eventTime,
    eventSource,
    userIdentityType: userType,
    userIdentityPrincipalId: userUid,
    userIdentityArn: userArn,
    userIdentityUserName: userName,
    sourceIPAddress: row.source_ip || unmappedData.sourceIPAddress,
    userAgent: row.user_agent || unmappedData.userAgent,
    errorCode: unmappedData.errorCode,
    errorMessage: unmappedData.errorMessage,
    readOnly,
    resources: unmappedData.resources,
    requestParameters: unmappedData.requestParameters,
    responseElements: unmappedData.responseElements,
  }
}

/**
 * Build SQL WHERE clause from filters for Security Lake query
 *
 * Now that we're querying OCSF struct fields directly (api.operation, api.service.name),
 * we can apply most filters at the SQL level for better performance.
 */
function buildWhereClause(
  filters: CloudTrailDatasetFilters,
  accountIds: string[],
  startEpoch: number,
  endEpoch: number
): string {
  const conditions: string[] = []
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

  // Time range (required)
  conditions.push(`time BETWEEN ${startEpoch} AND ${endEpoch}`)

  // Account filter
  if (accountIds.length > 0) {
    const accountList = accountIds.map(quote).join(', ')
    conditions.push(`accountid IN (${accountList})`)
  }

  // Regions filter
  if (filters.regions && filters.regions.length > 0) {
    const regionList = filters.regions.map(quote).join(', ')
    conditions.push(`cloud.region IN (${regionList})`)
  }

  // Event names filter (api.operation)
  if (filters.eventNames && filters.eventNames.length > 0) {
    const eventList = filters.eventNames.map(quote).join(', ')
    conditions.push(`api.operation IN (${eventList})`)
  }

  // Event sources filter (api.service.name)
  if (filters.eventSources && filters.eventSources.length > 0) {
    const sourceList = filters.eventSources.map(quote).join(', ')
    conditions.push(`api.service.name IN (${sourceList})`)
  }

  if (filters.userIdentities && filters.userIdentities.length > 0) {
    const identities = filters.userIdentities.map(quote).join(', ')
    conditions.push(`actor.user.name IN (${identities})`)
  }

  // Write events only (exclude Get*, List*, Describe*)
  if (filters.writeEventsOnly) {
    conditions.push(`(api.operation NOT LIKE 'Get%' AND api.operation NOT LIKE 'List%' AND api.operation NOT LIKE 'Describe%')`)
  }

  // Note: Event types and errors-only filters will still be applied client-side
  // since they may require more complex logic

  return conditions.join(' AND ')
}

/**
 * Client-side filtering for events
 *
 * Most filters are now applied at the SQL level.
 * These remaining filters handle cases not easily done in SQL.
 */
function applyClientSideFilters(
  events: CloudTrailEventRecord[],
  filters: CloudTrailDatasetFilters
): CloudTrailEventRecord[] {
  let filtered = events

  // Filter by event types (class_name in OCSF)
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    filtered = filtered.filter(e => filters.eventTypes!.includes(e.eventType))
  }

  // Filter by user identities
  if (filters.userIdentities && filters.userIdentities.length > 0) {
    filtered = filtered.filter(e =>
      e.userIdentityUserName && filters.userIdentities!.includes(e.userIdentityUserName)
    )
  }

  // Filter by errors only (if not already filtered at SQL level)
  if (filters.errorsOnly) {
    filtered = filtered.filter(e => e.errorCode !== undefined)
  }

  // Note: Event names, event sources, regions, and write-only filters
  // are now applied at the SQL level for better performance

  return filtered
}

/**
 * Query Security Lake for CloudTrail events using Athena
 */
async function querySecurityLakeForEvents(
  accountIds: string[],
  accountNameMap: Map<string, string>,
  filters: CloudTrailDatasetFilters,
  startTime: Date,
  endTime: Date,
  environment: 'commercial' | 'govcloud',
  options: DatasetQueryOptions = {}
): Promise<{ records: CloudTrailEventRecord[]; hasMore: boolean }> {
  const events: CloudTrailEventRecord[] = []
  let activeClient: Awaited<ReturnType<typeof getAthenaClient>> | undefined
  let activeQueryId: string | undefined

  try {
    // Get environment configuration
    const config = getEnvironmentConfig(environment)
    const region = environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'

    // Get Athena client for Security Lake account
    const client = await getAthenaClient(environment, region, config.monitoringAccountId)
    activeClient = client

    // Convert dates to Unix epoch milliseconds for OCSF
    const startEpoch = Math.floor(startTime.getTime())
    const endEpoch = Math.floor(endTime.getTime())

    // Build table name from Security Lake
    // Map to the data source identifier used in Security Lake
    const tableName = buildTableName(environment, 'cloud_trail_mgmt')

    // Build WHERE clause
    const whereClause = buildWhereClause(filters, accountIds, startEpoch, endEpoch)

    // Build complete SQL query
    // Security Lake OCSF schema - query top-level fields and nested struct fields with dot notation
    // The unmapped field (map<string,string>) contains the complete original CloudTrail event
    const sqlQuery = `
      SELECT
        accountid,
        cloud.region as region,
        time,
        time_dt,
        metadata.uid as event_id,
        api.operation as event_name,
        class_name,
        activity_name,
        severity,
        status,
        api.service.name as service_name,
        actor.user.name as user_name,
        actor.user.type as user_type,
        actor.user.uid as user_uid,
        src_endpoint.ip as source_ip,
        http_request.user_agent as user_agent,
        unmapped
      FROM ${tableName}
      WHERE ${whereClause}
      ORDER BY time DESC
      ${options.limit ? `LIMIT ${options.limit}` : ''}
    `.trim()

    logger.info('[CloudTrail Security Lake] Executing Athena query', {
      environment,
      region,
      tableName,
      accountCount: accountIds.length
    })

    // Start query execution
    const startCommand = new StartQueryExecutionCommand({
      QueryString: sqlQuery,
      QueryExecutionContext: {
        Database: config.database
      },
      ResultConfiguration: {
        OutputLocation: `s3://${config.athenaResultsBucket}/cloudtrail-queries/`
      }
    })

    const startResponse = await client.send(startCommand, { abortSignal: options.signal })
    const queryExecutionId = startResponse.QueryExecutionId

    if (!queryExecutionId) {
      throw new Error('Failed to start Athena query - no execution ID returned')
    }
    activeQueryId = queryExecutionId
    await options.onAthenaQuery?.(queryExecutionId)

    logger.debug('[CloudTrail Security Lake] Query started', { queryExecutionId })

    // Poll for query completion
    let queryStatus = 'RUNNING'
    let attempts = 0
    const maxAttempts = 60 // 60 attempts * 2 seconds = 2 minutes max wait

    while (queryStatus === 'RUNNING' || queryStatus === 'QUEUED') {
      if (attempts >= maxAttempts) {
        await client.send(new StopQueryExecutionCommand({ QueryExecutionId: queryExecutionId })).catch(() => undefined)
        throw new Error('Athena query timeout - exceeded maximum wait time')
      }

      if (options.signal?.aborted) {
        await client.send(new StopQueryExecutionCommand({ QueryExecutionId: queryExecutionId })).catch(() => undefined)
        throw options.signal.reason || new Error('Query canceled')
      }

      // Wait 2 seconds between checks
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 2000)
        options.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(options.signal?.reason || new Error('Query canceled'))
        }, { once: true })
      })
      attempts++

      const statusCommand = new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId
      })

      const statusResponse = await client.send(statusCommand, { abortSignal: options.signal })
      queryStatus = statusResponse.QueryExecution?.Status?.State || 'UNKNOWN'

      if (queryStatus === 'FAILED' || queryStatus === 'CANCELLED') {
        const reason = statusResponse.QueryExecution?.Status?.StateChangeReason || 'Unknown error'
        throw new Error(`Athena query failed: ${reason}`)
      }

      logger.debug('[CloudTrail Security Lake] Query status', {
        queryExecutionId,
        status: queryStatus,
        attempts
      })
      await options.onProgress?.({ phase: 'cloudtrail', processed: attempts })
    }

    logger.info('[CloudTrail Security Lake] Query completed', {
      queryExecutionId,
      attempts,
      durationSeconds: attempts * 2
    })

    // Fetch query results
    const resultsCommand = new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
      MaxResults: 1000
    })

    const resultResponse = await client.send(resultsCommand, { abortSignal: options.signal })
    let processedRows = 0
    if (resultResponse.ResultSet?.Rows) {
      // First row is headers, skip it
      const rows = resultResponse.ResultSet.Rows.slice(processedRows === 0 ? 1 : 0)

      for (const row of rows) {
        if (!row.Data) continue

        // Parse row data into object
        const rowData: any = {}
        const columns = resultResponse.ResultSet.ResultSetMetadata?.ColumnInfo || []

        row.Data.forEach((cell, index) => {
          const columnName = columns[index]?.Name || `col_${index}`
          const value = cell.VarCharValue

          // Parse JSON fields (unmapped contains the original CloudTrail event)
          if (value && columnName === 'unmapped') {
            try {
              rowData[columnName] = JSON.parse(value)
            } catch {
              rowData[columnName] = value
            }
          } else {
            rowData[columnName] = value
          }
        })

        // Get account name
        const accountId = rowData.accountid || ''
        const accountName = accountNameMap.get(accountId) || accountId

        // Normalize the event
        const event = normalizeSecurityLakeEvent(rowData, accountName)
        events.push(event)
      }

      processedRows += rows.length

    }

    logger.info('[CloudTrail Security Lake] Events retrieved', {
      totalEvents: events.length,
      processedRows
    })

    activeQueryId = undefined
    await options.onAthenaQuery?.(null)
  } catch (error: any) {
    if (activeClient && activeQueryId && options.signal?.aborted) {
      await activeClient.send(new StopQueryExecutionCommand({ QueryExecutionId: activeQueryId })).catch(() => undefined)
    }
    await options.onAthenaQuery?.(null)
    logger.error('[CloudTrail Security Lake] Query failed', {
      error: (error instanceof Error ? error.message : String(error)),
      stack: (error instanceof Error ? error.stack : String(error))
    })
    throw new Error(`CloudTrail query failed: ${(error instanceof Error ? error.message : String(error))}`)
  }

  return { records: events, hasMore: Boolean(options.limit && events.length >= options.limit) }
}

/**
 * Main function: Get CloudTrail events for dataset reports
 *
 * @param accountIds - List of account IDs to query (empty = all accounts)
 * @param filters - Filter options for events
 * @returns Normalized CloudTrail event records
 */
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
  const startTime = Date.now()

  // Determine environment
  const environment = (process.env.AWS_CLOUDTRAIL_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'

  // Calculate time range
  const lookbackDays = Math.min(
    filters.lookbackDays || DEFAULT_LOOKBACK_DAYS,
    MAX_LOOKBACK_DAYS
  )
  const endDate = filters.endTime ? new Date(filters.endTime) : new Date()
  const startDate = filters.startTime ? new Date(filters.startTime) : new Date()
  if (!filters.startTime) startDate.setDate(startDate.getDate() - lookbackDays)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
    throw new Error('Invalid CloudTrail time range')
  }

  logger.info('[CloudTrail] Fetching events', {
    accountCount: accountIds.length || 'all',
    environment,
    lookbackDays,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    filters,
  })

  try {
    // Get all accounts for name mapping
    const allAccounts = await getAllAccountsUnified()
    const accountsWithIds = allAccounts.filter(
      (account): account is typeof account & { accountId: string } => Boolean(account.accountId)
    )

    // Build account maps for both Commercial and GovCloud IDs
    const commercialAccountMap = new Map(
      accountsWithIds.map(acc => [acc.accountId, acc.accountName || acc.projectName || acc.accountId])
    )
    const govCloudAccountMap = new Map(
      accountsWithIds
        .filter(acc => acc.awsGovCloudAccountID)
        .map(acc => [acc.awsGovCloudAccountID!, acc.accountName || acc.projectName || acc.accountId])
    )

    // Determine which accounts to query - use correct IDs for the environment
    let targetAccounts: Array<{ accountId: string; accountName: string }> = []
    if (accountIds.length === 0) {
      // Empty array = all accounts
      if (environment === 'govcloud') {
        targetAccounts = allAccounts
          .filter(acc => acc.awsGovCloudAccountID)
          .map(acc => ({
            accountId: acc.awsGovCloudAccountID!,
            accountName: acc.accountName || acc.projectName || acc.accountId || acc.awsGovCloudAccountID!
          }))
      } else {
        targetAccounts = accountsWithIds.map(acc => ({
          accountId: acc.accountId,
          accountName: acc.accountName || acc.projectName || acc.accountId
        }))
      }
    } else {
      // User selected specific accounts (by commercial ID)
      // Need to map to the correct environment's account IDs
      if (environment === 'govcloud') {
        targetAccounts = accountIds
          .map(commercialId => {
            const account = allAccounts.find(acc => acc.accountId === commercialId)
            if (!account?.awsGovCloudAccountID) return null
            return {
              accountId: account.awsGovCloudAccountID,
              accountName: account.accountName || account.projectName || commercialId
            }
          })
          .filter((acc): acc is { accountId: string; accountName: string } => acc !== null)
      } else {
        targetAccounts = accountIds
          .map(id => {
            const name = commercialAccountMap.get(id)
            if (!name) return null
            return { accountId: id, accountName: name }
          })
          .filter((acc): acc is { accountId: string; accountName: string } => acc !== null)
      }
    }

    if (targetAccounts.length < accountIds.length && accountIds.length > 0) {
      logger.warn('[CloudTrail] Some accounts not found in environment', {
        environment,
        requestedCount: accountIds.length,
        validCount: targetAccounts.length
      })
    }

    const validAccounts = targetAccounts

    // Extract just the account IDs for querying Security Lake
    const queryAccountIds = validAccounts.map(acc => acc.accountId)

    // Build account name map for the results
    const accountNameMap = environment === 'govcloud' ? govCloudAccountMap : commercialAccountMap

    // Query Security Lake once for all accounts (much more efficient than per-account queries)
    logger.info('[CloudTrail] Querying Security Lake', {
      accountCount: queryAccountIds.length,
      environment,
      lookbackDays
    })

    const queryResult = await querySecurityLakeForEvents(
      queryAccountIds,
      accountNameMap,
      filters,
      startDate,
      endDate,
      environment,
      options
    )

    // Apply client-side filters
    const filteredEvents = applyClientSideFilters(queryResult.records, filters)

    // Sort by event time (newest first)
    filteredEvents.sort((a, b) => {
      return new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime()
    })

    const duration = Date.now() - startTime
    logger.info('[CloudTrail] Events fetched successfully', {
      totalEvents: filteredEvents.length,
      durationMs: duration,
      accountsQueried: validAccounts.length,
    })

    const records = options.limit ? filteredEvents.slice(0, options.limit) : filteredEvents
    return {
      records,
      sampleCount: records.length,
      hasMore: queryResult.hasMore,
      truncated: queryResult.hasMore
    }

  } catch (error) {
    logger.error('[CloudTrail] Failed to fetch events', { error })
    throw new Error(`Failed to fetch CloudTrail events: ${(error instanceof Error ? error.message : String(error))}`)
  }
}

/**
 * Get CloudTrail events statistics
 *
 * Returns aggregated statistics about events.
 */
export async function getCloudTrailEventStatistics(
  accountIds: string[],
  filters: CloudTrailDatasetFilters = {}
): Promise<{
  totalEvents: number
  eventsByType: Record<string, number>
  eventsByService: Record<string, number>
  eventsByName: Record<string, number>
  topUsers: Array<{ userName: string; eventCount: number }>
  topServices: Array<{ service: string; eventCount: number }>
  topEventNames: Array<{ eventName: string; eventCount: number }>
  writeEvents: number
  readEvents: number
  errorEvents: number
  errorsByCode: Record<string, number>
  eventsByRegion: Record<string, number>
}> {
  const events = await getCloudTrailEvents(accountIds, filters)

  const stats = {
    totalEvents: events.length,
    eventsByType: {} as Record<string, number>,
    eventsByService: {} as Record<string, number>,
    eventsByName: {} as Record<string, number>,
    topUsers: [] as Array<{ userName: string; eventCount: number }>,
    topServices: [] as Array<{ service: string; eventCount: number }>,
    topEventNames: [] as Array<{ eventName: string; eventCount: number }>,
    writeEvents: 0,
    readEvents: 0,
    errorEvents: 0,
    errorsByCode: {} as Record<string, number>,
    eventsByRegion: {} as Record<string, number>,
  }

  const userCounts = new Map<string, number>()

  for (const event of events) {
    // Count by type
    stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] || 0) + 1

    // Count by service
    stats.eventsByService[event.eventSource] = (stats.eventsByService[event.eventSource] || 0) + 1

    // Count by event name
    stats.eventsByName[event.eventName] = (stats.eventsByName[event.eventName] || 0) + 1

    // Count by user
    if (event.userIdentityUserName) {
      userCounts.set(
        event.userIdentityUserName,
        (userCounts.get(event.userIdentityUserName) || 0) + 1
      )
    }

    // Count read vs write
    if (event.readOnly) {
      stats.readEvents++
    } else {
      stats.writeEvents++
    }

    // Count errors
    if (event.errorCode) {
      stats.errorEvents++
      stats.errorsByCode[event.errorCode] = (stats.errorsByCode[event.errorCode] || 0) + 1
    }

    // Count by region
    stats.eventsByRegion[event.region] = (stats.eventsByRegion[event.region] || 0) + 1
  }

  // Generate top users
  stats.topUsers = Array.from(userCounts.entries())
    .map(([userName, eventCount]) => ({ userName, eventCount }))
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 10)

  // Generate top services
  stats.topServices = Object.entries(stats.eventsByService)
    .map(([service, eventCount]) => ({ service, eventCount }))
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 10)

  // Generate top event names
  stats.topEventNames = Object.entries(stats.eventsByName)
    .map(([eventName, eventCount]) => ({ eventName, eventCount }))
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 10)

  return stats
}

/**
 * Get suspicious CloudTrail activities
 *
 * Identifies potentially suspicious patterns in CloudTrail events.
 */
export async function getSuspiciousCloudTrailActivities(
  accountIds: string[],
  filters: CloudTrailDatasetFilters = {}
): Promise<Array<{
  type: string
  description: string
  count: number
  examples: string[]
}>> {
  const events = await getCloudTrailEvents(accountIds, filters)
  const suspicious: Array<{
    type: string
    description: string
    count: number
    examples: string[]
  }> = []

  // Root account activity
  const rootEvents = events.filter(e => e.userIdentityType === 'Root')
  if (rootEvents.length > 0) {
    suspicious.push({
      type: 'RootAccountActivity',
      description: 'Root account was used for API calls',
      count: rootEvents.length,
      examples: rootEvents.slice(0, 5).map(e => `${e.eventName} at ${e.eventTime}`),
    })
  }

  // High error rates
  const errorEvents = events.filter(e => e.errorCode)
  if (errorEvents.length > events.length * 0.1) {  // More than 10% errors
    suspicious.push({
      type: 'HighErrorRate',
      description: `High error rate detected (${errorEvents.length} errors out of ${events.length} events)`,
      count: errorEvents.length,
      examples: errorEvents.slice(0, 5).map(e => `${e.eventName}: ${e.errorCode}`),
    })
  }

  // Access denied errors (possible unauthorized access attempts)
  const accessDenied = events.filter(e =>
    e.errorCode === 'AccessDenied' ||
    e.errorCode === 'UnauthorizedOperation' ||
    e.errorCode === 'AccessDeniedException'
  )
  if (accessDenied.length > 5) {
    suspicious.push({
      type: 'UnauthorizedAccessAttempts',
      description: 'Multiple access denied errors detected',
      count: accessDenied.length,
      examples: accessDenied.slice(0, 5).map(e => `${e.eventName} by ${e.userIdentityUserName || 'unknown'}`),
    })
  }

  return suspicious
}
