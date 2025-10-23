/**
 * List all stored reports from S3 (admin only)
 * GET /api/admin/stored-reports/list
 */

import { listObjectsByPrefix } from '../../../utils/s3-storage'
import { getReportDownloadUrl } from '../../../utils/s3-reports-storage'

// Parse S3 key to extract metadata
function parseS3Key(key: string) {
  // Expected format: reports/scheduled/{reportId}/{executionId}/report.{ext}
  // or: reports/shared/{userId}/{timestamp}-{shareId}/report.{ext}
  const parts = key.split('/')

  if (parts[0] !== 'reports') {
    return null
  }

  const type = parts[1] // 'scheduled' or 'shared'
  const fileName = parts[parts.length - 1]
  const format = fileName.split('.').pop() || 'unknown'

  if (type === 'scheduled' && parts.length >= 5) {
    return {
      type: 'scheduled',
      reportId: parts[2],
      executionId: parts[3],
      format,
      userId: null
    }
  } else if (type === 'shared' && parts.length >= 5) {
    return {
      type: 'shared',
      reportId: null,
      executionId: null,
      format,
      userId: parts[2]
    }
  }

  return null
}

export default defineEventHandler(async (event) => {
  try {
    // Get query parameters
    const query = getQuery(event)
    const limit = parseInt(query.limit as string) || 100
    const continuationToken = query.continuationToken as string | undefined
    const type = query.type as string | undefined // 'scheduled' or 'shared'

    // Build prefix based on type filter
    let prefix = 'reports/'
    if (type === 'scheduled' || type === 'shared') {
      prefix = `reports/${type}/`
    }

    // List S3 objects
    const result = await listObjectsByPrefix(prefix, limit, continuationToken)

    // Parse objects and enrich with metadata
    const reports = await Promise.all(
      result.objects.map(async (obj) => {
        const metadata = parseS3Key(obj.key)

        return {
          s3Key: obj.key,
          size: obj.size,
          lastModified: obj.lastModified.toISOString(),
          ...metadata,
          // Don't generate presigned URLs here (too many), generate on-demand
        }
      })
    )

    // Filter out invalid keys
    const validReports = reports.filter(r => r.type !== null)

    // Calculate statistics
    const stats = {
      totalFiles: validReports.length,
      totalSize: validReports.reduce((sum, r) => sum + r.size, 0),
      byType: {
        scheduled: validReports.filter(r => r.type === 'scheduled').length,
        shared: validReports.filter(r => r.type === 'shared').length
      },
      byFormat: validReports.reduce((acc, r) => {
        acc[r.format] = (acc[r.format] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    }

    return {
      success: true,
      data: {
        reports: validReports,
        stats,
        nextToken: result.nextToken
      }
    }
  } catch (error: any) {
    console.error('Error listing stored reports:', error)

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to list stored reports'
    })
  }
})
