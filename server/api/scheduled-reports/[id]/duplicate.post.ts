/**
 * Duplicate a scheduled report
 * POST /api/scheduled-reports/[id]/duplicate
 *
 * Creates a copy of an existing scheduled report with the same settings
 */

import { getUserEmail, isUserAdmin } from '../../../utils/user-roles'
import { createReport } from '../../../utils/scheduled-reports'
import { requireScheduledReportAccess, isDatasetReport } from '../../../utils/dataset-report-access'
import { logger } from '../../../utils/logger'
import { assertCanCreateReport, assertSelfOnlyRecipients } from '../../../utils/report-limits'

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
    const reportId = getRouterParam(event, 'id')

    if (!reportId) {
      throw createError({
        statusCode: 400,
        message: 'Report ID is required'
      })
    }

    // Users can only duplicate their own reports (admins can duplicate any)
    const existingReport = await requireScheduledReportAccess(event, reportId)
    if (!isDatasetReport(existingReport)) await assertSelfOnlyRecipients(event, existingReport.recipients)
    await assertCanCreateReport(event)

    // Create new report with copied settings
    const newReportName = `Copy of ${existingReport.reportName}`

    const newReport = await createReport(
      {
        reportName: newReportName,
        description: existingReport.description,
        // Keep the type, or a dataset report's copy would run as a cost report
        reportType: existingReport.reportType,
        reportConfig: existingReport.reportConfig,
        schedule: existingReport.schedule,
        recipients: existingReport.recipients,
        emailTemplate: existingReport.emailTemplate
      },
      userEmail,
      await isUserAdmin(event)
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
