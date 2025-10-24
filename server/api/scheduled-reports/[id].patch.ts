/**
 * Update a scheduled report
 * PATCH /api/scheduled-reports/:id
 */

import type { UpdateReportRequest } from '~/shared/types/scheduled-reports'
import { getReport, updateReport } from '../../utils/scheduled-reports'
import { validateEmails } from '../../utils/email-service'
import { isUserAdmin } from '../../utils/user-roles'
import { logger } from '../../utils/logger'

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

    const userEmail = user.claims?.email || user.claims?.preferred_username

    // Get report ID from route params
    const reportId = getRouterParam(event, 'id')
    if (!reportId) {
      throw createError({
        statusCode: 400,
        message: 'Report ID is required'
      })
    }

    // Get existing report
    const existing = await getReport(reportId)
    if (!existing) {
      throw createError({
        statusCode: 404,
        message: 'Report not found'
      })
    }

    // Allow all authenticated users to update any report

    // Parse request body
    const updates = await readBody<UpdateReportRequest>(event)

    // Validate recipients if provided
    if (updates.recipients) {
      if (updates.recipients.length === 0) {
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

      // Allow all authenticated users to set any recipients
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
