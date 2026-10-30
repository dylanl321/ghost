/**
 * Create a new dataset report
 * POST /api/dataset-reports/create
 */

import type { DatasetReportConfig } from '../../../shared/types/dataset-reports'
import type { CreateReportRequest } from '../../../shared/types/scheduled-reports'
import { createReport } from '../../utils/scheduled-reports'
import { validateEmails } from '../../utils/email-service'
import { getUserEmail, isUserAdmin } from '../../utils/user-roles'
import { logger } from '../../utils/logger'
import { getScheduledDatasetReportErrors } from '../../utils/dataset-report-validation'
import { getScheduleErrors } from '../../../shared/utils/report-schedule'
import { assertCanCreateReport } from '../../utils/report-limits'

interface CreateDatasetReportRequest {
  reportName: string
  description?: string
  reportConfig: DatasetReportConfig
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
    dayOfWeek?: number
    dayOfMonth?: number
    monthOfQuarter?: number
    time: string
    timezone: string
  }
  recipients: string[]
  emailTemplate: {
    subject: string
    body: string
    isCustom: boolean
  }
}

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
    const body = await readBody<CreateDatasetReportRequest>(event)
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

    if (!body.recipients || body.recipients.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'At least one recipient is required'
      })
    }

    const validationErrors = [
      ...getScheduledDatasetReportErrors(body.reportConfig),
      ...getScheduleErrors(body.schedule)
    ]
    if (validationErrors.length > 0) {
      throw createError({
        statusCode: 400,
        message: validationErrors.join('; ')
      })
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

    // Check if user has admin privileges (AWS-Product-Team membership)
    const isAdmin = await isUserAdmin(event)
    await assertCanCreateReport(event)

    // Convert to ReportConfig format (compatible with existing infrastructure)
    const reportRequest: CreateReportRequest = {
      reportName: body.reportName,
      description: body.description,
      reportType: 'dataset' as const,
      reportConfig: body.reportConfig as any, // Shared scheduler supports both report config shapes
      schedule: body.schedule,
      recipients: body.recipients,
      emailTemplate: body.emailTemplate
    }

    // Create the report using existing infrastructure
    const report = await createReport(reportRequest, userEmail, isAdmin)

    return {
      success: true,
      data: report
    }
  } catch (error: any) {
    logger.error('[Dataset Reports API] Error creating report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to create dataset report'
    })
  }
})
