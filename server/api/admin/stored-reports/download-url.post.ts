/**
 * Get presigned download URL for a stored report (admin only)
 * POST /api/admin/stored-reports/download-url
 */

import { getReportDownloadUrl, isStoredReportKey } from '../../../utils/s3-reports-storage'
import { logger } from '../../../utils/logger'
import { requireAdmin } from '../../../utils/user-roles'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const body = await readBody(event)
    const s3Key = body?.s3Key

    if (!isStoredReportKey(s3Key)) {
      throw createError({
        statusCode: 400,
        message: 'A stored report key under reports/ is required'
      })
    }

    // Generate presigned URL (7 days expiration)
    const downloadUrl = await getReportDownloadUrl(s3Key, 7)

    return {
      success: true,
      data: {
        downloadUrl,
        expiresInDays: 7
      }
    }
  } catch (error: any) {
    logger.error('Error generating download URL:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to generate download URL'
    })
  }
})
