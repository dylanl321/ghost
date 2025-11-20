/**
 * Send a test dataset report
 * POST /api/dataset-reports/:id/test
 */

import { getReport } from '../../../utils/scheduled-reports'
import { generateDatasetReport } from '../../../utils/dataset-report-generator'
import { sendReportEmail, getDefaultTemplate } from '../../../utils/email-service'
import { uploadReportToS3, getReportDownloadUrl } from '../../../utils/s3-reports-storage'
import { getUserEmail } from '../../../utils/user-roles'
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

    // Get existing report
    const report = await getReport(reportId)

    // Verify ownership
    if (report.createdBy !== userEmail) {
      throw createError({
        statusCode: 403,
        message: 'Access denied'
      })
    }

    // Verify it's a dataset report
    if (report.reportType !== 'dataset') {
      throw createError({
        statusCode: 404,
        message: 'Dataset report not found'
      })
    }

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

    logger.info('[Dataset Reports API] Generating test report', {
      reportId,
      reportName: report.reportName
    })

    // Generate the report
    const result = await generateDatasetReport(report.reportConfig)

    if (!result.success || !result.buffer) {
      throw new Error(result.error || 'Report generation failed')
    }

    // Upload to S3
    const executionId = uuidv4()
    const s3Key = await uploadReportToS3(
      reportId,
      executionId,
      result.buffer,
      result.filename!,
      result.mimeType || 'application/octet-stream',
      {
        reportName: report.reportName,
        format: report.reportConfig.format,
        isTest: true
      }
    )

    // Get download URL
    const downloadUrl = await getReportDownloadUrl(s3Key, 7) // 7 days expiry

    // Prepare email template
    const emailSubject = report.emailTemplate.subject || `[TEST] ${report.reportName}`
    const emailBody = report.emailTemplate.body || getDefaultTemplate('dataset')

    // Send email
    const emailResult = await sendReportEmail({
      to: recipients,
      subject: emailSubject,
      body: emailBody,
      attachments: [{
        filename: result.filename!,
        content: result.buffer,
        contentType: result.mimeType || 'application/octet-stream'
      }],
      templateVariables: {
        reportName: report.reportName,
        userName: userEmail,
        downloadUrl: downloadUrl || '',
        timestamp: new Date().toISOString(),
        isTest: true
      }
    })

    logger.info('[Dataset Reports API] Test report sent', {
      reportId,
      recipients,
      emailsSent: emailResult.emailsSent,
      emailsFailed: emailResult.emailsFailed
    })

    return {
      success: true,
      message: 'Test report sent successfully',
      data: {
        emailsSent: emailResult.emailsSent,
        emailsFailed: emailResult.emailsFailed,
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
