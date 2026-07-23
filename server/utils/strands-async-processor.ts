/**
 * Durable async chat jobs owned by GHOST.
 * SQS provides work ownership while DynamoDB remains the status source of truth.
 */

import { v4 as uuidv4 } from 'uuid'
import { getItem, queryItems, updateItem } from './dynamodb'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import { enqueueChatJob } from './chat-job-queue'
import type { AsyncChatJob } from '../types/strands-async'
import type { ChatThread } from '#shared/types/chat-threads'
import { createQueuedJobWithUserMessage } from './chat-messages'

const JOB_TTL_HOURS = 24

async function getJobsTableConfig() {
  return {
    tableName: await getTableName('asyncChatJobs'),
    environment: await getTableEnvironment('asyncChatJobs'),
    accountId: await getTableAccountId('asyncChatJobs')
  }
}

export async function submitAsyncQuery(
  message: string,
  userId: string,
  thread: ChatThread,
  options: AsyncChatJob['queryOptions'] = {}
): Promise<AsyncChatJob> {
  const jobId = uuidv4()
  const now = new Date().toISOString()
  const job: AsyncChatJob = {
    jobId,
    strandsJobId: null,
    threadId: thread.threadId,
    userId,
    status: 'queued',
    query: message,
    queryOptions: options,
    progress: 'Query queued for execution...',
    progressPercent: 0,
    eventCount: 0,
    response: null,
    errorMessage: null,
    metadata: null,
    createdAt: now,
    lastUpdated: now,
    completedAt: null,
    startedAt: null,
    heartbeatAt: null,
    workerId: null,
    attemptCount: 0,
    cancelRequested: false,
    resultMessageKey: `${now}#job-${jobId}`,
    ttl: Math.floor(Date.now() / 1000) + JOB_TTL_HOURS * 3600
  }

  const config = await getJobsTableConfig()
  await createQueuedJobWithUserMessage(
    thread,
    job,
    options.accountIdentifier ? { accountId: options.accountIdentifier } : undefined
  )

  try {
    await enqueueChatJob(jobId)
  } catch (error: any) {
    const failedAt = new Date().toISOString()
    await updateItem(config.tableName, { jobId }, {
      status: 'error',
      progress: 'Failed to queue query',
      errorMessage: error.message || 'Failed to queue query',
      lastUpdated: failedAt,
      completedAt: failedAt
    }, config.environment, config.accountId)
    return { ...job, status: 'error', errorMessage: error.message, completedAt: failedAt, lastUpdated: failedAt }
  }

  return job
}

export async function getJob(jobId: string, userId?: string): Promise<AsyncChatJob | null> {
  const config = await getJobsTableConfig()
  const job = await getItem<AsyncChatJob>(config.tableName, { jobId }, config.environment, config.accountId)
  if (!job || (userId && job.userId !== userId)) return null
  return job
}

export async function updateJob(jobId: string, updates: Partial<AsyncChatJob>): Promise<AsyncChatJob | null> {
  const config = await getJobsTableConfig()
  return await updateItem(
    config.tableName,
    { jobId },
    { ...updates, lastUpdated: new Date().toISOString() },
    config.environment,
    config.accountId
  ) as AsyncChatJob | null
}

export async function requestJobCancellation(jobId: string, userId: string): Promise<boolean> {
  const job = await getJob(jobId, userId)
  if (!job || ['complete', 'error', 'canceled'].includes(job.status)) return false

  const now = new Date().toISOString()
  await updateJob(jobId, {
    cancelRequested: true,
    status: 'canceled',
    progress: 'Query canceled',
    errorMessage: 'Cancelled by user',
    completedAt: now
  })
  return true
}

export async function pollJobStatus(jobId: string, userId: string) {
  return getJob(jobId, userId)
}

export async function cancelJob(jobId: string, userId: string) {
  return requestJobCancellation(jobId, userId)
}

export async function failStaleRunningJobs(maxAgeMinutes = 20): Promise<number> {
  const config = await getJobsTableConfig()
  const result = await queryItems({
    tableName: config.tableName,
    indexName: 'StatusIndex',
    queryExpression: '#status = :status',
    expressionAttributeNames: { '#status': 'status' },
    expressionAttributeValues: { ':status': 'running' },
    limit: 100
  }, config.environment, config.accountId)
  const cutoff = Date.now() - maxAgeMinutes * 60 * 1000
  let failed = 0

  for (const item of result.items as AsyncChatJob[]) {
    const heartbeat = Date.parse(item.heartbeatAt || item.lastUpdated || item.createdAt)
    if (Number.isFinite(heartbeat) && heartbeat < cutoff) {
      await updateJob(item.jobId, {
        status: 'error',
        progress: 'Query interrupted',
        errorMessage: 'The chat worker stopped before this query completed. Please retry.',
        completedAt: new Date().toISOString()
      })
      failed++
    }
  }
  return failed
}
