/**
 * Strands Async Job Processor
 * Handles async polling queries to Strands API following the recommended approach
 * Stores job state in DynamoDB and processes via polling instead of SSE
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from './logger'
import { getStrandsConfig, StrandsClientError } from './strands-client'
import { putItem, getItem, updateItem } from './dynamodb'
import { sendUserNotification } from './notification-service'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import type {
  AsyncChatJob,
  AsyncChatJobStatus,
  StrandsAsyncSubmitRequest,
  StrandsAsyncStatusResponse
} from '../types/strands-async'

const JOB_TTL_HOURS = 24

/**
 * Get async jobs table configuration
 */
async function getJobsTableConfig() {
  const tableName = await getTableName('asyncChatJobs')
  const environment = await getTableEnvironment('asyncChatJobs')
  const accountId = await getTableAccountId('asyncChatJobs')
  return { tableName, environment, accountId }
}

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

    const tableConfig = await getJobsTableConfig()
    await putItem(tableConfig.tableName, job, tableConfig.environment, tableConfig.accountId)

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

    const tableConfig = await getJobsTableConfig()
    await putItem(tableConfig.tableName, job, tableConfig.environment, tableConfig.accountId)

    return job
  }
}

/**
 * Poll Strands for job status
 * Updates DynamoDB with latest status
 */
export async function pollJobStatus(jobId: string, userId: string): Promise<AsyncChatJob | null> {
  logger.debug('[Async Processor] Polling job status', { jobId, userId })

  const tableConfig = await getJobsTableConfig()

  // Get job from DynamoDB
  const job = await getItem<AsyncChatJob>(tableConfig.tableName, { jobId }, tableConfig.environment, tableConfig.accountId)

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

    const statusData: any = await response.json()

    // Log FULL Strands response for debugging
    logger.info('[Async Processor] Full Strands status response', {
      jobId,
      strandsJobId: job.strandsJobId,
      fullResponse: JSON.stringify(statusData).substring(0, 1000)
    })

    // Extract response text - try multiple field names
    let responseText = statusData.response || statusData.result || statusData.output || null
    let embeddedLinks: any[] = []

    // Extract and remove embedded JSON links from response
    if (responseText && typeof responseText === 'string') {
      // Pattern: lines starting with bullet followed by JSON object
      // Support multiple bullet characters: •, -, *, and also handle whitespace
      const lines = responseText.split('\n')
      const cleanedLines: string[] = []

      for (const line of lines) {
        const trimmed = line.trim()
        // Check if line starts with bullet (•, -, *) and contains JSON
        const startsWithBullet = /^[•\-*]\s*\{/.test(trimmed)

        if (startsWithBullet && trimmed.includes('}')) {
          try {
            // Extract JSON part (after the bullet and any whitespace)
            const jsonStr = trimmed.replace(/^[•\-*]\s*/, '')
            const linkObj = JSON.parse(jsonStr)

            // Validate it looks like a link object (has url field)
            if (linkObj.url || linkObj.type || linkObj.label) {
              embeddedLinks.push(linkObj)
              logger.debug('[Async Processor] Extracted embedded link:', {
                label: linkObj.label,
                type: linkObj.type
              })
              // Don't add this line to cleanedLines - we're removing it
              continue
            } else {
              // Not a link object, keep the line
              cleanedLines.push(line)
            }
          } catch (parseError) {
            // Not valid JSON, keep the line
            logger.debug('[Async Processor] Failed to parse potential link line:', {
              line: trimmed.substring(0, 100)
            })
            cleanedLines.push(line)
          }
        } else {
          cleanedLines.push(line)
        }
      }

      responseText = cleanedLines.join('\n')
    }

    logger.debug('[Async Processor] Response extraction', {
      hasResponse: !!statusData.response,
      hasResult: !!statusData.result,
      hasOutput: !!statusData.output,
      extractedLength: responseText?.length || 0,
      embeddedLinksCount: embeddedLinks.length
    })

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

    // Build update object with only the fields to update (excluding keys)
    // Merge embedded links into metadata if they exist
    const updatedMetadata = statusData.metadata || job.metadata || {}
    if (embeddedLinks.length > 0) {
      updatedMetadata.embeddedLinks = embeddedLinks
    }

    const updates: Partial<AsyncChatJob> = {
      status: newStatus,
      progress: statusData.currentStep || job.progress,
      progressPercent: statusData.progressPercent || job.progressPercent,
      eventCount: statusData.eventCount || job.eventCount,
      response: responseText || job.response,  // Use cleaned responseText
      errorMessage: statusData.errorMessage || job.errorMessage,
      metadata: updatedMetadata,
      lastUpdated: now,
      completedAt: (newStatus === 'complete' || newStatus === 'error') ? now : job.completedAt,
      toolsCalled: statusData.toolsCalled || job.toolsCalled
    }

    // Update job in DynamoDB
    await updateItem(tableConfig.tableName, { jobId }, updates, tableConfig.environment, tableConfig.accountId)

    // Return updated job object (merge original with updates, keeping all required fields)
    const updatedJob: AsyncChatJob = {
      jobId: job.jobId,
      strandsJobId: job.strandsJobId,
      userId: job.userId,
      query: job.query,
      queryOptions: job.queryOptions,
      createdAt: job.createdAt,
      ttl: job.ttl,
      status: newStatus,
      progress: updates.progress!,
      progressPercent: updates.progressPercent!,
      eventCount: updates.eventCount!,
      response: updates.response!,
      errorMessage: updates.errorMessage!,
      metadata: updates.metadata!,
      lastUpdated: now,
      completedAt: updates.completedAt!,
      toolsCalled: updates.toolsCalled
    }

    logger.debug('[Async Processor] Job status updated', {
      jobId,
      status: newStatus,
      progress: updatedJob.progress,
      progressPercent: updatedJob.progressPercent
    })

    // Send notification on terminal status transition (not on cached result returns)
    if ((newStatus === 'complete' || newStatus === 'error')
        && job.status !== 'complete' && job.status !== 'error') {
      const isComplete = newStatus === 'complete'
      sendUserNotification({
        userId: job.userId,
        category: 'CHAT_COMPLETE',
        title: isComplete ? 'Your AI analysis is ready' : 'AI analysis failed',
        body: isComplete
          ? `Analysis completed with ${updatedJob.toolsCalled?.length || 0} tool(s) called`
          : `Error: ${updatedJob.errorMessage || 'Unknown error'}`,
        severity: isComplete ? 'info' : 'warning',
        actionUrl: '/chat',
        actionLabel: 'View Result',
        metadata: { jobId: job.jobId, toolsCalled: updatedJob.toolsCalled },
        dedupeKey: `chat-job-${job.jobId}`
      }).catch(err => logger.warn('[Async Processor] Failed to send completion notification:', err))
    }

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
  const tableConfig = await getJobsTableConfig()
  const result = await getItem(tableConfig.tableName, { jobId }, tableConfig.environment, tableConfig.accountId)

  if (!result) {
    return null
  }

  const job = result as AsyncChatJob

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

  const tableConfig = await getJobsTableConfig()
  const now = new Date().toISOString()

  await updateItem(tableConfig.tableName, { jobId }, {
    status: 'error',
    errorMessage: 'Cancelled by user',
    lastUpdated: now,
    completedAt: now
  }, tableConfig.environment, tableConfig.accountId)

  logger.info('[Async Processor] Job cancelled', { jobId, userId })

  return true
}
