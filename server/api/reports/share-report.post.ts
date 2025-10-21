/**
 * Create a shareable report link
 * POST /api/reports/share-report
 */

import type { CreateShareReportRequest, CreateShareReportResponse } from '~/shared/types/shared-reports'
import { createShortLink } from '../../lib/shortlinks'
import { getTableName, getTableEnvironment } from '../../lib/dynamodb-config'
import { v4 as uuidv4 } from 'uuid'

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

    console.log(`Creating shareable report: ${body.reportName} for user ${userEmail}`)

    // Step 1: Generate the report
    console.log('  → Generating report...')
    const reportResult = await generateCostReport(body.config)

    if (!reportResult.success || !reportResult.buffer) {
      return {
        success: false,
        error: reportResult.error || 'Failed to generate report'
      }
    }

    console.log(`  → Report generated: ${reportResult.filename} (${reportResult.buffer.length} bytes)`)

    // Step 2: Upload to S3
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
      timestamp
    )

    if (!s3UploadResult.success) {
      return {
        success: false,
        error: `Failed to upload report to S3: ${s3UploadResult.error}`
      }
    }

    console.log(`  → Report uploaded to S3: ${s3UploadResult.key}`)

    // Step 3: Create shortlink
    const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const downloadPath = `/api/reports/download/${shareId}`

    const shortlink = await createShortLink({
      originalUrl: s3UploadResult.s3Url || '',
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
    console.log(`  → Shortlink created: ${shortUrl}`)

    // Step 4: Store shared report metadata in DynamoDB
    const tableName = await getTableName('shared-reports')
    const environment = await getTableEnvironment('shared-reports')

    // Calculate TTL (90 days from now)
    const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    await putItem(tableName, {
      shareId,
      userId: userEmail,
      reportName: body.reportName,
      s3Key: s3UploadResult.key,
      s3Url: s3UploadResult.s3Url || '',
      shortCode: shortlink.shortCode,
      shortUrl,
      createdAt: new Date().toISOString(),
      expiresAt,
      downloadCount: 0,
      reportConfig: body.config,
      reportSize: reportResult.buffer.length,
      ttl
    }, environment)

    console.log(`  ✓ Shared report created successfully`)

    return {
      success: true,
      shareId,
      shortUrl,
      downloadUrl: s3UploadResult.s3Url
    }
  } catch (error: any) {
    console.error('Error creating shareable report:', error)
    return {
      success: false,
      error: error.message || 'Unknown error creating shareable report'
    }
  }
})
