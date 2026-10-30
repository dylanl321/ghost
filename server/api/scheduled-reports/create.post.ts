/**
 * Create a new scheduled report
 * POST /api/scheduled-reports/create
 */

import type { CreateReportRequest } from '../../../shared/types/scheduled-reports'
import { createReport } from '../../utils/scheduled-reports'
import { validateEmails } from '../../utils/email-service'
import { isUserAdmin, getUserEmail } from '../../utils/user-roles'
import { getScheduleErrors } from '../../../shared/utils/report-schedule'
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

    // Parse request body
    const body = await readBody<CreateReportRequest>(event)
    if (!body || typeof body !== 'object') {
      throw createError({ statusCode: 400, message: 'Request body is required' })
    }

    // Validation
    if (!body.reportName || body.reportName.trim() === '') {
      throw createError({
        statusCode: 400,
        message: 'Report name is required'
      })
    }

    if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'At least one recipient is required'
      })
    }

    const scheduleErrors = getScheduleErrors(body.schedule)
    if (scheduleErrors.length > 0) {
      throw createError({ statusCode: 400, message: scheduleErrors.join('; ') })
    }

    // Validate email addresses
    const emailValidation = validateEmails(body.recipients)
    if (!emailValidation.valid) {
      throw createError({
        statusCode: 400,
        message: `Invalid email addresses: ${emailValidation.errors.join(', ')}`
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

    const isAdmin = await isUserAdmin(event)

    // Create the report
    const report = await createReport(body, userEmail, isAdmin)

    return {
      success: true,
      data: report
    }
  } catch (error: any) {
    logger.error('Error creating scheduled report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to create scheduled report'
    })
  }
})
