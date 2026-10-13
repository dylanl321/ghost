/**
 * Budget Alert Notifier
 *
 * Polls the budget alert DynamoDB table for recent alerts and converts them
 * into user notifications. Runs on a 15-minute cron with a 30-minute lookback
 * window to catch alerts that arrived between runs.
 *
 * Uses dedupeKey to prevent duplicate notifications when the same alert
 * is seen across overlapping lookback windows.
 */

import { getAlertsByMonth } from './budget-alerts'
import { sendUserNotification } from './notification-service'
import { withTransientRetry } from './budget-alert-retry'
import { logger } from './logger'
import type { BudgetAlert, BudgetAlertLevel } from '#shared/types/budget-alerts'
import type { NotificationSeverity } from '#shared/types/notifications'

const LOOKBACK_MINUTES = 30

/**
 * Map budget alert level to notification severity
 */
function mapAlertLevelToSeverity(level: BudgetAlertLevel): NotificationSeverity {
  switch (level) {
    case 'CRITICAL':
    case 'ESCALATION':
      return 'critical'
    case 'WARNING':
      return 'warning'
    case 'INFO':
    default:
      return 'info'
  }
}

/**
 * Build a human-readable notification body from alert financial data
 */
function buildAlertBody(alert: BudgetAlert): string {
  const parts: string[] = []

  const spend = `$${alert.actual_spend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const budget = `$${alert.budget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  parts.push(`Spend: ${spend} / ${budget} budget`)

  if (alert.projected_spend) {
    const projected = `$${alert.projected_spend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    parts.push(`Projected: ${projected}`)
  }

  return parts.join(' · ')
}

/**
 * Resolve recipient emails from a budget alert
 */
function getAlertRecipients(alert: BudgetAlert): string[] {
  // Prefer recipients_to (newer format), fall back to recipients (legacy)
  const recipients = alert.recipients_to || alert.recipients || []
  // Filter to valid-looking email addresses
  return recipients.filter(r => r && r.includes('@'))
}

/**
 * Process recent budget alerts and send user notifications.
 * Called by the scheduler cron every 15 minutes.
 */
export async function processRecentBudgetAlerts(): Promise<{ processed: number; notified: number; skipped: number }> {
  const now = new Date()
  const dateFrom = new Date(now.getTime() - LOOKBACK_MINUTES * 60 * 1000).toISOString()
  const month = now.toISOString().substring(0, 7) // YYYY-MM

  logger.info('[BudgetAlertNotifier] Processing recent alerts', { month, dateFrom })

  let processed = 0
  let notified = 0
  let skipped = 0

  // Query with a bounded retry for transient transport failures only. A final
  // failure is intentionally allowed to propagate so the scheduler's catch
  // records a job/heartbeat error rather than a false successful zero-count
  // completion. Per-notification send failures below remain contained.
  const result = await withTransientRetry(
    () => getAlertsByMonth(month, {
      dateFrom,
      limit: 100,
      sortOrder: 'desc'
    }),
    { component: 'budget-alert-notifier', operation: 'getAlertsByMonth', month }
  )

  logger.info('[BudgetAlertNotifier] Found alerts to process', { count: result.count })

  for (const alert of result.alerts) {
    processed++

    // Skip dry-run alerts
    if (alert.dry_run) {
      skipped++
      continue
    }

    const recipients = getAlertRecipients(alert)
    if (recipients.length === 0) {
      logger.debug('[BudgetAlertNotifier] No recipients for alert', { alertId: alert.alert_id })
      skipped++
      continue
    }

    const title = `Budget Alert: ${alert.account_name || alert.account_id}`
    const body = buildAlertBody(alert)
    const severity = mapAlertLevelToSeverity(alert.alert_level)

    // Send notification to each recipient
    for (const email of recipients) {
      try {
        const sendResult = await sendUserNotification({
          userId: email,
          category: 'BUDGET_THRESHOLD',
          title,
          body,
          severity,
          actionUrl: `/account/costs?account=${alert.account_id}`,
          actionLabel: 'View Cost Details',
          skipEmail: true, // External Lambda handles all budget email delivery
          metadata: {
            alertId: alert.alert_id,
            accountId: alert.account_id,
            accountName: alert.account_name,
            alertLevel: alert.alert_level,
            alertType: alert.alert_type,
            actualSpend: alert.actual_spend,
            budget: alert.budget,
            projectedSpend: alert.projected_spend,
            emailBodyS3Uri: alert.email_body_s3_uri || null,
            lambdaDeliveryStatus: alert.delivery_status,
            lambdaSesMessageId: alert.ses_message_id || null,
          },
          dedupeKey: `budget-alert-${alert.alert_id}`
        })
        if (sendResult.success && !sendResult.skipped) {
          notified++
        } else {
          logger.warn('[BudgetAlertNotifier] Notification not delivered', {
            alertId: alert.alert_id,
            recipient: email,
            success: sendResult.success,
            skipped: sendResult.skipped,
            reason: sendResult.reason || sendResult.error
          })
        }
      } catch (err) {
        logger.warn('[BudgetAlertNotifier] Failed to send notification', {
          alertId: alert.alert_id,
          recipient: email,
          error: (err as Error).message
        })
      }
    }
  }

  logger.info('[BudgetAlertNotifier] Processing complete', { processed, notified, skipped })
  return { processed, notified, skipped }
}
