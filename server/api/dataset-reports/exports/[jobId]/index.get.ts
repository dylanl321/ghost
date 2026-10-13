import { defineEventHandler, getRouterParam } from 'h3'
import { sendSuccess, errors } from '../../../../utils/api-response'
import { getDatasetExportJob } from '../../../../utils/dataset-export-jobs'
import { getUserEmail } from '../../../../utils/user-roles'

export default defineEventHandler(async (event) => {
  if (!event.context.auth?.isAuthenticated) return errors.unauthorized(event, 'Authentication required')
  const userId = getUserEmail(event)
  const jobId = getRouterParam(event, 'jobId')
  if (!userId || !jobId) return errors.badRequest(event, 'Job ID and user are required')
  const job = await getDatasetExportJob(jobId, userId)
  return job ? sendSuccess(event, { job }) : errors.notFound(event, 'Export job')
})
