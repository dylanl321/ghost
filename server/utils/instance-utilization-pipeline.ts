/**
 * Instance utilization pipeline shared by the synchronous utilization route
 * and the background analysis job: list the account's instances from the
 * Config aggregator, fetch CloudWatch metrics, Compute Optimizer findings,
 * pricing and API activity in parallel, then classify every instance.
 */

import { listAggregateResources, batchGetResourceConfigs, getAggregatorName } from './config-service'
import { buildInstanceData, type EnrichedInstanceData } from './instance-enrichment'
import { batchGetInstanceMetrics } from './cloudwatch-metrics'
import { getEC2Recommendations } from './compute-optimizer'
import { classifyInstances, DEFAULT_THRESHOLDS, type ClassificationResult } from './instance-utilization-classifier'
import type { InstanceApiActivity } from './instance-activity-detection'
import type { AWSEnvironmentType } from '../types'
import { logger } from './logger'

export type UtilizationPhase = 'config' | 'cloudwatch' | 'optimizer' | 'pricing' | 'classifying'

export interface UtilizationRun {
  result: ClassificationResult
  instances: EnrichedInstanceData[]
  runningInstances: EnrichedInstanceData[]
  metricsCount: number
  metricsErrors: string[]
  optimizerCount: number
  activityCount: number
  activityErrors: string[]
  activityDurationMs: number
  pricingCount: number
}

export function emptyClassificationResult(): ClassificationResult {
  return {
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
}

export async function runUtilizationAnalysis(
  targetAccountId: string,
  environment: AWSEnvironmentType,
  lookbackDays: number,
  options: {
    includeMetrics?: boolean
    onPhase?: (phase: UtilizationPhase, totalInstances: number) => Promise<void> | void
  } = {}
): Promise<UtilizationRun> {
  const includeMetrics = options.includeMetrics !== false
  const onPhase = async (phase: UtilizationPhase, total: number) => {
    await options.onPhase?.(phase, total)
  }

  // Step 1: instances from the Config aggregator
  await onPhase('config', 0)
  const aggregatorName = getAggregatorName(environment)
  const configRegion = environment === 'commercial'
    ? (process.env.AWS_COMMERCIAL_REGION || 'us-east-1')
    : (process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')

  const { resources: identifiers } = await listAggregateResources(
    aggregatorName,
    { resourceType: 'AWS::EC2::Instance', accountIds: [targetAccountId], limit: 5000 },
    environment,
    configRegion
  )

  const batchResult = identifiers.length > 0
    ? await batchGetResourceConfigs(
        aggregatorName,
        identifiers.map(r => ({
          SourceAccountId: r.SourceAccountId!,
          SourceRegion: r.SourceRegion!,
          ResourceId: r.ResourceId!,
          ResourceType: r.ResourceType!,
          ResourceName: r.ResourceName
        })),
        environment,
        configRegion
      )
    : { successful: [] as any[] }

  const instances = batchResult.successful
    .filter(resource => resource.resourceType === 'AWS::EC2::Instance')
    .map(resource => buildInstanceData(resource))
  const runningInstances = instances.filter(i => i.instanceState === 'running')

  // Step 2: data sources in parallel. Metrics cover stopped instances too:
  // they keep CloudWatch history that the runtime classification needs.
  await onPhase('cloudwatch', instances.length)
  const [metricsResult, optimizerRecs, pricingData, activityResult] = await Promise.all([
    includeMetrics && instances.length > 0
      ? batchGetInstanceMetrics(
          instances.map(i => ({ instanceId: i.resourceId, region: i.region })),
          targetAccountId, environment, lookbackDays
        ).catch((err) => {
          logger.error('[Utilization] CloudWatch metrics failed:', err.message)
          return { metrics: new Map(), errors: [err.message as string] }
        })
      : Promise.resolve({ metrics: new Map(), errors: [] as string[] }),

    (async () => {
      await onPhase('optimizer', instances.length)
      if (runningInstances.length === 0) return []
      const partition = environment === 'govcloud' ? 'aws-us-gov' : 'aws'
      const arns = runningInstances.map(i => `arn:${partition}:ec2:${i.region}:${targetAccountId}:instance/${i.resourceId}`)
      return getEC2Recommendations(arns, environment).catch((err) => {
        logger.error('[Utilization] Compute Optimizer failed:', err.message)
        return []
      })
    })(),

    (async () => {
      await onPhase('pricing', instances.length)
      try {
        const { batchGetEC2InstancePricing } = await import('./aws-pricing')
        return await batchGetEC2InstancePricing(
          instances.filter(i => i.instanceType && i.region).map(i => ({ instanceType: i.instanceType!, region: i.region })),
          environment
        )
      } catch (err: any) {
        logger.error('[Utilization] Pricing fetch failed:', err.message)
        return new Map()
      }
    })(),

    // CloudTrail API activity via Security Lake (single Athena query)
    (async () => {
      if (instances.length === 0) {
        return { activities: new Map() as Map<string, InstanceApiActivity>, queryDurationMs: 0, errors: [] as string[] }
      }
      try {
        const { batchGetInstanceActivity } = await import('./instance-activity-detection')
        return await batchGetInstanceActivity(instances.map(i => i.resourceId), targetAccountId, environment, lookbackDays)
      } catch (err: any) {
        logger.error('[Utilization] Activity detection failed:', err.message)
        return { activities: new Map() as Map<string, InstanceApiActivity>, queryDurationMs: 0, errors: [err.message as string] }
      }
    })()
  ])

  for (const instance of instances) {
    if (instance.instanceType && instance.region) {
      const pricing = pricingData.get(`${instance.region}-${instance.instanceType}`)
      if (pricing) instance.pricingInfo = pricing
    }
  }

  // Step 3: classify
  await onPhase('classifying', instances.length)
  const optimizerMap = new Map(optimizerRecs.map(r => [r.resourceId, r]))
  const result = instances.length > 0
    ? classifyInstances(instances, metricsResult.metrics, optimizerMap, activityResult.activities, DEFAULT_THRESHOLDS)
    : emptyClassificationResult()

  return {
    result,
    instances,
    runningInstances,
    metricsCount: metricsResult.metrics.size,
    metricsErrors: metricsResult.errors,
    optimizerCount: optimizerMap.size,
    activityCount: activityResult.activities.size,
    activityErrors: activityResult.errors,
    activityDurationMs: activityResult.queryDurationMs,
    pricingCount: pricingData.size
  }
}
