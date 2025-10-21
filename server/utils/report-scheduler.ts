/**
 * Report Scheduler Service
 * Manages execution of scheduled reports
 */

import type { ScheduledReport } from '~/shared/types/scheduled-reports'
import {
  getUpcomingReports,
  updateReportRunStatus,
  recordExecution
} from './scheduled-reports'
import { generateCostReport } from './report-generator'
import { sendReportEmail, renderTemplate, getDefaultTemplate } from './email-service'
import { claimExecutionLock, createLockId } from './execution-locks'
import { uploadReportToS3 } from './s3-reports-storage'

/**
 * Execute a single scheduled report
 */
export async function executeScheduledReport(report: ScheduledReport): Promise<{
  success: boolean
  error?: string
  duration?: number
}> {
  const startTime = Date.now()

  console.log(`Executing scheduled report: ${report.reportName} (${report.reportId})`)

  try {
    // Step 1: Generate the report
    console.log('  → Generating report...')
    const reportResult = await generateCostReport(report.reportConfig)

    if (!reportResult.success || !reportResult.buffer) {
      throw new Error(reportResult.error || 'Failed to generate report')
    }

    console.log(`  → Report generated: ${reportResult.filename} (${reportResult.buffer.length} bytes)`)

    // Step 2: Upload report to S3
    console.log('  → Uploading report to S3...')
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const s3UploadResult = await uploadReportToS3(
      'scheduled',
      reportResult.buffer,
      {
        reportId: report.reportId,
        reportName: report.reportName,
        userId: report.createdBy,
        executionId,
        format: report.reportConfig.format === 'pdf' ? 'pdf' : 'csv'
      }
    )

    if (!s3UploadResult.success) {
      console.warn(`  ⚠ Failed to upload report to S3: ${s3UploadResult.error}`)
      // Continue execution - we can still send email with attachment
    } else {
      console.log(`  → Report uploaded to S3: ${s3UploadResult.key}`)
    }

    // Step 3: Prepare email content with enhanced date context
    const dateContext = buildDateContext(report.reportConfig.timeframe)

    const emailSubject = renderTemplate(report.emailTemplate.subject, {
      reportName: report.reportName,
      timeframe: formatTimeframe(report.reportConfig.timeframe),
      dataMode: formatDataMode(report.reportConfig.dataMode),
      ...dateContext
    })

    let emailBody = report.emailTemplate.body
    if (!emailBody || emailBody.trim() === '') {
      emailBody = getDefaultTemplate()
    }

    // Build template context
    // Use environment-specific site URL, falling back to localhost in dev
    const siteUrl = process.env.NUXT_PUBLIC_SITE_URL ||
                    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')

    if (!siteUrl) {
      console.warn('NUXT_PUBLIC_SITE_URL not set - email links will be empty')
    }

    const templateContext = {
      userName: report.createdBy.split('@')[0], // Extract name from email
      reportName: report.reportName,
      timeframe: formatTimeframe(report.reportConfig.timeframe),
      dataMode: formatDataMode(report.reportConfig.dataMode),
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
      recipientEmail: report.recipients[0], // First recipient
      downloadUrl: s3UploadResult.s3Url || '', // S3 presigned download URL
      ...dateContext // Include all date variables
    }

    const renderedBody = renderTemplate(emailBody, templateContext)

    // Step 4: Send email to all recipients
    console.log(`  → Sending email to ${report.recipients.length} recipient(s)...`)
    const emailResult = await sendReportEmail(
      report.recipients,
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
    console.log(`  ✓ Report sent successfully in ${duration}ms`)

    // Step 5: Update report status
    await updateReportRunStatus(report.reportId, 'success')

    // Step 6: Record execution with email delivery details and S3 storage info
    await recordExecution({
      reportId: report.reportId,
      executionId,
      executionTime: new Date().toISOString(),
      status: 'success',
      duration,
      emailsSent: emailResult.deliveryDetails?.totalSent || report.recipients.length,
      emailsFailed: emailResult.deliveryDetails?.totalFailed || 0,
      reportSize: reportResult.buffer.length,
      emailDelivery: emailResult.deliveryDetails,  // Store detailed delivery info
      s3Key: s3UploadResult.key,                   // S3 object key
      s3Url: s3UploadResult.s3Url,                 // Presigned download URL
      s3UrlExpiresAt: s3UploadResult.s3UrlExpiresAt, // URL expiration
      downloadCount: 0                              // Initialize download counter
    })

    return {
      success: true,
      duration
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    const errorMessage = error.message || 'Unknown error during report execution'

    console.error(`  ✗ Report execution failed: ${errorMessage}`)

    // Update report status with error
    await updateReportRunStatus(report.reportId, 'failed', errorMessage)

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
    })

    return {
      success: false,
      error: errorMessage,
      duration
    }
  }
}

/**
 * Check for and execute all due reports
 */
export async function processScheduledReports(): Promise<{
  processed: number
  successful: number
  failed: number
}> {
  try {
    // Get reports due in next 60 seconds
    const dueReports = await getUpcomingReports(60)

    if (dueReports.length === 0) {
      return { processed: 0, successful: 0, failed: 0 }
    }

    console.log(`Found ${dueReports.length} report(s) to execute`)

    let successful = 0
    let failed = 0
    let skipped = 0

    // Execute reports sequentially to avoid overwhelming the system
    for (const report of dueReports) {
      // Try to claim execution lock
      const lockClaimed = await claimExecutionLock(report.reportId, report.nextRunTime)

      if (!lockClaimed) {
        console.log(`⊘ Skipping ${report.reportName} - already claimed by another container`)
        skipped++
        continue
      }

      // Lock claimed successfully, execute the report
      const result = await executeScheduledReport(report)

      if (result.success) {
        successful++
      } else {
        failed++
      }

      // Small delay between reports
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    if (skipped > 0) {
      console.log(`⊘ Skipped ${skipped} report(s) (already claimed by other containers)`)
    }

    return {
      processed: successful + failed,
      successful,
      failed
    }
  } catch (error: any) {
    console.error('Error processing scheduled reports:', error)
    return { processed: 0, successful: 0, failed: 0 }
  }
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
    startDateISO: startDate.toISOString().split('T')[0],
    endDateISO: endDate.toISOString().split('T')[0],

    // Quarter information
    quarter: `Q${Math.floor(startDate.getMonth() / 3) + 1}`,

    // Relative descriptions
    reportPeriod: timeframe === 'lastMonth'
      ? startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
  }
}
