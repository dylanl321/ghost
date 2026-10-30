import { createError, type H3Event } from 'h3'
import type { ScheduledReport } from '../../shared/types/scheduled-reports'
import { getReport } from './scheduled-reports'
import { getUserEmail, isUserAdmin } from './user-roles'

export function isDatasetReport(report: Pick<ScheduledReport, 'reportType' | 'reportConfig'>): boolean {
  return report.reportType === 'dataset' ||
    (!report.reportType && Boolean((report.reportConfig as any)?.datasets))
}

/**
 * Load a scheduled report the caller owns (or any report, for an admin).
 * Every route that reads or changes one report goes through here so the
 * ownership rule is the same for cost and dataset reports.
 */
export async function requireScheduledReportAccess(
  event: H3Event,
  reportId: string,
  options: { datasetOnly?: boolean } = {}
): Promise<ScheduledReport> {
  const userEmail = getUserEmail(event)
  if (!userEmail) {
    throw createError({ statusCode: 401, message: 'User authentication required' })
  }

  const report = await getReport(reportId)
  if (!report || (options.datasetOnly && !isDatasetReport(report))) {
    throw createError({ statusCode: 404, message: options.datasetOnly ? 'Dataset report not found' : 'Report not found' })
  }

  if (report.createdBy !== userEmail && !await isUserAdmin(event)) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  return report
}

export function requireDatasetReportAccess(event: H3Event, reportId: string): Promise<ScheduledReport> {
  return requireScheduledReportAccess(event, reportId, { datasetOnly: true })
}
