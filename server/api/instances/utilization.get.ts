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
  batchGetResourceConfigs
} from '../../utils/config-service'
import { lookupAccountOptimized } from '../../utils/account-lookup-optimized'
import { batchGetInstanceMetrics } from '../../utils/cloudwatch-metrics'
import { getEC2Recommendations } from '../../utils/compute-optimizer'
import {
  classifyInstances,
  DEFAULT_THRESHOLDS,
  type ClassificationResult
} from '../../utils/instance-utilization-classifier'
import { getCacheManager } from '../../utils/cache-manager'
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
    logger.info(`[Utilization API] Cache hit for ${accountIdentifier}`)
    return sendSuccess(event, cached, { cached: true, environment })
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
  const aggregatorName = environment === 'commercial'
    ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'CommercialAggregator')
    : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')

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
        totalInstances: 0, unused: 0, patchingOnly: 0,
        underutilized: 0, rightSized: 0, insufficientData: 0,
        totalPotentialMonthlySavings: 0
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

  const [metricsResult, optimizerRecs, pricingData] = await Promise.all([
    // CloudWatch metrics (only for running instances, only if requested)
    includeMetrics && runningInstances.length > 0
      ? batchGetInstanceMetrics(
          runningInstances.map(i => ({ instanceId: i.resourceId, region: i.region })),
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

  // Step 4: Classify all instances
  const result = classifyInstances(instances, metricsMap, optimizerMap, DEFAULT_THRESHOLDS)

  // Cache the result
  await cache.set(cacheKey, result, { ttl: CACHE_TTL })

  logger.info(`[Utilization API] Classification complete: ${result.summary.unused} unused, ${result.summary.underutilized} underutilized, ${result.summary.patchingOnly} patching-only`)

  return sendSuccess(event, result, {
    environment,
    lookbackDays,
    includeMetrics,
    metricsErrors: metricsResult.errors.length > 0 ? metricsResult.errors : undefined
  })
}))
