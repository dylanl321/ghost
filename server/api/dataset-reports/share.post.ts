/**
 * Create a shareable dataset report link
 * POST /api/dataset-reports/share
 */

import type { DatasetReportConfig } from '../../../shared/types/dataset-reports'
import { createShortLink } from '../../lib/shortlinks'
import { getTableConfig } from '../../lib/dynamodb-config'
import { uploadReportToS3 } from '../../utils/s3-reports-storage'
import { generateDatasetReport } from '../../utils/dataset-report-generator'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../utils/logger'
import { requireUserSession } from '../../utils/entra/session'
import { getDatasetReportConfigErrors } from '../../utils/dataset-report-validation'

interface CreateDatasetShareRequest {
  reportName: string
  config: DatasetReportConfig
}

interface CreateDatasetShareResponse {
  success: boolean
  shareId?: string
  shortUrl?: string
  downloadUrl?: string
  error?: string
}

export default defineEventHandler(async (event): Promise<CreateDatasetShareResponse> => {
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

    // Parse request body
    const body = await readBody<CreateDatasetShareRequest>(event)

    if (!body || typeof body !== 'object' || !body.reportName || !body.config) {
      return {
        success: false,
        error: 'Missing required fields: reportName and config'
      }
    }

    const validationErrors = getDatasetReportConfigErrors(body.config)
    if (validationErrors.length > 0) {
      return { success: false, error: validationErrors.join('; ') }
    }

    logger.info(`[Dataset Share] Creating shareable report: ${body.reportName} for user ${userEmail}`)

    // Step 1: Generate the dataset report
    logger.info('[Dataset Share]   → Generating report...')
    const reportResult = await generateDatasetReport(body.config, event)

    if (!reportResult.success || !reportResult.buffer) {
      return {
        success: false,
        error: reportResult.error || 'Failed to generate report'
      }
    }

    logger.info(`[Dataset Share]   → Report generated: ${reportResult.filename} (${reportResult.buffer.length} bytes)`)

    // Step 2: Upload to S3 with 90-day lifecycle
    const shareId = uuidv4()
    const timestamp = Date.now()

    const s3UploadResult = await uploadReportToS3(
      'shared',
      reportResult.buffer,
      {
        reportName: body.reportName,
        userId: userEmail,
        shareId,
        format: body.config.format
      },
      timestamp,
      false // Don't generate presigned URL yet - we'll do it on-demand
    )

    if (!s3UploadResult.success) {
      return {
        success: false,
        error: `Failed to upload report to S3: ${s3UploadResult.error}`
      }
    }

    logger.info(`[Dataset Share]   → Report uploaded to S3: ${s3UploadResult.key}`)

    // Step 3: Create shortlink pointing to download endpoint
    const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const downloadPath = `/api/dataset-reports/download/${shareId}`
    const downloadUrl = `${siteUrl}${downloadPath}`

    const shortlink = await createShortLink({
      originalUrl: downloadUrl,
      pagePath: downloadPath,
      configData: {
        shareId,
        reportName: body.reportName,
        format: body.config.format,
        reportType: 'dataset'
      },
      expiresInDays: 90, // Match S3 lifecycle policy
      createdBy: userEmail,
      description: `Shared dataset report: ${body.reportName}`
    })

    const shortUrl = `${siteUrl}/s/${shortlink.shortCode}`
    logger.info(`[Dataset Share]   → Shortlink created: ${shortUrl} -> ${downloadUrl}`)

    // Step 4: Store shared report metadata in DynamoDB
    const tableConfig = await getTableConfig('sharedReports')

    // Calculate TTL (90 days from now)
    const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    await putItem(tableConfig.tableName, {
      shareId,
      userId: userEmail,
      reportName: body.reportName,
      reportType: 'dataset', // Distinguish from cost reports
      s3Key: s3UploadResult.key,
      shortCode: shortlink.shortCode,
      shortUrl,
      createdAt: new Date().toISOString(),
      expiresAt,
      downloadCount: 0,
      reportConfig: body.config,
      reportSize: reportResult.buffer.length,
      ttl
    }, tableConfig.environment, tableConfig.accountId)

    logger.info(`[Dataset Share]   ✓ Shared dataset report created successfully`)

    return {
      success: true,
      shareId,
      shortUrl,
      downloadUrl
    }
  } catch (error: any) {
    logger.error('[Dataset Share] Error creating shareable report:', error)
    return {
      success: false,
      error: error.message || 'Unknown error creating shareable report'
    }
  }
})
