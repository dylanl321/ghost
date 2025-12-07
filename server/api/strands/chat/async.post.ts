/**
 * Submit Async Query to Strands
 * POST /api/strands/chat/async
 *
 * Submits a query to Strands using async polling approach
 * Returns jobId immediately for client to poll
 */

import { defineEventHandler, readBody, getHeaders } from 'h3'
import { logger } from '../../../utils/logger'
import { submitAsyncQuery } from '../../../utils/strands-async-processor'
import { buildUserContextForAI } from '../../../utils/user-context-builder'

export default defineEventHandler(async (event) => {
  try {
    // Get user from session - try multiple paths for compatibility
    const userId = event.context.user?.email ||
      event.context.auth?.user?.email ||
      event.context.oidc?.user?.email

    if (!userId) {
      throw new Error('Unauthorized: No user session found')
    }
    const body = await readBody(event)

    // Validate required fields
    if (!body.message || typeof body.message !== 'string') {
      return {
        success: false,
        error: 'Message is required'
      }
    }

    logger.info('[Async Chat API] Submitting async query', {
      userId,
      message: body.message.substring(0, 100) + (body.message.length > 100 ? '...' : ''),
      accountIdentifier: body.accountIdentifier
    })

    // Build user context (enclave, permissions, timezone)
    const userContext = await buildUserContextForAI(event)

    // Extract timezone from body, headers, or user context
    const timezone = body.timezone ||
      getHeaders(event)['x-timezone'] ||
      userContext?.timezone ||
      'America/New_York'

    // Submit async query
    const job = await submitAsyncQuery(
      body.message,
      userId,
      {
        accountIdentifier: body.accountIdentifier,
        conversationHistory: body.conversationHistory,
        timezone,
        region: body.region,
        preferGovcloud: body.preferGovcloud
      }
    )

    // Return job details
    return {
      success: true,
      jobId: job.jobId,
      status: job.status,
      message: job.status === 'queued'
        ? `Query submitted successfully. Poll GET /api/strands/chat/async/${job.jobId} for progress.`
        : job.errorMessage || 'Unknown status',
      pollUrl: `/api/strands/chat/async/${job.jobId}`,
      estimatedTimeSeconds: 60 // Estimate for typical queries
    }

  } catch (error: any) {
    logger.error('[Async Chat API] Error submitting async query:', error)

    return {
      success: false,
      error: error.message || 'Failed to submit query',
      details: error.details
    }
  }
})
