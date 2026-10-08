import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { isChatQueueConfigured, receiveChatJobs } from '../utils/chat-job-queue'
import { processChatQueueMessage } from '../utils/chat-worker'
import { failStaleRunningJobs } from '../utils/strands-async-processor'
import { logger } from '../utils/logger'
import { computeReceiveRetryDelay } from '../utils/receive-backoff'

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = error.code
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined
}

export default defineNitroPlugin(() => {
  if (!isChatQueueConfigured() || process.env.CHAT_WORKER_ENABLED === 'false') return

  const controller = new AbortController()
  let stopping = false

  const run = async () => {
    logger.info('[Chat Worker] Started')
    let failureAttempt = 0
    while (!stopping) {
      try {
        const messages = await receiveChatJobs(controller.signal)
        failureAttempt = 0 // reset backoff after a successful receive
        await Promise.all(messages.map(processChatQueueMessage))
      } catch (error: unknown) {
        const errorName = error instanceof Error ? error.name : 'UnknownError'
        if (stopping || errorName === 'AbortError') continue
        failureAttempt += 1
        const retryDelayMs = computeReceiveRetryDelay(failureAttempt)
        // Compact structured fields only — avoid dumping full stacks for
        // transient ECONNRESET/ETIMEDOUT receive-loop failures.
        logger.error('[Chat Worker] Receive loop failed', {
          component: 'chat-worker',
          operation: 'receiveChatJobs',
          errorName,
          errorCode: getErrorCode(error),
          attempt: failureAttempt,
          retryDelayMs
        })
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
  }

  void run()
  const reconcileTimer = setInterval(() => {
    failStaleRunningJobs().then(count => {
      if (count > 0) logger.warn(`[Chat Worker] Marked ${count} stale job(s) failed`)
    }).catch(error => logger.error('[Chat Worker] Stale job reconciliation failed', error))
  }, 5 * 60 * 1000)
  reconcileTimer.unref?.()
  const stop = () => {
    stopping = true
    controller.abort()
    clearInterval(reconcileTimer)
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
})
