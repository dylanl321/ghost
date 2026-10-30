/**
 * Shared report download
 * Resolves a share link to a fresh presigned URL; used by both the cost and
 * dataset share-download routes, which were near-identical copies
 */

import { getTableConfig } from '../lib/dynamodb-config'
import type { SharedReport } from '../../shared/types/shared-reports'
import { getItem, updateItem } from './dynamodb'
import { getReportDownloadUrl } from './s3-reports-storage'
import { logger } from './logger'

export async function resolveSharedReportDownload(
  shareId: string | undefined,
  options: { datasetOnly?: boolean } = {}
) {
  if (!shareId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing shareId parameter' })
  }

  try {
    const tableConfig = await getTableConfig('sharedReports')
    const report = await getItem(tableConfig.tableName, { shareId }, tableConfig.environment, tableConfig.accountId) as SharedReport | null

    if (!report) {
      throw createError({ statusCode: 404, statusMessage: 'Shared report not found' })
    }
    if (options.datasetOnly && report.reportType !== 'dataset') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid report type' })
    }
    if (report.expiresAt && new Date(report.expiresAt) < new Date()) {
      throw createError({ statusCode: 410, statusMessage: 'Shared report has expired' })
    }

    await updateItem(
      tableConfig.tableName,
      { shareId },
      {
        downloadCount: (report.downloadCount || 0) + 1,
        lastDownloadedAt: new Date().toISOString()
      },
      tableConfig.environment,
      tableConfig.accountId
    )

    // Signed on demand so the link works for the whole share lifetime
    const presignedUrl = await getReportDownloadUrl(report.s3Key, 7)

    return {
      presignedUrl,
      reportName: report.reportName,
      reportSize: report.reportSize,
      format: (report.reportConfig as { format?: string } | undefined)?.format || 'pdf'
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    logger.error(`[Shared Reports] Download failed for ${shareId}:`, error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to download shared report' })
  }
}
