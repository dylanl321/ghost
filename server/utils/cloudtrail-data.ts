/**
 * AWS CloudTrail Data Fetcher
 *
 * Fetches CloudTrail events, API activity, and audit logs
 * across multiple accounts and regions.
 */

import {
  LookupEventsCommand,
  type CloudTrailClient,
  type Event as CloudTrailAPIEvent,
  type LookupAttribute,
} from '@aws-sdk/client-cloudtrail'
import { getClient } from '../lib/aws-client-factory'
import { getAllAccountsUnified } from './accounts-consolidated'
import { logger } from './logger'
import type {
  CloudTrailEventRecord,
  CloudTrailDatasetFilters,
} from '#shared/types/dataset-reports'

/**
 * Get CloudTrail client for a specific account/region
 */
async function getCloudTrailClient(accountId?: string, region: string = 'us-east-1'): Promise<CloudTrailClient> {
  // Default to govcloud environment (can be overridden by env var if needed)
  const environment = (process.env.AWS_CLOUDTRAIL_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
  return getClient<CloudTrailClient>(environment, 'cloudtrail', region, accountId)
}

/**
 * Default lookback period (days)
 */
const DEFAULT_LOOKBACK_DAYS = 7
const MAX_LOOKBACK_DAYS = 90  // CloudTrail API limitation

/**
 * Normalize CloudTrail event to our simplified record format
 */
function normalizeEvent(event: CloudTrailAPIEvent, accountId: string, accountName: string): CloudTrailEventRecord {
  // Parse CloudTrail event JSON (if available)
  let parsedEvent: any = {}
  if (event.CloudTrailEvent) {
    try {
      parsedEvent = JSON.parse(event.CloudTrailEvent)
    } catch {
      logger.warn('[CloudTrail] Failed to parse CloudTrailEvent JSON')
    }
  }

  // Extract user identity
  const userIdentity = parsedEvent.userIdentity || {}
  const userIdentityType = userIdentity.type || 'Unknown'
  const userIdentityPrincipalId = userIdentity.principalId
  const userIdentityArn = userIdentity.arn
  const userIdentityUserName = event.Username || userIdentity.userName

  // Extract resources
  const resources = event.Resources?.map(r => ({
    type: r.ResourceType || '',
    name: r.ResourceName || '',
    arn: r.ResourceName,  // ResourceName is typically an ARN
  }))

  // Determine if read-only
  const readOnly = event.ReadOnly === 'true' || event.ReadOnly === true

  return {
    accountId,
    accountName,
    region: parsedEvent.awsRegion || 'unknown',
    eventId: event.EventId || '',
    eventName: event.EventName || '',
    eventType: parsedEvent.eventType || 'AwsApiCall',
    eventTime: event.EventTime?.toISOString() || '',
    eventSource: parsedEvent.eventSource || '',
    userIdentityType,
    userIdentityPrincipalId,
    userIdentityArn,
    userIdentityUserName,
    sourceIPAddress: parsedEvent.sourceIPAddress,
    userAgent: parsedEvent.userAgent,
    errorCode: parsedEvent.errorCode,
    errorMessage: parsedEvent.errorMessage,
    readOnly,
    resources,
    requestParameters: parsedEvent.requestParameters,
    responseElements: parsedEvent.responseElements,
  }
}

/**
 * Build CloudTrail lookup attributes from filters
 */
function buildLookupAttributes(filters: CloudTrailDatasetFilters): LookupAttribute[] {
  const attributes: LookupAttribute[] = []

  // Filter by event names
  if (filters.eventNames && filters.eventNames.length > 0) {
    // CloudTrail API only supports one EventName at a time
    // We'll filter client-side for multiple event names
    attributes.push({
      AttributeKey: 'EventName',
      AttributeValue: filters.eventNames[0],
    })
  }

  // Filter by event source (service)
  if (filters.eventSources && filters.eventSources.length > 0) {
    attributes.push({
      AttributeKey: 'EventSource',
      AttributeValue: filters.eventSources[0],
    })
  }

  // Filter by user identity
  if (filters.userIdentities && filters.userIdentities.length > 0) {
    attributes.push({
      AttributeKey: 'Username',
      AttributeValue: filters.userIdentities[0],
    })
  }

  // Filter by read-only (if write-only specified)
  if (filters.writeEventsOnly) {
    attributes.push({
      AttributeKey: 'ReadOnly',
      AttributeValue: 'false',
    })
  }

  return attributes
}

/**
 * Client-side filtering for events
 *
 * CloudTrail API has limited filter support, so we apply additional filters client-side.
 */
function applyClientSideFilters(
  events: CloudTrailEventRecord[],
  filters: CloudTrailDatasetFilters
): CloudTrailEventRecord[] {
  let filtered = events

  // Filter by event types
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    filtered = filtered.filter(e => filters.eventTypes!.includes(e.eventType))
  }

  // Filter by event names (multi-value)
  if (filters.eventNames && filters.eventNames.length > 1) {
    filtered = filtered.filter(e => filters.eventNames!.includes(e.eventName))
  }

  // Filter by event sources (multi-value)
  if (filters.eventSources && filters.eventSources.length > 1) {
    filtered = filtered.filter(e => filters.eventSources!.includes(e.eventSource))
  }

  // Filter by user identities (multi-value)
  if (filters.userIdentities && filters.userIdentities.length > 1) {
    filtered = filtered.filter(e =>
      e.userIdentityUserName && filters.userIdentities!.includes(e.userIdentityUserName)
    )
  }

  // Filter by errors only
  if (filters.errorsOnly) {
    filtered = filtered.filter(e => e.errorCode !== undefined)
  }

  // Filter by regions
  if (filters.regions && filters.regions.length > 0) {
    filtered = filtered.filter(e => filters.regions!.includes(e.region))
  }

  return filtered
}

/**
 * Fetch events for a single account
 */
async function fetchEventsForAccount(
  accountId: string,
  accountName: string,
  filters: CloudTrailDatasetFilters,
  startTime: Date,
  endTime: Date,
  environment: 'commercial' | 'govcloud' = 'govcloud'
): Promise<CloudTrailEventRecord[]> {
  const events: CloudTrailEventRecord[] = []

  try {
    // CloudTrail LookupEvents only works in the region where the trail is configured
    // For organization trails, use appropriate region for the environment
    const region = environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'
    const client = await getCloudTrailClient(accountId, region)

    const lookupAttributes = buildLookupAttributes(filters)

    let nextToken: string | undefined
    let pageCount = 0
    const maxPages = 10  // Limit to prevent excessive API calls (CloudTrail can be slow)

    do {
      const command = new LookupEventsCommand({
        LookupAttributes: lookupAttributes.length > 0 ? lookupAttributes : undefined,
        StartTime: startTime,
        EndTime: endTime,
        MaxResults: 50,  // CloudTrail API max is 50
        NextToken: nextToken,
      })

      const response = await client.send(command)
      pageCount++

      if (response.Events) {
        for (const event of response.Events) {
          events.push(normalizeEvent(event, accountId, accountName))
        }
      }

      nextToken = response.NextToken

      logger.debug('[CloudTrail] Fetched events page', {
        accountId,
        page: pageCount,
        eventsInPage: response.Events?.length || 0,
        totalEvents: events.length,
      })

    } while (nextToken && pageCount < maxPages)

    if (nextToken) {
      logger.warn('[CloudTrail] Exceeded max pages for account', {
        accountId,
        maxPages,
        totalEvents: events.length,
      })
    }

  } catch (error: any) {
    // CloudTrail might not be enabled or accessible
    if (error.name === 'InvalidClientTokenId' || error.message?.includes('not enabled')) {
      logger.warn('[CloudTrail] Not accessible in account', { accountId })
    } else {
      logger.error('[CloudTrail] Failed to fetch events', {
        accountId,
        error: error.message,
      })
    }
    // Non-fatal - continue with other accounts
  }

  return events
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
  filters: CloudTrailDatasetFilters = {}
): Promise<CloudTrailEventRecord[]> {
  const startTime = Date.now()

  // Determine environment
  const environment = (process.env.AWS_CLOUDTRAIL_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'

  // Calculate time range
  const lookbackDays = Math.min(
    filters.lookbackDays || DEFAULT_LOOKBACK_DAYS,
    MAX_LOOKBACK_DAYS
  )
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - lookbackDays)

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

    // Build account maps for both Commercial and GovCloud IDs
    const commercialAccountMap = new Map(
      allAccounts.map(acc => [acc.accountId, acc.accountName || acc.projectName || acc.accountId])
    )
    const govCloudAccountMap = new Map(
      allAccounts
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
            accountName: acc.accountName || acc.projectName || acc.accountId
          }))
      } else {
        targetAccounts = allAccounts.map(acc => ({
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

    // Fetch events from all accounts
    const allEvents: CloudTrailEventRecord[] = []

    // Process accounts sequentially to avoid rate limiting
    // CloudTrail API has strict rate limits (2 TPS per account)
    for (const { accountId, accountName } of validAccounts) {
      const accountEvents = await fetchEventsForAccount(
        accountId,
        accountName,
        filters,
        startDate,
        endDate,
        environment
      )
      allEvents.push(...accountEvents)

      logger.info('[CloudTrail] Account completed', {
        accountId,
        eventsFound: accountEvents.length,
        totalEvents: allEvents.length,
      })
    }

    // Apply client-side filters
    const filteredEvents = applyClientSideFilters(allEvents, filters)

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

    return filteredEvents

  } catch (error) {
    logger.error('[CloudTrail] Failed to fetch events', { error })
    throw new Error(`Failed to fetch CloudTrail events: ${error.message}`)
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
