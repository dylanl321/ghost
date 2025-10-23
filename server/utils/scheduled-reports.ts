/**
 * Scheduled Reports DynamoDB Operations
 * CRUD operations and queries for scheduled reports
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  ScheduledReport,
  ReportExecution,
  CreateReportRequest,
  UpdateReportRequest,
  ReportStatistics
} from '~/shared/types/scheduled-reports'
import {
  getItem,
  putItem,
  updateItem,
  deleteItem,
  queryItems,
  scanItems
} from './dynamodb'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'

// Table configuration now loaded dynamically from Secrets Manager or environment variables

/**
 * Calculate next N run times based on schedule configuration
 * Returns an array of upcoming execution times
 */
export function calculateNextNRunTimes(schedule: any, timezone: string, n: number = 3): Date[] {
  const runs: Date[] = []
  let currentTime = new Date()

  for (let i = 0; i < n; i++) {
    const nextRun = calculateNextRunTime(schedule, timezone, currentTime)
    runs.push(nextRun)
    // Set current time to just after this run for next calculation
    currentTime = new Date(nextRun.getTime() + 60000) // Add 1 minute
  }

  return runs
}

/**
 * Calculate next run time based on schedule configuration
 */
export function calculateNextRunTime(schedule: any, timezone: string, fromTime?: Date): Date {
  const now = fromTime || new Date()

  // Convert current time to user's timezone for calculation
  const nowInTz = convertToTimezone(now, timezone)

  let nextRunInTz: Date

  switch (schedule.frequency) {
    case 'daily': {
      // Parse time (HH:MM) - this is in user's timezone
      const [hours, minutes] = schedule.time.split(':').map(Number)
      nextRunInTz = new Date(nowInTz)
      nextRunInTz.setHours(hours, minutes, 0, 0)

      // If time has passed today, schedule for tomorrow
      if (nextRunInTz <= nowInTz) {
        nextRunInTz.setDate(nextRunInTz.getDate() + 1)
      }
      break
    }

    case 'weekly': {
      const [hours, minutes] = schedule.time.split(':').map(Number)
      const targetDay = schedule.dayOfWeek || 1 // Default Monday
      const currentDay = nowInTz.getDay()

      nextRunInTz = new Date(nowInTz)
      nextRunInTz.setHours(hours, minutes, 0, 0)

      // Calculate days until target day
      let daysUntil = targetDay - currentDay
      if (daysUntil <= 0 || (daysUntil === 0 && nextRunInTz <= nowInTz)) {
        daysUntil += 7
      }

      nextRunInTz.setDate(nowInTz.getDate() + daysUntil)
      break
    }

    case 'monthly': {
      const [hours, minutes] = schedule.time.split(':').map(Number)
      const targetDay = schedule.dayOfMonth || 1

      nextRunInTz = new Date(nowInTz)
      nextRunInTz.setHours(hours, minutes, 0, 0)
      nextRunInTz.setDate(targetDay)

      // If date has passed this month, schedule for next month
      if (nextRunInTz <= nowInTz) {
        nextRunInTz.setMonth(nextRunInTz.getMonth() + 1)
      }

      // Handle month overflow (e.g., day 31 in February)
      if (nextRunInTz.getDate() !== targetDay) {
        // Set to last day of month
        nextRunInTz.setDate(0)
      }
      break
    }

    case 'quarterly': {
      const [hours, minutes] = schedule.time.split(':').map(Number)
      const targetMonth = schedule.monthOfQuarter || 1
      const currentMonth = nowInTz.getMonth()
      const currentQuarter = Math.floor(currentMonth / 3)

      nextRunInTz = new Date(nowInTz)
      nextRunInTz.setHours(hours, minutes, 0, 0)

      // Calculate next quarter month
      let nextQuarter = currentQuarter
      const targetMonthInYear = (currentQuarter * 3) + (targetMonth - 1)

      if (currentMonth > targetMonthInYear ||
          (currentMonth === targetMonthInYear && nextRunInTz <= nowInTz)) {
        nextQuarter++
      }

      if (nextQuarter > 3) {
        nextQuarter = 0
        nextRunInTz.setFullYear(nextRunInTz.getFullYear() + 1)
      }

      nextRunInTz.setMonth((nextQuarter * 3) + (targetMonth - 1))
      nextRunInTz.setDate(1)
      break
    }

    default:
      nextRunInTz = new Date(nowInTz)
  }

  // Convert back to UTC for storage
  return convertFromTimezone(nextRunInTz, timezone)
}

/**
 * Convert a Date to a specific timezone (returns a Date representing that time in that timezone)
 */
function convertToTimezone(date: Date, timezone: string): Date {
  // Format the date in the target timezone
  const dateStr = date.toLocaleString('en-US', { timeZone: timezone })
  return new Date(dateStr)
}

/**
 * Convert a date from a specific timezone back to UTC
 * Input date represents a local time in the timezone, output is UTC
 */
function convertFromTimezone(localDate: Date, timezone: string): Date {
  // Create a string representation of the local time
  const year = localDate.getFullYear()
  const month = String(localDate.getMonth() + 1).padStart(2, '0')
  const day = String(localDate.getDate()).padStart(2, '0')
  const hours = String(localDate.getHours()).padStart(2, '0')
  const minutes = String(localDate.getMinutes()).padStart(2, '0')
  const seconds = String(localDate.getSeconds()).padStart(2, '0')

  // ISO string representing time in the timezone
  const isoString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`

  // Parse it as if it were in the specified timezone
  const dateInTz = new Date(new Date(isoString).toLocaleString('en-US', { timeZone: 'UTC' }))
  const dateInUtc = new Date(new Date(isoString).toLocaleString('en-US', { timeZone: timezone }))

  // Calculate the offset and adjust
  const offset = dateInTz.getTime() - dateInUtc.getTime()
  return new Date(localDate.getTime() - offset)
}

/**
 * Get a scheduled report by ID
 */
export async function getReport(reportId: string): Promise<ScheduledReport | null> {
  try {
    const tableName = await getTableName('scheduledReports')
    const environment = await getTableEnvironment('scheduledReports')
    const accountId = await getTableAccountId('scheduledReports')

    // Query by partition key (reportId)
    const result = await queryItems(
      {
        tableName,
        queryExpression: 'reportId = :reportId',
        expressionAttributeValues: { ':reportId': reportId },
        limit: 1
      },
      environment,
      accountId
    )

    return result.items[0] as ScheduledReport || null
  } catch (error) {
    console.error('Error getting report:', error)
    return null
  }
}

/**
 * List reports for a user
 */
export async function listUserReports(
  userId: string,
  status?: string,
  limit: number = 50
): Promise<{ reports: ScheduledReport[]; total: number }> {
  try {
    if (!userId) {
      console.warn('listUserReports called without userId')
      return { reports: [], total: 0 }
    }

    const tableName = await getTableName('scheduledReports')
    const environment = await getTableEnvironment('scheduledReports')
    const accountId = await getTableAccountId('scheduledReports')

    const expressionAttributeValues: Record<string, any> = { ':userId': userId }
    const expressionAttributeNames: Record<string, string> = {}
    let filterExpression = 'createdBy = :userId'

    if (status) {
      expressionAttributeNames['#status'] = 'status'
      expressionAttributeValues[':status'] = status
      filterExpression += ' AND #status = :status'
    }

    const result = await scanItems(
      tableName,
      filterExpression,
      limit,
      undefined,
      environment,
      Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      expressionAttributeValues,
      accountId
    )

    return {
      reports: result.items as ScheduledReport[],
      total: result.count
    }
  } catch (error) {
    console.error('Error listing user reports:', error)
    return { reports: [], total: 0 }
  }
}

/**
 * List all reports (admin only)
 */
export async function listAllReports(
  limit: number = 100
): Promise<{ reports: ScheduledReport[]; total: number }> {
  try {
    const tableName = await getTableName('scheduledReports')
    const environment = await getTableEnvironment('scheduledReports')
    const accountId = await getTableAccountId('scheduledReports')
    const result = await scanItems(
      tableName,
      undefined,
      limit,
      undefined,
      environment,
      undefined,
      undefined,
      accountId
    )

    return {
      reports: result.items as ScheduledReport[],
      total: result.count
    }
  } catch (error) {
    console.error('Error listing all reports:', error)
    return { reports: [], total: 0 }
  }
}

/**
 * Get upcoming reports that need to run
 */
export async function getUpcomingReports(
  withinSeconds: number = 60
): Promise<ScheduledReport[]> {
  try {
    const tableName = await getTableName('scheduledReports')
    const environment = await getTableEnvironment('scheduledReports')
    const accountId = await getTableAccountId('scheduledReports')
    const now = new Date()
    const future = new Date(now.getTime() + withinSeconds * 1000)

    const result = await scanItems(
      tableName,
      `#status = :active AND nextRunTime <= :future`,
      100,
      undefined,
      environment,
      {
        '#status': 'status'
      },
      {
        ':active': 'active',
        ':future': future.toISOString()
      },
      accountId
    )

    return result.items.filter((report: any) => {
      const nextRun = new Date(report.nextRunTime)
      return nextRun <= future && report.status === 'active'
    }) as ScheduledReport[]
  } catch (error) {
    console.error('Error getting upcoming reports:', error)
    return []
  }
}

/**
 * Create a new scheduled report
 */
export async function createReport(
  request: CreateReportRequest,
  createdBy: string,
  isAdmin: boolean = false
): Promise<ScheduledReport> {
  const reportId = uuidv4()
  const now = new Date().toISOString()

  // Get user's timezone from preferences (fallback to report's timezone)
  let timezone = request.schedule.timezone
  try {
    const { getUserPreferences } = await import('./user-preferences')
    const userPrefs = await getUserPreferences(createdBy)
    if (userPrefs?.timezone) {
      timezone = userPrefs.timezone
    }
  } catch (error) {
    console.warn('Failed to get user timezone preferences, using schedule timezone:', error)
  }

  const nextRunTime = calculateNextRunTime(
    request.schedule,
    timezone
  ).toISOString()

  const report: ScheduledReport = {
    reportId,
    reportName: request.reportName,
    description: request.description,
    createdBy,
    isAdmin,
    reportConfig: request.reportConfig,
    schedule: request.schedule,
    recipients: request.recipients,
    emailTemplate: {
      templateId: request.emailTemplate?.templateId,
      subject: request.emailTemplate?.subject || 'Your Scheduled AWS Cost Report',
      body: request.emailTemplate?.body || '',
      isCustom: request.emailTemplate?.isCustom || false
    },
    status: 'active',
    nextRunTime,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
    userIdStatus: `${createdBy}#active`
  }

  const tableName = await getTableName('scheduledReports')
  const environment = await getTableEnvironment('scheduledReports')
  const accountId = await getTableAccountId('scheduledReports')
  await putItem(tableName, report, environment, accountId)
  return report
}

/**
 * Update a scheduled report
 */
export async function updateReport(
  reportId: string,
  updates: UpdateReportRequest
): Promise<ScheduledReport | null> {
  try {
    const existing = await getReport(reportId)
    if (!existing) return null

    const updatedReport: any = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    }

    // Recalculate next run time if schedule changed
    if (updates.schedule) {
      updatedReport.schedule = {
        ...existing.schedule,
        ...updates.schedule
      }

      // Get user's timezone from preferences (fallback to schedule timezone)
      let timezone = updatedReport.schedule.timezone
      try {
        const { getUserPreferences } = await import('./user-preferences')
        const userPrefs = await getUserPreferences(existing.createdBy)
        if (userPrefs?.timezone) {
          timezone = userPrefs.timezone
        }
      } catch (error) {
        console.warn('Failed to get user timezone preferences, using schedule timezone:', error)
      }

      updatedReport.nextRunTime = calculateNextRunTime(
        updatedReport.schedule,
        timezone
      ).toISOString()
    }

    // Update userIdStatus if status changed
    if (updates.status) {
      updatedReport.userIdStatus = `${existing.createdBy}#${updates.status}`
    }

    const tableName = await getTableName('scheduledReports')
    const environment = await getTableEnvironment('scheduledReports')
    const accountId = await getTableAccountId('scheduledReports')
    await putItem(tableName, updatedReport, environment, accountId)
    return updatedReport as ScheduledReport
  } catch (error) {
    console.error('Error updating report:', error)
    return null
  }
}

/**
 * Delete a scheduled report
 */
export async function deleteReport(reportId: string): Promise<boolean> {
  try {
    const report = await getReport(reportId)
    if (!report) return false

    const tableName = await getTableName('scheduledReports')
    const environment = await getTableEnvironment('scheduledReports')
    const accountId = await getTableAccountId('scheduledReports')
    await deleteItem(
      tableName,
      { reportId, createdAt: report.createdAt },
      environment,
      accountId
    )
    return true
  } catch (error) {
    console.error('Error deleting report:', error)
    return false
  }
}

/**
 * Update report execution status
 */
export async function updateReportRunStatus(
  reportId: string,
  status: 'success' | 'failed',
  error?: string
): Promise<void> {
  try {
    const report = await getReport(reportId)
    if (!report) return

    const now = new Date().toISOString()
    const nextRunTime = calculateNextRunTime(
      report.schedule,
      report.schedule.timezone
    ).toISOString()

    const updates: any = {
      lastRunTime: now,
      lastRunStatus: status,
      nextRunTime,
      runCount: report.runCount + 1,
      updatedAt: now
    }

    if (error) {
      updates.lastRunError = error
    } else if (report.lastRunError) {
      updates.lastRunError = null
    }

    const tableName = await getTableName('scheduledReports')
    const environment = await getTableEnvironment('scheduledReports')
    const accountId = await getTableAccountId('scheduledReports')
    await putItem(
      tableName,
      { ...report, ...updates },
      environment,
      accountId
    )
  } catch (error) {
    console.error('Error updating run status:', error)
  }
}

/**
 * Record a report execution in history
 */
export async function recordExecution(execution: Omit<ReportExecution, 'executionId'>): Promise<void> {
  try {
    const fullExecution: ReportExecution = {
      ...execution,
      executionId: uuidv4(),
      expiresAt: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    }

    const executionsTableName = await getTableName('reportExecutions')
    const environment = await getTableEnvironment('reportExecutions')
    const accountId = await getTableAccountId('reportExecutions')
    await putItem(executionsTableName, fullExecution, environment, accountId)
  } catch (error) {
    console.error('Error recording execution:', error)
  }
}

/**
 * Get execution history for a report
 */
export async function getExecutionHistory(
  reportId: string,
  limit: number = 50
): Promise<ReportExecution[]> {
  try {
    const executionsTableName = await getTableName('reportExecutions')
    const environment = await getTableEnvironment('reportExecutions')
    const accountId = await getTableAccountId('reportExecutions')

    // Query by partition key (reportId), sorted by executionTime descending
    const result = await queryItems(
      {
        tableName: executionsTableName,
        queryExpression: 'reportId = :reportId',
        expressionAttributeValues: { ':reportId': reportId },
        limit
      },
      environment,
      accountId
    )

    // Sort by execution time descending
    return (result.items as ReportExecution[]).sort((a, b) =>
      new Date(b.executionTime).getTime() - new Date(a.executionTime).getTime()
    )
  } catch (error) {
    console.error('Error getting execution history:', error)
    return []
  }
}

/**
 * Get statistics for admin dashboard
 */
export async function getReportStatistics(): Promise<ReportStatistics> {
  try {
    const allReports = await listAllReports(1000)
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const stats: ReportStatistics = {
      totalReports: allReports.total,
      activeReports: 0,
      pausedReports: 0,
      disabledReports: 0,
      reportsByFrequency: {
        daily: 0,
        weekly: 0,
        monthly: 0,
        quarterly: 0
      },
      recentExecutions: {
        last24h: 0,
        successRate: 0,
        failureRate: 0
      },
      upcomingRuns: {
        next1h: 0,
        next24h: 0,
        next7d: 0
      }
    }

    // Count by status and frequency
    for (const report of allReports.reports) {
      // Status
      if (report.status === 'active') stats.activeReports++
      else if (report.status === 'paused') stats.pausedReports++
      else if (report.status === 'disabled') stats.disabledReports++

      // Frequency
      stats.reportsByFrequency[report.schedule.frequency]++

      // Upcoming runs
      const nextRun = new Date(report.nextRunTime)
      if (nextRun <= new Date(now.getTime() + 60 * 60 * 1000)) {
        stats.upcomingRuns.next1h++
      }
      if (nextRun <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
        stats.upcomingRuns.next24h++
      }
      if (nextRun <= sevenDaysFromNow) {
        stats.upcomingRuns.next7d++
      }

      // Recent executions
      if (report.lastRunTime && new Date(report.lastRunTime) >= oneDayAgo) {
        stats.recentExecutions.last24h++
      }
    }

    // Calculate success rate
    const recentWithStatus = allReports.reports.filter(
      r => r.lastRunTime && new Date(r.lastRunTime) >= oneDayAgo
    )
    if (recentWithStatus.length > 0) {
      const successes = recentWithStatus.filter(r => r.lastRunStatus === 'success').length
      stats.recentExecutions.successRate = (successes / recentWithStatus.length) * 100
      stats.recentExecutions.failureRate = 100 - stats.recentExecutions.successRate
    }

    return stats
  } catch (error) {
    console.error('Error getting statistics:', error)
    throw error
  }
}
