/**
 * Download a shared report
 * GET /api/reports/download/:shareId
 * Redirects to S3 presigned URL
 */

import { getTableConfig } from '../../../lib/dynamodb-config'
import type { SharedReport } from '~/shared/types/shared-reports'

export default defineEventHandler(async (event) => {
  try {
    const shareId = getRouterParam(event, 'shareId')

    if (!shareId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing shareId parameter'
      })
    }

    console.log(`Downloading shared report: ${shareId}`)

    const tableConfig = await getTableConfig('sharedReports')

    // Get the shared report
    const report = await getItem(tableConfig.tableName, { shareId }, tableConfig.environment, tableConfig.accountId) as SharedReport | null

    if (!report) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Shared report not found'
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
        downloadCount: (report.downloadCount || 0) + 1
      },
      tableConfig.environment,
      tableConfig.accountId
    )

    // Generate fresh presigned URL on-demand (valid for 7 days)
    console.log('  → Generating presigned URL for S3 download')
    const presignedUrl = await getReportDownloadUrl(report.s3Key, 7)

    console.log(`  → Returning presigned URL`)

    // Return presigned URL for frontend to handle download
    return {
      presignedUrl,
      reportName: report.reportName,
      reportSize: report.reportSize
    }
  } catch (error: any) {
    console.error('Error downloading shared report:', error)

    if (error.statusCode) {
      throw error // Re-throw HTTP errors
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to download shared report'
    })
  }
})
