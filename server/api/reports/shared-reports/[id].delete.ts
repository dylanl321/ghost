/**
 * Delete a shared report
 * DELETE /api/reports/shared-reports/:id
 */

import { getTableConfig } from '../../../lib/dynamodb-config'
import type { SharedReport } from '~/shared/types/shared-reports'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Get authenticated user
    const session = await requireUserSession(event)
    const userEmail = session.user?.email

    if (!userEmail) {
      return {
        success: false,
        error: 'User not authenticated'
      }
    }

    const shareId = getRouterParam(event, 'id')

    if (!shareId) {
      return {
        success: false,
        error: 'Missing shareId parameter'
      }
    }

    logger.info(`Deleting shared report: ${shareId} for user ${userEmail}`)

    const tableConfig = await getTableConfig('sharedReports')

    // Get the report to verify ownership and get S3 key
    const report = await getItem(tableConfig.tableName, { shareId }, tableConfig.environment, tableConfig.accountId) as SharedReport | null

    if (!report) {
      return {
        success: false,
        error: 'Shared report not found'
      }
    }

    // Verify ownership
    if (report.userId !== userEmail) {
      return {
        success: false,
        error: 'Unauthorized: You can only delete your own reports'
      }
    }

    // Delete from S3
    if (report.s3Key) {
      logger.info(`  → Deleting from S3: ${report.s3Key}`)
      const s3Result = await deleteReportFromS3(report.s3Key)
      if (!s3Result.success) {
        logger.warn(`  ⚠ Failed to delete from S3: ${s3Result.error}`)
        // Continue with deletion even if S3 fails
      }
    }

    // Delete from DynamoDB
    await deleteItem(tableConfig.tableName, { shareId }, tableConfig.environment, tableConfig.accountId)

    logger.info(`  ✓ Shared report deleted successfully`)

    return {
      success: true
    }
  } catch (error: any) {
    logger.error('Error deleting shared report:', error)
    return {
      success: false,
      error: error.message || 'Failed to delete shared report'
    }
  }
})
