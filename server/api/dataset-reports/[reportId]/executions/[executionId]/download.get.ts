/**
 * Download a dataset report from execution history
 * GET /api/dataset-reports/:reportId/executions/:executionId/download
 * Returns presigned URL for downloading the report from S3
 */

import { getTableConfig } from '../../../../../lib/dynamodb-config'
import type { ReportExecution } from '../../../../../../shared/types/scheduled-reports'
import { logger } from '../../../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const reportId = getRouterParam(event, 'reportId')
    const executionId = getRouterParam(event, 'executionId')

    if (!reportId || !executionId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing reportId or executionId parameter'
      })
    }

    logger.info(`Downloading report execution: ${reportId} / ${executionId}`)

    const tableConfig = await getTableConfig('reportExecutions')

    // Get the execution record
    const execution = await getItem(
      tableConfig.tableName,
      { reportId, executionId },
      tableConfig.environment,
      tableConfig.accountId
    ) as ReportExecution | null

    if (!execution) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Report execution not found'
      })
    }

    // Verify execution was successful
    if (execution.status !== 'success') {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot download ${execution.status} report`
      })
    }

    // Verify S3 key exists
    if (!execution.s3Key) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Report file not found in storage'
      })
    }

    // Check if report has expired (30 days TTL)
    if (execution.expiresAt && execution.expiresAt < Date.now() / 1000) {
      throw createError({
        statusCode: 410,
        statusMessage: 'Report has expired and is no longer available'
      })
    }

    // Increment download count
    await updateItem(
      tableConfig.tableName,
      { reportId, executionId },
      {
        downloadCount: (execution.downloadCount || 0) + 1
      },
      tableConfig.environment,
      tableConfig.accountId
    )

    // Generate fresh presigned URL (valid for 7 days)
    logger.info('  → Generating presigned URL for S3 download')
    const presignedUrl = await getReportDownloadUrl(execution.s3Key, 7)

    logger.info(`  → Returning presigned URL`)

    // Return presigned URL and metadata
    return {
      presignedUrl,
      reportSize: execution.reportSize,
      executionTime: execution.executionTime,
      duration: execution.duration
    }
  } catch (error: any) {
    logger.error('Error downloading report execution:', error)

    if (error.statusCode) {
      throw error // Re-throw HTTP errors
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to download report'
    })
  }
})
