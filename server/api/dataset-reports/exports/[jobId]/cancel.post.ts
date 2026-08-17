import { defineEventHandler, getRouterParam } from 'h3'
import { sendSuccess, errors } from '../../../../utils/api-response'
import { cancelDatasetExportJob } from '../../../../utils/dataset-export-jobs'
import { getUserEmail } from '../../../../utils/user-roles'

export default defineEventHandler(async (event) => {
  if (!event.context.auth?.isAuthenticated) return errors.unauthorized(event, 'Authentication required')
  const userId = getUserEmail(event)
  const jobId = getRouterParam(event, 'jobId')
  if (!userId || !jobId) return errors.badRequest(event, 'Job ID and user are required')
  return await cancelDatasetExportJob(jobId, userId)
    ? sendSuccess(event, { canceled: true })
    : errors.conflict(event, 'Export cannot be canceled or was not found')
})
