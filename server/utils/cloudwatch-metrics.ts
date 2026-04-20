/**
 * CloudWatch Metrics Utility
 *
 * Batch-fetches EC2 utilization metrics (CPU, network, EBS I/O) from CloudWatch
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
const DEFAULT_MAX_METRIC_QUERIES = 150 // 25 instances × 6 metrics — reduced from 240 to lower throttle risk

export interface BatchMetricsOptions {
  /** Override max instances per batch (default: 25) */
  maxInstancesPerBatch?: number
  /** Skip reading from cache (useful for retry passes) */
  skipCache?: boolean
}

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
  // EBS I/O metrics
  diskReadOps: number | null
  diskWriteOps: number | null
  diskOpsPerDay: number | null
  // Days with CPU activity in the last 7 days (count of daily data points within 7-day window)
  daysActiveInLast7Days: number | null
  dataPointCount: number
  lookbackDays: number
}

export interface BatchMetricsResult {
  metrics: Map<string, InstanceMetrics>
  errors: string[]
  totalRequested: number
}

/**
 * Batch-fetch CPU and network metrics for multiple instances.
 * Groups by region and uses GetMetricData for efficient batch queries.
 */
export async function batchGetInstanceMetrics(
  instances: Array<{ instanceId: string; region: string }>,
  accountId: string,
  environment: AWSEnvironmentType,
  lookbackDays: number = 14,
  options?: BatchMetricsOptions
): Promise<BatchMetricsResult> {
  const cache = getCacheManager()
  const cacheKey = `${CACHE_KEY_PREFIX}:${accountId}:${lookbackDays}`

  // Check for cached full result (skip on retry passes)
  if (!options?.skipCache) {
    const cached = await cache.get<BatchMetricsResult>(cacheKey)
    if (cached) {
      logger.info(`[CloudWatch Metrics] Cache hit for account ${accountId}`)
      return {
        metrics: new Map(Object.entries(cached.metrics as any)),
        errors: cached.errors,
        totalRequested: cached.totalRequested ?? instances.length
      }
    }
  }

  const result: BatchMetricsResult = {
    metrics: new Map(),
    errors: [],
    totalRequested: instances.length
  }

  if (instances.length === 0) return result

  // Group instances by region
  const byRegion = new Map<string, string[]>()
  for (const inst of instances) {
    const existing = byRegion.get(inst.region) || []
    existing.push(inst.instanceId)
    byRegion.set(inst.region, existing)
  }

  // Fetch metrics per region with limited concurrency (max 2 regions at a time to avoid cross-region throttling)
  const REGION_CONCURRENCY = 2
  const regionEntries = Array.from(byRegion.entries())
  const regionChunks = chunkArray(regionEntries, REGION_CONCURRENCY)

  logger.info(`[CloudWatch Metrics] Fetching for ${instances.length} instances across ${regionEntries.length} regions: ${regionEntries.map(([r, ids]) => `${r}(${ids.length})`).join(', ')}`)

  for (const chunk of regionChunks) {
    const chunkPromises = chunk.map(
      ([region, instanceIds]) =>
        fetchRegionMetrics(instanceIds, accountId, environment, region, lookbackDays, options)
          .then(regionResult => {
            const got = regionResult.metrics.size
            const missing = instanceIds.length - got
            logger.info(`[CloudWatch Metrics] Region ${region}: ${got}/${instanceIds.length} instances returned data${missing > 0 ? `, ${missing} missing` : ''}${regionResult.errors.length > 0 ? `, ${regionResult.errors.length} errors` : ''}`)
            for (const [id, metrics] of regionResult.metrics) {
              result.metrics.set(id, metrics)
            }
            result.errors.push(...regionResult.errors)
          })
          .catch(err => {
            logger.error(`[CloudWatch Metrics] Failed for region ${region} (${instanceIds.length} instances):`, err.message)
            result.errors.push(`Region ${region}: ${err.message}`)
          })
    )
    await Promise.all(chunkPromises)
  }

  // Cache based on completion rate — don't cache poor results for long
  const completionRate = instances.length > 0 ? result.metrics.size / instances.length : 0
  if (result.metrics.size > 0) {
    const cacheData = {
      metrics: Object.fromEntries(result.metrics),
      errors: result.errors,
      totalRequested: result.totalRequested
    }
    if (completionRate >= 0.9) {
      // Full cache — high completion rate
      await cache.set(cacheKey, cacheData, { ttl: CACHE_TTL })
    } else if (completionRate >= 0.5) {
      // Short cache — partial results
      await cache.set(cacheKey, cacheData, { ttl: 300 }) // 5 minutes
    }
    // Below 50% — don't cache at all
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
  lookbackDays: number,
  options?: BatchMetricsOptions
): Promise<BatchMetricsResult> {
  const result: BatchMetricsResult = {
    metrics: new Map(),
    errors: [],
    totalRequested: instanceIds.length
  }

  try {
    const client = await getCloudWatchClient(environment, region, accountId)

    const endTime = new Date()
    const startTime = new Date()
    startTime.setDate(startTime.getDate() - lookbackDays)

    // Each instance needs 6 metrics (CPU avg, CPU max, NetworkIn, NetworkOut, DiskReadOps, DiskWriteOps)
    const metricsPerInstance = 6
    const maxInstancesPerBatch = options?.maxInstancesPerBatch || Math.min(
      Math.floor(DEFAULT_MAX_METRIC_QUERIES / metricsPerInstance),
      25 // Cap at 25 instances per batch
    )
    const batches = chunkArray(instanceIds, maxInstancesPerBatch)
    let throttleMultiplier = 1

    logger.info(`[CloudWatch Metrics] Region ${region}: ${instanceIds.length} instances in ${batches.length} batches (${maxInstancesPerBatch} per batch, ${metricsPerInstance} metrics each)`)

    // Process batches in parallel with concurrency limit of 5 to balance speed vs throttling
    const CONCURRENCY = 5
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const concurrentBatches = batches.slice(i, i + CONCURRENCY)
      await Promise.all(concurrentBatches.map(async (batch, localIdx) => {
        const batchIdx = i + localIdx
        // Small stagger within each concurrent group to spread API calls
        if (localIdx > 0) {
          await new Promise(resolve => setTimeout(resolve, localIdx * 100))
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

        queries.push({
          Id: `diskrd_${safeId}`,
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'DiskReadOps',
              Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
            },
            Period: 86400, // 1 day
            Stat: 'Sum'
          },
          ReturnData: true
        })

        queries.push({
          Id: `diskwr_${safeId}`,
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'DiskWriteOps',
              Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
            },
            Period: 86400, // 1 day
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
      // Paginate through all results (GetMetricData may return partial results with NextToken)
      let allMetricResults: any[] = []
      let nextToken: string | undefined
      const maxRetries = 3

      do {
        const paginatedCommand = new GetMetricDataCommand({
          ...(nextToken ? {} : { MetricDataQueries: queries, StartTime: startTime, EndTime: endTime }),
          NextToken: nextToken
        })

        let response
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            response = await client.send(paginatedCommand)
            break
          } catch (err: any) {
            const isThrottle = err.name === 'Throttling' || err.name === 'ThrottlingException' ||
              err.name === 'TooManyRequestsException' || err.message?.includes('Rate exceeded')
            if (isThrottle && attempt < maxRetries) {
              throttleMultiplier = Math.min(throttleMultiplier * 2, 8)
              const delay = Math.pow(2, attempt) * 500 * throttleMultiplier
              logger.warn(`[CloudWatch Metrics] Throttled on batch ${batchIdx + 1}/${batches.length}, retry ${attempt + 1} in ${delay}ms (throttleMultiplier=${throttleMultiplier})`)
              await new Promise(resolve => setTimeout(resolve, delay))
            } else {
              throw err
            }
          }
        }

        if (!response) break

        if (response.MetricDataResults) {
          allMetricResults.push(...response.MetricDataResults)
        }
        nextToken = response.NextToken
      } while (nextToken)

      if (allMetricResults.length === 0) return // no data for this batch, skip parsing

      // Parse results back into per-instance metrics
      for (const instanceId of batch) {
        const safeId = instanceId.replace(/-/g, '_')

        const cpuResult = allMetricResults.find(r => r.Id === `cpu_${safeId}`)
        const cpuMaxResult = allMetricResults.find(r => r.Id === `cpumax_${safeId}`)
        const netInResult = allMetricResults.find(r => r.Id === `netin_${safeId}`)
        const netOutResult = allMetricResults.find(r => r.Id === `netout_${safeId}`)
        const diskRdResult = allMetricResults.find(r => r.Id === `diskrd_${safeId}`)
        const diskWrResult = allMetricResults.find(r => r.Id === `diskwr_${safeId}`)

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

        // EBS I/O: sum daily values to get totals, compute per-day average
        const diskRdValues = diskRdResult?.Values || []
        const diskWrValues = diskWrResult?.Values || []
        const totalDiskReadOps = diskRdValues.length > 0
          ? diskRdValues.reduce((sum, v) => sum + v, 0)
          : null
        const totalDiskWriteOps = diskWrValues.length > 0
          ? diskWrValues.reduce((sum, v) => sum + v, 0)
          : null
        const totalDiskOps = totalDiskReadOps != null && totalDiskWriteOps != null
          ? totalDiskReadOps + totalDiskWriteOps
          : totalDiskReadOps ?? totalDiskWriteOps
        const diskDaysCount = Math.max(diskRdValues.length, diskWrValues.length)
        const diskOpsPerDay = totalDiskOps != null && diskDaysCount > 0
          ? totalDiskOps / diskDaysCount
          : null

        // Days active in last 7 days: count daily CPU data points within the 7-day window.
        // CloudWatch only publishes a daily data point when the instance was running that day.
        const sevenDaysAgo = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000)
        const daysActiveInLast7Days = cpuPairs.length > 0
          ? cpuPairs.filter(p => p.timestamp && new Date(p.timestamp) >= sevenDaysAgo).length
          : null

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
          diskReadOps: totalDiskReadOps,
          diskWriteOps: totalDiskWriteOps,
          diskOpsPerDay,
          daysActiveInLast7Days,
          dataPointCount: cpuValues.length,
          lookbackDays
        })
      }
      // Decay throttle multiplier after successful batch
      if (throttleMultiplier > 1) {
        throttleMultiplier = Math.max(1, throttleMultiplier * 0.85)
      }
      } catch (batchError: any) {
        // Per-batch error handling — retry with smaller sub-batches before giving up
        logger.warn(`[CloudWatch Metrics] Batch ${batchIdx + 1}/${batches.length} failed for ${batch.length} instances in ${region}, retrying in smaller chunks: ${batchError.message}`)

        // Split the failed batch into sub-batches of 25 and retry each
        const subBatches = chunkArray(batch, 25)
        for (const subBatch of subBatches) {
          try {
            await new Promise(resolve => setTimeout(resolve, 500 * throttleMultiplier))
            const subQueries: MetricDataQuery[] = []
            for (const instanceId of subBatch) {
              const safeId = instanceId.replace(/-/g, '_')
              subQueries.push(
                { Id: `cpu_${safeId}`, MetricStat: { Metric: { Namespace: 'AWS/EC2', MetricName: 'CPUUtilization', Dimensions: [{ Name: 'InstanceId', Value: instanceId }] }, Period: 86400, Stat: 'Average' }, ReturnData: true },
                { Id: `cpumax_${safeId}`, MetricStat: { Metric: { Namespace: 'AWS/EC2', MetricName: 'CPUUtilization', Dimensions: [{ Name: 'InstanceId', Value: instanceId }] }, Period: 86400, Stat: 'Maximum' }, ReturnData: true },
                { Id: `netin_${safeId}`, MetricStat: { Metric: { Namespace: 'AWS/EC2', MetricName: 'NetworkIn', Dimensions: [{ Name: 'InstanceId', Value: instanceId }] }, Period: 86400, Stat: 'Sum' }, ReturnData: true },
                { Id: `netout_${safeId}`, MetricStat: { Metric: { Namespace: 'AWS/EC2', MetricName: 'NetworkOut', Dimensions: [{ Name: 'InstanceId', Value: instanceId }] }, Period: 86400, Stat: 'Sum' }, ReturnData: true },
                { Id: `diskrd_${safeId}`, MetricStat: { Metric: { Namespace: 'AWS/EC2', MetricName: 'DiskReadOps', Dimensions: [{ Name: 'InstanceId', Value: instanceId }] }, Period: 86400, Stat: 'Sum' }, ReturnData: true },
                { Id: `diskwr_${safeId}`, MetricStat: { Metric: { Namespace: 'AWS/EC2', MetricName: 'DiskWriteOps', Dimensions: [{ Name: 'InstanceId', Value: instanceId }] }, Period: 86400, Stat: 'Sum' }, ReturnData: true }
              )
            }
            const subResponse = await client.send(new GetMetricDataCommand({
              MetricDataQueries: subQueries,
              StartTime: startTime,
              EndTime: endTime
            }))
            if (subResponse.MetricDataResults) {
              for (const instanceId of subBatch) {
                const safeId = instanceId.replace(/-/g, '_')
                const cpuResult = subResponse.MetricDataResults.find(r => r.Id === `cpu_${safeId}`)
                const cpuMaxResult = subResponse.MetricDataResults.find(r => r.Id === `cpumax_${safeId}`)
                const netInResult = subResponse.MetricDataResults.find(r => r.Id === `netin_${safeId}`)
                const netOutResult = subResponse.MetricDataResults.find(r => r.Id === `netout_${safeId}`)
                const diskRdResult = subResponse.MetricDataResults.find(r => r.Id === `diskrd_${safeId}`)
                const diskWrResult = subResponse.MetricDataResults.find(r => r.Id === `diskwr_${safeId}`)
                const cpuValues = cpuResult?.Values || []
                const cpuTimestamps = cpuResult?.Timestamps || []
                const avgCpu = cpuValues.length > 0 ? cpuValues.reduce((sum, v) => sum + v, 0) / cpuValues.length : null
                const cpuPairs = cpuValues.map((v, i) => ({ value: Math.round(v * 100) / 100, timestamp: cpuTimestamps[i]?.toISOString() || '' })).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                const cpuMaxValues = cpuMaxResult?.Values || []
                const cpuMaxTimestamps = cpuMaxResult?.Timestamps || []
                const cpuMaxPairs = cpuMaxValues.map((v, i) => ({ value: Math.round(v * 100) / 100, timestamp: cpuMaxTimestamps[i]?.toISOString() || '' })).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                const peakCpu = cpuMaxPairs.length > 0 ? Math.max(...cpuMaxPairs.map(p => p.value)) : null
                const netInValues = netInResult?.Values || []
                const netOutValues = netOutResult?.Values || []
                const totalNetIn = netInValues.length > 0 ? netInValues.reduce((sum, v) => sum + v, 0) : null
                const totalNetOut = netOutValues.length > 0 ? netOutValues.reduce((sum, v) => sum + v, 0) : null
                const totalNetwork = totalNetIn != null && totalNetOut != null ? totalNetIn + totalNetOut : totalNetIn ?? totalNetOut
                const networkDaysCount = Math.max(netInValues.length, netOutValues.length)
                const networkBytesPerDay = totalNetwork != null && networkDaysCount > 0 ? totalNetwork / networkDaysCount : null
                const netInTimestamps = netInResult?.Timestamps || []
                const netOutTimestamps = netOutResult?.Timestamps || []
                const dailyNetMap = new Map<string, number>()
                for (let i = 0; i < netInValues.length; i++) { dailyNetMap.set(netInTimestamps[i]?.toISOString() || '', (dailyNetMap.get(netInTimestamps[i]?.toISOString() || '') || 0) + netInValues[i]) }
                for (let i = 0; i < netOutValues.length; i++) { dailyNetMap.set(netOutTimestamps[i]?.toISOString() || '', (dailyNetMap.get(netOutTimestamps[i]?.toISOString() || '') || 0) + netOutValues[i]) }
                const networkPairs = Array.from(dailyNetMap.entries()).map(([ts, bytes]) => ({ timestamp: ts, value: Math.round(bytes) })).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                const diskRdValues = diskRdResult?.Values || []
                const diskWrValues = diskWrResult?.Values || []
                const totalDiskReadOps = diskRdValues.length > 0 ? diskRdValues.reduce((sum, v) => sum + v, 0) : null
                const totalDiskWriteOps = diskWrValues.length > 0 ? diskWrValues.reduce((sum, v) => sum + v, 0) : null
                const totalDiskOps = totalDiskReadOps != null && totalDiskWriteOps != null ? totalDiskReadOps + totalDiskWriteOps : totalDiskReadOps ?? totalDiskWriteOps
                const diskDaysCount = Math.max(diskRdValues.length, diskWrValues.length)
                const diskOpsPerDay = totalDiskOps != null && diskDaysCount > 0 ? totalDiskOps / diskDaysCount : null
                const subSevenDaysAgo = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000)
                const subDaysActive = cpuPairs.length > 0
                  ? cpuPairs.filter(p => p.timestamp && new Date(p.timestamp) >= subSevenDaysAgo).length
                  : null
                result.metrics.set(instanceId, {
                  instanceId, region,
                  avgCpuPercent: avgCpu != null ? Math.round(avgCpu * 100) / 100 : null,
                  maxCpuPercent: peakCpu,
                  cpuDailyValues: cpuPairs.map(p => p.value),
                  cpuDailyTimestamps: cpuPairs.map(p => p.timestamp),
                  maxCpuDailyValues: cpuMaxPairs.map(p => p.value),
                  totalNetworkInBytes: totalNetIn, totalNetworkOutBytes: totalNetOut, totalNetworkBytes: totalNetwork,
                  networkBytesPerDay,
                  networkDailyValues: networkPairs.map(p => p.value),
                  networkDailyTimestamps: networkPairs.map(p => p.timestamp),
                  diskReadOps: totalDiskReadOps, diskWriteOps: totalDiskWriteOps, diskOpsPerDay,
                  daysActiveInLast7Days: subDaysActive,
                  dataPointCount: cpuValues.length, lookbackDays
                })
              }
            }
          } catch (subErr: any) {
            logger.error(`[CloudWatch Metrics] Sub-batch retry also failed in ${region}: ${subErr.message}`)
            result.errors.push(`Sub-batch failed in ${region}: ${subErr.message}`)
          }
        }
      }
    })) // end Promise.all for concurrent batch group
    } // end outer for loop (concurrent groups)
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
