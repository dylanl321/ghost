/**
 * GET /api/instances/utilization
 *
 * Analyze EC2 instance utilization to identify unused, underutilized,
 * and patching-only instances. Combines CloudWatch metrics, Compute Optimizer
 * findings, and instance tags for accurate classification.
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync, parseQueryParams } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { lookupAccountOptimized, getEnvironmentAccountId } from '../../utils/account-lookup-optimized'
import type { ClassificationResult } from '../../utils/instance-utilization-classifier'
import { runUtilizationAnalysis } from '../../utils/instance-utilization-pipeline'
import { getCacheManager } from '../../utils/cache-manager'
import { getLatestAnalysis, getInstanceClassifications } from '../../utils/utilization-persistence'
import { logger } from '../../utils/logger'

const CACHE_TTL = 1800 // 30 minutes for full utilization result

registerEndpoint('/api/instances/utilization', 'GET', {
  summary: 'Analyze EC2 instance utilization',
  description: 'Identify unused, underutilized, and patching-only instances using CloudWatch metrics, Compute Optimizer, and tag analysis',
  tags: ['Resources'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'accountIds',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'Account identifier (12-digit ID, email, or request ID)'
    },
    {
      name: 'lookbackDays',
      in: 'query',
      required: false,
      schema: { type: 'integer', default: 14 },
      description: 'Number of days to analyze CloudWatch metrics (default: 14)'
    },
    {
      name: 'includeMetrics',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: true },
      description: 'Whether to fetch CloudWatch metrics (false = tags + Compute Optimizer only)'
    }
  ],
  responses: {
    200: {
      description: 'Utilization analysis completed',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  summary: {
                    type: 'object',
                    properties: {
                      totalInstances: { type: 'integer' },
                      overProvisioned: { type: 'integer' },
                      underProvisioned: { type: 'integer' },
                      optimized: { type: 'integer' },
                      noData: { type: 'integer' },
                      totalPotentialMonthlySavings: { type: 'number' },
                      runtimeSummary: { type: 'object' }
                    }
                  },
                  instances: { type: 'array' }
                }
              }
            }
          }
        }
      }
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const { environment } = parseQueryParams(event)

  const accountIdentifier = query.accountIds as string
  if (!accountIdentifier) {
    return errors.badRequest(event, 'accountIds parameter is required')
  }

  const lookbackDays = Math.min(Math.max(parseInt(query.lookbackDays as string) || 14, 1), 30)
  const includeMetrics = query.includeMetrics !== 'false'

  // Resolve the identifier (email, request ID or account ID) to this
  // partition's 12-digit ID once; DynamoDB results and AWS calls both use it.
  let targetAccountId: string | undefined
  try {
    const lookupResult = await lookupAccountOptimized(event, accountIdentifier, { includeDecommissioned: false })
    targetAccountId = getEnvironmentAccountId(lookupResult.account, environment)
  } catch {
    return errors.notFound(event, `No account found for identifier: ${accountIdentifier}`)
  }
  if (!targetAccountId) {
    return errors.badRequest(event, `Account found but missing ${environment} account ID`)
  }

  // Keyed by the resolved ID so the background job's results (and lookups by
  // email or request ID) share one entry.
  const cache = getCacheManager()
  const cacheKey = `utilization:${targetAccountId}:${environment}:${lookbackDays}:${includeMetrics}`
  const cached = await cache.get<ClassificationResult>(cacheKey)
  if (cached) {
    // Discard results cached under the old summary field names
    const s = cached.summary as any
    if (s && ('unused' in s || 'rightSized' in s) && !('overProvisioned' in s)) {
      await cache.delete(cacheKey)
    } else {
      return sendSuccess(event, cached, { cached: true, environment })
    }
  }

  // Use a recent background analysis before running the expensive sync path
  const latestAnalysis = await getLatestAnalysis(targetAccountId, environment).catch(() => null)
  if (latestAnalysis?.status === 'completed' && latestAnalysis.summary) {
    const completedAt = latestAnalysis.completedAt ? new Date(latestAnalysis.completedAt).getTime() : 0
    const age = Date.now() - completedAt
    const MAX_DYNAMO_AGE = 2 * 60 * 60 * 1000 // 2 hours

    if (age < MAX_DYNAMO_AGE) {
      const { items } = await getInstanceClassifications(latestAnalysis.jobId, { limit: 5000 }).catch(() => ({ items: [] }))
      if (items.length > 0) {
        const result = {
          summary: latestAnalysis.summary,
          instances: items
        }
        await cache.set(cacheKey, result, { ttl: CACHE_TTL })
        logger.info(`[Utilization API] Loaded from DynamoDB for ${accountIdentifier} (${age / 1000}s old)`)
        return sendSuccess(event, result, { cached: true, source: 'dynamodb', environment })
      }
    }
  }

  logger.info(`[Utilization API] Analyzing account ${targetAccountId} in ${environment}, lookback ${lookbackDays}d`)

  const run = await runUtilizationAnalysis(targetAccountId, environment, lookbackDays, { includeMetrics })
  const result = run.result

  if (run.activityErrors.length > 0) {
    logger.warn(`[Utilization API] Activity detection had ${run.activityErrors.length} errors`)
  }

  // Cache with TTL based on data completeness. Metrics are requested for
  // every instance, so completeness is measured against all of them; with
  // metrics turned off there is nothing to be incomplete.
  const hasMetricsErrors = run.metricsErrors.length > 0
  const metricsCompletionRate = includeMetrics && run.instances.length > 0
    ? Math.min(run.metricsCount / run.instances.length, 1)
    : 1

  if (!hasMetricsErrors || metricsCompletionRate >= 0.9) {
    await cache.set(cacheKey, result, { ttl: CACHE_TTL })
  } else if (metricsCompletionRate >= 0.5) {
    // Partial results: short TTL so a retry comes sooner
    await cache.set(cacheKey, result, { ttl: 300 })
    logger.warn(`[Utilization API] Partial results cached (${(metricsCompletionRate * 100).toFixed(0)}% complete) with short TTL`)
  } else {
    logger.warn(`[Utilization API] Results too incomplete to cache (${(metricsCompletionRate * 100).toFixed(0)}% complete, ${run.metricsErrors.length} errors)`)
  }

  logger.info(`[Utilization API] Classification complete: ${result.summary.overProvisioned} over-provisioned, ${result.summary.underProvisioned} under-provisioned, ${result.summary.optimized} optimized, ${result.summary.noData} no-data`)

  return sendSuccess(event, result, {
    environment,
    lookbackDays,
    includeMetrics,
    metricsCompletionRate: Math.round(metricsCompletionRate * 100),
    metricsErrors: hasMetricsErrors ? run.metricsErrors : undefined,
    partial: hasMetricsErrors && metricsCompletionRate < 0.9
  })
}))
