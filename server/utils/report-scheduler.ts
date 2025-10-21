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

    // Step 2: Prepare email content
    const emailSubject = renderTemplate(report.emailTemplate.subject, {
      reportName: report.reportName,
      timeframe: formatTimeframe(report.reportConfig.timeframe),
      dataMode: formatDataMode(report.reportConfig.dataMode)
    })

    let emailBody = report.emailTemplate.body
    if (!emailBody || emailBody.trim() === '') {
      emailBody = getDefaultTemplate()
    }

    // Build template context
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
      dashboardUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://ghost-dashboard.com',
      settingsUrl: `${process.env.NUXT_PUBLIC_SITE_URL || 'https://ghost-dashboard.com'}/reports/scheduled`,
      recipientEmail: report.recipients[0] // First recipient
    }

    const renderedBody = renderTemplate(emailBody, templateContext)

    // Step 3: Send email to all recipients
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

    // Step 4: Update report status
    await updateReportRunStatus(report.reportId, 'success')

    // Step 5: Record execution with email delivery details
    await recordExecution({
      reportId: report.reportId,
      executionTime: new Date().toISOString(),
      status: 'success',
      duration,
      emailsSent: emailResult.deliveryDetails?.totalSent || report.recipients.length,
      emailsFailed: emailResult.deliveryDetails?.totalFailed || 0,
      reportSize: reportResult.buffer.length,
      emailDelivery: emailResult.deliveryDetails  // Store detailed delivery info
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
