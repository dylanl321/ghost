import os from 'node:os'
import type { Message } from '@aws-sdk/client-sqs'
import { generateSmartLinks } from './strands-link-generator'
import { extractFollowUpPrompts } from './bedrock-prompt-extractor'
import { appendThreadMessage } from './chat-messages'
import { normalizeStrandsDisambiguation } from './strands-disambiguation'
import { getThreadById } from './chat-threads'
import { deleteChatJobMessage, extendChatJobVisibility, releaseChatJobMessage } from './chat-job-queue'
import { getJob, updateJob } from './strands-async-processor'
import { getStrandsConfig } from './strands-client'
import { sendUserNotification } from './notification-service'
import { logger } from './logger'

const workerId = `${os.hostname()}-${process.pid}`

interface StreamEvent {
  type: string
  data: any
}

async function* parseSSE(response: Response): AsyncGenerator<StreamEvent> {
  if (!response.body) throw new Error('Strands returned an empty stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''

    for (const block of blocks) {
      if (!block || block.startsWith(':')) continue
      let type = 'message'
      const dataLines: string[] = []
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) type = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      if (dataLines.length > 0) yield { type, data: JSON.parse(dataLines.join('\n')) }
    }
    if (done) break
  }
}

async function persistAssistantMessage(jobId: string, content: string, metadata: any, isError = false) {
  const job = await getJob(jobId)
  if (!job) throw new Error(`Job ${jobId} disappeared before completion`)
  const thread = await getThreadById(job.threadId, job.userId)
  if (!thread) throw new Error(`Thread ${job.threadId} no longer exists`)

  const suggestedLinks = isError ? [] : await generateSmartLinks(job.query, content, { accountId: metadata?.accountId })
  const suggestedPrompts = isError ? [] : await extractFollowUpPrompts(content)
  await appendThreadMessage(thread, {
    role: 'assistant',
    content,
    metadata: { ...metadata, ...(isError ? { error: true } : {}) },
    suggestedLinks,
    suggestedPrompts,
    jobId
  }, { messageKey: job.resultMessageKey })

  return { suggestedLinks, suggestedPrompts }
}

async function markFailed(jobId: string, message: string, receiveCount: number): Promise<boolean> {
  if (receiveCount < 2) {
    await updateJob(jobId, {
      status: 'queued',
      progress: 'Retrying query...',
      progressPercent: 0,
      errorMessage: message,
      workerId: null,
      heartbeatAt: null
    })
    return true
  }

  const completedAt = new Date().toISOString()
  await updateJob(jobId, {
    status: 'error',
    progress: 'Query failed',
    errorMessage: message,
    completedAt
  })
  try {
    await persistAssistantMessage(jobId, `Query failed: ${message}`, { errorType: 'worker' }, true)
  } catch (persistError) {
    logger.error(`[Chat Worker] Failed to persist terminal error message for ${jobId}`, persistError)
  }
  return false
}

export async function processChatQueueMessage(message: Message): Promise<void> {
  if (!message.Body || !message.ReceiptHandle) return
  const { jobId } = JSON.parse(message.Body) as { jobId?: string }
  if (!jobId) {
    await deleteChatJobMessage(message.ReceiptHandle)
    return
  }

  const receiveCount = Number(message.Attributes?.ApproximateReceiveCount || 1)
  const job = await getJob(jobId)
  if (!job || ['complete', 'error', 'canceled'].includes(job.status)) {
    await deleteChatJobMessage(message.ReceiptHandle)
    return
  }

  const controller = new AbortController()
  const visibilityTimer = setInterval(() => {
    extendChatJobVisibility(message.ReceiptHandle!).catch(error => logger.warn('[Chat Worker] Visibility extension failed', error))
  }, 5 * 60 * 1000)
  visibilityTimer.unref?.()
  const cancellationTimer = setInterval(() => {
    getJob(jobId).then(current => {
      if (!current || current.cancelRequested || current.status === 'canceled') controller.abort()
    }).catch(error => logger.warn('[Chat Worker] Cancellation check failed', error))
  }, 2000)
  cancellationTimer.unref?.()
  const heartbeatTimer = setInterval(() => {
    updateJob(jobId, { heartbeatAt: new Date().toISOString() })
      .catch(error => logger.warn('[Chat Worker] Heartbeat update failed', error))
  }, 30 * 1000)
  heartbeatTimer.unref?.()

  try {
    const startedAt = new Date().toISOString()
    await updateJob(jobId, {
      status: 'running',
      progress: 'Connecting to AI agent...',
      progressPercent: 5,
      startedAt,
      heartbeatAt: startedAt,
      workerId,
      attemptCount: receiveCount,
      errorMessage: null
    })

    const config = await getStrandsConfig()
    const response = await fetch(`${config.serverUrl}/query/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: job.queryOptions.userContext
          ? `${job.queryOptions.userContext}\n\nUser query: ${job.query}`
          : job.query,
        account_identifier: job.queryOptions.accountIdentifier,
        conversationHistory: job.queryOptions.conversationHistory,
        timezone: job.queryOptions.timezone,
        region: job.queryOptions.region,
        prefer_govcloud: job.queryOptions.preferGovcloud,
        sessionId: job.jobId
      }),
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`Strands stream failed: HTTP ${response.status}`)

    let responseText = ''
    let metadata: any = null
    let disambiguation: any = null
    const tools = new Set<string>()
    let eventCount = 0
    let lastWrite = 0
    let currentStep = 'AI is thinking...'
    let progressPercent = 20

    for await (const event of parseSSE(response)) {
      eventCount++
      const current = await getJob(jobId)
      if (!current || current.cancelRequested || current.status === 'canceled') {
        controller.abort()
        await deleteChatJobMessage(message.ReceiptHandle)
        return
      }

      if (event.type === 'status') {
        currentStep = event.data.message || currentStep
        progressPercent = Math.max(progressPercent, 20)
      } else if (event.type === 'tool_call') {
        if (event.data.tool_name) tools.add(event.data.tool_name)
        currentStep = event.data.message || `Calling ${event.data.tool_name}`
        progressPercent = Math.min(30 + tools.size * 10, 80)
      } else if (event.type === 'response') {
        responseText = event.data.accumulated || `${responseText}${event.data.delta || ''}`
        currentStep = 'Generating response...'
        progressPercent = 90
      } else if (event.type === 'complete') {
        responseText = event.data.response || responseText
        metadata = event.data.metadata || metadata
      } else if (event.type === 'disambiguation') {
        disambiguation = normalizeStrandsDisambiguation(event.data, job.jobId)
        currentStep = 'Waiting for account selection'
      } else if (event.type === 'error') {
        throw new Error(event.data.message || 'Agent query failed')
      }

      if (Date.now() - lastWrite >= 2000) {
        lastWrite = Date.now()
        await updateJob(jobId, {
          progress: currentStep,
          progressPercent,
          eventCount,
          toolsCalled: [...tools],
          heartbeatAt: new Date().toISOString()
        })
      }
    }

    if (disambiguation) {
      const completedAt = new Date().toISOString()
      await updateJob(jobId, {
        status: 'waiting_for_input',
        progress: 'Account selection required',
        errorMessage: null,
        disambiguation,
        completedAt,
        heartbeatAt: completedAt
      })
      await deleteChatJobMessage(message.ReceiptHandle)
      return
    }

    if (!responseText.trim()) throw new Error('The AI agent returned an empty response')
    const enrichment = await persistAssistantMessage(jobId, responseText, metadata || {})
    const completedAt = new Date().toISOString()
    await updateJob(jobId, {
      status: 'complete',
      progress: 'Query completed',
      progressPercent: 100,
      eventCount,
      response: responseText,
      metadata,
      suggestedLinks: enrichment.suggestedLinks,
      suggestedPrompts: enrichment.suggestedPrompts,
      toolsCalled: [...tools],
      completedAt,
      heartbeatAt: completedAt
    })
    await deleteChatJobMessage(message.ReceiptHandle)

    sendUserNotification({
      userId: job.userId,
      category: 'CHAT_COMPLETE',
      title: 'Your AI analysis is ready',
      body: `Analysis completed with ${tools.size} tool(s) called`,
      severity: 'info',
      actionUrl: `/chat?thread=${job.threadId}`,
      actionLabel: 'View Result',
      metadata: { jobId, threadId: job.threadId, ...enrichment },
      dedupeKey: `chat-job-${jobId}`
    }).catch(error => logger.warn('[Chat Worker] Completion notification failed', error))
  } catch (error: any) {
    const latest = await getJob(jobId)
    if (latest?.status === 'canceled' || latest?.cancelRequested) {
      await deleteChatJobMessage(message.ReceiptHandle)
      return
    }
    logger.error(`[Chat Worker] Job ${jobId} failed on attempt ${receiveCount}`, error)
    const shouldRetry = await markFailed(jobId, error.message || 'Query failed', receiveCount)
    if (shouldRetry) await releaseChatJobMessage(message.ReceiptHandle)
  } finally {
    clearInterval(visibilityTimer)
    clearInterval(cancellationTimer)
    clearInterval(heartbeatTimer)
    controller.abort()
  }
}
