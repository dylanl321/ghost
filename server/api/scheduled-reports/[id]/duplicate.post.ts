/**
 * Duplicate a scheduled report
 * POST /api/scheduled-reports/[id]/duplicate
 *
 * Creates a copy of an existing scheduled report with the same settings
 */

import { getUserEmail } from '../../../utils/user-roles'
import { getReport, createReport } from '../../../utils/scheduled-reports'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Check authentication
    const auth = event.context.auth
    if (!auth || !auth.isAuthenticated) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
      })
    }

    const user = auth.user
    if (!user) {
      throw createError({
        statusCode: 401,
        message: 'User not found'
      })
    }

    // Get user email
    const userEmail = getUserEmail(event)
    if (!userEmail) {
      throw createError({
        statusCode: 400,
        message: 'User email not available'
      })
    }

    // Get report ID from route params
    const reportId = event.context.params?.id

    if (!reportId) {
      throw createError({
        statusCode: 400,
        message: 'Report ID is required'
      })
    }

    // Get the existing report
    const existingReport = await getReport(reportId)

    if (!existingReport) {
      throw createError({
        statusCode: 404,
        message: 'Report not found'
      })
    }

    // Check permissions: user can only duplicate their own reports (unless admin)
    if (existingReport.createdBy !== userEmail && !existingReport.isAdmin) {
      throw createError({
        statusCode: 403,
        message: 'You can only duplicate your own reports'
      })
    }

    // Create new report with copied settings
    const newReportName = `Copy of ${existingReport.reportName}`

    const newReport = await createReport(
      {
        reportName: newReportName,
        description: existingReport.description,
        reportConfig: existingReport.reportConfig,
        schedule: existingReport.schedule,
        recipients: existingReport.recipients,
        emailTemplate: existingReport.emailTemplate
      },
      userEmail,
      existingReport.isAdmin
    )

    logger.info(`Report duplicated: ${reportId} → ${newReport.reportId}`)

    return {
      success: true,
      data: newReport
    }
  } catch (error: any) {
    logger.error('Error duplicating report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to duplicate report'
    })
  }
})
