/**
 * Update a dataset report
 * PATCH /api/dataset-reports/:id
 */

import { updateReport } from '../../utils/scheduled-reports'
import { validateEmails } from '../../utils/email-service'
import { requireDatasetReportAccess } from '../../utils/dataset-report-access'
import { logger } from '../../utils/logger'
import { getScheduledDatasetReportErrors } from '../../utils/dataset-report-validation'
import { getScheduleErrors } from '../../../shared/utils/report-schedule'
import { assertSelfOnlyRecipients } from '../../utils/report-limits'

export default defineEventHandler(async (event) => {
  try {
    // Get user from auth context
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
        message: 'User information not available'
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

    const existing = await requireDatasetReportAccess(event, reportId)

    // Parse request body
    const body = await readBody(event)
    if (!body || typeof body !== 'object') {
      throw createError({ statusCode: 400, message: 'Request body is required' })
    }
    const updates = {
      ...(body.reportName !== undefined && { reportName: body.reportName }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.reportConfig !== undefined && { reportConfig: body.reportConfig }),
      ...(body.schedule !== undefined && { schedule: body.schedule }),
      ...(body.recipients !== undefined && { recipients: body.recipients }),
      ...(body.emailTemplate !== undefined && { emailTemplate: body.emailTemplate })
    }

    if (updates.reportName !== undefined && (typeof updates.reportName !== 'string' || !updates.reportName.trim())) {
      throw createError({ statusCode: 400, message: 'Report name cannot be empty' })
    }

    // Validate emails if they're being updated
    if (updates.recipients !== undefined) {
      if (!Array.isArray(updates.recipients) || updates.recipients.length === 0) {
        throw createError({ statusCode: 400, message: 'At least one recipient is required' })
      }
      const emailValidation = validateEmails(updates.recipients)
      if (!emailValidation.valid) {
        throw createError({
          statusCode: 400,
          message: `Invalid email addresses: ${emailValidation.errors.join(', ')}`
        })
      }
      await assertSelfOnlyRecipients(event, updates.recipients)
    }

    // Validate datasets if reportConfig is being updated
    if (updates.reportConfig) {
      const configErrors = getScheduledDatasetReportErrors(updates.reportConfig)
      if (configErrors.length > 0) {
        throw createError({
          statusCode: 400,
          message: configErrors.join('; ')
        })
      }
    }

    if (updates.schedule) {
      const scheduleErrors = getScheduleErrors({ ...existing.schedule, ...updates.schedule })
      if (scheduleErrors.length > 0) {
        throw createError({ statusCode: 400, message: scheduleErrors.join('; ') })
      }
    }

    // Update the report
    const updatedReport = await updateReport(reportId, updates)

    return {
      success: true,
      data: updatedReport
    }
  } catch (error: any) {
    logger.error('[Dataset Reports API] Error updating report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to update dataset report'
    })
  }
})
