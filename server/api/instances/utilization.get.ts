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
import {
  listAggregateResources,
  batchGetResourceConfigs,
  getAggregatorName
} from '../../utils/config-service'
import { lookupAccountOptimized } from '../../utils/account-lookup-optimized'
import { batchGetInstanceMetrics } from '../../utils/cloudwatch-metrics'
import { getEC2Recommendations } from '../../utils/compute-optimizer'
import {
  classifyInstances,
  DEFAULT_THRESHOLDS,
  type ClassificationResult,
  type InstanceApiActivity
} from '../../utils/instance-utilization-classifier'
import { getCacheManager } from '../../utils/cache-manager'
import { getLatestAnalysis, getInstanceClassifications } from '../../utils/utilization-persistence'
import type { AWSEnvironmentType } from '../../types'
import type { EnrichedInstanceData } from '../../utils/instance-enrichment'
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
                      unused: { type: 'integer' },
                      patchingOnly: { type: 'integer' },
                      underutilized: { type: 'integer' },
                      rightSized: { type: 'integer' },
                      insufficientData: { type: 'integer' },
                      totalPotentialMonthlySavings: { type: 'number' }
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

  // Check cache first
  const cache = getCacheManager()
  const cacheKey = `utilization:${accountIdentifier}:${environment}:${lookbackDays}:${includeMetrics}`
  const cached = await cache.get<ClassificationResult>(cacheKey)
  if (cached) {
    // Validate schema — discard stale cached results with old field names
    const s = cached.summary as any
    if (s && ('unused' in s || 'rightSized' in s) && !('overProvisioned' in s)) {
      logger.info(`[Utilization API] Stale in-memory cache for ${accountIdentifier}, discarding`)
      await cache.delete(cacheKey)
    } else {
      logger.info(`[Utilization API] Cache hit for ${accountIdentifier}`)
      return sendSuccess(event, cached, { cached: true, environment })
    }
  }

  // Check DynamoDB for recent analysis before running expensive sync query
  // Resolve account ID first — accountIdentifier may be email/name, but DynamoDB keys use 12-digit account IDs
  let dynLookupId: string | null = null
  try {
    const lookupResult = await lookupAccountOptimized(event, accountIdentifier, { includeDecommissioned: false })
    if (environment === 'govcloud') {
      dynLookupId = lookupResult.account.govCloudAccountId || lookupResult.account.awsGovCloudAccountID || lookupResult.account.primaryAccountID
    } else {
      dynLookupId = lookupResult.account.accountId || lookupResult.account.awsStandardAccountID || lookupResult.account.id
    }
  } catch { 
    // Account lookup failed — skip DynamoDB fallback, continue to sync path
  }
  const latestAnalysis = dynLookupId ? await getLatestAnalysis(dynLookupId, environment).catch(() => null) : null
  if (latestAnalysis?.status === 'completed' && latestAnalysis.summary) {
    const completedAt = latestAnalysis.completedAt ? new Date(latestAnalysis.completedAt).getTime() : 0
    const age = Date.now() - completedAt
    const MAX_DYNAMO_AGE = 2 * 60 * 60 * 1000 // 2 hours

    if (age < MAX_DYNAMO_AGE) {
      // Load full results from DynamoDB
      const { items } = await getInstanceClassifications(latestAnalysis.jobId, { limit: 5000 }).catch(() => ({ items: [] }))
      if (items.length > 0) {
        const result = {
          summary: latestAnalysis.summary,
          instances: items
        }
        // Populate in-memory cache
        await cache.set(cacheKey, result, { ttl: CACHE_TTL })
        logger.info(`[Utilization API] Loaded from DynamoDB for ${accountIdentifier} (${age / 1000}s old)`)
        return sendSuccess(event, result, { cached: true, source: 'dynamodb', environment })
      }
    }
  }

  // Resolve account identifier
  let targetAccountId: string
  try {
    const lookupResult = await lookupAccountOptimized(event, accountIdentifier, {
      includeDecommissioned: false
    })

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

  logger.info(`[Utilization API] Analyzing account ${targetAccountId} in ${environment}, lookback ${lookbackDays}d`)

  // Step 1: Fetch instances from Config
  const aggregatorName = getAggregatorName(environment)

  const configRegion = environment === 'commercial'
    ? (process.env.AWS_COMMERCIAL_REGION || 'us-east-1')
    : (process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')

  const { resources: instanceIdentifiers } = await listAggregateResources(
    aggregatorName,
    {
      resourceType: 'AWS::EC2::Instance',
      accountIds: [targetAccountId],
      limit: 5000
    },
    environment,
    configRegion
  )

  if (instanceIdentifiers.length === 0) {
    const emptyResult: ClassificationResult = {
      summary: {
        totalInstances: 0,
        overProvisioned: 0,
        underProvisioned: 0,
        optimized: 0,
        noData: 0,
        totalPotentialMonthlySavings: 0,
        runtimeSummary: { usuallyRunning: 0, usuallyStopped: 0, noData: 0 }
      },
      instances: []
    }
    return sendSuccess(event, emptyResult, { environment })
  }

  // Step 2: Get detailed configs
  const batchResult = await batchGetResourceConfigs(
    aggregatorName,
    instanceIdentifiers.map(r => ({
      SourceAccountId: r.SourceAccountId!,
      SourceRegion: r.SourceRegion!,
      ResourceId: r.ResourceId!,
      ResourceType: r.ResourceType!,
      ResourceName: r.ResourceName
    })),
    environment,
    configRegion
  )

  // Parse into enriched instance format (lightweight, no AWS API calls)
  const instances: EnrichedInstanceData[] = batchResult.successful
    .filter(resource => resource.resourceType === 'AWS::EC2::Instance')
    .map(resource => {
      let tags = resource.tags || {}
      if (resource.configuration?.tags && Array.isArray(resource.configuration.tags)) {
        tags = {}
        for (const tag of resource.configuration.tags) {
          if (tag.key && tag.value !== undefined) {
            tags[tag.key] = tag.value
          }
        }
      }

      return {
        resourceId: resource.resourceId,
        resourceType: resource.resourceType,
        accountId: resource.accountId,
        region: resource.region,
        instanceName: tags.Name || tags.name,
        instanceType: resource.configuration?.instanceType,
        instanceState: resource.configuration?.state?.name,
        launchTime: resource.configuration?.launchTime,
        networkInfo: {
          privateIpAddress: resource.configuration?.privateIpAddress,
          publicIpAddress: resource.configuration?.publicIpAddress
        },
        schedulingInfo: {
          hasSchedule: !!tags.Schedule,
          scheduleName: tags.Schedule,
          lastScheduleMessage: tags.ScheduleMessage
        },
        patchingInfo: {
          patchGroup: tags['Patch Group'],
          patchingAutomation: tags.PatchingAutomation
        },
        managementInfo: {
          isGDMSManaged: tags.GDMS_Managed?.toLowerCase() === 'true',
          gdmsManagedValue: tags.GDMS_Managed
        },
        metadata: {
          environment: tags.Environment || tags.environment || tags.Env,
          project: tags.Project || tags.project || tags.Application,
          owner: tags.Owner || tags.owner,
          tags
        }
      } as EnrichedInstanceData
    })

  logger.info(`[Utilization API] Parsed ${instances.length} instances`)

  // Step 3: Fetch data in parallel — CloudWatch metrics + Compute Optimizer
  const runningInstances = instances.filter(i => i.instanceState === 'running')

  const [metricsResult, optimizerRecs, pricingData, activityResult] = await Promise.all([
    // CloudWatch metrics for ALL instances (stopped instances retain data for runtime classification)
    includeMetrics && instances.length > 0
      ? batchGetInstanceMetrics(
          instances.map(i => ({ instanceId: i.resourceId, region: i.region })),
          targetAccountId,
          environment,
          lookbackDays
        ).catch(err => {
          logger.error('[Utilization API] CloudWatch metrics failed:', err.message)
          return { metrics: new Map(), errors: [err.message] }
        })
      : Promise.resolve({ metrics: new Map(), errors: [] as string[] }),

    // Compute Optimizer recommendations (only for running instances)
    runningInstances.length > 0
      ? (async () => {
          const partition = environment === 'govcloud' ? 'aws-us-gov' : 'aws'
          const arns = runningInstances.map(i =>
            `arn:${partition}:ec2:${i.region}:${targetAccountId}:instance/${i.resourceId}`
          )
          return getEC2Recommendations(arns, environment).catch(err => {
            logger.error('[Utilization API] Compute Optimizer failed:', err.message)
            return []
          })
        })()
      : Promise.resolve([]),

    // Pricing data for cost estimates
    (async () => {
      try {
        const { batchGetEC2InstancePricing } = await import('../../utils/aws-pricing')
        const requests = instances
          .filter(i => i.instanceType && i.region)
          .map(i => ({ instanceType: i.instanceType!, region: i.region }))
        return await batchGetEC2InstancePricing(requests, environment)
      } catch (err: any) {
        logger.error('[Utilization API] Pricing fetch failed:', err.message)
        return new Map()
      }
    })(),

    // CloudTrail API activity via Security Lake (all instances, single Athena query)
    (async () => {
      try {
        const { batchGetInstanceActivity } = await import('../../utils/instance-activity-detection')
        const allInstanceIds = instances.map(i => i.resourceId)
        return await batchGetInstanceActivity(allInstanceIds, targetAccountId, environment, lookbackDays)
      } catch (err: any) {
        logger.error('[Utilization API] Activity detection failed:', err.message)
        return { activities: new Map() as Map<string, InstanceApiActivity>, queryDurationMs: 0, errors: [err.message] }
      }
    })()
  ])

  // Attach pricing to instances
  for (const instance of instances) {
    if (instance.instanceType && instance.region) {
      const pricingKey = `${instance.region}-${instance.instanceType}`
      const pricing = pricingData.get(pricingKey)
      if (pricing) {
        instance.pricingInfo = pricing
      }
    }
  }

  // Build lookup maps
  const metricsMap = metricsResult.metrics
  const optimizerMap = new Map(optimizerRecs.map(r => [r.resourceId, r]))
  const activityMap = activityResult.activities

  if (activityResult.errors.length > 0) {
    logger.warn(`[Utilization API] Activity detection had ${activityResult.errors.length} errors`)
  }
  if (activityResult.queryDurationMs > 0) {
    logger.info(`[Utilization API] Activity detection: ${activityMap.size} instances with activity data (${activityResult.queryDurationMs}ms)`)
  }

  // Step 4: Classify all instances
  const result = classifyInstances(instances, metricsMap, optimizerMap, activityMap, DEFAULT_THRESHOLDS)

  // Cache with TTL based on data completeness
  const hasMetricsErrors = metricsResult.errors.length > 0
  const metricsCompletionRate = runningInstances.length > 0
    ? metricsResult.metrics.size / runningInstances.length
    : 1

  if (!hasMetricsErrors || metricsCompletionRate >= 0.9) {
    // Full cache - complete or near-complete results
    await cache.set(cacheKey, result, { ttl: CACHE_TTL })
  } else if (metricsCompletionRate >= 0.5) {
    // Short cache - partial results, allow retry sooner
    await cache.set(cacheKey, result, { ttl: 300 }) // 5 minutes
    logger.warn(`[Utilization API] Partial results cached (${(metricsCompletionRate * 100).toFixed(0)}% complete) with short TTL`)
  } else {
    // Don't cache severely incomplete results
    logger.warn(`[Utilization API] Results too incomplete to cache (${(metricsCompletionRate * 100).toFixed(0)}% complete, ${metricsResult.errors.length} errors)`)
  }

  logger.info(`[Utilization API] Classification complete: ${result.summary.overProvisioned} over-provisioned, ${result.summary.underProvisioned} under-provisioned, ${result.summary.optimized} optimized, ${result.summary.noData} no-data`)

  return sendSuccess(event, result, {
    environment,
    lookbackDays,
    includeMetrics,
    metricsCompletionRate: Math.round(metricsCompletionRate * 100),
    metricsErrors: metricsResult.errors.length > 0 ? metricsResult.errors : undefined,
    partial: hasMetricsErrors && metricsCompletionRate < 0.9
  })
}))
