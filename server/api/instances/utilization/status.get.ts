/**
 * GET /api/instances/utilization/status
 * Get the current analysis status and latest results summary for an account.
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync, parseQueryParams } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { lookupAccountOptimized } from '../../../utils/account-lookup-optimized'
import { getLatestAnalysis, getAnalysisJob } from '../../../utils/utilization-persistence'

registerEndpoint('/api/instances/utilization/status', 'GET', {
  summary: 'Get utilization analysis status',
  description: 'Returns the latest analysis summary and any in-progress job status',
  tags: ['Resources'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    { name: 'accountIds', in: 'query', required: true, schema: { type: 'string' } }
  ],
  responses: {
    200: {
      description: 'Analysis status',
      content: { 'application/json': { schema: { type: 'object' } } }
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

  const latest = await getLatestAnalysis(targetAccountId, environment).catch(() => null)

  if (!latest) {
    return sendSuccess(event, {
      hasResults: false,
      latestAnalysis: null,
      currentJob: null
    })
  }

  // If job is running, get current progress from the job record
  let currentJob = null
  if (latest.status === 'running' && latest.triggeredAt) {
    const job = await getAnalysisJob(targetAccountId, environment, latest.triggeredAt).catch(() => null)
    if (job) {
      currentJob = {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        triggeredAt: job.triggeredAt
      }
    }
  }

  return sendSuccess(event, {
    hasResults: latest.status === 'completed' && !!latest.summary,
    latestAnalysis: latest.status === 'completed' ? {
      jobId: latest.jobId,
      completedAt: latest.completedAt,
      summary: latest.summary
    } : null,
    currentJob
  })
}))
