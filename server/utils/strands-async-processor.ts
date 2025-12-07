/**
 * Strands Async Job Processor
 * Handles async polling queries to Strands API following the recommended approach
 * Stores job state in DynamoDB and processes via polling instead of SSE
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from './logger'
import { getStrandsConfig, StrandsClientError } from './strands-client'
import { putItem, getItem, updateItem } from './dynamodb'
import type {
  AsyncChatJob,
  AsyncChatJobStatus,
  StrandsAsyncSubmitRequest,
  StrandsAsyncStatusResponse
} from '../types/strands-async'

const ASYNC_JOBS_TABLE = process.env.AWS_ASYNC_JOBS_TABLE_NAME || 'ghost-async-chat-jobs'
const JOB_TTL_HOURS = 24

/**
 * Submit an async query to Strands
 * Creates a job record in DynamoDB and returns jobId immediately
 */
export async function submitAsyncQuery(
  message: string,
  userId: string,
  options?: {
    accountIdentifier?: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string | object | any[] }>
    timezone?: string
    region?: string
    preferGovcloud?: boolean
  }
): Promise<AsyncChatJob> {
  const jobId = uuidv4()
  const now = new Date().toISOString()
  const ttl = Math.floor(Date.now() / 1000) + (JOB_TTL_HOURS * 3600)

  const config = await getStrandsConfig()
  const strandsUrl = `${config.serverUrl}/query/async`

  // Build request payload
  const request: StrandsAsyncSubmitRequest = {
    message,
    account_identifier: options?.accountIdentifier,
    region: options?.region,
    prefer_govcloud: options?.preferGovcloud,
    timezone: options?.timezone,
    conversationHistory: options?.conversationHistory
  }

  // Remove undefined fields
  Object.keys(request).forEach(key => {
    if (request[key as keyof StrandsAsyncSubmitRequest] === undefined) {
      delete request[key as keyof StrandsAsyncSubmitRequest]
    }
  })

  logger.info('[Async Processor] Submitting async query', {
    jobId,
    userId,
    message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
    accountIdentifier: options?.accountIdentifier
  })

  try {
    // Submit to Strands async endpoint
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout)

    const response = await fetch(strandsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new StrandsClientError(
        `Failed to submit async query: ${response.statusText}`,
        `HTTP_${response.status}`,
        response.status,
        errorText
      )
    }

    const strandsResponse = await response.json()
    const strandsJobId = strandsResponse.jobId

    if (!strandsJobId) {
      throw new StrandsClientError(
        'Strands did not return a jobId',
        'MISSING_JOB_ID'
      )
    }

    // Create job record in DynamoDB
    const job: AsyncChatJob = {
      jobId,
      strandsJobId,
      userId,
      status: 'queued',
      query: message,
      queryOptions: options || {},
      progress: 'Query queued for execution...',
      progressPercent: 0,
      eventCount: 0,
      response: null,
      errorMessage: null,
      metadata: null,
      createdAt: now,
      lastUpdated: now,
      completedAt: null,
      ttl
    }

    await putItem(ASYNC_JOBS_TABLE, job)

    logger.info('[Async Processor] Job created successfully', {
      jobId,
      strandsJobId,
      status: job.status
    })

    return job

  } catch (error: any) {
    logger.error('[Async Processor] Failed to submit async query:', error)

    // Create error job record
    const job: AsyncChatJob = {
      jobId,
      strandsJobId: null,
      userId,
      status: 'error',
      query: message,
      queryOptions: options || {},
      progress: 'Failed to submit query',
      progressPercent: 0,
      eventCount: 0,
      response: null,
      errorMessage: error.message || 'Unknown error occurred',
      metadata: null,
      createdAt: now,
      lastUpdated: now,
      completedAt: now,
      ttl
    }

    await putItem(ASYNC_JOBS_TABLE, job)

    return job
  }
}

/**
 * Poll Strands for job status
 * Updates DynamoDB with latest status
 */
export async function pollJobStatus(jobId: string, userId: string): Promise<AsyncChatJob | null> {
  logger.debug('[Async Processor] Polling job status', { jobId, userId })

  // Get job from DynamoDB
  const job = await getItem<AsyncChatJob>(ASYNC_JOBS_TABLE, { jobId })

  if (!job) {
    logger.warn('[Async Processor] Job not found', { jobId })
    return null
  }

  // Verify user owns this job
  if (job.userId !== userId) {
    logger.warn('[Async Processor] User does not own this job', { jobId, userId, jobUserId: job.userId })
    return null
  }

  // If job already complete or errored, return cached result
  if (job.status === 'complete' || job.status === 'error') {
    logger.debug('[Async Processor] Job already finished, returning cached result', {
      jobId,
      status: job.status
    })
    return job
  }

  // Poll Strands for updated status
  if (!job.strandsJobId) {
    logger.error('[Async Processor] Job has no strandsJobId', { jobId })
    return job
  }

  try {
    const config = await getStrandsConfig()
    const statusUrl = `${config.serverUrl}/query/status/${job.strandsJobId}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout for status checks

    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new StrandsClientError(
        `Failed to poll job status: ${response.statusText}`,
        `HTTP_${response.status}`,
        response.status
      )
    }

    const statusData: StrandsAsyncStatusResponse = await response.json()

    // Map Strands status to our status
    let newStatus: AsyncChatJobStatus
    if (statusData.status === 'complete') {
      newStatus = 'complete'
    } else if (statusData.status === 'error') {
      newStatus = 'error'
    } else if (statusData.status === 'running') {
      newStatus = 'running'
    } else {
      newStatus = 'queued'
    }

    const now = new Date().toISOString()

    // Update job in DynamoDB
    const updatedJob: AsyncChatJob = {
      ...job,
      status: newStatus,
      progress: statusData.currentStep || job.progress,
      progressPercent: statusData.progressPercent || job.progressPercent,
      eventCount: statusData.eventCount || job.eventCount,
      response: statusData.response || job.response,
      errorMessage: statusData.errorMessage || job.errorMessage,
      metadata: statusData.metadata || job.metadata,
      lastUpdated: now,
      completedAt: (newStatus === 'complete' || newStatus === 'error') ? now : job.completedAt
    }

    await updateItem(ASYNC_JOBS_TABLE, { jobId }, updatedJob)

    logger.debug('[Async Processor] Job status updated', {
      jobId,
      status: newStatus,
      progress: updatedJob.progress,
      progressPercent: updatedJob.progressPercent
    })

    return updatedJob

  } catch (error: any) {
    logger.error('[Async Processor] Failed to poll job status:', {
      jobId,
      error: error.message
    })

    // Don't update job to error state if polling fails - might be temporary
    // Just return the current job state
    return job
  }
}

/**
 * Get job by ID (no polling, just returns cached state)
 */
export async function getJob(jobId: string, userId: string): Promise<AsyncChatJob | null> {
  const job = await getItem<AsyncChatJob>(ASYNC_JOBS_TABLE, { jobId })

  if (!job) {
    return null
  }

  // Verify user owns this job
  if (job.userId !== userId) {
    logger.warn('[Async Processor] User does not own this job', { jobId, userId, jobUserId: job.userId })
    return null
  }

  return job
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string, userId: string): Promise<boolean> {
  const job = await getJob(jobId, userId)

  if (!job) {
    return false
  }

  // Only cancel if not already complete/errored
  if (job.status === 'complete' || job.status === 'error') {
    return false
  }

  const now = new Date().toISOString()

  await updateItem(ASYNC_JOBS_TABLE, { jobId }, {
    status: 'error',
    errorMessage: 'Cancelled by user',
    lastUpdated: now,
    completedAt: now
  })

  logger.info('[Async Processor] Job cancelled', { jobId, userId })

  return true
}
