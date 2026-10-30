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
} from '../../shared/types/scheduled-reports'
import {
  putItem,
  deleteItem,
  queryItems,
  queryAllItems,
  scanAllItems
} from './dynamodb'
import { calculateNextRunTime } from '../../shared/utils/report-schedule'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import { logger } from './logger'

// Table configuration now loaded dynamically from Secrets Manager or environment variables

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
    logger.error('Error getting report:', error)
    return null
  }
}

/**
 * List reports for a user
 */
export async function listUserReports(
  userId: string,
  status?: string,
  limit: number = 50,
  cursor?: string
): Promise<{ reports: ScheduledReport[]; total: number; nextCursor?: string }> {
  try {
    if (!userId) {
      logger.warn('listUserReports called without userId')
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

    // Scan every page: Limit is applied before the filter, so a limited scan
    // only sees the first N reports in the table, not the first N of this user's.
    const items = await scanAllItems(
      tableName,
      filterExpression,
      environment,
      Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      expressionAttributeValues,
      accountId
    ) as ScheduledReport[]
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

    const offset = Math.max(Number.parseInt(cursor || '0', 10) || 0, 0)
    const page = items.slice(offset, offset + limit)
    return {
      reports: page,
      total: items.length,
      nextCursor: offset + limit < items.length ? String(offset + limit) : undefined
    }
  } catch (error) {
    logger.error('Error listing user reports:', error)
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
    const items = await scanAllItems(tableName, undefined, environment, undefined, undefined, accountId) as ScheduledReport[]
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

    return {
      reports: items.slice(0, limit),
      total: items.length
    }
  } catch (error) {
    logger.error('Error listing all reports:', error)
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

    // Every page, so a due report is never missed once the table outgrows one page.
    const items = await scanAllItems(
      tableName,
      `#status = :active AND nextRunTime <= :future`,
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

    return items.filter((report: any) => {
      const nextRun = new Date(report.nextRunTime)
      return nextRun <= future && report.status === 'active'
    }) as ScheduledReport[]
  } catch (error) {
    logger.error('Error getting upcoming reports:', error)
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

  // ALWAYS use the schedule's timezone, not user preferences
  // The schedule defines when the report should run in its specified timezone
  const timezone = request.schedule.timezone
  logger.info(`Creating report "${request.reportName}" with schedule timezone: ${timezone}`)

  const nextRunTime = calculateNextRunTime(
    request.schedule,
    timezone
  ).toISOString()

  logger.info(`  Calculated nextRunTime: ${nextRunTime}`)

  const report: ScheduledReport = {
    reportId,
    reportName: request.reportName,
    description: request.description,
    reportType: request.reportType || 'cost',
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

const EDITABLE_REPORT_FIELDS = [
  'reportName',
  'description',
  'reportConfig',
  'schedule',
  'recipients',
  'emailTemplate',
  'status'
] as const satisfies readonly (keyof UpdateReportRequest)[]

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

    // Only user-editable fields; ownership, run bookkeeping and keys stay as stored.
    const editable: UpdateReportRequest = {}
    for (const key of EDITABLE_REPORT_FIELDS) {
      if (updates[key] !== undefined) (editable as any)[key] = updates[key]
    }

    const updatedReport: any = {
      ...existing,
      ...editable,
      updatedAt: new Date().toISOString()
    }

    // Recalculate next run time if schedule changed
    if (updates.schedule) {
      updatedReport.schedule = {
        ...existing.schedule,
        ...updates.schedule
      }

      // ALWAYS use the schedule's timezone, not user preferences
      // The schedule defines when the report should run in its specified timezone
      const timezone = updatedReport.schedule.timezone
      logger.info(`Recalculating nextRunTime for ${existing.reportName} using schedule timezone: ${timezone}`)

      updatedReport.nextRunTime = calculateNextRunTime(
        updatedReport.schedule,
        timezone
      ).toISOString()

      logger.info(`  New nextRunTime: ${updatedReport.nextRunTime}`)
    }

    // A report resumed after its next run went by would otherwise be due
    // immediately with a stale nextRunTime; schedule the next real slot.
    if (!updates.schedule && editable.status === 'active' && existing.status !== 'active' &&
        new Date(updatedReport.nextRunTime).getTime() <= Date.now()) {
      updatedReport.nextRunTime = calculateNextRunTime(updatedReport.schedule, updatedReport.schedule.timezone).toISOString()
    }

    // Update userIdStatus if status changed
    if (editable.status) {
      updatedReport.userIdStatus = `${existing.createdBy}#${editable.status}`
    }

    const tableName = await getTableName('scheduledReports')
    const environment = await getTableEnvironment('scheduledReports')
    const accountId = await getTableAccountId('scheduledReports')
    await putItem(tableName, updatedReport, environment, accountId)
    return updatedReport as ScheduledReport
  } catch (error) {
    logger.error('Error updating report:', error)
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
    logger.error('Error deleting report:', error)
    return false
  }
}

/**
 * Update report execution status
 */
export async function updateReportRunStatus(
  reportId: string,
  status: 'success' | 'failed',
  error?: string,
  scheduledSlot?: string
): Promise<void> {
  try {
    const report = await getReport(reportId)
    if (!report) return

    const now = new Date().toISOString()

    logger.info(`Updating run status for ${report.reportName} (status: ${status})`)
    logger.info(`  Using schedule timezone: ${report.schedule.timezone}`)

    // A scheduled run can start up to a minute before its slot, so the next
    // run is the one after that slot; counting from "now" would return the
    // same slot again and send the report twice. A manual run leaves the
    // schedule alone unless the stored time has already passed.
    const nowMs = Date.now()
    const storedNext = new Date(report.nextRunTime).getTime()
    let nextRunTime: string
    if (scheduledSlot) {
      const base = Math.max(nowMs, new Date(scheduledSlot).getTime() || nowMs)
      nextRunTime = calculateNextRunTime(report.schedule, report.schedule.timezone, new Date(base)).toISOString()
    } else if (Number.isFinite(storedNext) && storedNext > nowMs) {
      nextRunTime = report.nextRunTime
    } else {
      nextRunTime = calculateNextRunTime(report.schedule, report.schedule.timezone).toISOString()
    }

    logger.info(`  Calculated nextRunTime: ${nextRunTime}`)

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
    logger.error('Error updating run status:', error)
  }
}

/**
 * Record a report execution in history
 */
export async function recordExecution(
  execution: Omit<ReportExecution, 'executionId'> & { executionId?: string }
): Promise<ReportExecution> {
  try {
    const fullExecution: ReportExecution = {
      ...execution,
      executionId: execution.executionId || uuidv4(),
      expiresAt: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    }

    const executionsTableName = await getTableName('reportExecutions')
    const environment = await getTableEnvironment('reportExecutions')
    const accountId = await getTableAccountId('reportExecutions')
    await putItem(executionsTableName, fullExecution, environment, accountId)
    return fullExecution
  } catch (error) {
    logger.error('Error recording execution:', error)
    throw error
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
        // Newest first, so the limit drops the oldest runs rather than the latest
        scanIndexForward: false,
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
    logger.error('Error getting execution history:', error)
    return []
  }
}

/**
 * Find one execution of a report. The table's sort key is executionTime, so
 * an executionId alone is not a key: look it up within the report's runs.
 */
export async function getExecution(reportId: string, executionId: string): Promise<ReportExecution | null> {
  const executionsTableName = await getTableName('reportExecutions')
  const environment = await getTableEnvironment('reportExecutions')
  const accountId = await getTableAccountId('reportExecutions')

  const matches = await queryAllItems(
    {
      tableName: executionsTableName,
      queryExpression: 'reportId = :reportId',
      filterExpression: 'executionId = :executionId',
      expressionAttributeValues: { ':reportId': reportId, ':executionId': executionId },
      scanIndexForward: false
    },
    environment,
    accountId,
    { stopWhen: items => items.length > 0 }
  )
  return (matches[0] as ReportExecution | undefined) || null
}

/**
 * Count executions of a report since the given time (manual runs included)
 */
export async function countExecutionsSince(reportId: string, since: Date): Promise<number> {
  const executionsTableName = await getTableName('reportExecutions')
  const environment = await getTableEnvironment('reportExecutions')
  const accountId = await getTableAccountId('reportExecutions')

  const items = await queryAllItems(
    {
      tableName: executionsTableName,
      queryExpression: 'reportId = :reportId AND executionTime >= :since',
      expressionAttributeValues: { ':reportId': reportId, ':since': since.toISOString() },
      projectionExpression: 'executionId'
    },
    environment,
    accountId
  )
  return items.length
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
      const frequency = report.schedule?.frequency
      if (frequency && frequency in stats.reportsByFrequency) stats.reportsByFrequency[frequency]++

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
    logger.error('Error getting statistics:', error)
    throw error
  }
}
