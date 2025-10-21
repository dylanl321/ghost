/**
 * Send a test report immediately
 * POST /api/scheduled-reports/:id/test
 */

import { getReport } from '../../../utils/scheduled-reports'
import { executeScheduledReport } from '../../../utils/report-scheduler'
import { isUserAdmin } from '../../../utils/user-roles'

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

    // Get the report
    const report = await getReport(reportId)
    if (!report) {
      throw createError({
        statusCode: 404,
        message: 'Report not found'
      })
    }

    // Allow all authenticated users to test any report

    // Get optional test recipient from body
    const body = await readBody(event).catch(() => ({}))
    const testRecipient = body.testRecipient

    // If test recipient provided, override recipients temporarily
    let testReport = report
    if (testRecipient) {
      testReport = {
        ...report,
        recipients: [testRecipient]
      }
    }

    // Execute the report immediately
    console.log(`Sending test report: ${report.reportName}`)
    const result = await executeScheduledReport(testReport)

    if (!result.success) {
      throw createError({
        statusCode: 500,
        message: result.error || 'Failed to send test report'
      })
    }

    return {
      success: true,
      message: 'Test report sent successfully',
      duration: result.duration
    }
  } catch (error: any) {
    console.error('Error sending test report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to send test report'
    })
  }
})
