/**
 * Download a shared dataset report
 * GET /api/dataset-reports/download/:shareId
 * Returns presigned S3 URL for download
 */

import { getTableConfig } from '../../../lib/dynamodb-config'
import { getReportDownloadUrl } from '../../../utils/s3-reports-storage'
import type { SharedReport } from '../../../shared/types/shared-reports'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const shareId = getRouterParam(event, 'shareId')

    if (!shareId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing shareId parameter'
      })
    }

    logger.info(`[Dataset Download] Downloading shared report: ${shareId}`)

    const tableConfig = await getTableConfig('sharedReports')

    // Get the shared report
    const report = await getItem(
      tableConfig.tableName,
      { shareId },
      tableConfig.environment,
      tableConfig.accountId
    ) as SharedReport | null

    if (!report) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Shared report not found'
      })
    }

    // Verify this is a dataset report
    if (report.reportType !== 'dataset') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid report type'
      })
    }

    // Check if expired
    if (report.expiresAt && new Date(report.expiresAt) < new Date()) {
      throw createError({
        statusCode: 410,
        statusMessage: 'Shared report has expired'
      })
    }

    // Increment download count
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

    // Generate fresh presigned URL on-demand (valid for 7 days)
    logger.info('[Dataset Download]   → Generating presigned URL for S3 download')
    const presignedUrl = await getReportDownloadUrl(report.s3Key, 7)

    logger.info(`[Dataset Download]   → Returning presigned URL`)

    // Return presigned URL for frontend to handle download
    return {
      presignedUrl,
      reportName: report.reportName,
      reportSize: report.reportSize,
      format: (report.reportConfig as any)?.format || 'pdf'
    }
  } catch (error: any) {
    logger.error('[Dataset Download] Error downloading shared report:', error)

    if (error.statusCode) {
      throw error // Re-throw HTTP errors
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to download shared report'
    })
  }
})
