/**
 * GET /api/instances/utilization/results
 * Get paginated instance classification results from a completed analysis.
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { getInstanceClassifications } from '../../../utils/utilization-persistence'
import { lookupAccountOptimized } from '../../../utils/account-lookup-optimized'

registerEndpoint('/api/instances/utilization/results', 'GET', {
  summary: 'Get paginated utilization results',
  description: 'Returns instance classifications from a completed analysis job',
  tags: ['Resources'],
  parameters: [
    { name: 'jobId', in: 'query', required: true, schema: { type: 'string' } },
    { name: 'classification', in: 'query', required: false, schema: { type: 'string' } },
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
    { name: 'nextToken', in: 'query', required: false, schema: { type: 'string' } }
  ],
  responses: {
    200: {
      description: 'Paginated instance results',
      content: { 'application/json': { schema: { type: 'object' } } }
    }
  }
})

// Must match UtilizationClassification in instance-utilization-classifier
const VALID_CLASSIFICATIONS = ['over-provisioned', 'under-provisioned', 'optimized', 'no-data']

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)

  const jobId = query.jobId as string
  if (!jobId) {
    return errors.badRequest(event, 'jobId parameter is required')
  }

  // Validate jobId format (expected: accountId-timestamp)
  if (!/^\d{12}-\d+$/.test(jobId)) {
    return errors.badRequest(event, 'Invalid jobId format')
  }

  // Verify the caller has access to this account by extracting accountId from jobId
  const jobAccountId = jobId.split('-')[0]
  try {
    await lookupAccountOptimized(event, jobAccountId, { includeDecommissioned: false })
  } catch {
    return errors.forbidden(event, 'Access denied to this account')
  }

  const classification = query.classification as string | undefined
  if (classification && !VALID_CLASSIFICATIONS.includes(classification)) {
    return errors.badRequest(event, `Invalid classification. Must be one of: ${VALID_CLASSIFICATIONS.join(', ')}`)
  }

  const limit = Math.min(Math.max(parseInt(query.limit as string) || 50, 1), 200)
  const nextToken = query.nextToken as string | undefined
  if (nextToken && !isTokenForJob(nextToken, jobId)) {
    return errors.badRequest(event, 'Invalid nextToken')
  }

  const result = await getInstanceClassifications(jobId, { classification, limit, nextToken })

  return sendSuccess(event, {
    instances: result.items,
    nextToken: result.nextToken,
    count: result.items.length
  })
}))

/** A pagination token is a base64 DynamoDB key; it must belong to this job's partition. */
function isTokenForJob(token: string, jobId: string): boolean {
  try {
    const key = JSON.parse(Buffer.from(token, 'base64').toString())
    return key?.PK?.S === `JOB#${jobId}`
  } catch {
    return false
  }
}
