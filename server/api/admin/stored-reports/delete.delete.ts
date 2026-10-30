/**
 * Delete a stored report from S3 (admin only)
 * DELETE /api/admin/stored-reports/delete
 */

import { deleteReportFromS3 } from '../../../utils/s3-reports-storage'
import { logger } from '../../../utils/logger'
import { requireAdmin } from '../../../utils/user-roles'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const body = await readBody(event)
    const { s3Key } = body

    if (!s3Key) {
      throw createError({
        statusCode: 400,
        message: 'S3 key is required'
      })
    }

    // Delete from S3
    const result = await deleteReportFromS3(s3Key)

    if (!result.success) {
      throw createError({
        statusCode: 500,
        message: result.error || 'Failed to delete report'
      })
    }

    return {
      success: true,
      message: 'Report deleted successfully'
    }
  } catch (error: any) {
    logger.error('Error deleting stored report:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to delete report'
    })
  }
})
