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
import { generateSmartLinks } from '../../../../utils/strands-link-generator'
import { extractFollowUpPrompts } from '../../../../utils/bedrock-prompt-extractor'

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

    // If job is complete, include response and generate smart links/prompts
    if (job.status === 'complete' && job.response) {
      response.response = job.response
      response.metadata = job.metadata
      response.completedAt = job.completedAt

      // Generate smart links and follow-up prompts (async, non-blocking)
      try {
        const [smartLinks, followUpPrompts] = await Promise.all([
          generateSmartLinks(job.query, job.response, { accountId: job.metadata?.accountId }),
          extractFollowUpPrompts(job.response)
        ])

        // Merge embedded links from Strands response with generated smart links
        const embeddedLinks = (job.metadata as any)?.embeddedLinks || []
        response.suggestedLinks = [...embeddedLinks, ...smartLinks]
        response.suggestedPrompts = followUpPrompts
      } catch (linkError: any) {
        logger.warn('[Async Chat API] Failed to generate links/prompts:', linkError.message)
        // Still include embedded links even if generation fails
        const embeddedLinks = (job.metadata as any)?.embeddedLinks || []
        response.suggestedLinks = embeddedLinks
        response.suggestedPrompts = []
      }
    }

    // If job errored, include error message
    if (job.status === 'error') {
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
