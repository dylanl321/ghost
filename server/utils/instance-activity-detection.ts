/**
 * Instance Activity Detection via Security Lake (Athena)
 *
 * Queries AWS Security Lake's CloudTrail management events table to detect
 * API activity originating from EC2 instances. Instances make API calls via
 * their instance profile/role, and the principalId field contains the instance ID.
 *
 * This runs a SINGLE Athena query for all instances (1500+) — not per-instance.
 * Designed to run in parallel with CloudWatch metrics and Compute Optimizer.
 */

import { buildTableName, getEnvironmentConfig, runAthenaQuery } from './athena-query'
import { getCacheManager } from './cache-manager'
import { logger } from './logger'

// -- Types --

export interface InstanceApiActivity {
  instanceId: string
  totalCalls: number
  meaningfulCalls: number
  topEvents: Array<{ eventName: string; eventSource: string; count: number }>
}

export interface ActivityDetectionResult {
  activities: Map<string, InstanceApiActivity>
  queryDurationMs: number
  errors: string[]
}

// -- Constants --

const CACHE_TTL = 3600 // 1 hour
const CACHE_KEY_PREFIX = 'instance-activity'
const DEFAULT_LOOKBACK_DAYS = 14
const QUERY_TIMEOUT_MS = 120_000

/**
 * SSM agent noise events to exclude from "meaningful" call counts.
 * These are routine heartbeat/inventory calls made by the SSM agent on every
 * managed instance and do not indicate real workload activity.
 */
const SSM_NOISE_EVENTS = new Set([
  'UpdateInstanceInformation',
  'ListInstanceAssociations',
  'UpdateInstanceAssociationStatus',
  'PutInventory',
  'PutComplianceItems',
  'GetManifest',
  'DescribeDocument',
  'GetDocument',
  'PutConfigurePackageResult',
])

/**
 * Build the SQL string for the SSM noise exclusion filter.
 * Returns a SQL fragment like: 'UpdateInstanceInformation','ListInstanceAssociations',...
 */
function ssmNoiseEventsSql(): string {
  return Array.from(SSM_NOISE_EVENTS).map(e => `'${e}'`).join(', ')
}

/**
 * Batch-query Security Lake for API activity originating from EC2 instances.
 *
 * The query extracts instance IDs from `actor.user.uid` (the OCSF mapping of
 * CloudTrail's principalId). When an EC2 instance assumes its instance-profile
 * role, the principalId is formatted as `ROLE_ID:i-0abc123...`, so we use
 * regexp_extract to pull the instance ID out.
 *
 * Results are grouped by instance ID, event name, and event source so we can
 * compute total calls, meaningful calls (excluding SSM noise), and top events
 * in a single pass.
 */
export async function batchGetInstanceActivity(
  instanceIds: string[],
  accountId: string,
  environment: 'commercial' | 'govcloud',
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS
): Promise<ActivityDetectionResult> {
  const startTime = Date.now()
  const result: ActivityDetectionResult = {
    activities: new Map(),
    queryDurationMs: 0,
    errors: [],
  }

  if (instanceIds.length === 0) {
    result.queryDurationMs = Date.now() - startTime
    return result
  }

  // -- Cache check --
  const cache = getCacheManager()
  const cacheKey = `${CACHE_KEY_PREFIX}:${accountId}:${environment}:${lookbackDays}`

  try {
    const cached = await cache.get<{ activities: Record<string, InstanceApiActivity>; errors: string[] }>(cacheKey)
    if (cached) {
      logger.info(`[Instance Activity] Cache hit for account ${accountId}`)
      const requested = new Set(instanceIds)
      result.activities = new Map(Object.entries(cached.activities).filter(([id]) => requested.has(id)))
      result.errors = cached.errors
      result.queryDurationMs = Date.now() - startTime
      return result
    }
  } catch {
    // Cache miss or error — proceed with query
  }

  try {
    const config = getEnvironmentConfig(environment)
    const tableName = buildTableName(environment, 'cloud_trail_mgmt')

    // accountId is interpolated into the SQL below
    if (!/^\d{12}$/.test(accountId)) {
      throw new Error(`Invalid account ID: ${accountId}`)
    }

    // Build the instance ID filter. For large sets we use a LIKE-based approach
    // via the regexp_extract rather than an IN clause on principalId, because the
    // instance ID is embedded inside the principalId string. The accountid filter
    // narrows the scan partition so we don't need to enumerate all 1500+ IDs in SQL.
    //
    // The query:
    //  1. Filters to the target account and time range
    //  2. Requires actor.user.uid to contain 'i-' (instance principal marker)
    //  3. Extracts the instance ID via regexp_extract
    //  4. Groups by instance ID + event name + event source for aggregation
    const sqlQuery = `
      SELECT
        regexp_extract(actor.user.uid, '(i-[0-9a-f]+)') AS instance_id,
        api.operation AS event_name,
        api.service.name AS event_source,
        COUNT(*) AS call_count
      FROM ${tableName}
      WHERE time_dt >= date_add('day', -${Math.floor(lookbackDays)}, current_timestamp)
        AND accountid = '${accountId}'
        AND actor.user.uid LIKE '%i-%'
      GROUP BY
        regexp_extract(actor.user.uid, '(i-[0-9a-f]+)'),
        api.operation,
        api.service.name
    `.trim()

    logger.info('[Instance Activity] Executing Athena query', {
      environment,
      accountId,
      lookbackDays,
      instanceCount: instanceIds.length,
    })

    const queryResult = await runAthenaQuery(sqlQuery, {
      environment,
      database: config.database,
      outputPrefix: 'instance-activity',
      timeoutMs: QUERY_TIMEOUT_MS
    })

    logger.info('[Instance Activity] Query completed', {
      queryExecutionId: queryResult.queryExecutionId,
      durationMs: queryResult.executionTimeMs,
      rows: queryResult.rows.length,
    })

    // Aggregate every instance in the account; the cache holds all of them
    // and each caller gets the subset it asked for.
    const activityMap = new Map<string, {
      totalCalls: number
      meaningfulCalls: number
      events: Map<string, { eventName: string; eventSource: string; count: number }>
    }>()

    for (const rowData of queryResult.rows) {
      const instanceId = rowData.instance_id
      const eventName = rowData.event_name || ''
      const eventSource = rowData.event_source || ''
      const callCount = parseInt(rowData.call_count || '0', 10)

      if (!instanceId || !instanceId.startsWith('i-')) continue

      // Accumulate into the activity map
      let entry = activityMap.get(instanceId)
      if (!entry) {
        entry = { totalCalls: 0, meaningfulCalls: 0, events: new Map() }
        activityMap.set(instanceId, entry)
      }

      entry.totalCalls += callCount

      if (!SSM_NOISE_EVENTS.has(eventName)) {
        entry.meaningfulCalls += callCount
      }

      // Track per-event counts for top-N calculation
      const eventKey = `${eventSource}::${eventName}`
      const existing = entry.events.get(eventKey)
      if (existing) {
        existing.count += callCount
      } else {
        entry.events.set(eventKey, { eventName, eventSource, count: callCount })
      }
    }

    // -- Build final result --
    const allActivities: Record<string, InstanceApiActivity> = {}
    for (const [instanceId, entry] of activityMap) {
      const topEvents = Array.from(entry.events.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
      allActivities[instanceId] = {
        instanceId,
        totalCalls: entry.totalCalls,
        meaningfulCalls: entry.meaningfulCalls,
        topEvents,
      }
    }

    const requested = new Set(instanceIds)
    result.activities = new Map(Object.entries(allActivities).filter(([id]) => requested.has(id)))

    logger.info('[Instance Activity] Results processed', {
      accountId,
      instancesWithActivity: result.activities.size,
      instancesRequested: instanceIds.length,
    })

    // A successful query is cached even when no instance had activity, so
    // idle accounts do not rerun the scan on every request.
    await cache.set(cacheKey, { activities: allActivities, errors: result.errors }, { ttl: CACHE_TTL }).catch(() => undefined)
  } catch (error: any) {
    const message = error?.message || String(error)
    logger.error('[Instance Activity] Query failed', {
      accountId,
      environment,
      error: message,
    })

    // Graceful degradation: return empty result with error, don't crash the pipeline
    result.errors.push(`Security Lake activity detection failed: ${message}`)
  }

  result.queryDurationMs = Date.now() - startTime
  return result
}
