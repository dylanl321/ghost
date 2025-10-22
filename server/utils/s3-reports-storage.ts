/**
 * Reports-Specific S3 Storage
 * Wrapper around generic s3-storage.ts for report-specific operations
 */

import { uploadToS3, getPresignedDownloadUrl, deleteFromS3, listObjectsByPrefix, type S3UploadResult } from './s3-storage'
import type { ReportConfig } from '~/shared/types/scheduled-reports'

/**
 * Report type for S3 storage
 */
export type ReportType = 'scheduled' | 'shared'

/**
 * Report metadata for S3 upload
 */
export interface ReportMetadata {
  reportId?: string
  reportName: string
  userId: string
  executionId?: string
  shareId?: string
  format: 'pdf' | 'csv'
}

/**
 * Report upload result with S3 details
 */
export interface ReportUploadResult extends S3UploadResult {
  s3Url?: string
  s3UrlExpiresAt?: string
}

/**
 * Generate S3 key for a report
 */
function generateReportKey(
  type: ReportType,
  metadata: ReportMetadata,
  timestamp?: number
): string {
  const ts = timestamp || Date.now()
  const extension = metadata.format

  if (type === 'scheduled') {
    // reports/scheduled/{reportId}/{executionId}/report.pdf
    return `reports/scheduled/${metadata.reportId}/${metadata.executionId}/report.${extension}`
  } else {
    // reports/shared/{userId}/{timestamp}-{shareId}/report.pdf
    return `reports/shared/${metadata.userId}/${ts}-${metadata.shareId}/report.${extension}`
  }
}

/**
 * Get content type for report format
 */
function getContentType(format: 'pdf' | 'csv'): string {
  return format === 'pdf' ? 'application/pdf' : 'text/csv'
}

/**
 * Upload a report to S3
 * @param generatePresignedUrl - If true, generates a presigned URL immediately (for scheduled reports sent via email)
 *                               If false, presigned URLs generated on-demand (for shared reports accessed via shortlink)
 */
export async function uploadReportToS3(
  type: ReportType,
  buffer: Buffer,
  metadata: ReportMetadata,
  timestamp?: number,
  generatePresignedUrl: boolean = true
): Promise<ReportUploadResult> {
  try {
    const key = generateReportKey(type, metadata, timestamp)
    const contentType = getContentType(metadata.format)

    // Prepare S3 metadata
    const s3Metadata: Record<string, string> = {
      reportName: metadata.reportName,
      userId: metadata.userId,
      format: metadata.format,
      uploadedAt: new Date().toISOString()
    }

    if (metadata.reportId) {
      s3Metadata.reportId = metadata.reportId
    }
    if (metadata.executionId) {
      s3Metadata.executionId = metadata.executionId
    }
    if (metadata.shareId) {
      s3Metadata.shareId = metadata.shareId
    }

    // Upload to S3
    const uploadResult = await uploadToS3({
      key,
      buffer,
      contentType,
      metadata: s3Metadata
    })

    if (!uploadResult.success) {
      return uploadResult
    }

    // Optionally generate presigned URL (for scheduled reports sent via email)
    // For shared reports, presigned URLs are generated on-demand when accessed
    if (generatePresignedUrl) {
      const s3Url = await getPresignedDownloadUrl({ key })
      const expiresInSeconds = parseInt(process.env.S3_PRESIGNED_URL_EXPIRES_DAYS || '7', 10) * 24 * 60 * 60
      const s3UrlExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

      return {
        ...uploadResult,
        s3Url,
        s3UrlExpiresAt
      }
    }

    // Return without presigned URL
    return uploadResult
  } catch (error: any) {
    console.error('Error uploading report to S3:', error)
    return {
      success: false,
      key: '',
      bucket: '',
      size: buffer.length,
      error: error.message || 'Unknown error uploading report'
    }
  }
}

/**
 * Get download URL for a report
 */
export async function getReportDownloadUrl(s3Key: string, expiresInDays?: number): Promise<string> {
  const expiresInSeconds = expiresInDays
    ? expiresInDays * 24 * 60 * 60
    : parseInt(process.env.S3_PRESIGNED_URL_EXPIRES_DAYS || '30', 10) * 24 * 60 * 60

  return await getPresignedDownloadUrl({
    key: s3Key,
    expiresInSeconds
  })
}

/**
 * Delete a report from S3
 */
export async function deleteReportFromS3(s3Key: string): Promise<{ success: boolean; error?: string }> {
  return await deleteFromS3(s3Key)
}

/**
 * List all report files for a user from S3 storage
 */
export async function listUserReportFiles(
  userId: string,
  type: ReportType = 'shared',
  maxKeys: number = 100
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const prefix = `reports/${type}/${userId}/`

  const result = await listObjectsByPrefix(prefix, maxKeys)

  return result.objects
}

/**
 * List all scheduled report executions for a report
 */
export async function listScheduledReportExecutions(
  reportId: string,
  maxKeys: number = 100
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const prefix = `reports/scheduled/${reportId}/`

  const result = await listObjectsByPrefix(prefix, maxKeys)

  return result.objects
}
