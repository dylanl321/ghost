/**
 * Create a shareable report link
 * POST /api/reports/share-report
 */

import type { CreateShareReportRequest, CreateShareReportResponse } from '~/shared/types/shared-reports'
import { createShortLink } from '../../lib/shortlinks'
import { getTableConfig } from '../../lib/dynamodb-config'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event): Promise<CreateShareReportResponse> => {
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
    const body = await readBody<CreateShareReportRequest>(event)

    if (!body.reportName || !body.config) {
      return {
        success: false,
        error: 'Missing required fields: reportName and config'
      }
    }

    logger.info(`Creating shareable report: ${body.reportName} for user ${userEmail}`)

    // Step 1: Generate the report
    logger.info('  → Generating report...')
    const reportResult = await generateCostReport(body.config)

    if (!reportResult.success || !reportResult.buffer) {
      return {
        success: false,
        error: reportResult.error || 'Failed to generate report'
      }
    }

    logger.info(`  → Report generated: ${reportResult.filename} (${reportResult.buffer.length} bytes)`)

    // Step 2: Upload to S3 (without generating presigned URL - we'll do that on-demand)
    const shareId = uuidv4()
    const timestamp = Date.now()

    const s3UploadResult = await uploadReportToS3(
      'shared',
      reportResult.buffer,
      {
        reportName: body.reportName,
        userId: userEmail,
        shareId,
        format: body.config.format === 'pdf' ? 'pdf' : 'csv'
      },
      timestamp,
      false // Don't generate presigned URL - we'll generate on-demand when accessed
    )

    if (!s3UploadResult.success) {
      return {
        success: false,
        error: `Failed to upload report to S3: ${s3UploadResult.error}`
      }
    }

    logger.info(`  → Report uploaded to S3: ${s3UploadResult.key}`)

    // Step 3: Create shortlink to download endpoint
    const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const downloadPath = `/api/reports/download/${shareId}`
    const downloadUrl = `${siteUrl}${downloadPath}`

    const shortlink = await createShortLink({
      originalUrl: downloadUrl, // Points to our download endpoint, not S3 directly
      pagePath: downloadPath,
      configData: {
        shareId,
        reportName: body.reportName,
        format: body.config.format
      },
      expiresInDays: 90, // Match S3 lifecycle policy
      createdBy: userEmail,
      description: `Shared report: ${body.reportName}`
    })

    const shortUrl = `${siteUrl}/s/${shortlink.shortCode}`
    logger.info(`  → Shortlink created: ${shortUrl} -> ${downloadUrl}`)

    // Step 4: Store shared report metadata in DynamoDB
    const tableConfig = await getTableConfig('sharedReports')

    // Calculate TTL (90 days from now)
    const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    await putItem(tableConfig.tableName, {
      shareId,
      userId: userEmail,
      reportName: body.reportName,
      s3Key: s3UploadResult.key, // Store S3 key only, generate presigned URLs on-demand
      shortCode: shortlink.shortCode,
      shortUrl,
      createdAt: new Date().toISOString(),
      expiresAt,
      downloadCount: 0,
      reportConfig: body.config,
      reportSize: reportResult.buffer.length,
      ttl
    }, tableConfig.environment, tableConfig.accountId)

    logger.info(`  ✓ Shared report created successfully`)

    return {
      success: true,
      shareId,
      shortUrl,
      downloadUrl: downloadUrl // Our download endpoint, not S3 directly
    }
  } catch (error: any) {
    logger.error('Error creating shareable report:', error)
    return {
      success: false,
      error: error.message || 'Unknown error creating shareable report'
    }
  }
})
