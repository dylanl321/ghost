/**
 * Cancel Async Job
 * POST /api/strands/chat/async/[jobId]/cancel
 *
 * Cancels a running async chat job
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { logger } from '../../../../../utils/logger'
import { cancelJob } from '../../../../../utils/strands-async-processor'

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

    logger.info('[Async Chat API] Cancelling job', { userId, jobId })

    // Cancel the job
    const canceled = await cancelJob(jobId, userId)

    if (!canceled) {
      return {
        success: false,
        error: 'Job not found, already complete, or not owned by user'
      }
    }

    logger.info('[Async Chat API] Job cancelled successfully', { jobId })

    return {
      success: true,
      jobId,
      message: 'Job cancelled successfully'
    }

  } catch (error: any) {
    logger.error('[Async Chat API] Error cancelling job:', error)

    return {
      success: false,
      error: error.message || 'Failed to cancel job'
    }
  }
})
