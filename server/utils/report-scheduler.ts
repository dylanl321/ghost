/**
 * Report Scheduler Service
 * Manages execution of scheduled reports
 */

import type { H3Event } from 'h3'
import type { ScheduledReport } from '../../shared/types/scheduled-reports'
import type { DatasetReportConfig } from '../../shared/types/dataset-reports'
import {
  getUpcomingReports,
  updateReport,
  updateReportRunStatus,
  recordExecution,
  countExecutionsSince
} from './scheduled-reports'
import { isScheduledSlot } from '../../shared/utils/report-schedule'
import { isDatasetReport } from './dataset-report-access'
import { generateCostReport } from './report-generator'
import { generateDatasetReport } from './dataset-report-generator'
import { sendReportEmail, renderTemplate, getDefaultTemplate } from './email-service'
import { claimExecutionLock } from './execution-locks'
import { uploadReportToS3 } from './s3-reports-storage'
import { sendUserNotification } from './notification-service'
import { logger } from './logger'

/**
 * Execute a single scheduled report
 */
export async function executeScheduledReport(
  report: ScheduledReport,
  options: {
    scheduledSlot?: string
    /**
     * Send a one-off test copy: subject marked [TEST], sent to these
     * recipients, nothing stored and the schedule and history untouched
     */
    test?: { recipients: string[] }
    /** Interactive request, so session-bound datasets (Entra Users) can load */
    event?: H3Event
  } = {}
): Promise<{
  success: boolean
  error?: string
  duration?: number
  executionId?: string
}> {
  const startTime = Date.now()

  logger.info(`Executing scheduled report: ${report.reportName} (${report.reportId})`)

  try {
    // Step 1: Generate the report (route based on report type)
    logger.info(`  → Generating ${report.reportType || 'cost'} report...`)

    const isDataset = isDatasetReport(report)
    let reportResult
    if (isDataset) {
      reportResult = await generateDatasetReport(report.reportConfig as unknown as DatasetReportConfig, options.event)
    } else {
      // Default to cost report for backwards compatibility
      reportResult = await generateCostReport(report.reportConfig)
    }

    if (!reportResult.success || !reportResult.buffer) {
      throw new Error(reportResult.error || 'Failed to generate report')
    }

    logger.info(`  → Report generated: ${reportResult.filename} (${reportResult.buffer.length} bytes)`)

    // Step 2: Upload report to S3 (test sends are not stored)
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    let s3UploadResult: Awaited<ReturnType<typeof uploadReportToS3>> = { success: false, key: '' }

    if (!options.test) {
      logger.info('  → Uploading report to S3...')
      s3UploadResult = await uploadReportToS3(
        'scheduled',
        reportResult.buffer,
        {
          reportId: report.reportId,
          reportName: report.reportName,
          userId: report.createdBy,
          executionId,
          format: report.reportConfig.format
        }
      )

      if (!s3UploadResult.success) {
        logger.warn(`  ⚠ Failed to upload report to S3: ${s3UploadResult.error}`)
        // Continue execution - we can still send email with attachment
      } else {
        logger.info(`  → Report uploaded to S3: ${s3UploadResult.key}`)
      }
    }

    // Step 3: Prepare email content with enhanced date context
    const dateContext = isDataset
      ? {}
      : buildDateContext(report.reportConfig.timeframe)

    const recipients = options.test?.recipients || report.recipients
    const emailSubject = (options.test ? '[TEST] ' : '') + renderTemplate(report.emailTemplate.subject || report.reportName, {
      reportName: report.reportName,
      timeframe: isDataset ? 'Current dataset query' : formatTimeframe(report.reportConfig.timeframe),
      dataMode: isDataset ? 'Dataset report' : formatDataMode(report.reportConfig.dataMode),
      ...dateContext
    })

    let emailBody = report.emailTemplate.body
    if (!emailBody || emailBody.trim() === '') {
      emailBody = isDataset
        ? getDatasetDefaultEmailTemplate()
        : getDefaultTemplate()
    }

    // Build template context
    // Use environment-specific site URL, falling back to localhost in dev
    const siteUrl = process.env.NUXT_PUBLIC_SITE_URL ||
                    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')

    if (!siteUrl) {
      logger.warn('NUXT_PUBLIC_SITE_URL not set - email links will be empty')
    }

    const templateContext = {
      userName: report.createdBy.split('@')[0], // Extract name from email
      reportName: report.reportName,
      timeframe: isDataset ? 'Current dataset query' : formatTimeframe(report.reportConfig.timeframe),
      dataMode: isDataset ? 'Dataset report' : formatDataMode(report.reportConfig.dataMode),
      accountCount: report.reportConfig.accounts?.length || 'All',
      format: report.reportConfig.format.toUpperCase(),
      timestamp: new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      }),
      siteUrl: siteUrl,
      recipientEmail: recipients[0], // First recipient
      downloadUrl: s3UploadResult.s3Url || '', // S3 presigned download URL
      ...dateContext // Include all date variables
    }

    const renderedBody = renderTemplate(emailBody, templateContext)

    // Step 4: Send email to all recipients
    logger.info(`  → Sending email to ${recipients.length} recipient(s)...`)
    const emailResult = await sendReportEmail(
      recipients,
      emailSubject,
      renderedBody,
      reportResult.buffer,
      reportResult.filename || 'report.pdf',
      report.reportConfig.format
    )

    if (!emailResult.success) {
      throw new Error(emailResult.error || 'Failed to send email')
    }

    const duration = Date.now() - startTime
    logger.info(`  ✓ Report sent successfully in ${duration}ms`)

    if (options.test) {
      return { success: true, duration }
    }

    // Step 5: Update report status
    await updateReportRunStatus(report.reportId, 'success', undefined, options.scheduledSlot)

    // Step 6: Record execution with email delivery details and S3 storage info.
    // The email has already gone out, so a history write failure is logged
    // rather than rethrown: rethrowing would record the run as failed too.
    await recordExecution({
      reportId: report.reportId,
      executionId,
      executionTime: new Date().toISOString(),
      status: 'success',
      duration,
      emailsSent: emailResult.deliveryDetails?.totalSent ?? report.recipients.length,
      emailsFailed: emailResult.deliveryDetails?.totalFailed ?? 0,
      reportSize: reportResult.buffer.length,
      emailDelivery: emailResult.deliveryDetails,  // Store detailed delivery info
      s3Key: s3UploadResult.key,                   // S3 object key
      s3Url: s3UploadResult.s3Url,                 // Presigned download URL
      s3UrlExpiresAt: s3UploadResult.s3UrlExpiresAt, // URL expiration
      downloadCount: 0                              // Initialize download counter
    }).catch(error => logger.error(`  ⚠ Report sent but execution history was not recorded: ${error.message}`))

    // Notify report creator that their report is ready
    sendUserNotification({
      userId: report.createdBy,
      category: 'REPORT_READY',
      title: `Report '${report.reportName}' is ready`,
      body: `Sent to ${report.recipients.length} recipient(s)`,
      severity: 'info',
      actionUrl: reportsPageFor(isDataset),
      actionLabel: 'View Reports',
      metadata: { reportId: report.reportId, executionId, s3Url: s3UploadResult.s3Url }
    }).catch(err => logger.warn('Failed to send report-ready notification:', err))

    return {
      success: true,
      duration,
      executionId
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    const errorMessage = error.message || 'Unknown error during report execution'

    logger.error(`  ✗ Report execution failed: ${errorMessage}`)

    if (options.test) {
      return { success: false, error: errorMessage, duration }
    }

    // Update report status with error
    await updateReportRunStatus(report.reportId, 'failed', errorMessage, options.scheduledSlot)

    // Record failed execution
    // Note: emailDelivery might be undefined if we failed before sending email
    await recordExecution({
      reportId: report.reportId,
      executionTime: new Date().toISOString(),
      status: 'failed',
      duration,
      error: errorMessage,
      emailsSent: 0,
      emailsFailed: report.recipients.length
    }).catch(recordError => logger.error(`  ⚠ Failed execution was not recorded: ${recordError.message}`))

    // Notify report creator of the failure
    sendUserNotification({
      userId: report.createdBy,
      category: 'REPORT_READY',
      title: `Report '${report.reportName}' failed`,
      body: `Failed to generate: ${errorMessage}`,
      severity: 'warning',
      actionUrl: reportsPageFor(isDatasetReport(report)),
      actionLabel: 'View Reports',
      metadata: { reportId: report.reportId, error: errorMessage }
    }).catch(err => logger.warn('Failed to send report-failure notification:', err))

    return {
      success: false,
      error: errorMessage,
      duration
    }
  }
}

/** The page that lists this kind of report, for notification links. */
function reportsPageFor(isDataset: boolean): string {
  return isDataset ? '/reports/datasets' : '/reports/scheduled'
}

function getDatasetDefaultEmailTemplate(): string {
  return `
    <h1>AWS Dataset Report</h1>
    <p>Hello {{userName}},</p>
    <p>Your scheduled dataset report <strong>{{reportName}}</strong> is ready and attached.</p>
    <p>Accounts: {{accountCount}}<br>Format: {{format}}<br>Generated: {{timestamp}}</p>
    {{#if downloadUrl}}<p><a href="{{downloadUrl}}">Download report</a></p>{{/if}}
  `.trim()
}

/**
 * Check for and execute all due reports
 */
export async function processScheduledReports(): Promise<{
  processed: number
  successful: number
  failed: number
  paused: number
}> {
  try {
    // Get reports due in next 60 seconds
    const dueReports = await getUpcomingReports(60)

    if (dueReports.length === 0) {
      return { processed: 0, successful: 0, failed: 0, paused: 0 }
    }

    logger.debug(`Found ${dueReports.length} report(s) to execute`)

    let successful = 0
    let failed = 0
    let skipped = 0
    let paused = 0

    // Execute reports sequentially to avoid overwhelming the system
    for (const report of dueReports) {
      try {
        // Safety check: a corrupt or long-missed nextRunTime is realigned, and
        // a report that has genuinely run too often is paused.
        const check = await checkForSuspiciousPattern(report)

        if (check.action === 'realign') {
          logger.warn(`⚠️  ${report.reportName}: ${check.reason}; rescheduling to the next slot without running`)
          // Passing the schedule makes updateReport recompute nextRunTime
          await updateReport(report.reportId, { schedule: report.schedule })
          skipped++
          continue
        }

        if (check.action === 'pause') {
          logger.warn(`⚠️  Suspicious pattern detected for ${report.reportName}: ${check.reason}`)
          logger.warn(`⚠️  Auto-pausing report for safety`)
          await updateReport(report.reportId, { status: 'paused' })
          sendUserNotification({
            userId: report.createdBy,
            category: 'REPORT_READY',
            title: `Report '${report.reportName}' was paused`,
            body: `It was paused automatically: ${check.reason}. Resume it once the schedule looks right.`,
            severity: 'warning',
            actionUrl: reportsPageFor(isDatasetReport(report)),
            actionLabel: 'View Reports',
            metadata: { reportId: report.reportId, reason: check.reason }
          }).catch(err => logger.warn('Failed to send report-paused notification:', err))
          paused++
          continue
        }
      } catch (error: any) {
        // One report's bookkeeping failing must not stop the others from running
        logger.error(`Safety check failed for ${report.reportName}, skipping this tick:`, error)
        skipped++
        continue
      }

      // Try to claim execution lock
      const lockClaimed = await claimExecutionLock(report.reportId, report.nextRunTime)

      if (!lockClaimed) {
        logger.info(`⊘ Skipping ${report.reportName} - already claimed by another container`)
        skipped++
        continue
      }

      // Lock claimed successfully, execute the report
      const result = await executeScheduledReport(report, { scheduledSlot: report.nextRunTime })

      if (result.success) {
        successful++
      } else {
        failed++
      }

      // Small delay between reports
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    if (skipped > 0) {
      logger.info(`⊘ Skipped ${skipped} report(s) (claimed by another container or rescheduled)`)
    }

    if (paused > 0) {
      logger.warn(`⚠️  Auto-paused ${paused} report(s) due to suspicious patterns`)
    }

    return {
      processed: successful + failed,
      successful,
      failed,
      paused
    }
  } catch (error: any) {
    logger.error('Error processing scheduled reports:', error)
    return { processed: 0, successful: 0, failed: 0, paused: 0 }
  }
}

// Late runs within this window still go out (e.g. after a deploy or outage);
// older ones are skipped to the next slot instead of sending stale data.
const MAX_CATCH_UP_HOURS = 24

// Executions in the last 24h (manual runs included) above which a report is
// treated as stuck in a loop and paused.
const MAX_RUNS_PER_DAY: Record<string, number> = {
  daily: 5,
  weekly: 3,
  monthly: 2,
  quarterly: 2
}

/**
 * Decide whether a due report should run.
 * - realign: nextRunTime is not a slot this schedule produces (stored by an
 *   older calculation or a corrupt write) or is more than a day overdue.
 *   Recompute it and skip this tick; nothing is wrong with the report itself.
 * - pause: the report has run far more often than its schedule allows.
 */
export async function checkForSuspiciousPattern(
  report: ScheduledReport,
  now: Date = new Date(),
  countRecentRuns: (reportId: string, since: Date) => Promise<number> = countExecutionsSince
): Promise<{ action: 'run' | 'realign' | 'pause', reason?: string }> {
  const nextRun = new Date(report.nextRunTime)

  if (Number.isNaN(nextRun.getTime())) {
    return { action: 'realign', reason: 'next run time is missing or invalid' }
  }

  const hoursBehind = (now.getTime() - nextRun.getTime()) / (1000 * 60 * 60)
  if (hoursBehind > MAX_CATCH_UP_HOURS) {
    return { action: 'realign', reason: `next run time is ${hoursBehind.toFixed(1)} hours in the past` }
  }

  if (!isScheduledSlot(report.schedule, nextRun, report.schedule.timezone)) {
    return { action: 'realign', reason: `next run time ${report.nextRunTime} does not match the ${report.schedule.frequency} schedule` }
  }

  // runCount is lifetime, so count the actual runs in the last 24 hours.
  const threshold = MAX_RUNS_PER_DAY[report.schedule.frequency] || 5
  const recentRuns = await countRecentRuns(report.reportId, new Date(now.getTime() - 24 * 60 * 60 * 1000))
  if (recentRuns > threshold) {
    return {
      action: 'pause',
      reason: `${recentRuns} runs in the last 24 hours (more than ${threshold} for a ${report.schedule.frequency} schedule)`
    }
  }

  return { action: 'run' }
}

/**
 * Format timeframe for display
 */
function formatTimeframe(timeframe: string): string {
  const now = new Date()
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const timeframeMap: Record<string, string> = {
    'thisMonth': `This Month (${monthName})`,
    'lastMonth': 'Last Month',
    'last3Months': 'Last 3 Months',
    'last6Months': 'Last 6 Months',
    'last12Months': 'Last 12 Months',
    'yearToDate': 'Year to Date',
    'lastYear': 'Last Year'
  }

  return timeframeMap[timeframe] || timeframe
}

/**
 * Format data mode for display
 */
function formatDataMode(mode: string): string {
  return mode === 'billable' ? 'Billable (Actual Costs)' : 'Pro-forma (With Savings Plans)'
}

/**
 * Build comprehensive date context for email templates
 * Provides various date formats based on the report timeframe
 */
function buildDateContext(timeframe: string): Record<string, string> {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed

  // Calculate date ranges based on timeframe
  let startDate: Date
  let endDate: Date

  switch (timeframe) {
    case 'thisMonth':
      startDate = new Date(currentYear, currentMonth, 1)
      endDate = new Date(currentYear, currentMonth + 1, 0)
      break

    case 'lastMonth':
      startDate = new Date(currentYear, currentMonth - 1, 1)
      endDate = new Date(currentYear, currentMonth, 0)
      break

    case 'last3Months':
      startDate = new Date(currentYear, currentMonth - 3, 1)
      endDate = new Date(currentYear, currentMonth, 0)
      break

    case 'last6Months':
      startDate = new Date(currentYear, currentMonth - 6, 1)
      endDate = new Date(currentYear, currentMonth, 0)
      break

    case 'last12Months':
      startDate = new Date(currentYear, currentMonth - 12, 1)
      endDate = new Date(currentYear, currentMonth, 0)
      break

    case 'yearToDate':
      startDate = new Date(currentYear, 0, 1)
      endDate = now
      break

    case 'lastYear':
      startDate = new Date(currentYear - 1, 0, 1)
      endDate = new Date(currentYear - 1, 11, 31)
      break

    default:
      startDate = new Date(currentYear, currentMonth - 1, 1)
      endDate = new Date(currentYear, currentMonth, 0)
  }

  // Build comprehensive date variables
  return {
    // Current date/time
    currentDate: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    currentMonth: now.toLocaleDateString('en-US', { month: 'long' }),
    currentMonthShort: now.toLocaleDateString('en-US', { month: 'short' }),
    currentYear: currentYear.toString(),
    currentDay: now.getDate().toString(),

    // Report period start
    startDate: startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    startMonth: startDate.toLocaleDateString('en-US', { month: 'long' }),
    startMonthShort: startDate.toLocaleDateString('en-US', { month: 'short' }),
    startYear: startDate.getFullYear().toString(),
    startDay: startDate.getDate().toString(),

    // Report period end
    endDate: endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    endMonth: endDate.toLocaleDateString('en-US', { month: 'long' }),
    endMonthShort: endDate.toLocaleDateString('en-US', { month: 'short' }),
    endYear: endDate.getFullYear().toString(),
    endDay: endDate.getDate().toString(),

    // Date range
    dateRange: `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,

    // ISO format dates (for technical use)
    startDateISO: startDate.toISOString().split('T')[0] || '',
    endDateISO: endDate.toISOString().split('T')[0] || '',

    // Quarter information
    quarter: `Q${Math.floor(startDate.getMonth() / 3) + 1}`,

    // Relative descriptions
    reportPeriod: timeframe === 'lastMonth'
      ? startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
  }
}
