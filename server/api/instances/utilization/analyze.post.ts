/**
 * POST /api/instances/utilization/analyze
 * Trigger a background utilization analysis for an account.
 * Returns immediately with a job ID.
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync, parseQueryParams } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { lookupAccountOptimized, getEnvironmentAccountId } from '../../../utils/account-lookup-optimized'
import { getLatestAnalysis, saveAnalysisJob, saveLatestPointer, updateAnalysisProgress, saveInstanceClassifications } from '../../../utils/utilization-persistence'
import { runUtilizationAnalysis } from '../../../utils/instance-utilization-pipeline'
import { getCacheManager } from '../../../utils/cache-manager'
import { logger } from '../../../utils/logger'
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

    const run = await runUtilizationAnalysis(targetAccountId, environment, lookbackDays, {
      onPhase: async (phase, total) => {
        if (phase === 'config') return
        if (phase === 'cloudwatch') {
          await updateProgress({ phase, instancesProcessed: 0, totalInstances: total, metricsErrors: 0 }, { totalInstances: total })
        } else if (phase !== 'classifying') {
          await updateProgress({ phase, instancesProcessed: 0, totalInstances: total, metricsErrors: 0 })
        }
      }
    })
    const { result, instances, runningInstances } = run

    await updateProgress({
      phase: 'classifying',
      instancesProcessed: run.metricsCount,
      totalInstances: instances.length,
      metricsErrors: run.metricsErrors.length
    })

    logger.info(`[Background Analysis] [${jobId}] ${instances.length} instances (${runningInstances.length} running): CloudWatch ${run.metricsCount} with metrics, ${run.metricsErrors.length} errors; Compute Optimizer ${run.optimizerCount}; activity ${run.activityCount} (${run.activityDurationMs}ms); pricing ${run.pricingCount}`)
    if (run.metricsErrors.length > 0) {
      logger.warn(`[Background Analysis] [${jobId}] CloudWatch errors: ${run.metricsErrors.join('; ')}`)
    }
    if (run.activityErrors.length > 0) {
      logger.warn(`[Background Analysis] [${jobId}] Activity detection errors: ${run.activityErrors.join('; ')}`)
    }

    // Step 5: Save results
    await updateProgress({
      phase: 'saving',
      instancesProcessed: instances.length,
      totalInstances: instances.length,
      metricsErrors: run.metricsErrors.length
    })

    if (result.instances.length > 0) {
      await saveInstanceClassifications(jobId, result.instances)
    }

    // Update in-memory cache too
    const cache = getCacheManager()
    const cacheKey = `utilization:${targetAccountId}:${environment}:${lookbackDays}:true`
    await cache.set(cacheKey, result, { ttl: 1800 })

    // Finalize
    const completedAt = new Date().toISOString()
    await updateProgress(
      { phase: 'done', instancesProcessed: instances.length, totalInstances: instances.length, metricsErrors: run.metricsErrors.length },
      { status: 'completed', completedAt, totalInstances: instances.length, summary: result.summary }
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
