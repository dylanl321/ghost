/**
 * Download a shared report
 * GET /api/reports/download/:shareId
 * Redirects to S3 presigned URL
 */

import { getTableName, getTableEnvironment } from '../../../lib/dynamodb-config'
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

    const tableName = await getTableName('shared-reports')
    const environment = await getTableEnvironment('shared-reports')

    // Get the shared report
    const report = await getItem(tableName, { shareId }, environment) as SharedReport | null

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
      tableName,
      { shareId },
      {
        downloadCount: (report.downloadCount || 0) + 1
      },
      environment
    )

    // Generate fresh presigned URL (or use existing if still valid)
    let downloadUrl = report.s3Url

    // If URL is expired or missing, generate a new one
    if (!downloadUrl || (report.s3UrlExpiresAt && new Date(report.s3UrlExpiresAt) < new Date())) {
      console.log('  → Generating fresh presigned URL')
      downloadUrl = await getReportDownloadUrl(report.s3Key, 30) // 30 days
    }

    console.log(`  → Redirecting to S3 download`)

    // Redirect to S3 presigned URL
    return sendRedirect(event, downloadUrl, 302)
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
