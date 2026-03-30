/**
 * Notification Digest Service
 *
 * Processes pending notifications into grouped email digests.
 * Called by the scheduler cron job every hour.
 * Checks each user's preferred delivery time/frequency before sending.
 */

import { getNotificationsForDigest, markNotificationsAsEmailed } from './notification-service'
import { getUserPreferences } from './user-preferences'
import { sendEmail } from './email-service'
import { getConfigValue } from './site-config'
import { logger } from './logger'
import type { UserNotification, NotificationCategory } from '#shared/types/notifications'
import { CATEGORY_DISPLAY } from '#shared/types/notifications'

const SITE_URL = process.env.NUXT_PUBLIC_SITE_URL || 'https://ghost.gd-ms.com'

interface DigestResult {
  processed: number
  successful: number
  failed: number
  skipped: number
}

/**
 * Main entry point — called by scheduler cron
 */
export async function processDigestDeliveries(): Promise<DigestResult> {
  // Check if digest is enabled
  const digestEnabled = await getConfigValue<boolean>('notifications.digestEnabled')
  if (digestEnabled === false) {
    return { processed: 0, successful: 0, failed: 0, skipped: 0 }
  }

  const result: DigestResult = { processed: 0, successful: 0, failed: 0, skipped: 0 }

  try {
    // Get all pending digest notifications grouped by user
    const pendingByUser = await getNotificationsForDigest(500)

    if (pendingByUser.size === 0) {
      return result
    }

    logger.info(`[Digest] Found pending notifications for ${pendingByUser.size} user(s)`)

    for (const [userId, notifications] of pendingByUser) {
      result.processed++

      try {
        // Check if this is the right time for this user
        const userPrefs = await getUserPreferences(userId)
        const notifPrefs = userPrefs.preferences?.notificationPreferences || {}

        // Check mute status
        if (notifPrefs.mutedUntil && new Date(notifPrefs.mutedUntil) > new Date()) {
          result.skipped++
          continue
        }

        if (!shouldDeliverDigestNow(notifPrefs, userPrefs.timezone || 'America/New_York')) {
          result.skipped++
          continue
        }

        // Build and send digest email
        const html = buildDigestEmailHtml(userId, notifications)
        const text = buildDigestEmailText(notifications)

        await sendEmail({
          to: [userId],
          subject: `[GHOST] Your notification digest — ${notifications.length} update${notifications.length > 1 ? 's' : ''}`,
          html,
          text
        })

        // Mark all as emailed
        const notifIds = notifications.map(n => n.notificationId)
        await markNotificationsAsEmailed(userId, notifIds)

        result.successful++
        logger.info(`[Digest] Sent digest to ${userId} with ${notifications.length} notifications`)
      } catch (error) {
        result.failed++
        logger.error(`[Digest] Failed to process digest for ${userId}:`, error)
      }
    }
  } catch (error) {
    logger.error('[Digest] Fatal error in digest processing:', error)
  }

  return result
}

/**
 * Check if now is the right time to deliver a digest for this user
 */
function shouldDeliverDigestNow(
  notifPrefs: Record<string, any>,
  userTimezone: string
): boolean {
  const frequency = notifPrefs.emailDigestFrequency || 'daily'
  const preferredHour = notifPrefs.emailDigestTime ?? 8 // Default 8 AM
  const preferredDay = notifPrefs.emailDigestDay || 'monday'

  // Get current time in user's timezone
  let now: Date
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      hour: 'numeric',
      hour12: false,
      weekday: 'long'
    })
    const parts = formatter.formatToParts(new Date())
    const hourPart = parts.find(p => p.type === 'hour')
    const dayPart = parts.find(p => p.type === 'weekday')
    const currentHour = parseInt(hourPart?.value || '0')
    const currentDay = (dayPart?.value || 'Monday').toLowerCase()

    // Check hour match (allow the current hour window)
    if (currentHour !== preferredHour) {
      return false
    }

    // For weekly, check day match
    if (frequency === 'weekly' && currentDay !== preferredDay) {
      return false
    }

    return true
  } catch {
    // If timezone parsing fails, use UTC
    now = new Date()
    return now.getUTCHours() === preferredHour
  }
}

/**
 * Build digest email HTML — grouped by category
 */
function buildDigestEmailHtml(userId: string, notifications: UserNotification[]): string {
  // Group by category
  const grouped = new Map<NotificationCategory, UserNotification[]>()
  for (const n of notifications) {
    const list = grouped.get(n.category) || []
    list.push(n)
    grouped.set(n.category, list)
  }

  // Build category sections
  let categorySections = ''
  for (const [category, items] of grouped) {
    const display = CATEGORY_DISPLAY[category]
    const rows = items.map(n => {
      const severityBadge = n.severity === 'critical'
        ? '<span style="color:#dc2626; font-weight:600;">Critical</span>'
        : n.severity === 'warning'
          ? '<span style="color:#d97706; font-weight:600;">Warning</span>'
          : ''
      const time = new Date(n.createdAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
      return `<tr>
        <td style="padding:8px 12px; border-top:1px solid #e5e7eb; font-size:14px; color:#111827;">${n.title} ${severityBadge}</td>
        <td style="padding:8px 12px; border-top:1px solid #e5e7eb; font-size:13px; color:#6b7280;">${n.body.substring(0, 100)}${n.body.length > 100 ? '...' : ''}</td>
        <td style="padding:8px 12px; border-top:1px solid #e5e7eb; font-size:12px; color:#9ca3af; white-space:nowrap;">${time}</td>
      </tr>`
    }).join('')

    categorySections += `
      <tr>
        <td style="padding:16px 32px 8px;">
          <h2 style="margin:0; font-size:15px; font-weight:600; color:#374151;">${display.label} <span style="font-weight:400; color:#9ca3af;">(${items.length})</span></h2>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 16px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            ${rows}
          </table>
        </td>
      </tr>`
  }

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>GHOST Notification Digest</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6; border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:30px 15px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff; border:1px solid #d1d5db; border-collapse:collapse;">
          <tr>
            <td style="padding:24px 32px; border-bottom:1px solid #e5e7eb; background-color:#f9fafb;">
              <h1 style="margin:0; font-size:20px; font-weight:600; color:#111827;">Notification Digest</h1>
              <p style="margin:6px 0 0; font-size:14px; color:#6b7280;">You have ${notifications.length} new notification${notifications.length > 1 ? 's' : ''}</p>
            </td>
          </tr>
          ${categorySections}
          <tr>
            <td align="center" style="padding:16px 32px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:6px; background:#2563eb;">
                    <a href="${SITE_URL}/settings/notifications" style="display:inline-block; padding:12px 24px; background:#2563eb; color:#ffffff; font-size:14px; font-weight:bold; text-decoration:none; border-radius:6px;">View All in GHOST</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #e5e7eb; text-align:center; background-color:#f9fafb;">
              <p style="margin:0 0 4px; font-size:13px; font-weight:600; color:#374151;">GHOST Dashboard</p>
              <p style="margin:2px 0; font-size:12px; color:#9ca3af;">Manage your digest preferences in Settings</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim()
}

/**
 * Build plain text version of digest
 */
function buildDigestEmailText(notifications: UserNotification[]): string {
  const lines = ['GHOST Notification Digest', `${notifications.length} new notification(s)`, '']
  for (const n of notifications) {
    lines.push(`[${n.severity.toUpperCase()}] ${n.title}`)
    lines.push(n.body.substring(0, 200))
    lines.push('')
  }
  lines.push(`View all: ${SITE_URL}/settings/notifications`)
  return lines.join('\n')
}
