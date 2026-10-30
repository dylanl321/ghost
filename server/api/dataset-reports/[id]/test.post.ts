/**
 * Send a test dataset report
 * POST /api/dataset-reports/:id/test
 */

import { generateDatasetReport } from '../../../utils/dataset-report-generator'
import { sendReportEmail, renderTemplate, validateEmails } from '../../../utils/email-service'
import { getDatasetDefaultEmailTemplate } from '../../../utils/report-scheduler'
import { uploadReportToS3, getReportDownloadUrl } from '../../../utils/s3-reports-storage'
import { getUserEmail } from '../../../utils/user-roles'
import { requireDatasetReportAccess } from '../../../utils/dataset-report-access'
import { logger } from '../../../utils/logger'
import { v4 as uuidv4 } from 'uuid'

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

    const report = await requireDatasetReportAccess(event, reportId)

    // Parse optional request body for override recipients
    let recipients = report.recipients
    try {
      const body = await readBody(event)
      if (body.recipients && Array.isArray(body.recipients)) {
        recipients = body.recipients
      }
    } catch {
      // No body or invalid body, use report recipients
    }

    const emailValidation = validateEmails(recipients)
    if (!emailValidation.valid || recipients.length === 0) {
      throw createError({
        statusCode: 400,
        message: emailValidation.errors.join(', ') || 'At least one recipient is required'
      })
    }

    logger.info('[Dataset Reports API] Generating test report', {
      reportId,
      reportName: report.reportName
    })

    // Generate the report
    const result = await generateDatasetReport(report.reportConfig as any, event)

    if (!result.success || !result.buffer) {
      throw new Error(result.error || 'Report generation failed')
    }

    // Upload to S3
    const executionId = uuidv4()
    const s3UploadResult = await uploadReportToS3(
      'scheduled',
      result.buffer,
      {
        reportId,
        executionId,
        reportName: report.reportName,
        userId: userEmail,
        format: report.reportConfig.format
      }
    )

    // Get download URL
    const downloadUrl = s3UploadResult.success
      ? await getReportDownloadUrl(s3UploadResult.key, 7)
      : ''

    // Prepare email template
    const emailSubject = `[TEST] ${report.emailTemplate.subject || report.reportName}`
    // Same default body the scheduled run uses, not the cost-report template
    const emailBody = renderTemplate(report.emailTemplate.body?.trim() ? report.emailTemplate.body : getDatasetDefaultEmailTemplate(), {
      reportName: report.reportName,
      userName: userEmail.split('@')[0],
      downloadUrl,
      timestamp: new Date().toISOString(),
      accountCount: report.reportConfig.accounts?.length || 'All',
      format: report.reportConfig.format.toUpperCase(),
      timeframe: 'Current dataset query',
      dataMode: 'Dataset report',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
      recipientEmail: recipients[0]
    })

    // Send email
    const emailResult = await sendReportEmail(
      recipients,
      emailSubject,
      emailBody,
      result.buffer,
      result.filename!,
      report.reportConfig.format
    )

    if (!emailResult.success) {
      throw new Error(emailResult.error || 'Failed to send test report')
    }

    logger.info('[Dataset Reports API] Test report sent', {
      reportId,
      recipients,
      emailsSent: emailResult.deliveryDetails?.totalSent || 0,
      emailsFailed: emailResult.deliveryDetails?.totalFailed || 0
    })

    return {
      success: true,
      message: 'Test report sent successfully',
      data: {
        emailsSent: emailResult.deliveryDetails?.totalSent || 0,
        emailsFailed: emailResult.deliveryDetails?.totalFailed || 0,
        downloadUrl
      }
    }
  } catch (error: any) {
    logger.error('[Dataset Reports API] Error sending test report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to send test report'
    })
  }
})
