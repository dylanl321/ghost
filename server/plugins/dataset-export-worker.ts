import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { isDatasetExportQueueConfigured, receiveDatasetExportJobs } from '../utils/dataset-export-job-queue'
import { processDatasetExportMessage } from '../utils/dataset-export-worker'
import { failStaleDatasetExportJobs } from '../utils/dataset-export-jobs'
import { logger } from '../utils/logger'

export default defineNitroPlugin(() => {
  if (!isDatasetExportQueueConfigured() || process.env.DATASET_EXPORT_WORKER_ENABLED === 'false') return
  const controller = new AbortController()
  let stopping = false
  void (async () => {
    logger.info('[Dataset Export Worker] Started')
    while (!stopping) {
      try {
        const messages = await receiveDatasetExportJobs(controller.signal)
        await Promise.all(messages.map(processDatasetExportMessage))
      } catch (error: any) {
        if (!stopping && error.name !== 'AbortError') await new Promise(resolve => setTimeout(resolve, 2_000))
      }
    }
  })()
  const reconcile = setInterval(() => failStaleDatasetExportJobs().catch(error => logger.error('[Dataset Export Worker] Reconciliation failed', error)), 300_000)
  reconcile.unref?.()
  const stop = () => { stopping = true; controller.abort(); clearInterval(reconcile) }
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
})
