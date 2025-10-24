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
import { logger } from './logger'

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
 * Supports basic conditionals: {{#if variable}}...{{/if}}
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  let rendered = template

  // Handle conditionals {{#if variable}}...{{/if}}
  const conditionalRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g
  rendered = rendered.replace(conditionalRegex, (match, varName, content) => {
    const value = context[varName]
    // Show content if variable is truthy and not an empty string
    return (value && String(value).trim() !== '') ? content : ''
  })

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

    logger.info('Email sent successfully:', {
      messageId: response.MessageId,
      recipients: options.to.length
    })

    return {
      success: true,
      messageId: response.MessageId
    }
  } catch (error: any) {
    logger.error('Failed to send email:', error)
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
    logger.error('Error sending report email:', error)

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
 * Optimized for Outlook compatibility using table-based layout
 */
export function getDefaultTemplate(): string {
  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AWS Cost Report</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, sans-serif; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6; border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt;">
    <tr>
      <td align="center" style="padding:30px 15px;">
        <!-- Main Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff; border:1px solid #d1d5db; border-collapse:collapse;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px; border-bottom:1px solid #e5e7eb;">
              <h1 style="margin:0; font-size:20px; font-weight:600; color:#111827; font-family: Arial, sans-serif;">AWS Cost Report</h1>
              <p style="margin:6px 0 0; font-size:14px; color:#6b7280; font-family: Arial, sans-serif;">{{reportName}}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <p style="margin:0 0 12px; font-size:15px; color:#374151; font-family: Arial, sans-serif;">Hello {{userName}},</p>
              <p style="margin:0 0 16px; font-size:15px; color:#4b5563; line-height:1.5;">Your scheduled cost report is ready and attached to this email.</p>

              <!-- Key Details -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse; font-family: Arial, sans-serif;">
                <tr>
                  <td width="140" style="padding:6px 12px 6px 0; border-bottom:1px solid #f3f4f6; font-size:14px; color:#6b7280;">Report Period</td>
                  <td style="padding:6px 0; border-bottom:1px solid #f3f4f6; font-size:14px; color:#111827; font-weight:500;">{{timeframe}}</td>
                </tr>
                <tr>
                  <td style="padding:6px 12px 6px 0; border-bottom:1px solid #f3f4f6; font-size:14px; color:#6b7280;">Data Mode</td>
                  <td style="padding:6px 0; border-bottom:1px solid #f3f4f6; font-size:14px; color:#111827; font-weight:500;">{{dataMode}}</td>
                </tr>
                <tr>
                  <td style="padding:6px 12px 6px 0; border-bottom:1px solid #f3f4f6; font-size:14px; color:#6b7280;">Accounts</td>
                  <td style="padding:6px 0; border-bottom:1px solid #f3f4f6; font-size:14px; color:#111827; font-weight:500;">{{accountCount}} accounts</td>
                </tr>
                <tr>
                  <td style="padding:6px 12px 6px 0; border-bottom:1px solid #f3f4f6; font-size:14px; color:#6b7280;">Format</td>
                  <td style="padding:6px 0; border-bottom:1px solid #f3f4f6; font-size:14px; color:#111827; font-weight:500;">{{format}}</td>
                </tr>
                <tr>
                  <td style="padding:6px 12px 6px 0; font-size:14px; color:#6b7280;">Generated</td>
                  <td style="padding:6px 0; font-size:14px; color:#111827; font-weight:500;">{{timestamp}}</td>
                </tr>
              </table>

              <p style="margin:16px 0 8px; font-size:15px; color:#4b5563; line-height:1.5;">You can download the report directly or visit the GHOST Dashboard for interactive analysis.</p>

              <!-- Download Report Button (conditional) -->
              {{#if downloadUrl}}
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:12px auto;">
                <tr>
                  <td align="center" style="border-radius:6px; background:#16a34a;">
                    <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                        xmlns:w="urn:schemas-microsoft-com:office:word"
                        href="{{downloadUrl}}" style="height:42px;v-text-anchor:middle;width:160px;"
                        arcsize="15%" strokecolor="#16a34a" fillcolor="#16a34a">
                        <w:anchorlock/>
                        <center style="color:#ffffff; font-family:Arial, sans-serif; font-size:14px; font-weight:bold;">Download Report</center>
                      </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                      <a href="{{downloadUrl}}"
                         style="display:inline-block; padding:12px 24px; background:#16a34a; color:#ffffff; font-size:14px; font-weight:bold; text-decoration:none; border-radius:6px; border:0; font-family:Arial, sans-serif;">Download Report</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              {{/if}}

              <!-- Open Dashboard Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:12px auto;">
                <tr>
                  <td align="center" style="border-radius:6px; background:#2563eb;">
                    <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                        xmlns:w="urn:schemas-microsoft-com:office:word"
                        href="{{siteUrl}}" style="height:42px;v-text-anchor:middle;width:160px;"
                        arcsize="15%" strokecolor="#2563eb" fillcolor="#2563eb">
                        <w:anchorlock/>
                        <center style="color:#ffffff; font-family:Arial, sans-serif; font-size:14px; font-weight:bold;">Open Dashboard</center>
                      </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                      <a href="{{siteUrl}}"
                         style="display:inline-block; padding:12px 24px; background:#2563eb; color:#ffffff; font-size:14px; font-weight:bold; text-decoration:none; border-radius:6px; border:0; font-family:Arial, sans-serif;">Open Dashboard</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #e5e7eb; text-align:center;">
              <p style="margin:0 0 4px; font-size:13px; font-weight:600; color:#374151;">GHOST Cost Dashboard</p>
              <p style="margin:2px 0; font-size:12px; color:#9ca3af;">Automated Report &bull; Sent to {{recipientEmail}}</p>
              <p style="margin:10px 0 0;">
                <a href="{{siteUrl}}/profile" style="font-size:12px; color:#4b5563; text-decoration:none; font-family: Arial, sans-serif;">View Your Profile</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
