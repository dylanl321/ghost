/**
 * GET /api/instances/utilization/retry-metrics
 *
 * Retry CloudWatch metrics fetch for instances that are missing data.
 * Uses smaller batch sizes and skips cache to maximize success rate
 * on the second pass. Re-classifies updated instances and returns
 * the full updated result set.
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync, parseQueryParams } from '../../../utils/api-response'
import { lookupAccountOptimized } from '../../../utils/account-lookup-optimized'
import { batchGetInstanceMetrics } from '../../../utils/cloudwatch-metrics'
import {
  classifyInstance,
  DEFAULT_THRESHOLDS,
  type ClassificationResult,
  type ClassificationSummary,
  type InstanceClassification,
  type InstanceApiActivity
} from '../../../utils/instance-utilization-classifier'
import type { ComputeOptimizerRecommendation } from '../../../utils/compute-optimizer'
import type { EnrichedInstanceData } from '../../../utils/instance-enrichment'
import { getCacheManager } from '../../../utils/cache-manager'
import { getLatestAnalysis, getInstanceClassifications } from '../../../utils/utilization-persistence'
import type { AWSEnvironmentType } from '../../../types'
import { logger } from '../../../utils/logger'

const RETRY_BATCH_SIZE = 10 // Small batches to avoid throttling on retry

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const { environment } = parseQueryParams(event)

  const accountIdentifier = query.accountIds as string
  if (!accountIdentifier) {
    return errors.badRequest(event, 'accountIds parameter is required')
  }

  const lookbackDays = Math.min(Math.max(parseInt(query.lookbackDays as string) || 14, 1), 30)

  // Load existing results from cache
  const cache = getCacheManager()
  const cacheKey = `utilization:${accountIdentifier}:${environment}:${lookbackDays}:true`
  let existingResult = await cache.get<ClassificationResult>(cacheKey)

  // If not in memory cache, try DynamoDB
  if (!existingResult) {
    let dynLookupId: string | null = null
    try {
      const lookupResult = await lookupAccountOptimized(event, accountIdentifier, { includeDecommissioned: false })
      if (environment === 'govcloud') {
        dynLookupId = lookupResult.account.govCloudAccountId || lookupResult.account.awsGovCloudAccountID || lookupResult.account.primaryAccountID
      } else {
        dynLookupId = lookupResult.account.accountId || lookupResult.account.awsStandardAccountID || lookupResult.account.id
      }
    } catch { /* skip */ }

    if (dynLookupId) {
      const latestAnalysis = await getLatestAnalysis(dynLookupId, environment).catch(() => null)
      if (latestAnalysis?.status === 'completed' && latestAnalysis.summary) {
        const { items } = await getInstanceClassifications(latestAnalysis.jobId, { limit: 5000 }).catch(() => ({ items: [] }))
        if (items.length > 0) {
          existingResult = { summary: latestAnalysis.summary, instances: items }
        }
      }
    }
  }

  if (!existingResult || !existingResult.instances?.length) {
    return errors.badRequest(event, 'No existing analysis found. Run a full analysis first.')
  }

  // Find instances with missing CPU metrics — include stopped instances since
  // CloudWatch retains historical data even after an instance is stopped
  const missingInstances = existingResult.instances.filter(inst =>
    inst.metrics?.avgCpuPercent == null &&
    inst.metrics?.maxCpuPercent == null
  )

  if (missingInstances.length === 0) {
    logger.info(`[Retry Metrics] No instances with missing metrics for ${accountIdentifier}`)
    return sendSuccess(event, existingResult, { retried: 0, updated: 0 })
  }

  // Resolve account ID for CloudWatch calls
  let targetAccountId: string
  try {
    const lookupResult = await lookupAccountOptimized(event, accountIdentifier, { includeDecommissioned: false })
    if (environment === 'govcloud') {
      targetAccountId = lookupResult.account.govCloudAccountId || lookupResult.account.awsGovCloudAccountID || lookupResult.account.primaryAccountID
    } else {
      targetAccountId = lookupResult.account.accountId || lookupResult.account.awsStandardAccountID || lookupResult.account.id
    }
    if (!targetAccountId) {
      return errors.badRequest(event, `Account found but missing ${environment} account ID`)
    }
  } catch {
    return errors.notFound(event, `No account found for identifier: ${accountIdentifier}`)
  }

  logger.info(`[Retry Metrics] Retrying CloudWatch for ${missingInstances.length} instances in account ${targetAccountId}`)

  // Re-fetch CloudWatch metrics with small batches and no cache
  const metricsResult = await batchGetInstanceMetrics(
    missingInstances.map(i => ({ instanceId: i.instanceId, region: i.region })),
    targetAccountId,
    environment,
    lookbackDays,
    { maxInstancesPerBatch: RETRY_BATCH_SIZE, skipCache: true }
  ).catch(err => {
    logger.error('[Retry Metrics] CloudWatch retry failed:', err.message)
    return { metrics: new Map(), errors: [err.message], totalRequested: missingInstances.length }
  })

  if (metricsResult.metrics.size === 0) {
    logger.warn(`[Retry Metrics] Retry returned no new metrics (${metricsResult.errors.length} errors)`)
    return sendSuccess(event, existingResult, {
      retried: missingInstances.length,
      updated: 0,
      retryErrors: metricsResult.errors
    })
  }

  // Re-classify instances that got new metrics
  let updated = 0
  const instanceMap = new Map(existingResult.instances.map((inst, idx) => [inst.instanceId, idx]))

  for (const [instanceId, newMetrics] of metricsResult.metrics) {
    const idx = instanceMap.get(instanceId)
    if (idx == null) continue

    const existing = existingResult.instances[idx]

    // Reconstruct EnrichedInstanceData from stored classification
    const enriched = reconstructEnrichedData(existing)

    // Reconstruct optimizer rec if stored
    const optimizerRec = existing.optimization ? {
      resourceId: instanceId,
      finding: existing.optimization.finding,
      estimatedMonthlySavings: existing.optimization.estimatedMonthlySavings,
      recommendationOptions: existing.optimization.recommendedType
        ? [{ configuration: { instanceType: existing.optimization.recommendedType } }]
        : []
    } as ComputeOptimizerRecommendation : null

    // Reconstruct API activity if stored
    const apiActivity: InstanceApiActivity | null = existing.apiActivity ? {
      instanceId,
      totalCalls: existing.apiActivity.meaningfulCalls,
      meaningfulCalls: existing.apiActivity.meaningfulCalls,
      topEvents: existing.apiActivity.topEvents || []
    } : null

    // Re-classify with new metrics
    const reclassified = classifyInstance(enriched, newMetrics, optimizerRec, apiActivity, DEFAULT_THRESHOLDS)

    // Preserve monthly estimate from original (pricing doesn't change)
    if (existing.monthlyEstimate && !reclassified.monthlyEstimate) {
      reclassified.monthlyEstimate = existing.monthlyEstimate
    }

    existingResult.instances[idx] = reclassified
    updated++
  }

  // Recompute summary
  existingResult.summary = recomputeSummary(existingResult.instances)

  // Update cache with completed results
  const completionRate = existingResult.instances.filter(i =>
    i.instanceState !== 'running' || i.metrics?.avgCpuPercent != null || i.metrics?.maxCpuPercent != null
  ).length / existingResult.instances.length

  if (completionRate >= 0.9) {
    await cache.set(cacheKey, existingResult, { ttl: 1800 })
  } else {
    await cache.set(cacheKey, existingResult, { ttl: 300 })
  }

  logger.info(`[Retry Metrics] Updated ${updated} of ${missingInstances.length} instances with new metrics`)

  return sendSuccess(event, existingResult, {
    retried: missingInstances.length,
    updated,
    retryErrors: metricsResult.errors.length > 0 ? metricsResult.errors : undefined
  })
}))

/**
 * Reconstruct a minimal EnrichedInstanceData from a stored classification.
 * Has enough info for the classifier to re-evaluate.
 */
function reconstructEnrichedData(inst: InstanceClassification): EnrichedInstanceData {
  return {
    resourceId: inst.instanceId,
    resourceType: 'AWS::EC2::Instance',
    accountId: '',
    region: inst.region,
    instanceName: inst.instanceName,
    instanceType: inst.instanceType,
    instanceState: inst.instanceState,
    launchTime: inst.launchTime,
    schedulingInfo: {
      hasSchedule: !!inst.schedule,
      scheduleName: inst.schedule
    },
    patchingInfo: {
      patchGroup: inst.patchGroup
    },
    managementInfo: {
      isGDMSManaged: false
    },
    metadata: {
      owner: inst.owner,
      project: inst.project,
      tags: {}
    },
    pricingInfo: inst.monthlyEstimate ? {
      monthlyEstimate: inst.monthlyEstimate
    } : undefined
  } as EnrichedInstanceData
}

/**
 * Recompute classification summary from instance list
 */
function recomputeSummary(instances: InstanceClassification[]): ClassificationSummary {
  const summary: ClassificationSummary = {
    totalInstances: instances.length,
    overProvisioned: 0,
    underProvisioned: 0,
    optimized: 0,
    noData: 0,
    totalPotentialMonthlySavings: 0,
    runtimeSummary: { usuallyRunning: 0, usuallyStopped: 0, noData: 0 }
  }

  for (const inst of instances) {
    switch (inst.classification) {
      case 'over-provisioned':
        summary.overProvisioned++
        if (inst.optimization?.estimatedMonthlySavings) {
          summary.totalPotentialMonthlySavings += inst.optimization.estimatedMonthlySavings
        } else if (inst.monthlyEstimate) {
          summary.totalPotentialMonthlySavings += inst.monthlyEstimate * 0.5
        }
        break
      case 'under-provisioned':
        summary.underProvisioned++
        break
      case 'optimized':
        summary.optimized++
        break
      case 'no-data':
        summary.noData++
        break
    }
    switch (inst.runtimeClassification) {
      case 'usually-running': summary.runtimeSummary.usuallyRunning++; break
      case 'usually-stopped': summary.runtimeSummary.usuallyStopped++; break
      default: summary.runtimeSummary.noData++; break
    }
  }

  summary.totalPotentialMonthlySavings = Math.round(summary.totalPotentialMonthlySavings * 100) / 100
  return summary
}
