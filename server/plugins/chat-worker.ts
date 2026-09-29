import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { isChatQueueConfigured, receiveChatJobs } from '../utils/chat-job-queue'
import { processChatQueueMessage } from '../utils/chat-worker'
import { failStaleRunningJobs } from '../utils/strands-async-processor'
import { computeReceiveBackoffMs } from '../utils/chat-worker-backoff'
import { logger } from '../utils/logger'

export default defineNitroPlugin(() => {
  if (!isChatQueueConfigured() || process.env.CHAT_WORKER_ENABLED === 'false') return

  const controller = new AbortController()
  let stopping = false

  const run = async () => {
    logger.info('[Chat Worker] Started')
    let consecutiveFailures = 0
    while (!stopping) {
      try {
        const messages = await receiveChatJobs(controller.signal)
        // A successful receive (including an empty one) clears the backoff.
        consecutiveFailures = 0
        await Promise.all(messages.map(processChatQueueMessage))
      } catch (error: any) {
        if (!stopping && error.name !== 'AbortError') {
          consecutiveFailures += 1
          const retryDelayMs = computeReceiveBackoffMs(consecutiveFailures)
          logger.error('[Chat Worker] Receive loop failed', {
            consecutiveFailures,
            retryDelayMs,
            errorName: error?.name,
            errorCode: error?.code,
          })
          await new Promise(resolve => setTimeout(resolve, retryDelayMs))
        }
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
