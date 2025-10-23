/**
 * Get presigned download URL for a stored report (admin only)
 * POST /api/admin/stored-reports/download-url
 */

import { getReportDownloadUrl } from '../../../utils/s3-reports-storage'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { s3Key } = body

    if (!s3Key) {
      throw createError({
        statusCode: 400,
        message: 'S3 key is required'
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
    console.error('Error generating download URL:', error)

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate download URL'
    })
  }
})
