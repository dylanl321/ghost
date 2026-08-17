import { defineEventHandler } from 'h3'
import { sendSuccess, errors } from '../../../utils/api-response'
import { listDatasetExportJobs } from '../../../utils/dataset-export-jobs'
import { getUserEmail } from '../../../utils/user-roles'

export default defineEventHandler(async (event) => {
  if (!event.context.auth?.isAuthenticated) return errors.unauthorized(event, 'Authentication required')
  const userId = getUserEmail(event)
  if (!userId) return errors.unauthorized(event, 'User email not available')
  return sendSuccess(event, { jobs: await listDatasetExportJobs(userId) })
})
