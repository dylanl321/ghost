import { defineEventHandler, readBody } from 'h3'
import type { DatasetReportConfig } from '../../../shared/types/dataset-reports'
import { sendSuccess, errors } from '../../utils/api-response'
import { getDatasetReportConfigErrors } from '../../utils/dataset-report-validation'
import { createDatasetExportJob } from '../../utils/dataset-export-jobs'
import { getUserEmail } from '../../utils/user-roles'
import { logger } from '../../utils/logger'

interface ExportRequest { reportConfig: DatasetReportConfig }

export default defineEventHandler(async (event) => {
  try {
    if (!event.context.auth?.isAuthenticated) return errors.unauthorized(event, 'Authentication required')
    const userId = getUserEmail(event)
    if (!userId) return errors.unauthorized(event, 'User email not available')
    const { reportConfig } = await readBody<ExportRequest>(event)
    const validation = getDatasetReportConfigErrors(reportConfig)
    if (validation.length) return errors.badRequest(event, validation.join('; '))
    const job = await createDatasetExportJob(userId, reportConfig)
    return sendSuccess(event, { job }, { message: 'Export queued' })
  } catch (error: any) {
    logger.error('[Dataset Export] Failed to queue export', error)
    return errors.serverError(event, error.message || 'Failed to queue export')
  }
})
