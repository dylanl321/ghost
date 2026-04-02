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
const MAX_METRIC_QUERIES_PER_REQUEST = 400 // Conservative limit (API max is 500) to avoid edge-case throttling

export interface InstanceMetrics {
  instanceId: string
  region: string
  avgCpuPercent: number | null
  maxCpuPercent: number | null
  cpuDailyValues: number[]
  cpuDailyTimestamps: string[]
  maxCpuDailyValues: number[]
  totalNetworkInBytes: number | null
  totalNetworkOutBytes: number | null
  totalNetworkBytes: number | null
  networkBytesPerDay: number | null
  networkDailyValues: number[]
  networkDailyTimestamps: string[]
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

  // Cache the result only if we got data — don't cache failures/empty results
  if (result.metrics.size > 0) {
    const cacheData = {
      metrics: Object.fromEntries(result.metrics),
      errors: result.errors
    }
    await cache.set(cacheKey, cacheData, { ttl: CACHE_TTL })
  }

  if (result.errors.length > 0) {
    logger.warn(`[CloudWatch Metrics] ${result.errors.length} error(s) for account ${accountId}: ${result.errors.join('; ')}`)
  }
  logger.info(`[CloudWatch Metrics] Fetched metrics for ${result.metrics.size} of ${instances.length} instances in account ${accountId}`)
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

    // Each instance needs 4 metrics (CPU avg, CPU max, NetworkIn, NetworkOut)
    // GetMetricData supports up to 500 queries per request
    const metricsPerInstance = 4
    const maxInstancesPerBatch = Math.floor(MAX_METRIC_QUERIES_PER_REQUEST / metricsPerInstance)
    const batches = chunkArray(instanceIds, maxInstancesPerBatch)

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx]

      // Stagger batches to avoid CloudWatch throttling (50ms between batches)
      if (batchIdx > 0) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      try {

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
          Id: `cpumax_${safeId}`,
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'CPUUtilization',
              Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
            },
            Period: 86400, // 1 day
            Stat: 'Maximum'
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
            Period: 86400, // 1 day — daily granularity for per-day calculation
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
            Period: 86400, // 1 day — daily granularity for per-day calculation
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

      // Retry with exponential backoff for throttling
      let response
      const maxRetries = 3
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          response = await client.send(command)
          break
        } catch (err: any) {
          const isThrottle = err.name === 'Throttling' || err.name === 'ThrottlingException' ||
            err.name === 'TooManyRequestsException' || err.message?.includes('Rate exceeded')
          if (isThrottle && attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 500 // 500ms, 1s, 2s
            logger.warn(`[CloudWatch Metrics] Throttled on batch ${batchIdx + 1}/${batches.length}, retry ${attempt + 1} in ${delay}ms`)
            await new Promise(resolve => setTimeout(resolve, delay))
          } else {
            throw err
          }
        }
      }

      if (!response) continue

      // Parse results back into per-instance metrics
      for (const instanceId of batch) {
        const safeId = instanceId.replace(/-/g, '_')

        const cpuResult = response.MetricDataResults?.find(r => r.Id === `cpu_${safeId}`)
        const cpuMaxResult = response.MetricDataResults?.find(r => r.Id === `cpumax_${safeId}`)
        const netInResult = response.MetricDataResults?.find(r => r.Id === `netin_${safeId}`)
        const netOutResult = response.MetricDataResults?.find(r => r.Id === `netout_${safeId}`)

        const cpuValues = cpuResult?.Values || []
        const cpuTimestamps = cpuResult?.Timestamps || []
        const avgCpu = cpuValues.length > 0
          ? cpuValues.reduce((sum, v) => sum + v, 0) / cpuValues.length
          : null

        // Sort daily average values by timestamp (CloudWatch returns in arbitrary order)
        const cpuPairs = cpuValues.map((v, i) => ({
          value: Math.round(v * 100) / 100,
          timestamp: cpuTimestamps[i]?.toISOString() || ''
        })).sort((a, b) => a.timestamp.localeCompare(b.timestamp))

        // Daily max CPU values, sorted by timestamp
        const cpuMaxValues = cpuMaxResult?.Values || []
        const cpuMaxTimestamps = cpuMaxResult?.Timestamps || []
        const cpuMaxPairs = cpuMaxValues.map((v, i) => ({
          value: Math.round(v * 100) / 100,
          timestamp: cpuMaxTimestamps[i]?.toISOString() || ''
        })).sort((a, b) => a.timestamp.localeCompare(b.timestamp))

        // Peak CPU = highest daily max across the lookback period
        const peakCpu = cpuMaxPairs.length > 0
          ? Math.max(...cpuMaxPairs.map(p => p.value))
          : null

        // Network: sum daily values to get totals, compute per-day average
        const netInValues = netInResult?.Values || []
        const netOutValues = netOutResult?.Values || []
        const totalNetIn = netInValues.length > 0
          ? netInValues.reduce((sum, v) => sum + v, 0)
          : null
        const totalNetOut = netOutValues.length > 0
          ? netOutValues.reduce((sum, v) => sum + v, 0)
          : null
        const totalNetwork = totalNetIn != null && totalNetOut != null
          ? totalNetIn + totalNetOut
          : totalNetIn ?? totalNetOut

        // Days with network data (use the longer of the two arrays)
        const networkDaysCount = Math.max(netInValues.length, netOutValues.length)
        const networkBytesPerDay = totalNetwork != null && networkDaysCount > 0
          ? totalNetwork / networkDaysCount
          : null

        // Build daily network totals (in + out per day), sorted by timestamp
        const netInTimestamps = netInResult?.Timestamps || []
        const netOutTimestamps = netOutResult?.Timestamps || []
        const dailyNetMap = new Map<string, number>()
        for (let i = 0; i < netInValues.length; i++) {
          const ts = netInTimestamps[i]?.toISOString() || ''
          dailyNetMap.set(ts, (dailyNetMap.get(ts) || 0) + netInValues[i])
        }
        for (let i = 0; i < netOutValues.length; i++) {
          const ts = netOutTimestamps[i]?.toISOString() || ''
          dailyNetMap.set(ts, (dailyNetMap.get(ts) || 0) + netOutValues[i])
        }
        const networkPairs = Array.from(dailyNetMap.entries())
          .map(([ts, bytes]) => ({ timestamp: ts, value: Math.round(bytes) }))
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

        result.metrics.set(instanceId, {
          instanceId,
          region,
          avgCpuPercent: avgCpu != null ? Math.round(avgCpu * 100) / 100 : null,
          maxCpuPercent: peakCpu,
          cpuDailyValues: cpuPairs.map(p => p.value),
          cpuDailyTimestamps: cpuPairs.map(p => p.timestamp),
          maxCpuDailyValues: cpuMaxPairs.map(p => p.value),
          totalNetworkInBytes: totalNetIn,
          totalNetworkOutBytes: totalNetOut,
          totalNetworkBytes: totalNetwork,
          networkBytesPerDay,
          networkDailyValues: networkPairs.map(p => p.value),
          networkDailyTimestamps: networkPairs.map(p => p.timestamp),
          dataPointCount: cpuValues.length,
          lookbackDays
        })
      }
      } catch (batchError: any) {
        // Per-batch error handling — log and continue to next batch
        logger.error(`[CloudWatch Metrics] Batch ${batchIdx + 1}/${batches.length} failed for ${batch.length} instances in ${region}:`, batchError.message)
        result.errors.push(`Batch ${batchIdx + 1} failed in ${region}: ${batchError.message}`)
      }
    }
  } catch (error: any) {
    logger.error(`[CloudWatch Metrics] Region ${region} setup error:`, error.message)

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
