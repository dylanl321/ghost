/**
 * Test sends for scheduled and dataset reports
 * Runs the same generation and email path as a scheduled run, marked [TEST],
 * without storing the file or touching the schedule or history
 */

import type { H3Event } from 'h3'
import { requireScheduledReportAccess } from './dataset-report-access'
import { executeScheduledReport } from './report-scheduler'
import { validateEmails } from './email-service'
import { getUserEmail } from './user-roles'
import { logger } from './logger'

export async function handleReportTestSend(event: H3Event, options: { datasetOnly?: boolean } = {}) {
  const reportId = getRouterParam(event, 'id')
  if (!reportId) {
    throw createError({ statusCode: 400, message: 'Report ID is required' })
  }

  const report = await requireScheduledReportAccess(event, reportId, { datasetOnly: options.datasetOnly })

  // A test goes to the person who asked for it ("check your inbox") unless
  // they name recipients; it used to email the report's whole distribution.
  // Dataset reports send { recipients }, the cost report page { testRecipient }
  const body = await readBody(event).catch(() => undefined) as { recipients?: unknown, testRecipient?: unknown } | undefined
  const requester = getUserEmail(event)
  let recipients: string[] = requester ? [requester] : report.recipients
  if (Array.isArray(body?.recipients) && body.recipients.length > 0) {
    recipients = body.recipients as string[]
  } else if (typeof body?.testRecipient === 'string' && body.testRecipient.trim()) {
    recipients = [body.testRecipient.trim()]
  }

  const emailValidation = validateEmails(recipients)
  if (!emailValidation.valid || recipients.length === 0) {
    throw createError({
      statusCode: 400,
      message: emailValidation.errors.join(', ') || 'At least one recipient is required'
    })
  }

  logger.info(`[Reports API] Sending test of ${report.reportId} to ${recipients.length} recipient(s)`)
  const result = await executeScheduledReport(report, { test: { recipients }, event })
  if (!result.success) {
    throw createError({ statusCode: 500, message: result.error || 'Failed to send test report' })
  }

  return {
    success: true,
    message: 'Test report sent successfully',
    duration: result.duration
  }
}
