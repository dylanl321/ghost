import { createError, type H3Event } from 'h3'
import type { ScheduledReport } from '../../shared/types/scheduled-reports'
import { getReport } from './scheduled-reports'
import { getUserEmail, isUserAdmin } from './user-roles'

export async function requireDatasetReportAccess(
  event: H3Event,
  reportId: string
): Promise<ScheduledReport> {
  const userEmail = getUserEmail(event)
  if (!userEmail) {
    throw createError({ statusCode: 401, message: 'User authentication required' })
  }

  const report = await getReport(reportId)
  const isDatasetReport = report?.reportType === 'dataset' ||
    (!report?.reportType && Boolean((report?.reportConfig as any)?.datasets))
  if (!report || !isDatasetReport) {
    throw createError({ statusCode: 404, message: 'Dataset report not found' })
  }

  if (report.createdBy !== userEmail && !await isUserAdmin(event)) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  return report
}
