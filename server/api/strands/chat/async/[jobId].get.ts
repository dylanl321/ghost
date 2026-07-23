/**
 * Poll Async Job Status
 * GET /api/strands/chat/async/[jobId]
 *
 * Polls Strands for job status and updates DynamoDB cache
 * Returns current status, progress, and result when complete
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { logger } from '../../../../utils/logger'
import { pollJobStatus } from '../../../../utils/strands-async-processor'

export default defineEventHandler(async (event) => {
  try {
    // Get user from session - try multiple paths for compatibility
    const userId = event.context.user?.email ||
                   event.context.auth?.user?.email ||
                   event.context.oidc?.user?.email

    if (!userId) {
      return {
        success: false,
        error: 'Unauthorized: No user session found'
      }
    }
    const jobId = getRouterParam(event, 'jobId')

    if (!jobId) {
      return {
        success: false,
        error: 'Job ID is required'
      }
    }

    logger.debug('[Async Chat API] Polling job status', { userId, jobId })

    // Poll Strands for latest status
    const job = await pollJobStatus(jobId, userId)

    if (!job) {
      return {
        success: false,
        error: 'Job not found or expired'
      }
    }

    // Build response based on job status
    const response: any = {
      success: true,
      jobId: job.jobId,
      status: job.status,
      currentStep: job.progress,
      progressPercent: job.progressPercent,
      eventCount: job.eventCount,
      toolsCalled: job.toolsCalled || [],
      createdAt: job.createdAt,
      lastUpdated: job.lastUpdated
    }

    // The worker already persisted and enriched the assistant message.
    if (job.status === 'complete' && job.response) {
      response.response = job.response
      response.metadata = job.metadata
      response.completedAt = job.completedAt
      response.suggestedLinks = job.suggestedLinks || []
      response.suggestedPrompts = job.suggestedPrompts || []

    }

    // If job errored, include error message
    if (job.status === 'error' || job.status === 'canceled') {
      response.errorMessage = job.errorMessage
      response.completedAt = job.completedAt
    }

    return response

  } catch (error: any) {
    logger.error('[Async Chat API] Error polling job status:', error)

    return {
      success: false,
      error: error.message || 'Failed to poll job status'
    }
  }
})
