/**
 * Update a dataset report
 * PATCH /api/dataset-reports/:id
 */

import { updateReport, getReport } from '../../utils/scheduled-reports'
import { validateEmails } from '../../utils/email-service'
import { getUserEmail } from '../../utils/user-roles'
import { logger } from '../../utils/logger'

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

    // Get user email
    const userEmail = getUserEmail(event)
    if (!userEmail) {
      throw createError({
        statusCode: 400,
        message: 'User email not available'
      })
    }

    // Get existing report
    const existingReport = await getReport(reportId)

    // Verify ownership
    if (existingReport.createdBy !== userEmail) {
      throw createError({
        statusCode: 403,
        message: 'Access denied'
      })
    }

    // Verify it's a dataset report
    if (existingReport.reportType !== 'dataset') {
      throw createError({
        statusCode: 404,
        message: 'Dataset report not found'
      })
    }

    // Parse request body
    const updates = await readBody(event)

    // Validate emails if they're being updated
    if (updates.recipients) {
      const emailValidation = validateEmails(updates.recipients)
      if (!emailValidation.valid) {
        throw createError({
          statusCode: 400,
          message: `Invalid email addresses: ${emailValidation.errors.join(', ')}`
        })
      }
    }

    // Validate datasets if reportConfig is being updated
    if (updates.reportConfig) {
      const datasetsSelected = Object.values(updates.reportConfig.datasets || {}).some(
        (ds: any) => ds && ds.enabled
      )
      if (!datasetsSelected) {
        throw createError({
          statusCode: 400,
          message: 'At least one dataset must be selected'
        })
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
