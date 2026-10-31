import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { isDatasetExportQueueConfigured, receiveDatasetExportJobs } from '../utils/dataset-export-job-queue'
import { processDatasetExportMessage } from '../utils/dataset-export-worker'
import { failStaleDatasetExportJobs } from '../utils/dataset-export-jobs'
import { markJobRunning, markJobComplete } from '../utils/job-tracker'
import { logger } from '../utils/logger'

export default defineNitroPlugin((nitroApp) => {
  if (!isDatasetExportQueueConfigured() || process.env.DATASET_EXPORT_WORKER_ENABLED === 'false') return
  const controller = new AbortController()
  let stopping = false
  void (async () => {
    logger.info('[Dataset Export Worker] Started')
    while (!stopping) {
      try {
        const messages = await receiveDatasetExportJobs(controller.signal)
        // Tracked so shutdown waits for in-flight exports (with the scheduler's jobs)
        await Promise.all(messages.map(async (message) => {
          markJobRunning('dataset-export')
          try {
            await processDatasetExportMessage(message)
          } finally {
            markJobComplete('dataset-export')
          }
        }))
      } catch (error: any) {
        if (!stopping && error.name !== 'AbortError') {
          logger.warn('[Dataset Export Worker] Receive or process failed, retrying shortly', error)
          await new Promise(resolve => setTimeout(resolve, 2_000))
        }
      }
    }
  })()
  const reconcile = setInterval(() => failStaleDatasetExportJobs().catch(error => logger.error('[Dataset Export Worker] Reconciliation failed', error)), 300_000)
  reconcile.unref?.()
  // Stop polling on Nitro's graceful shutdown; the scheduler plugin's close
  // hook waits for tracked jobs, including exports still running.
  nitroApp.hooks.hook('close', () => {
    stopping = true
    controller.abort()
    clearInterval(reconcile)
  })
})
