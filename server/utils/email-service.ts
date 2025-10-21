/**
 * Email Service - AWS SES Integration
 * Handles email sending with attachments for scheduled reports
 *
 * Architecture:
 * - SES resources are in org/master account (same account as credentials)
 * - Uses base credentials directly (no role assumption needed)
 * - ECS app runs in deployment account but credentials are for org account with SES
 */

import { SendRawEmailCommand } from '@aws-sdk/client-ses'
import { getSESClient } from '../lib/aws-client-factory'
import type { TemplateContext } from '~/shared/types/email-templates'
import type { EmailDeliveryRecipient, EmailDeliveryDetails } from '~/shared/types/scheduled-reports'

interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

interface SendEmailOptions {
  to: string[]
  subject: string
  html: string
  text?: string
  attachments?: EmailAttachment[]
  replyTo?: string
}

const SES_REGION = process.env.AWS_SES_REGION || process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1'
const SES_FROM_EMAIL = process.env.AWS_SES_FROM_EMAIL || 'aws-ghost@gd-ms.com'
const SES_FROM_NAME = process.env.AWS_SES_FROM_NAME || 'GHOST AWS Dashboard'
const SES_REPLY_TO = process.env.AWS_SES_REPLY_TO || 'aws-ghost@gd-ms.com'
const SES_CONFIG_SET = process.env.AWS_SES_CONFIGURATION_SET // Optional - only if configured

/**
 * Render email template with variable substitution
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  let rendered = template

  // Replace {{variable}} with values from context
  for (const [key, value] of Object.entries(context)) {
    const regex = new RegExp(`{{${key}}}`, 'g')
    rendered = rendered.replace(regex, String(value ?? ''))
  }

  // Clean up any remaining unreplaced variables
  rendered = rendered.replace(/{{[^}]+}}/g, '')

  return rendered
}

/**
 * Build MIME email message with attachments
 */
function buildMimeMessage(options: SendEmailOptions): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(7)}`
  const altBoundary = `----=_Part_Alt_${Date.now()}_${Math.random().toString(36).substring(7)}`

  const headers = [
    `From: ${SES_FROM_NAME} <${SES_FROM_EMAIL}>`,
    `To: ${options.to.join(', ')}`,
    `Reply-To: ${options.replyTo || SES_REPLY_TO}`,
    `Subject: ${options.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`
  ]

  // Only add configuration set header if one is configured
  if (SES_CONFIG_SET) {
    headers.push(`X-SES-CONFIGURATION-SET: ${SES_CONFIG_SET}`)
  }

  let message = [
    ...headers,
    '',
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
  ].join('\r\n')

  // Text part
  if (options.text) {
    message += [
      `--${altBoundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      options.text,
      ''
    ].join('\r\n')
  }

  // HTML part
  message += [
    `--${altBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    options.html,
    '',
    `--${altBoundary}--`,
    ''
  ].join('\r\n')

  // Attachments
  if (options.attachments && options.attachments.length > 0) {
    for (const attachment of options.attachments) {
      const base64Content = attachment.content.toString('base64')

      message += [
        `--${boundary}`,
        `Content-Type: ${attachment.contentType}`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        `Content-Transfer-Encoding: base64`,
        '',
        base64Content,
        ''
      ].join('\r\n')
    }
  }

  message += `--${boundary}--`

  return message
}

/**
 * Send email via AWS SES
 */
export async function sendEmail(options: SendEmailOptions): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  try {
    // Get SES client using base credentials (SES is in same account as credentials)
    const client = await getSESClient('govcloud', SES_REGION)
    const mimeMessage = buildMimeMessage(options)

    const command = new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(mimeMessage)
      },
      Source: `${SES_FROM_NAME} <${SES_FROM_EMAIL}>`,
      Destinations: options.to
    })

    const response = await client.send(command)

    console.log('Email sent successfully:', {
      messageId: response.MessageId,
      recipients: options.to.length
    })

    return {
      success: true,
      messageId: response.MessageId
    }
  } catch (error: any) {
    console.error('Failed to send email:', error)
    return {
      success: false,
      error: error.message || 'Failed to send email'
    }
  }
}

/**
 * Send report email with attachment
 * Returns detailed delivery information including email content and per-recipient status
 */
export async function sendReportEmail(
  recipients: string[],
  subject: string,
  htmlBody: string,
  reportBuffer: Buffer,
  reportFilename: string,
  reportFormat: 'pdf' | 'xlsx' | 'csv' | 'json'
): Promise<{
  success: boolean
  error?: string
  deliveryDetails?: EmailDeliveryDetails
}> {
  const contentTypeMap = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    json: 'application/json'
  }

  const timestamp = new Date().toISOString()

  try {
    const result = await sendEmail({
      to: recipients,
      subject,
      html: htmlBody,
      text: stripHtml(htmlBody),
      attachments: [
        {
          filename: reportFilename,
          content: reportBuffer,
          contentType: contentTypeMap[reportFormat]
        }
      ]
    })

    // Build delivery details for tracking
    const deliveryRecipients: EmailDeliveryRecipient[] = recipients.map(email => ({
      email,
      status: result.success ? 'sent' : 'failed',
      messageId: result.messageId,
      error: result.success ? undefined : result.error,
      timestamp
    }))

    const deliveryDetails: EmailDeliveryDetails = {
      subject,
      bodyPreview: stripHtml(htmlBody).substring(0, 500),
      htmlBody,
      recipients: deliveryRecipients,
      totalSent: result.success ? recipients.length : 0,
      totalFailed: result.success ? 0 : recipients.length,
      sesMessageId: result.messageId
    }

    return {
      success: result.success,
      error: result.error,
      deliveryDetails
    }
  } catch (error: any) {
    console.error('Error sending report email:', error)

    // Even on error, return delivery details showing failure
    const deliveryRecipients: EmailDeliveryRecipient[] = recipients.map(email => ({
      email,
      status: 'failed' as const,
      error: error.message,
      timestamp
    }))

    return {
      success: false,
      error: error.message,
      deliveryDetails: {
        subject,
        bodyPreview: stripHtml(htmlBody).substring(0, 500),
        htmlBody,
        recipients: deliveryRecipients,
        totalSent: 0,
        totalFailed: recipients.length
      }
    }
  }
}

/**
 * Strip HTML tags for plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Validate email address format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate multiple email addresses
 */
export function validateEmails(emails: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const email of emails) {
    if (!validateEmail(email)) {
      errors.push(`Invalid email format: ${email}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Get default email template
 */
export function getDefaultTemplate(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px;
    }
    .details {
      background: #f9fafb;
      border-left: 4px solid #1e40af;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .details h3 {
      margin: 0 0 10px 0;
      font-size: 16px;
      color: #1e40af;
    }
    .details ul {
      margin: 0;
      padding-left: 20px;
    }
    .details li {
      margin: 5px 0;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: #1e40af;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 500;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 12px;
      background: #f9fafb;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your AWS Cost Report</h1>
    </div>
    <div class="content">
      <p>Hello {{userName}},</p>
      <p>Your scheduled AWS cost report <strong>{{reportName}}</strong> is ready.</p>

      <div class="details">
        <h3>Report Details</h3>
        <ul>
          <li><strong>Period:</strong> {{timeframe}}</li>
          <li><strong>Data Mode:</strong> {{dataMode}}</li>
          <li><strong>Accounts:</strong> {{accountCount}} accounts</li>
          <li><strong>Format:</strong> {{format}}</li>
          <li><strong>Generated:</strong> {{timestamp}}</li>
        </ul>
      </div>

      <p>The detailed report is attached to this email. For interactive analysis and additional features, visit the GHOST Dashboard.</p>

      <a href="{{dashboardUrl}}" class="button">Open Dashboard</a>
    </div>
    <div class="footer">
      <p><strong>GHOST Cost Dashboard</strong></p>
      <p>Automated Report • This email was sent to {{recipientEmail}}</p>
      <p style="margin-top: 10px;">
        <a href="{{settingsUrl}}" style="color: #1e40af; text-decoration: none;">Update Schedule Settings</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
