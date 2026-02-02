/**
 * GET /api/support/access-audit
 * CloudTrail-based access audit for resources
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getClient } from '../../lib/aws-client-factory'
import { lookupAccountUnified } from '../../utils/accounts-consolidated'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'
import type { CloudTrailClient, Event } from '@aws-sdk/client-cloudtrail'
import {
  LookupEventsCommand,
  type LookupAttribute
} from '@aws-sdk/client-cloudtrail'

interface AccessEvent {
  eventId: string
  eventTime: string
  eventName: string
  eventSource: string
  userName?: string
  userType?: string
  userArn?: string
  accessKeyId?: string
  sourceIpAddress?: string
  awsRegion?: string
  errorCode?: string
  errorMessage?: string
  resourceType?: string
  resourceName?: string
  readOnly: boolean
}

interface AccessAuditResponse {
  resourceId?: string
  accountId?: string
  accountName?: string
  environment: AWSEnvironmentType
  timeRange: {
    start: string
    end: string
  }
  summary: {
    totalEvents: number
    uniqueUsers: number
    readEvents: number
    writeEvents: number
    failedEvents: number
    uniqueIpAddresses: number
  }
  events: AccessEvent[]
  topUsers: Array<{ user: string; eventCount: number }>
  topActions: Array<{ action: string; count: number }>
  anomalies: string[]
  hasMore: boolean
  nextToken?: string
}

registerEndpoint('/api/support/access-audit', 'GET', {
  summary: 'Audit resource access via CloudTrail',
  description: 'Retrieve CloudTrail events for a specific resource to see who accessed it and when',
  tags: ['Support Tools', 'Security'],
  parameters: [
    {
      name: 'resourceId',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Resource ID to audit (e.g., i-12345678, bucket-name)'
    },
    {
      name: 'accountId',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'AWS account ID to query'
    },
    {
      name: 'eventName',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by specific event name (e.g., RunInstances, GetObject)'
    },
    {
      name: 'userName',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by user name'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment (default: govcloud)'
    },
    {
      name: 'hoursBack',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 2160 },
      description: 'Hours to look back (default: 24, max: 2160 = 90 days)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100 },
      description: 'Maximum events to return (default: 50)'
    },
    {
      name: 'nextToken',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Pagination token from previous request'
    }
  ],
  responses: {
    200: {
      description: 'Access audit results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  summary: { type: 'object' },
                  events: { type: 'array' },
                  topUsers: { type: 'array' },
                  anomalies: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

/**
 * Parse CloudTrail event to simplified format
 */
function parseEvent(event: Event): AccessEvent {
  const userIdentity = event.CloudTrailEvent
    ? JSON.parse(event.CloudTrailEvent).userIdentity
    : undefined

  return {
    eventId: event.EventId || '',
    eventTime: event.EventTime?.toISOString() || '',
    eventName: event.EventName || '',
    eventSource: event.EventSource || '',
    userName: event.Username || userIdentity?.userName || userIdentity?.principalId,
    userType: userIdentity?.type,
    userArn: userIdentity?.arn,
    accessKeyId: event.AccessKeyId,
    sourceIpAddress: userIdentity?.sourceIdentity,
    awsRegion: event.CloudTrailEvent
      ? JSON.parse(event.CloudTrailEvent).awsRegion
      : undefined,
    errorCode: event.CloudTrailEvent
      ? JSON.parse(event.CloudTrailEvent).errorCode
      : undefined,
    errorMessage: event.CloudTrailEvent
      ? JSON.parse(event.CloudTrailEvent).errorMessage
      : undefined,
    resourceType: event.Resources?.[0]?.ResourceType,
    resourceName: event.Resources?.[0]?.ResourceName,
    readOnly: event.ReadOnly === 'true' || event.ReadOnly === true
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  const queryParams = getQuery(event)
  const resourceId = queryParams.resourceId as string | undefined
  const accountId = queryParams.accountId as string
  const eventName = queryParams.eventName as string | undefined
  const userName = queryParams.userName as string | undefined
  const environment = (queryParams.environment as AWSEnvironmentType) || 'govcloud'
  const hoursBack = Math.min(parseInt(queryParams.hoursBack as string) || 24, 2160)
  const limit = Math.min(parseInt(queryParams.limit as string) || 50, 100)
  const nextToken = queryParams.nextToken as string | undefined

  // Validate required parameters
  if (!accountId) {
    return errors.badRequest(event, 'accountId is required')
  }

  // At least one filter should be provided for meaningful results
  if (!resourceId && !eventName && !userName) {
    return errors.badRequest(event, 'At least one of resourceId, eventName, or userName must be provided')
  }

  // Validate environment
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  // Get account info
  const account = await lookupAccountUnified({ accountId })
  const accountName = account?.name || account?.projectName

  // Use GovCloud account ID if querying govcloud environment
  const targetAccountId = environment === 'govcloud' && account?.govCloudAccountId
    ? account.govCloudAccountId
    : accountId

  logger.info(`[Access Audit] Account: ${accountId}, Resource: ${resourceId || 'any'}, Hours: ${hoursBack}`)

  try {
    // Build time range
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - hoursBack * 60 * 60 * 1000)

    // Build lookup attributes
    const lookupAttributes: LookupAttribute[] = []

    if (resourceId) {
      lookupAttributes.push({
        AttributeKey: 'ResourceName',
        AttributeValue: resourceId
      })
    }

    if (eventName) {
      lookupAttributes.push({
        AttributeKey: 'EventName',
        AttributeValue: eventName
      })
    }

    if (userName) {
      lookupAttributes.push({
        AttributeKey: 'Username',
        AttributeValue: userName
      })
    }

    // Get CloudTrail client
    const client = await getClient<CloudTrailClient>(
      environment,
      'cloudtrail',
      undefined,
      targetAccountId
    )

    // Query CloudTrail
    const command = new LookupEventsCommand({
      LookupAttributes: lookupAttributes.length > 0 ? [lookupAttributes[0]] : undefined,
      StartTime: startTime,
      EndTime: endTime,
      MaxResults: limit,
      NextToken: nextToken
    })

    const response = await client.send(command)
    const rawEvents = response.Events || []

    // Parse events
    let events = rawEvents.map(parseEvent)

    // Apply additional filters (CloudTrail only supports one lookup attribute at a time)
    if (lookupAttributes.length > 1) {
      if (eventName && lookupAttributes[0].AttributeKey !== 'EventName') {
        events = events.filter(e => e.eventName === eventName)
      }
      if (userName && lookupAttributes[0].AttributeKey !== 'Username') {
        events = events.filter(e => e.userName?.includes(userName))
      }
      if (resourceId && lookupAttributes[0].AttributeKey !== 'ResourceName') {
        events = events.filter(e => e.resourceName?.includes(resourceId))
      }
    }

    // Calculate summary
    const uniqueUsers = new Set(events.map(e => e.userName).filter(Boolean))
    const uniqueIps = new Set(events.map(e => e.sourceIpAddress).filter(Boolean))

    const summary = {
      totalEvents: events.length,
      uniqueUsers: uniqueUsers.size,
      readEvents: events.filter(e => e.readOnly).length,
      writeEvents: events.filter(e => !e.readOnly).length,
      failedEvents: events.filter(e => e.errorCode).length,
      uniqueIpAddresses: uniqueIps.size
    }

    // Calculate top users
    const userCounts = new Map<string, number>()
    for (const e of events) {
      if (e.userName) {
        userCounts.set(e.userName, (userCounts.get(e.userName) || 0) + 1)
      }
    }
    const topUsers = Array.from(userCounts.entries())
      .map(([user, eventCount]) => ({ user, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10)

    // Calculate top actions
    const actionCounts = new Map<string, number>()
    for (const e of events) {
      actionCounts.set(e.eventName, (actionCounts.get(e.eventName) || 0) + 1)
    }
    const topActions = Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Detect anomalies
    const anomalies: string[] = []

    // Unusual access patterns
    if (summary.failedEvents > summary.totalEvents * 0.3) {
      anomalies.push(`High failure rate: ${summary.failedEvents} out of ${summary.totalEvents} events failed`)
    }

    // Check for unusual hours (assuming business hours are 6am-8pm)
    const unusualHourEvents = events.filter(e => {
      const hour = new Date(e.eventTime).getHours()
      return hour < 6 || hour > 20
    })
    if (unusualHourEvents.length > events.length * 0.3) {
      anomalies.push(`${unusualHourEvents.length} events occurred outside business hours (6am-8pm)`)
    }

    // Check for root account usage
    const rootEvents = events.filter(e => e.userType === 'Root')
    if (rootEvents.length > 0) {
      anomalies.push(`${rootEvents.length} events performed by root account - review for security`)
    }

    // Check for access denied patterns
    const accessDeniedEvents = events.filter(e =>
      e.errorCode === 'AccessDenied' || e.errorCode === 'UnauthorizedAccess'
    )
    if (accessDeniedEvents.length > 5) {
      anomalies.push(`${accessDeniedEvents.length} access denied events - possible unauthorized access attempts`)
    }

    // Check for destructive actions
    const destructiveActions = ['Delete', 'Terminate', 'Remove']
    const destructiveEvents = events.filter(e =>
      destructiveActions.some(action => e.eventName.includes(action))
    )
    if (destructiveEvents.length > 0) {
      anomalies.push(`${destructiveEvents.length} destructive action(s) detected (Delete/Terminate/Remove)`)
    }

    const responseData: AccessAuditResponse = {
      resourceId,
      accountId,
      accountName,
      environment,
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      },
      summary,
      events,
      topUsers,
      topActions,
      anomalies,
      hasMore: !!response.NextToken,
      nextToken: response.NextToken
    }

    logger.info(`[Access Audit] Found ${summary.totalEvents} events from ${summary.uniqueUsers} users`)

    return sendSuccess(event, responseData)

  } catch (error: any) {
    logger.error('[Access Audit] Error:', error)

    // Handle specific errors
    if (error.name === 'InvalidLookupAttributesException') {
      return errors.badRequest(event, 'Invalid lookup attribute value')
    }

    if (error.name === 'AccessDeniedException') {
      return errors.serverError(event, 'Access denied to CloudTrail in this account', {
        hint: 'Ensure the IAM role has cloudtrail:LookupEvents permission'
      })
    }

    return errors.serverError(event, error.message || 'Failed to get access audit data')
  }
}))
