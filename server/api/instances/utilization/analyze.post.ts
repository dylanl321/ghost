/**
 * POST /api/instances/utilization/analyze
 * Trigger a background utilization analysis for an account.
 * Returns immediately with a job ID.
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync, parseQueryParams } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { lookupAccountOptimized } from '../../../utils/account-lookup-optimized'
import { getLatestAnalysis, saveAnalysisJob, saveLatestPointer, updateAnalysisProgress, saveInstanceClassifications } from '../../../utils/utilization-persistence'
import { listAggregateResources, batchGetResourceConfigs, getAggregatorName } from '../../../utils/config-service'
import { batchGetInstanceMetrics } from '../../../utils/cloudwatch-metrics'
import { getEC2Recommendations } from '../../../utils/compute-optimizer'
import { classifyInstances, DEFAULT_THRESHOLDS, type InstanceApiActivity } from '../../../utils/instance-utilization-classifier'
import { getCacheManager } from '../../../utils/cache-manager'
import { logger } from '../../../utils/logger'
import type { EnrichedInstanceData } from '../../../utils/instance-enrichment'
import type { AWSEnvironmentType } from '../../../types'

registerEndpoint('/api/instances/utilization/analyze', 'POST', {
  summary: 'Trigger background utilization analysis',
  description: 'Start an asynchronous utilization analysis for an account. Returns a job ID for polling.',
  tags: ['Resources'],
  parameters: [{ $ref: '#/components/parameters/Environment' }],
  requestBody: {
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            accountIds: { type: 'string', description: 'Account identifier' },
            lookbackDays: { type: 'integer', default: 14 }
          },
          required: ['accountIds']
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Analysis triggered',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  jobId: { type: 'string' },
                  status: { type: 'string' }
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
  const { environment } = parseQueryParams(event)
  const body = await readBody(event)

  const accountIdentifier = body?.accountIds as string
  if (!accountIdentifier) {
    return errors.badRequest(event, 'accountIds is required in request body')
  }

  const lookbackDays = Math.min(Math.max(parseInt(body?.lookbackDays) || 14, 1), 30)

  // Resolve account
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

  // Check for existing running job
  const latest = await getLatestAnalysis(targetAccountId, environment).catch(() => null)
  if (latest && latest.status === 'running' && latest.triggeredAt) {
    const jobAge = Date.now() - new Date(latest.triggeredAt).getTime()
    if (jobAge < 15 * 60 * 1000) {
      return sendSuccess(event, { jobId: latest.jobId, status: 'already-running' })
    }
  }

  // Create new job
  const timestamp = new Date().toISOString()
  const jobId = `${targetAccountId}-${Date.now()}`

  const job = {
    PK: `ACCOUNT#${targetAccountId}`,
    SK: `ANALYSIS#${environment}#${timestamp}`,
    type: 'analysis-job' as const,
    jobId,
    accountId: targetAccountId,
    environment,
    status: 'pending' as const,
    triggeredAt: timestamp,
    lookbackDays,
    totalInstances: 0,
    progress: {
      phase: 'config' as const,
      instancesProcessed: 0,
      totalInstances: 0,
      metricsErrors: 0
    },
    ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  }

  await saveAnalysisJob(job)
  await saveLatestPointer({
    PK: `ACCOUNT#${targetAccountId}`,
    SK: `LATEST#${environment}`,
    type: 'latest-pointer',
    jobId,
    status: 'running',
    triggeredAt: timestamp,
    ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
  })

  // Fire and forget — run analysis in background
  runBackgroundAnalysis(jobId, targetAccountId, environment as AWSEnvironmentType, lookbackDays, timestamp).catch(err => {
    logger.error(`[Background Analysis] Unhandled error for job ${jobId}:`, err)
  })

  return sendSuccess(event, { jobId, status: 'pending' })
}))

/**
 * Run the full utilization analysis in the background.
 * Updates DynamoDB progress as it goes.
 */
async function runBackgroundAnalysis(
  jobId: string,
  targetAccountId: string,
  environment: AWSEnvironmentType,
  lookbackDays: number,
  timestamp: string
) {
  const updateProgress = (progress: any, extra?: any) =>
    updateAnalysisProgress(targetAccountId, environment, timestamp, progress, extra).catch(err =>
      logger.error(`[Background Analysis] Progress update failed:`, err.message)
    )

  try {
    await updateProgress(
      { phase: 'config', instancesProcessed: 0, totalInstances: 0, metricsErrors: 0 },
      { status: 'running' }
    )

    // Step 1: Fetch instances from Config
    const aggregatorName = getAggregatorName(environment)
    const configRegion = environment === 'commercial'
      ? (process.env.AWS_COMMERCIAL_REGION || 'us-east-1')
      : (process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')

    logger.info(`[Background Analysis] [${jobId}] Phase: config — fetching instances from aggregator "${aggregatorName}" in ${configRegion}`)
    const { resources: instanceIdentifiers } = await listAggregateResources(
      aggregatorName,
      { resourceType: 'AWS::EC2::Instance', accountIds: [targetAccountId], limit: 5000 },
      environment,
      configRegion
    )
    logger.info(`[Background Analysis] [${jobId}] Config returned ${instanceIdentifiers.length} instance identifiers`)

    if (instanceIdentifiers.length === 0) {
      await updateProgress(
        { phase: 'done', instancesProcessed: 0, totalInstances: 0, metricsErrors: 0 },
        {
          status: 'completed',
          completedAt: new Date().toISOString(),
          totalInstances: 0,
          summary: { totalInstances: 0, overProvisioned: 0, underProvisioned: 0, optimized: 0, noData: 0, totalPotentialMonthlySavings: 0, runtimeSummary: { usuallyRunning: 0, usuallyStopped: 0, noData: 0 } }
        }
      )
      await saveLatestPointer({
        PK: `ACCOUNT#${targetAccountId}`, SK: `LATEST#${environment}`,
        type: 'latest-pointer', jobId, status: 'completed',
        completedAt: new Date().toISOString(),
        summary: { totalInstances: 0, overProvisioned: 0, underProvisioned: 0, optimized: 0, noData: 0, totalPotentialMonthlySavings: 0, runtimeSummary: { usuallyRunning: 0, usuallyStopped: 0, noData: 0 } },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      })
      return
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
          networkInfo: { privateIpAddress: resource.configuration?.privateIpAddress, publicIpAddress: resource.configuration?.publicIpAddress },
          schedulingInfo: { hasSchedule: !!tags.Schedule, scheduleName: tags.Schedule, lastScheduleMessage: tags.ScheduleMessage },
          patchingInfo: { patchGroup: tags['Patch Group'], patchingAutomation: tags.PatchingAutomation },
          managementInfo: { isGDMSManaged: tags.GDMS_Managed?.toLowerCase() === 'true', gdmsManagedValue: tags.GDMS_Managed },
          metadata: { environment: tags.Environment || tags.environment || tags.Env, project: tags.Project || tags.project || tags.Application, owner: tags.Owner || tags.owner, tags }
        } as EnrichedInstanceData
      })

    // Log instance breakdown by state and region
    const stateBreakdown: Record<string, number> = {}
    const regionBreakdown: Record<string, number> = {}
    for (const inst of instances) {
      const state = inst.instanceState || 'unknown'
      stateBreakdown[state] = (stateBreakdown[state] || 0) + 1
      regionBreakdown[inst.region] = (regionBreakdown[inst.region] || 0) + 1
    }
    logger.info(`[Background Analysis] [${jobId}] Parsed ${instances.length} instances — states: ${JSON.stringify(stateBreakdown)}, regions: ${JSON.stringify(regionBreakdown)}`)

    await updateProgress({
      phase: 'cloudwatch',
      instancesProcessed: 0,
      totalInstances: instances.length,
      metricsErrors: 0
    }, { totalInstances: instances.length })

    // Step 3: Fetch data in parallel
    // Fetch CloudWatch metrics for ALL instances (not just running) — stopped instances
    // retain CloudWatch data and need it for accurate runtime classification
    const runningInstances = instances.filter(i => i.instanceState === 'running')
    logger.info(`[Background Analysis] [${jobId}] Phase: parallel fetches — ${instances.length} instances for CW, ${runningInstances.length} running for Optimizer, ${instances.length} total for activity detection`)

    const [metricsResult, optimizerRecs, pricingData, activityResult] = await Promise.all([
      instances.length > 0
        ? batchGetInstanceMetrics(
            instances.map(i => ({ instanceId: i.resourceId, region: i.region })),
            targetAccountId, environment, lookbackDays
          ).catch(err => {
            logger.error('[Background Analysis] CloudWatch metrics failed:', err.message)
            return { metrics: new Map(), errors: [err.message], totalRequested: instances.length }
          })
        : Promise.resolve({ metrics: new Map(), errors: [] as string[], totalRequested: 0 }),

      (async () => {
        await updateProgress({ phase: 'optimizer', instancesProcessed: 0, totalInstances: instances.length, metricsErrors: 0 })
        if (runningInstances.length === 0) return []
        const partition = environment === 'govcloud' ? 'aws-us-gov' : 'aws'
        const arns = runningInstances.map(i => `arn:${partition}:ec2:${i.region}:${targetAccountId}:instance/${i.resourceId}`)
        return getEC2Recommendations(arns, environment).catch(err => {
          logger.error('[Background Analysis] Compute Optimizer failed:', err.message)
          return []
        })
      })(),

      (async () => {
        await updateProgress({ phase: 'pricing', instancesProcessed: 0, totalInstances: instances.length, metricsErrors: 0 })
        try {
          const { batchGetEC2InstancePricing } = await import('../../../utils/aws-pricing')
          return await batchGetEC2InstancePricing(
            instances.filter(i => i.instanceType && i.region).map(i => ({ instanceType: i.instanceType!, region: i.region })),
            environment
          )
        } catch (err: any) {
          logger.error('[Background Analysis] Pricing fetch failed:', err.message)
          return new Map()
        }
      })(),

      // CloudTrail API activity via Security Lake (single Athena query for all instances)
      (async () => {
        try {
          const { batchGetInstanceActivity } = await import('../../../utils/instance-activity-detection')
          const allInstanceIds = instances.map(i => i.resourceId)
          return await batchGetInstanceActivity(allInstanceIds, targetAccountId, environment, lookbackDays)
        } catch (err: any) {
          logger.error('[Background Analysis] Activity detection failed:', err.message)
          return { activities: new Map() as Map<string, InstanceApiActivity>, queryDurationMs: 0, errors: [err.message] }
        }
      })()
    ])

    // Attach pricing
    for (const instance of instances) {
      if (instance.instanceType && instance.region) {
        const pricingKey = `${instance.region}-${instance.instanceType}`
        const pricing = pricingData.get(pricingKey)
        if (pricing) instance.pricingInfo = pricing
      }
    }

    await updateProgress({
      phase: 'classifying',
      instancesProcessed: metricsResult.metrics.size,
      totalInstances: instances.length,
      metricsErrors: metricsResult.errors.length
    })

    // Step 4: Log data quality, then classify
    const metricsMap = metricsResult.metrics
    const optimizerMap = new Map(optimizerRecs.map(r => [r.resourceId, r]))
    const activityMap = activityResult.activities

    // Detailed data quality report
    const cwWithData = metricsMap.size
    const cwMissing = runningInstances.length - cwWithData
    const cwMissingIds = runningInstances
      .filter(i => !metricsMap.has(i.resourceId))
      .slice(0, 10)
      .map(i => `${i.resourceId}(${i.instanceName || 'no-name'})`)
    logger.info(`[Background Analysis] [${jobId}] CloudWatch: ${cwWithData}/${runningInstances.length} running instances have metrics, ${cwMissing} missing, ${metricsResult.errors.length} errors`)
    if (cwMissing > 0) {
      logger.warn(`[Background Analysis] [${jobId}] CloudWatch missing (first 10): ${cwMissingIds.join(', ')}`)
    }
    if (metricsResult.errors.length > 0) {
      logger.warn(`[Background Analysis] [${jobId}] CloudWatch errors: ${metricsResult.errors.join('; ')}`)
    }

    logger.info(`[Background Analysis] [${jobId}] Compute Optimizer: ${optimizerMap.size} recommendations returned`)
    const optMissing = runningInstances.filter(i => !optimizerMap.has(i.resourceId)).length
    if (optMissing > 0) {
      logger.info(`[Background Analysis] [${jobId}] Compute Optimizer: ${optMissing} running instances have no recommendation`)
    }

    logger.info(`[Background Analysis] [${jobId}] Activity detection: ${activityMap.size} instances with API activity (${activityResult.queryDurationMs}ms)${activityResult.errors.length > 0 ? `, errors: ${activityResult.errors.join('; ')}` : ''}`)

    logger.info(`[Background Analysis] [${jobId}] Pricing: ${pricingData.size} price lookups resolved`)

    // Cross-reference: instances with NO data at all
    const noDataInstances = runningInstances.filter(i =>
      !metricsMap.has(i.resourceId) && !optimizerMap.has(i.resourceId) && !activityMap.has(i.resourceId)
    )
    if (noDataInstances.length > 0) {
      const sample = noDataInstances.slice(0, 5).map(i => `${i.resourceId}(${i.region}, ${i.instanceType})`)
      logger.warn(`[Background Analysis] [${jobId}] ${noDataInstances.length} running instances have NO data from any source: ${sample.join(', ')}`)
    }

    const result = classifyInstances(instances, metricsMap, optimizerMap, activityMap, DEFAULT_THRESHOLDS)

    // Step 5: Save results
    await updateProgress({
      phase: 'saving',
      instancesProcessed: instances.length,
      totalInstances: instances.length,
      metricsErrors: metricsResult.errors.length
    })

    await saveInstanceClassifications(jobId, result.instances)

    // Update in-memory cache too
    const cache = getCacheManager()
    const cacheKey = `utilization:${targetAccountId}:${environment}:${lookbackDays}:true`
    await cache.set(cacheKey, result, { ttl: 1800 })

    // Finalize
    const completedAt = new Date().toISOString()
    await updateProgress(
      { phase: 'done', instancesProcessed: instances.length, totalInstances: instances.length, metricsErrors: metricsResult.errors.length },
      { status: 'completed', completedAt, summary: result.summary }
    )
    await saveLatestPointer({
      PK: `ACCOUNT#${targetAccountId}`, SK: `LATEST#${environment}`,
      type: 'latest-pointer', jobId, status: 'completed', completedAt,
      summary: result.summary,
      ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
    })

    logger.info(`[Background Analysis] Job ${jobId} completed: ${result.summary.overProvisioned} over-provisioned, ${result.summary.underProvisioned} under-provisioned, ${result.summary.optimized} optimized, ${result.summary.noData} no-data`)

  } catch (err: any) {
    logger.error(`[Background Analysis] Job ${jobId} failed:`, err)
    await updateProgress(
      { phase: 'done', instancesProcessed: 0, totalInstances: 0, metricsErrors: 0 },
      { status: 'failed', errorMessage: err.message }
    ).catch(() => {})
    await saveLatestPointer({
      PK: `ACCOUNT#${targetAccountId}`, SK: `LATEST#${environment}`,
      type: 'latest-pointer', jobId, status: 'failed',
      ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
    }).catch(() => {})
  }
}
