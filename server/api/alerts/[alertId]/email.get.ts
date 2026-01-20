/**
 * GET /api/alerts/:alertId/email
 * Fetch the email HTML content for a budget alert from S3
 */

import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { getItem } from '../../../utils/dynamodb'
import { getS3Client } from '../../../lib/aws-client-factory'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { BUDGET_ALERTS_TABLE, PROFORMA_ACCOUNT_ID } from '../../../lib/dynamodb-config'
import { logger } from '../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/alerts/[alertId]/email', 'GET', {
  summary: 'Get budget alert email content',
  description: 'Retrieve the HTML email content for a specific budget alert from S3',
  tags: ['Alerts'],
  parameters: [
    {
      name: 'alertId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'The alert ID (UUID)'
    },
    {
      name: 'accountId',
      in: 'query',
      required: true,
      schema: { type: 'string', pattern: '^\\d{12}$' },
      description: 'AWS account ID (12 digits) - required for DynamoDB lookup'
    }
  ],
  responses: {
    200: {
      description: 'Email HTML content',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  html: { type: 'string', description: 'The email HTML content' },
                  subject: { type: 'string', description: 'Email subject line' },
                  s3Uri: { type: 'string', description: 'S3 URI where email is stored' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const alertId = getRouterParam(event, 'alertId')
  if (!alertId) {
    return errors.badRequest(event, 'Alert ID is required')
  }

  const query = getQuery(event)
  const accountId = query.accountId as string
  if (!accountId) {
    return errors.badRequest(event, 'Account ID is required as a query parameter')
  }

  // Validate account ID format
  if (!/^\d{12}$/.test(accountId)) {
    return errors.badRequest(event, 'Invalid account ID format. Must be a 12-digit AWS account ID.')
  }

  try {
    logger.info('[Alert Email API] Fetching alert:', { alertId, accountId })

    // Fetch the alert record from DynamoDB to get the S3 URI
    const alert = await getItem(
      BUDGET_ALERTS_TABLE,
      {
        account_id: accountId,
        alert_id: alertId
      },
      'commercial',
      PROFORMA_ACCOUNT_ID
    )

    if (!alert) {
      return errors.notFound(event, 'Alert not found')
    }

    const s3Uri = alert.email_body_s3_uri
    if (!s3Uri) {
      return errors.notFound(event, 'Email content not available for this alert')
    }

    logger.info('[Alert Email API] Found S3 URI:', { s3Uri })

    // Parse S3 URI: s3://bucket-name/key/path
    const s3Match = s3Uri.match(/^s3:\/\/([^\/]+)\/(.+)$/)
    if (!s3Match) {
      logger.error('[Alert Email API] Invalid S3 URI format:', { s3Uri })
      return errors.serverError(event, 'Invalid S3 URI format in alert record')
    }

    const [, bucket, key] = s3Match

    // Fetch the HTML from S3 (same account as DynamoDB table)
    const s3Client = await getS3Client('commercial', 'us-east-1', PROFORMA_ACCOUNT_ID)

    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    })

    logger.info('[Alert Email API] Fetching from S3:', { bucket, key })
    const s3Response = await s3Client.send(getCommand)

    // Read the body stream
    const html = await s3Response.Body?.transformToString('utf-8')

    if (!html) {
      return errors.serverError(event, 'Failed to read email content from S3')
    }

    logger.info('[Alert Email API] Successfully fetched email HTML, length:', html.length)

    return sendSuccess(event, {
      html,
      subject: alert.email_subject || 'Budget Alert',
      s3Uri,
      alertId,
      accountId
    })
  } catch (error: any) {
    logger.error('[Alert Email API] Error:', {
      alertId,
      accountId,
      error: error.message,
      code: error.code || error.name
    })

    if (error.name === 'NoSuchKey' || error.code === 'NoSuchKey') {
      return errors.notFound(event, 'Email file not found in S3')
    }

    if (error.$metadata) {
      return errors.awsError(event, error)
    }

    return errors.serverError(event, 'Failed to retrieve email content')
  }
}))
