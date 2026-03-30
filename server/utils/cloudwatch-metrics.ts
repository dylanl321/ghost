/**
 * CloudWatch Metrics Utility
 *
 * Batch-fetches EC2 utilization metrics (CPU, network) from CloudWatch
 * for identifying unused and underutilized instances
 */

import {
  GetMetricDataCommand,
  type MetricDataQuery
} from '@aws-sdk/client-cloudwatch'
import { getCloudWatchClient } from '../lib/aws-client-factory'
import { getCacheManager } from './cache-manager'
import { logger } from './logger'
import type { AWSEnvironmentType } from '../types'

const CACHE_TTL = 3600 // 1 hour
const CACHE_KEY_PREFIX = 'cloudwatch:metrics'
const MAX_METRIC_QUERIES_PER_REQUEST = 500

export interface InstanceMetrics {
  instanceId: string
  region: string
  avgCpuPercent: number | null
  cpuDailyValues: number[]
  cpuDailyTimestamps: string[]
  totalNetworkInBytes: number | null
  totalNetworkOutBytes: number | null
  totalNetworkBytes: number | null
  dataPointCount: number
  lookbackDays: number
}

export interface BatchMetricsResult {
  metrics: Map<string, InstanceMetrics>
  errors: string[]
}

/**
 * Batch-fetch CPU and network metrics for multiple instances.
 * Groups by region and uses GetMetricData for efficient batch queries.
 */
export async function batchGetInstanceMetrics(
  instances: Array<{ instanceId: string; region: string }>,
  accountId: string,
  environment: AWSEnvironmentType,
  lookbackDays: number = 14
): Promise<BatchMetricsResult> {
  const cache = getCacheManager()
  const cacheKey = `${CACHE_KEY_PREFIX}:${accountId}:${lookbackDays}`

  // Check for cached full result
  const cached = await cache.get<BatchMetricsResult>(cacheKey)
  if (cached) {
    logger.info(`[CloudWatch Metrics] Cache hit for account ${accountId}`)
    return {
      metrics: new Map(Object.entries(cached.metrics as any)),
      errors: cached.errors
    }
  }

  const result: BatchMetricsResult = {
    metrics: new Map(),
    errors: []
  }

  if (instances.length === 0) return result

  // Group instances by region
  const byRegion = new Map<string, string[]>()
  for (const inst of instances) {
    const existing = byRegion.get(inst.region) || []
    existing.push(inst.instanceId)
    byRegion.set(inst.region, existing)
  }

  // Fetch metrics per region in parallel
  const regionPromises = Array.from(byRegion.entries()).map(
    ([region, instanceIds]) =>
      fetchRegionMetrics(instanceIds, accountId, environment, region, lookbackDays)
        .then(regionResult => {
          for (const [id, metrics] of regionResult.metrics) {
            result.metrics.set(id, metrics)
          }
          result.errors.push(...regionResult.errors)
        })
        .catch(err => {
          logger.error(`[CloudWatch Metrics] Failed for region ${region}:`, err.message)
          result.errors.push(`Region ${region}: ${err.message}`)
        })
  )

  await Promise.all(regionPromises)

  // Cache the result (serialize Map for caching)
  const cacheData = {
    metrics: Object.fromEntries(result.metrics),
    errors: result.errors
  }
  await cache.set(cacheKey, cacheData, { ttl: CACHE_TTL })

  logger.info(`[CloudWatch Metrics] Fetched metrics for ${result.metrics.size} instances in account ${accountId}`)
  return result
}

/**
 * Fetch metrics for all instances in a single region using GetMetricData
 */
async function fetchRegionMetrics(
  instanceIds: string[],
  accountId: string,
  environment: AWSEnvironmentType,
  region: string,
  lookbackDays: number
): Promise<BatchMetricsResult> {
  const result: BatchMetricsResult = {
    metrics: new Map(),
    errors: []
  }

  try {
    const client = await getCloudWatchClient(environment, region, accountId)

    const endTime = new Date()
    const startTime = new Date()
    startTime.setDate(startTime.getDate() - lookbackDays)

    // Each instance needs 3 metrics (CPU, NetworkIn, NetworkOut)
    // GetMetricData supports up to 500 queries per request
    const metricsPerInstance = 3
    const maxInstancesPerBatch = Math.floor(MAX_METRIC_QUERIES_PER_REQUEST / metricsPerInstance)
    const batches = chunkArray(instanceIds, maxInstancesPerBatch)

    for (const batch of batches) {
      const queries: MetricDataQuery[] = []

      for (const instanceId of batch) {
        const safeId = instanceId.replace(/-/g, '_')

        queries.push({
          Id: `cpu_${safeId}`,
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'CPUUtilization',
              Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
            },
            Period: 86400, // 1 day
            Stat: 'Average'
          },
          ReturnData: true
        })

        queries.push({
          Id: `netin_${safeId}`,
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'NetworkIn',
              Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
            },
            Period: 86400 * lookbackDays, // entire period as one data point
            Stat: 'Sum'
          },
          ReturnData: true
        })

        queries.push({
          Id: `netout_${safeId}`,
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'NetworkOut',
              Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
            },
            Period: 86400 * lookbackDays,
            Stat: 'Sum'
          },
          ReturnData: true
        })
      }

      const command = new GetMetricDataCommand({
        MetricDataQueries: queries,
        StartTime: startTime,
        EndTime: endTime
      })

      const response = await client.send(command)

      // Parse results back into per-instance metrics
      for (const instanceId of batch) {
        const safeId = instanceId.replace(/-/g, '_')

        const cpuResult = response.MetricDataResults?.find(r => r.Id === `cpu_${safeId}`)
        const netInResult = response.MetricDataResults?.find(r => r.Id === `netin_${safeId}`)
        const netOutResult = response.MetricDataResults?.find(r => r.Id === `netout_${safeId}`)

        const cpuValues = cpuResult?.Values || []
        const cpuTimestamps = cpuResult?.Timestamps || []
        const avgCpu = cpuValues.length > 0
          ? cpuValues.reduce((sum, v) => sum + v, 0) / cpuValues.length
          : null

        // Sort daily values by timestamp (CloudWatch returns in arbitrary order)
        const cpuPairs = cpuValues.map((v, i) => ({
          value: Math.round(v * 100) / 100,
          timestamp: cpuTimestamps[i]?.toISOString() || ''
        })).sort((a, b) => a.timestamp.localeCompare(b.timestamp))

        const totalNetIn = netInResult?.Values?.[0] ?? null
        const totalNetOut = netOutResult?.Values?.[0] ?? null
        const totalNetwork = totalNetIn != null && totalNetOut != null
          ? totalNetIn + totalNetOut
          : totalNetIn ?? totalNetOut

        result.metrics.set(instanceId, {
          instanceId,
          region,
          avgCpuPercent: avgCpu != null ? Math.round(avgCpu * 100) / 100 : null,
          cpuDailyValues: cpuPairs.map(p => p.value),
          cpuDailyTimestamps: cpuPairs.map(p => p.timestamp),
          totalNetworkInBytes: totalNetIn,
          totalNetworkOutBytes: totalNetOut,
          totalNetworkBytes: totalNetwork,
          dataPointCount: cpuValues.length,
          lookbackDays
        })
      }
    }
  } catch (error: any) {
    logger.error(`[CloudWatch Metrics] Region ${region} error:`, error.message)

    if (error.name === 'AccessDeniedException') {
      result.errors.push(`Access denied for CloudWatch in account ${accountId}, region ${region}`)
    } else {
      result.errors.push(`CloudWatch error in ${region}: ${error.message}`)
    }
  }

  return result
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}
