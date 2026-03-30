/**
 * POST /api/admin/user-notifications/backfill-budget
 * Backfill budget alert notifications from the external alert history table.
 *
 * Uses dedupeKey so it's safe to run multiple times — existing notifications
 * won't be duplicated. All backfilled notifications have skipEmail: true
 * and metadata.backfilled: true.
 *
 * Body:
 *   months: number (default 3, max 12) — how many months back to process
 *   limitPerMonth: number (default 200, max 500) — max alerts per month
 *   dryRun: boolean (default true) — preview without creating notifications
 *   skipDryRunAlerts: boolean (default true) — skip alerts that were in dry-run mode
 */

import { requireAdmin } from '../../../utils/user-roles'
import { getAlertsByMonth } from '../../../utils/budget-alerts'
import { sendUserNotification } from '../../../utils/notification-service'
import { logger } from '../../../utils/logger'
import type { BudgetAlert, BudgetAlertLevel } from '#shared/types/budget-alerts'
import type { NotificationSeverity } from '#shared/types/notifications'

function mapSeverity(level: BudgetAlertLevel): NotificationSeverity {
  switch (level) {
    case 'CRITICAL':
    case 'ESCALATION':
      return 'critical'
    case 'WARNING':
      return 'warning'
    default:
      return 'info'
  }
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{
    months?: number
    limitPerMonth?: number
    dryRun?: boolean
    skipDryRunAlerts?: boolean
  }>(event)

  const months = Math.min(Math.max(body.months || 3, 1), 12)
  const limitPerMonth = Math.min(Math.max(body.limitPerMonth || 200, 1), 500)
  const dryRun = body.dryRun !== false // Default true for safety
  const skipDryRunAlerts = body.skipDryRunAlerts !== false

  logger.info('[Backfill] Starting budget alert notification backfill', {
    months, limitPerMonth, dryRun, skipDryRunAlerts
  })

  // Build month list
  const monthList: string[] = []
  const now = new Date()
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const results = {
    months: monthList,
    dryRun,
    totalAlerts: 0,
    notificationsCreated: 0,
    duplicatesSkipped: 0,
    alertsSkipped: 0,
    errors: 0,
    perMonth: [] as Array<{ month: string; alerts: number; created: number; dupes: number; skipped: number; errors: number }>,
    preview: [] as Array<{ alertId: string; account: string; level: string; recipients: string[]; date: string }>
  }

  for (const month of monthList) {
    const monthStats = { month, alerts: 0, created: 0, dupes: 0, skipped: 0, errors: 0 }
    let nextToken: string | undefined
    let monthProcessed = 0

    try {
      do {
        const result = await getAlertsByMonth(month, {
          limit: Math.min(limitPerMonth - monthProcessed, 100),
          sortOrder: 'desc',
          nextToken
        })

        for (const alert of result.alerts) {
          monthProcessed++
          monthStats.alerts++
          results.totalAlerts++

          if (skipDryRunAlerts && alert.dry_run) {
            monthStats.skipped++
            results.alertsSkipped++
            continue
          }

          const recipients = (alert.recipients_to || alert.recipients || []).filter(
            (r: string) => r && r.includes('@')
          )

          if (recipients.length === 0) {
            monthStats.skipped++
            results.alertsSkipped++
            continue
          }

          // In dry-run mode, just collect preview data
          if (dryRun) {
            results.preview.push({
              alertId: alert.alert_id,
              account: alert.account_name || alert.account_id,
              level: alert.alert_level,
              recipients,
              date: alert.created_at || alert.timestamp
            })
            monthStats.created += recipients.length
            results.notificationsCreated += recipients.length
            continue
          }

          // Create notifications
          const title = `Budget Alert: ${alert.account_name || alert.account_id}`
          const spend = `$${alert.actual_spend?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0'}`
          const budget = `$${alert.budget?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0'}`
          const alertBody = `Spend: ${spend} / ${budget} budget`

          for (const email of recipients) {
            try {
              const result = await sendUserNotification({
                userId: email,
                category: 'BUDGET_THRESHOLD',
                title,
                body: alertBody,
                severity: mapSeverity(alert.alert_level),
                actionUrl: `/account/costs?account=${alert.account_id}`,
                actionLabel: 'View Cost Details',
                skipEmail: true,
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
                  backfilled: true
                },
                dedupeKey: `budget-alert-${alert.alert_id}`
              })

              if (result.deduplicated) {
                monthStats.dupes++
                results.duplicatesSkipped++
              } else {
                monthStats.created++
                results.notificationsCreated++
              }
            } catch (err: any) {
              monthStats.errors++
              results.errors++
              logger.warn('[Backfill] Failed to create notification', {
                alertId: alert.alert_id, email, error: err.message
              })
            }
          }
        }

        nextToken = result.nextToken
        if (monthProcessed >= limitPerMonth) break
      } while (nextToken)
    } catch (err: any) {
      logger.error(`[Backfill] Failed to process month ${month}:`, err)
      monthStats.errors++
      results.errors++
    }

    results.perMonth.push(monthStats)
  }

  // Trim preview to 50 items for response size
  if (results.preview.length > 50) {
    results.preview = results.preview.slice(0, 50)
  }

  logger.info('[Backfill] Complete', {
    dryRun,
    totalAlerts: results.totalAlerts,
    created: results.notificationsCreated,
    dupes: results.duplicatesSkipped,
    errors: results.errors
  })

  return { success: true, data: results }
})
