/**
 * Update a scheduled report
 * PATCH /api/scheduled-reports/:id
 */

import type { UpdateReportRequest } from '../../../shared/types/scheduled-reports'
import { updateReport } from '../../utils/scheduled-reports'
import { validateEmails } from '../../utils/email-service'
import { requireScheduledReportAccess, isDatasetReport } from '../../utils/dataset-report-access'
import { getScheduleErrors } from '../../../shared/utils/report-schedule'
import { logger } from '../../utils/logger'
import { assertSelfOnlyRecipients } from '../../utils/report-limits'

export default defineEventHandler(async (event) => {
  try {
    // Get user from session
    const auth = event.context.auth
    const user = auth?.user
    if (!user) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
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

    const existing = await requireScheduledReportAccess(event, reportId)

    // Parse request body
    const updates = await readBody<UpdateReportRequest>(event)
    if (!updates || typeof updates !== 'object') {
      throw createError({ statusCode: 400, message: 'Request body is required' })
    }

    if (updates.reportName !== undefined && (typeof updates.reportName !== 'string' || !updates.reportName.trim())) {
      throw createError({ statusCode: 400, message: 'Report name cannot be empty' })
    }

    if (updates.status !== undefined && !['active', 'paused', 'disabled'].includes(updates.status)) {
      throw createError({ statusCode: 400, message: 'Invalid report status' })
    }

    if (updates.schedule) {
      const scheduleErrors = getScheduleErrors({ ...existing.schedule, ...updates.schedule })
      if (scheduleErrors.length > 0) {
        throw createError({ statusCode: 400, message: scheduleErrors.join('; ') })
      }
    }

    // Validate recipients if provided
    if (updates.recipients) {
      if (!Array.isArray(updates.recipients) || updates.recipients.length === 0) {
        throw createError({
          statusCode: 400,
          message: 'At least one recipient is required'
        })
      }

      const emailValidation = validateEmails(updates.recipients)
      if (!emailValidation.valid) {
        throw createError({
          statusCode: 400,
          message: `Invalid email addresses: ${emailValidation.errors.join(', ')}`
        })
      }

      if (!isDatasetReport(existing)) await assertSelfOnlyRecipients(event, updates.recipients)
    }

    // Update the report
    const updated = await updateReport(reportId, updates)

    if (!updated) {
      throw createError({
        statusCode: 500,
        message: 'Failed to update report'
      })
    }

    return {
      success: true,
      data: updated
    }
  } catch (error: any) {
    logger.error('Error updating scheduled report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to update scheduled report'
    })
  }
})
