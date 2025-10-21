/**
 * Update a scheduled report
 * PATCH /api/scheduled-reports/:id
 */

import type { UpdateReportRequest } from '~/shared/types/scheduled-reports'
import { getReport, updateReport } from '../../utils/scheduled-reports'
import { validateEmails } from '../../utils/email-service'
import { isUserAdmin } from '../../utils/user-roles'

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
    const isAdmin = await isUserAdmin(event)

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

    // Check ownership (unless admin)
    if (!isAdmin && existing.createdBy !== userEmail) {
      throw createError({
        statusCode: 403,
        message: 'Access denied'
      })
    }

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

      // Non-admin users can only set themselves as recipient
      if (!isAdmin) {
        if (updates.recipients.length > 1 || updates.recipients[0] !== userEmail) {
          throw createError({
            statusCode: 403,
            message: 'Non-admin users can only send reports to themselves'
          })
        }
      }
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
    console.error('Error updating scheduled report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to update scheduled report'
    })
  }
})
