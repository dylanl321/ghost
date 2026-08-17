/**
 * Shared Reports Types
 * For reports that users generate and share via links
 */

import type { ReportConfig } from './scheduled-reports'
import type { DatasetReportConfig } from './dataset-reports'

/**
 * Shared report entry in DynamoDB
 */
export interface SharedReport {
  shareId: string             // PK: UUID
  userId: string              // SK: Email of who created it
  reportName: string          // User-friendly name
  reportType?: 'cost' | 'dataset'
  s3Key: string               // S3 object key (presigned URLs generated on-demand)
  shortCode: string           // From shortlinks table
  shortUrl: string            // Full short URL (e.g., https://ghost.com/s/abc123)
  createdAt: string           // ISO 8601 timestamp
  expiresAt?: string          // When the report expires (90 days)
  downloadCount: number       // Track how many times downloaded
  reportConfig: ReportConfig | DatasetReportConfig
  reportSize: number          // File size in bytes
  ttl?: number                // DynamoDB TTL (auto-delete after 90 days)
}

/**
 * Request to create a shareable report
 */
export interface CreateShareReportRequest {
  reportName: string
  config: ReportConfig
}

/**
 * Response from creating a shareable report
 */
export interface CreateShareReportResponse {
  success: boolean
  shareId?: string
  shortUrl?: string
  downloadUrl?: string
  error?: string
}
