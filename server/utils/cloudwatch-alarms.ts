/**
 * CloudWatch Alarms Utility
 *
 * Retrieves CloudWatch alarm data for instances and resources
 */

import {
  DescribeAlarmsCommand,
  type MetricAlarm
} from '@aws-sdk/client-cloudwatch'
import { getCloudWatchClient } from '../lib/aws-client-factory'
import { logger } from './logger'
import type { AWSEnvironmentType } from '../types'

export interface CloudWatchAlarm {
  alarmName: string
  alarmArn?: string
  alarmDescription?: string
  metricName: string
  namespace: string
  statistic?: string
  threshold?: number
  comparisonOperator?: string
  evaluationPeriods?: number
  period?: number
  state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA'
  stateReason?: string
  stateUpdatedTimestamp?: string
  actionsEnabled: boolean
  dimensions: Array<{ name: string; value: string }>
}

export interface InstanceAlarmsSummary {
  instanceId: string
  accountId: string
  environment: AWSEnvironmentType
  region: string
  inAlarm: number
  ok: number
  insufficientData: number
  total: number
  alarms: CloudWatchAlarm[]
}

/**
 * Parse CloudWatch alarm to our format
 */
function parseAlarm(alarm: MetricAlarm): CloudWatchAlarm {
  return {
    alarmName: alarm.AlarmName || '',
    alarmArn: alarm.AlarmArn,
    alarmDescription: alarm.AlarmDescription,
    metricName: alarm.MetricName || '',
    namespace: alarm.Namespace || '',
    statistic: alarm.Statistic,
    threshold: alarm.Threshold,
    comparisonOperator: alarm.ComparisonOperator,
    evaluationPeriods: alarm.EvaluationPeriods,
    period: alarm.Period,
    state: (alarm.StateValue || 'INSUFFICIENT_DATA') as 'OK' | 'ALARM' | 'INSUFFICIENT_DATA',
    stateReason: alarm.StateReason,
    stateUpdatedTimestamp: alarm.StateUpdatedTimestamp?.toISOString(),
    actionsEnabled: alarm.ActionsEnabled ?? true,
    dimensions: (alarm.Dimensions || []).map(d => ({
      name: d.Name || '',
      value: d.Value || ''
    }))
  }
}

/**
 * Get CloudWatch alarms for a specific instance
 */
export async function getInstanceAlarms(
  instanceId: string,
  accountId: string,
  environment: AWSEnvironmentType = 'govcloud',
  region?: string
): Promise<InstanceAlarmsSummary> {
  const targetRegion = region || (environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1')

  const summary: InstanceAlarmsSummary = {
    instanceId,
    accountId,
    environment,
    region: targetRegion,
    inAlarm: 0,
    ok: 0,
    insufficientData: 0,
    total: 0,
    alarms: []
  }

  try {
    const client = await getCloudWatchClient(environment, targetRegion, accountId)

    // Query alarms by InstanceId dimension
    // CloudWatch doesn't have a direct "get alarms by resource" API,
    // so we need to describe all alarms and filter by dimension
    let nextToken: string | undefined
    const allAlarms: CloudWatchAlarm[] = []

    do {
      const command = new DescribeAlarmsCommand({
        NextToken: nextToken,
        MaxRecords: 100
      })

      const response = await client.send(command)

      if (response.MetricAlarms) {
        for (const alarm of response.MetricAlarms) {
          // Check if this alarm is for our instance
          const hasInstanceDimension = alarm.Dimensions?.some(
            d => d.Name === 'InstanceId' && d.Value === instanceId
          )

          if (hasInstanceDimension) {
            const parsed = parseAlarm(alarm)
            allAlarms.push(parsed)

            // Count by state
            switch (parsed.state) {
              case 'ALARM':
                summary.inAlarm++
                break
              case 'OK':
                summary.ok++
                break
              case 'INSUFFICIENT_DATA':
                summary.insufficientData++
                break
            }
          }
        }
      }

      nextToken = response.NextToken
    } while (nextToken && allAlarms.length < 100)

    // Sort alarms: ALARM first, then OK, then INSUFFICIENT_DATA
    const stateOrder: Record<string, number> = {
      'ALARM': 0,
      'OK': 1,
      'INSUFFICIENT_DATA': 2
    }

    allAlarms.sort((a, b) => stateOrder[a.state] - stateOrder[b.state])

    summary.alarms = allAlarms
    summary.total = allAlarms.length

    logger.info(`[CloudWatch] Instance ${instanceId}: ${summary.total} alarms (${summary.inAlarm} in ALARM)`)

    return summary

  } catch (error: any) {
    // An empty summary would read as "no alarms"; the caller reports the source as unavailable
    logger.error(`[CloudWatch] Failed to get alarms for ${instanceId}:`, error.message)
    throw new Error(error.name === 'AccessDeniedException'
      ? `CloudWatch access denied for account ${accountId}: ${error.message}`
      : `CloudWatch alarm lookup failed for ${instanceId}: ${error.message}`)
  }
}
