import { defineEventHandler, getRouterParam, sendRedirect } from 'h3'
import { errors } from '../../../../utils/api-response'
import { getDatasetExportJob } from '../../../../utils/dataset-export-jobs'
import { getUserEmail } from '../../../../utils/user-roles'
import { getPresignedDownloadUrl } from '../../../../utils/s3-storage'

export default defineEventHandler(async (event) => {
  if (!event.context.auth?.isAuthenticated) return errors.unauthorized(event, 'Authentication required')
  const userId = getUserEmail(event)
  const jobId = getRouterParam(event, 'jobId')
  if (!userId || !jobId) return errors.badRequest(event, 'Job ID and user are required')
  const job = await getDatasetExportJob(jobId, userId)
  if (!job) return errors.notFound(event, 'Export job')
  if (job.status !== 'complete' || !job.s3Key) return errors.conflict(event, 'Export is not ready for download')
  return sendRedirect(event, await getPresignedDownloadUrl({ key: job.s3Key, expiresInSeconds: 300 }), 302)
})
