import type { Message } from '@aws-sdk/client-sqs'
import { generateDatasetReport } from './dataset-report-generator'
import { deleteFromS3, uploadToS3 } from './s3-storage'
import { deleteDatasetExportMessage, extendDatasetExportVisibility, releaseDatasetExportMessage } from './dataset-export-job-queue'
import { getDatasetExportJob, updateDatasetExportJob } from './dataset-export-jobs'
import { logger } from './logger'
import { createEntraServiceEvent } from './entra/service-session'

export async function processDatasetExportMessage(message: Message): Promise<void> {
  if (!message.Body || !message.ReceiptHandle) return
  const { jobId } = JSON.parse(message.Body) as { jobId?: string }
  if (!jobId) return deleteDatasetExportMessage(message.ReceiptHandle)
  const receiveCount = Number(message.Attributes?.ApproximateReceiveCount || 1)
  const initial = await getDatasetExportJob(jobId)
  if (!initial || ['complete', 'error', 'canceled'].includes(initial.status)) return deleteDatasetExportMessage(message.ReceiptHandle)

  const controller = new AbortController()
  const heartbeat = setInterval(() => updateDatasetExportJob(jobId, { heartbeatAt: new Date().toISOString() }).catch(() => undefined), 30_000)
  const cancellation = setInterval(() => getDatasetExportJob(jobId).then(job => {
    if (!job || job.cancelRequested || job.status === 'canceled') controller.abort(new Error('Export canceled'))
  }).catch(() => undefined), 2_000)
  const visibility = setInterval(() => extendDatasetExportVisibility(message.ReceiptHandle!).catch(() => undefined), 300_000)
  heartbeat.unref?.(); cancellation.unref?.(); visibility.unref?.()
  let s3Key: string | undefined

  try {
    const startedAt = new Date().toISOString()
    await updateDatasetExportJob(jobId, { status: 'running', phase: 'Collecting datasets', progressPercent: 10, startedAt, heartbeatAt: startedAt, errorMessage: undefined })
    const entraEvent = initial.reportConfig.datasets.entraUsers?.enabled ? await createEntraServiceEvent() : undefined
    const result = await generateDatasetReport(initial.reportConfig, entraEvent, {
      mode: 'export', signal: controller.signal,
      onProgress: async progress => { await updateDatasetExportJob(jobId, { phase: `Collecting ${progress.phase}`, progressPercent: 35 }) },
      onAthenaQuery: async queryId => { await updateDatasetExportJob(jobId, { activeAthenaQueryIds: queryId ? [queryId] : [] }) }
    })
    if (controller.signal.aborted) throw controller.signal.reason
    if (!result.success || !result.buffer || !result.filename || !result.mimeType) throw new Error(result.error || 'Report generation failed')

    s3Key = `exports/dataset/${initial.userId.replace(/[^a-zA-Z0-9@._-]/g, '_')}/${jobId}/${result.filename}`
    await updateDatasetExportJob(jobId, { phase: 'Uploading result', progressPercent: 90, datasetCounts: result.datasetCounts || {}, s3Key })
    const upload = await uploadToS3({ key: s3Key, buffer: result.buffer, contentType: result.mimeType, signal: controller.signal })
    if (!upload.success) throw new Error(upload.error || 'S3 upload failed')
    if (controller.signal.aborted) throw controller.signal.reason

    const completedAt = new Date().toISOString()
    await updateDatasetExportJob(jobId, {
      status: 'complete', phase: 'Complete', progressPercent: 100, s3Key, filename: result.filename,
      mimeType: result.mimeType, sizeBytes: result.buffer.length, completedAt, heartbeatAt: completedAt
    })
    await deleteDatasetExportMessage(message.ReceiptHandle)
  } catch (error: any) {
    const latest = await getDatasetExportJob(jobId)
    if (s3Key) await deleteFromS3(s3Key)
    if (latest?.cancelRequested || latest?.status === 'canceled' || controller.signal.aborted) {
      await updateDatasetExportJob(jobId, { status: 'canceled', phase: 'Canceled', errorMessage: 'Canceled by user', completedAt: new Date().toISOString() })
      await deleteDatasetExportMessage(message.ReceiptHandle)
    } else if (receiveCount < 2) {
      await updateDatasetExportJob(jobId, { status: 'queued', phase: 'Retrying export', progressPercent: 0, errorMessage: error.message })
      await releaseDatasetExportMessage(message.ReceiptHandle)
    } else {
      logger.error(`[Dataset Export Worker] ${jobId} failed`, error)
      await updateDatasetExportJob(jobId, { status: 'error', phase: 'Export failed', errorMessage: error.message || 'Export failed', completedAt: new Date().toISOString() })
      await deleteDatasetExportMessage(message.ReceiptHandle)
    }
  } finally {
    clearInterval(heartbeat); clearInterval(cancellation); clearInterval(visibility); controller.abort()
  }
}
