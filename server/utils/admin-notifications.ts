/**
 * Admin Notifications Service
 * Sends email notifications to administrators for various system events
 * Tracks all sent notifications in DynamoDB for audit and history
 *
 * Features:
 * - Extensible notification types (feedback, errors, alerts, etc.)
 * - Email tracking and delivery status
 * - Reusable templates with variable substitution
 * - Per-notification type customization
 */

import { v4 as uuidv4 } from 'uuid'
import { sendEmail, renderTemplate } from './email-service'
import { getDynamoDBClient } from '../lib/aws-client-factory'
import { getConfigValue } from './site-config'
import { PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { logger } from './logger'

// Notification types - easily extensible for future use cases
export enum NotificationType {
  FEEDBACK = 'FEEDBACK',
  ERROR = 'ERROR',
  SECURITY_ALERT = 'SECURITY_ALERT',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
  PERFORMANCE_ALERT = 'PERFORMANCE_ALERT',
  DEPLOYMENT = 'DEPLOYMENT'
}

// Notification status
export enum NotificationStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
  PENDING = 'PENDING'
}

// Generic notification metadata structure
export interface NotificationMetadata {
  trigger: string        // What triggered the notification (e.g., 'feedback_submission', 'api_error')
  environment: string    // dev | prod | local
  [key: string]: any     // Additional flexible metadata
}

// Notification data structure stored in DynamoDB
export interface NotificationRecord {
  id: string
  timestamp: string
  type: NotificationType
  subject: string
  recipients: string[]
  status: NotificationStatus
  trigger: string
  environment: string
  content_preview: string
  full_content: string
  metadata: Record<string, any>
  delivery_info?: {
    messageId?: string
    sentAt?: string
  }
  error?: string
}

// Options for sending a notification
export interface SendNotificationOptions {
  type: NotificationType
  subject: string
  data: Record<string, any>
  metadata: NotificationMetadata
  recipients?: string[]  // Optional override, defaults to env var
}

// Configuration
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE_NAME || 'ghost_admin_notifications'
const SITE_URL = process.env.NUXT_PUBLIC_SITE_URL || 'https://ghost.gd-ms.com'
const DEPLOYMENT_ACCOUNT_ID = '461760157232' // GovCloud deployment account where notifications table lives
const REGION = 'us-gov-west-1'

/**
 * Get admin notification configuration from site config with env var fallback
 */
async function getNotificationConfig() {
  const emails = (await getConfigValue<string[]>('email.admin.notificationEmails')) ||
                 (process.env.ADMIN_NOTIFICATION_EMAILS || 'dylan.lewis@gd-ms.com').split(',').map(e => e.trim())
  const enabled = (await getConfigValue<boolean>('email.admin.enabled')) ??
                  (process.env.ADMIN_NOTIFICATIONS_ENABLED !== 'false')

  return { emails, enabled }
}

/**
 * Send admin notification email and track in DynamoDB
 */
export async function sendAdminNotification(
  options: SendNotificationOptions
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  // Get notification configuration
  const config = await getNotificationConfig()

  // Check if notifications are enabled
  if (!config.enabled) {
    logger.info('Admin notifications are disabled')
    return { success: true }
  }

  const notificationId = uuidv4()
  const timestamp = new Date().toISOString()

  // Get recipients
  const recipients = options.recipients || config.emails

  if (recipients.length === 0) {
    logger.warn('No admin notification recipients configured')
    return { success: false, error: 'No recipients configured' }
  }

  try {
    // Build email content based on notification type
    const emailContent = buildNotificationEmail(options.type, options.data)

    // Send email
    const emailResult = await sendEmail({
      to: recipients,
      subject: options.subject,
      html: emailContent.html,
      text: emailContent.text,
      replyTo: options.data.replyTo as string | undefined
    })

    // Create notification record
    const record: NotificationRecord = {
      id: notificationId,
      timestamp,
      type: options.type,
      subject: options.subject,
      recipients,
      status: emailResult.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      trigger: options.metadata.trigger,
      environment: options.metadata.environment,
      content_preview: emailContent.text.substring(0, 200),
      full_content: emailContent.html,
      metadata: {
        ...options.metadata,
        data: options.data
      },
      delivery_info: emailResult.success ? {
        messageId: emailResult.messageId,
        sentAt: timestamp
      } : undefined,
      error: emailResult.error
    }

    // Store in DynamoDB
    await storeNotificationRecord(record)

    logger.info('Admin notification sent successfully:', {
      notificationId,
      type: options.type,
      recipients: recipients.length,
      status: record.status
    })

    return {
      success: emailResult.success,
      notificationId,
      error: emailResult.error
    }
  } catch (error: any) {
    logger.error('Failed to send admin notification:', error)

    // Try to store failure record
    try {
      await storeNotificationRecord({
        id: notificationId,
        timestamp,
        type: options.type,
        subject: options.subject,
        recipients,
        status: NotificationStatus.FAILED,
        trigger: options.metadata.trigger,
        environment: options.metadata.environment,
        content_preview: '',
        full_content: '',
        metadata: options.metadata,
        error: error.message
      })
    } catch (storeError) {
      logger.error('Failed to store notification failure record:', storeError)
    }

    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Store notification record in DynamoDB
 */
async function storeNotificationRecord(record: NotificationRecord): Promise<void> {
  const client = await getDynamoDBClient('govcloud', REGION, DEPLOYMENT_ACCOUNT_ID)

  await client.send(new PutItemCommand({
    TableName: NOTIFICATIONS_TABLE,
    Item: marshall(record, { removeUndefinedValues: true })
  }))
}

/**
 * Get notification record by ID
 */
export async function getNotificationById(notificationId: string): Promise<NotificationRecord | null> {
  const client = await getDynamoDBClient('govcloud', REGION, DEPLOYMENT_ACCOUNT_ID)

  const result = await client.send(new GetItemCommand({
    TableName: NOTIFICATIONS_TABLE,
    Key: marshall({ id: notificationId })
  }))

  if (!result.Item) {
    return null
  }

  return unmarshall(result.Item) as NotificationRecord
}

/**
 * Query notifications by type
 */
export async function queryNotificationsByType(
  type: NotificationType,
  limit: number = 50
): Promise<NotificationRecord[]> {
  const client = await getDynamoDBClient('govcloud', REGION, DEPLOYMENT_ACCOUNT_ID)

  const result = await client.send(new QueryCommand({
    TableName: NOTIFICATIONS_TABLE,
    IndexName: 'type-timestamp-index',
    KeyConditionExpression: '#type = :type',
    ExpressionAttributeNames: {
      '#type': 'type'
    },
    ExpressionAttributeValues: marshall({
      ':type': type
    }),
    ScanIndexForward: false, // Most recent first
    Limit: limit
  }))

  if (!result.Items || result.Items.length === 0) {
    return []
  }

  return result.Items.map(item => unmarshall(item) as NotificationRecord)
}

/**
 * Build email content based on notification type
 */
function buildNotificationEmail(
  type: NotificationType,
  data: Record<string, any>
): { html: string; text: string } {
  switch (type) {
    case NotificationType.FEEDBACK:
      return buildFeedbackEmail(data)
    case NotificationType.ERROR:
      return buildErrorEmail(data)
    case NotificationType.SECURITY_ALERT:
      return buildSecurityAlertEmail(data)
    default:
      return buildGenericEmail(type, data)
  }
}

/**
 * Build feedback notification email
 */
function buildFeedbackEmail(data: Record<string, any>): { html: string; text: string } {
  const {
    type,
    description,
    reporter_email,
    environment,
    source,
    id,
    timestamp
  } = data

  const sourceLabel = source === 'mcp-connections' ? 'MCP Connections' : undefined

  const dashboardUrl = `${SITE_URL}/admin/feedback?id=${id}`

  const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Feedback Received</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6; border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:30px 15px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff; border:1px solid #d1d5db; border-collapse:collapse;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px; border-bottom:1px solid #e5e7eb; background-color:#f9fafb;">
              <h1 style="margin:0; font-size:20px; font-weight:600; color:#111827;">New Feedback Received</h1>
              <p style="margin:6px 0 0; font-size:14px; color:#6b7280;">GHOST Dashboard Feedback System</p>
            </td>
          </tr>

          <!-- Feedback Type Badge -->
          <tr>
            <td style="padding:20px 32px 0;">
              <span style="display:inline-block; padding:6px 12px; background-color:${type === 'Issue' ? '#fee2e2' : '#dbeafe'}; color:${type === 'Issue' ? '#991b1b' : '#1e40af'}; border-radius:4px; font-size:13px; font-weight:600;">
                ${type}
              </span>
              <span style="display:inline-block; margin-left:8px; padding:6px 12px; background-color:#f3f4f6; color:#374151; border-radius:4px; font-size:13px; font-weight:500;">
                ${environment}
              </span>
              ${sourceLabel ? `<span style="display:inline-block; margin-left:8px; padding:6px 12px; background-color:#fef3c7; color:#92400e; border-radius:4px; font-size:13px; font-weight:500;">${sourceLabel}</span>` : ''}
            </td>
          </tr>

          <!-- Feedback Content -->
          <tr>
            <td style="padding:20px 32px;">
              <h2 style="margin:0 0 12px; font-size:15px; font-weight:600; color:#374151;">Description</h2>
              <div style="padding:16px; background-color:#f9fafb; border-left:3px solid #3b82f6; border-radius:4px;">
                <p style="margin:0; font-size:14px; color:#111827; line-height:1.6; white-space:pre-wrap;">${description}</p>
              </div>
            </td>
          </tr>

          <!-- Details Table -->
          <tr>
            <td style="padding:0 32px 20px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td width="140" style="padding:8px 12px 8px 0; border-top:1px solid #e5e7eb; font-size:14px; color:#6b7280;">Reporter</td>
                  <td style="padding:8px 0; border-top:1px solid #e5e7eb; font-size:14px; color:#111827; font-weight:500;">
                    <a href="mailto:${reporter_email}" style="color:#2563eb; text-decoration:none;">${reporter_email}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 12px 8px 0; border-top:1px solid #e5e7eb; font-size:14px; color:#6b7280;">Submitted</td>
                  <td style="padding:8px 0; border-top:1px solid #e5e7eb; font-size:14px; color:#111827; font-weight:500;">${new Date(timestamp).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px 8px 0; border-top:1px solid #e5e7eb; font-size:14px; color:#6b7280;">Feedback ID</td>
                  <td style="padding:8px 0; border-top:1px solid #e5e7eb; font-size:14px; color:#111827; font-family:monospace; font-size:13px;">${id}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action Button -->
          <tr>
            <td style="padding:0 32px 24px;" align="center">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:6px; background:#2563eb;">
                    <a href="${dashboardUrl}" style="display:inline-block; padding:12px 24px; background:#2563eb; color:#ffffff; font-size:14px; font-weight:bold; text-decoration:none; border-radius:6px;">View in Dashboard</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #e5e7eb; text-align:center; background-color:#f9fafb;">
              <p style="margin:0 0 4px; font-size:13px; font-weight:600; color:#374151;">GHOST Dashboard</p>
              <p style="margin:2px 0; font-size:12px; color:#9ca3af;">Admin Notification System</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const text = `
New Feedback Received - GHOST Dashboard

Type: ${type}
Environment: ${environment}
${sourceLabel ? `Source: ${sourceLabel}` : ''}

Description:
${description}

Reporter: ${reporter_email}
Submitted: ${new Date(timestamp).toLocaleString()}
Feedback ID: ${id}

View in Dashboard: ${dashboardUrl}
  `.trim()

  return { html, text }
}

/**
 * Build error notification email
 */
function buildErrorEmail(data: Record<string, any>): { html: string; text: string } {
  // Placeholder for future error notifications
  return buildGenericEmail(NotificationType.ERROR, data)
}

/**
 * Build security alert email
 */
function buildSecurityAlertEmail(data: Record<string, any>): { html: string; text: string } {
  // Placeholder for future security alerts
  return buildGenericEmail(NotificationType.SECURITY_ALERT, data)
}

/**
 * Build generic notification email
 */
function buildGenericEmail(type: NotificationType, data: Record<string, any>): { html: string; text: string } {
  const dataEntries = Object.entries(data)
    .map(([key, value]) => `<tr><td style="padding:8px 12px 8px 0; border-top:1px solid #e5e7eb; font-size:14px; color:#6b7280;">${key}</td><td style="padding:8px 0; border-top:1px solid #e5e7eb; font-size:14px; color:#111827;">${String(value)}</td></tr>`)
    .join('')

  const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${type} Notification</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6; border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:30px 15px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff; border:1px solid #d1d5db; border-collapse:collapse;">
          <tr>
            <td style="padding:24px 32px;">
              <h1 style="margin:0 0 16px; font-size:20px; font-weight:600; color:#111827;">${type}</h1>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                ${dataEntries}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const text = `${type}\n\n${Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n')}`

  return { html, text }
}
