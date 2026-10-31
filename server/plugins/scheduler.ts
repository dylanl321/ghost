/**
 * Scheduled Reports Scheduler Plugin
 * Runs periodically to check for and execute due reports
 */

import { Cron } from 'croner'
import { processScheduledReports } from '../utils/report-scheduler'
import { cleanupStaleLocks, claimExecutionLock, releaseExecutionLock, STALE_LOCK_MAX_AGE_MINUTES } from '../utils/execution-locks'
import { logger } from '../utils/logger'
import { markJobRunning, markJobComplete, logJobCompletion, waitForActiveJobs } from '../utils/job-tracker'
import { writeSourceHeartbeat } from '../utils/source-heartbeat'

const SCHEDULER_ENABLED = process.env.REPORT_SCHEDULER_ENABLED !== 'false'

// Store scheduler jobs for cleanup
let schedulerJob: Cron | null = null
let securitySummaryJob: Cron | null = null
let digestJob: Cron | null = null
let budgetAlertJob: Cron | null = null
let aiUsageJob: Cron | null = null
let mcpUsageAggregateJob: Cron | null = null
const AI_USAGE_COLLECTION_ENABLED = process.env.AI_USAGE_COLLECTION_ENABLED === 'true'

// How long shutdown waits for running jobs. Nitro allows 30s
// (NITRO_SHUTDOWN_TIMEOUT) and ECS sends SIGKILL after its stopTimeout,
// so this stays below both.
const SHUTDOWN_GRACE_MS = Number.parseInt(process.env.SCHEDULER_SHUTDOWN_GRACE_MS || '', 10) || 20_000

export default defineNitroPlugin(async (nitroApp) => {
  if (!SCHEDULER_ENABLED) {
    logger.info('📅 Scheduled reports scheduler is disabled')
    return
  }

  logger.info('📅 Starting scheduled reports scheduler...')

  // Clean up locks abandoned by a container that died mid-job. Only locks
  // older than the longest job are removed, so a live job on another task
  // keeps its lock.
  try {
    await cleanupStaleLocks(STALE_LOCK_MAX_AGE_MINUTES)
  } catch (error) {
    logger.error('Error cleaning up stale locks on startup:', error)
    // Continue anyway - don't block scheduler startup
  }

  // Stop existing jobs if any (handles hot reload)
  if (schedulerJob) {
    schedulerJob.stop()
    schedulerJob = null
  }
  if (securitySummaryJob) {
    securitySummaryJob.stop()
    securitySummaryJob = null
  }
  if (digestJob) {
    digestJob.stop()
    digestJob = null
  }
  if (budgetAlertJob) {
    budgetAlertJob.stop()
    budgetAlertJob = null
  }
  if (aiUsageJob) {
    aiUsageJob.stop()
    aiUsageJob = null
  }
  if (mcpUsageAggregateJob) {
    mcpUsageAggregateJob.stop()
    mcpUsageAggregateJob = null
  }

  // Run every minute to check for due reports. protect: a tick is skipped
  // while the previous one is still sending, instead of running alongside it.
  schedulerJob = new Cron('* * * * *', { protect: true }, async () => {
    const start = performance.now()
    markJobRunning('report-scheduler')
    try {
      const result = await processScheduledReports()

      if (result.processed > 0) {
        logger.info(
          `📊 Processed ${result.processed} report(s): ` +
          `${result.successful} successful, ${result.failed} failed`
        )
      }
      logJobCompletion('report-scheduler', 'success', performance.now() - start, {
        processed: result.processed, successful: result.successful, failed: result.failed,
      })
      writeSourceHeartbeat('report-scheduler', { lastRun: new Date().toISOString(), status: 'success', durationMs: Math.round(performance.now() - start), count: result.processed })
    } catch (error) {
      logger.error('Error in scheduler cron job:', error)
      logJobCompletion('report-scheduler', 'error', performance.now() - start)
      writeSourceHeartbeat('report-scheduler', { lastRun: new Date().toISOString(), status: 'error', durationMs: Math.round(performance.now() - start), error: String(error) })
    } finally {
      markJobComplete('report-scheduler')
    }
  })

  // Clean up on process shutdown
  const cleanupScheduler = () => {
    if (schedulerJob) {
      logger.info('Stopping scheduler on shutdown...')
      schedulerJob.stop()
      schedulerJob = null
    }
    if (securitySummaryJob) {
      logger.info('Stopping security summary scheduler on shutdown...')
      securitySummaryJob.stop()
      securitySummaryJob = null
    }
    if (digestJob) {
      logger.info('Stopping digest scheduler on shutdown...')
      digestJob.stop()
      digestJob = null
    }
    if (budgetAlertJob) {
      logger.info('Stopping budget alert notifier on shutdown...')
      budgetAlertJob.stop()
      budgetAlertJob = null
    }
    if (aiUsageJob) {
      logger.info('Stopping AI usage collector on shutdown...')
      aiUsageJob.stop()
      aiUsageJob = null
    }
    if (mcpUsageAggregateJob) {
      mcpUsageAggregateJob.stop()
      mcpUsageAggregateJob = null
    }
  }

  // Nitro awaits 'close' during graceful shutdown (SIGTERM/SIGINT), so stop
  // scheduling new runs and give in-flight jobs a chance to finish and
  // release their locks before the process exits.
  nitroApp.hooks.hook('close', async () => {
    cleanupScheduler()
    const { drained, remaining } = await waitForActiveJobs(SHUTDOWN_GRACE_MS)
    if (drained) {
      logger.info('Scheduler stopped; no jobs in flight')
    } else {
      logger.warn(`Scheduler shutdown grace period elapsed with jobs still running: ${remaining.join(', ')}`)
    }
  })

  logger.info('Scheduled reports scheduler initialized (running every minute)')

  // Nightly security summary pre-computation via Athena (3 AM UTC)
  securitySummaryJob = new Cron('0 3 * * *', { protect: true }, async () => {
    const today = new Date().toISOString().split('T')[0]
    const start = performance.now()
    markJobRunning('security-summary-nightly')
    try {
      const locked = await claimExecutionLock('security-summary-nightly', today)
      if (!locked) {
        return // Another container is handling it
      }

      // Check if already computed recently (< 20 hours)
      const { getSecuritySummaryMetadata } = await import('../utils/security-summary-store')
      const meta = await getSecuritySummaryMetadata()
      if (meta && meta.ageMinutes < 20 * 60) {
        logger.info('[SecurityScheduler] Summary already fresh, skipping')
        logJobCompletion('security-summary-nightly', 'success', performance.now() - start, { skipped: true })
        return
      }

      logger.info('[SecurityScheduler] Starting nightly security summary computation...')
      const jobStart = Date.now()
      const { buildSecuritySummaryViaAthena } = await import('../utils/security-hub-athena')
      const { saveSecuritySummary } = await import('../utils/security-summary-store')
      const result = await buildSecuritySummaryViaAthena()
      await saveSecuritySummary(result, { durationMs: Date.now() - jobStart })
      logger.info(`[SecurityScheduler] Nightly summary complete in ${Date.now() - jobStart}ms`)
      // The lock is keyed by date, so it is left to expire: releasing it let a
      // container whose cron fired a moment later claim it and run again.
      logJobCompletion('security-summary-nightly', 'success', performance.now() - start)
    } catch (error) {
      logger.error('[SecurityScheduler] Nightly security summary failed:', error)
      await releaseExecutionLock('security-summary-nightly', today).catch(() => {})
      logJobCompletion('security-summary-nightly', 'error', performance.now() - start)
    } finally {
      markJobComplete('security-summary-nightly')
    }
  })

  logger.info('Nightly security summary scheduler initialized (3 AM UTC)')

  // Email digest delivery — every hour at :15
  digestJob = new Cron('15 * * * *', { protect: true }, async () => {
    const hourKey = new Date().toISOString().substring(0, 13) // YYYY-MM-DDTHH
    const start = performance.now()
    markJobRunning('email-digest')
    try {
      const locked = await claimExecutionLock('email-digest', hourKey)
      if (!locked) {
        return // Another container is handling it
      }

      const { getConfigValue } = await import('../utils/site-config')
      const digestEnabled = await getConfigValue<boolean>('notifications.digestEnabled')
      if (digestEnabled === false) {
        logJobCompletion('email-digest', 'success', performance.now() - start, { skipped: true })
        return
      }

      logger.info('[Digest] Starting hourly digest processing...')
      const { processDigestDeliveries } = await import('../utils/digest-service')
      const result = await processDigestDeliveries()

      if (result.processed > 0) {
        logger.info(`[Digest] Processed ${result.processed} user(s): ${result.successful} sent, ${result.failed} failed, ${result.skipped} skipped`)
      }

      // Keyed by hour, so the lock is left to expire rather than released:
      // a release let a container that fired a moment later send the hour again.
      logJobCompletion('email-digest', 'success', performance.now() - start, {
        processed: result.processed, successful: result.successful, failed: result.failed, skipped: result.skipped,
      })
      writeSourceHeartbeat('email-digest', { lastRun: new Date().toISOString(), status: 'success', durationMs: Math.round(performance.now() - start), count: result.processed })
    } catch (error) {
      logger.error('[Digest] Hourly digest processing failed:', error)
      await releaseExecutionLock('email-digest', hourKey).catch(() => {})
      logJobCompletion('email-digest', 'error', performance.now() - start)
      writeSourceHeartbeat('email-digest', { lastRun: new Date().toISOString(), status: 'error', durationMs: Math.round(performance.now() - start), error: String(error) })
    } finally {
      markJobComplete('email-digest')
    }
  })

  logger.info('Email digest scheduler initialized (every hour at :15)')

  // Budget alert notifier — every 15 minutes at :05, :20, :35, :50
  budgetAlertJob = new Cron('5,20,35,50 * * * *', { protect: true }, async () => {
    const windowKey = new Date().toISOString().substring(0, 16) // YYYY-MM-DDTHH:MM
    const start = performance.now()
    markJobRunning('budget-alert-notifier')
    try {
      const locked = await claimExecutionLock('budget-alert-notifier', windowKey)
      if (!locked) {
        return // Another container is handling it
      }

      logger.info('[BudgetAlertNotifier] Starting budget alert processing...')
      const { processRecentBudgetAlerts } = await import('../utils/budget-alert-notifier')
      const result = await processRecentBudgetAlerts()

      if (result.processed > 0) {
        logger.info(`[BudgetAlertNotifier] Processed ${result.processed} alert(s): ${result.notified} notified, ${result.skipped} skipped`)
      }

      // Keyed by window: left to expire so a late-firing container cannot rerun it
      logJobCompletion('budget-alert-notifier', 'success', performance.now() - start, {
        processed: result.processed, notified: result.notified, skipped: result.skipped,
      })
      writeSourceHeartbeat('budget-alert-notifier', { lastRun: new Date().toISOString(), status: 'success', durationMs: Math.round(performance.now() - start), count: result.processed })
    } catch (error) {
      logger.error('[BudgetAlertNotifier] Budget alert processing failed:', error)
      await releaseExecutionLock('budget-alert-notifier', windowKey).catch(() => {})
      logJobCompletion('budget-alert-notifier', 'error', performance.now() - start)
      writeSourceHeartbeat('budget-alert-notifier', { lastRun: new Date().toISOString(), status: 'error', durationMs: Math.round(performance.now() - start), error: String(error) })
    } finally {
      markJobComplete('budget-alert-notifier')
    }
  })

  logger.info('Budget alert notifier initialized (every 15 minutes)')

  if (AI_USAGE_COLLECTION_ENABLED) {
    aiUsageJob = new Cron('10 * * * *', { protect: true }, async () => {
      const lockKey = 'active'
      const start = performance.now()
      markJobRunning('ai-usage-collector')
      try {
        const locked = await claimExecutionLock('ai-usage-collector', lockKey)
        if (!locked) return
        const { collectAIUsage } = await import('../utils/ai-usage-collector')
        const result = await collectAIUsage()
        await releaseExecutionLock('ai-usage-collector', lockKey)
        logJobCompletion('ai-usage-collector', 'success', performance.now() - start, {
          factsWritten: result.factsWritten,
          warnings: result.warnings.length,
          initialBackfill: result.initialBackfill
        })
        writeSourceHeartbeat('ai-usage-collector', {
          lastRun: new Date().toISOString(),
          status: 'success',
          durationMs: Math.round(performance.now() - start),
          count: result.factsWritten
        })
      } catch (error) {
        logger.error('[AI Usage] Hourly collection failed:', error)
        await releaseExecutionLock('ai-usage-collector', lockKey).catch(() => {})
        logJobCompletion('ai-usage-collector', 'error', performance.now() - start)
        writeSourceHeartbeat('ai-usage-collector', {
          lastRun: new Date().toISOString(),
          status: 'error',
          durationMs: Math.round(performance.now() - start),
          error: String(error)
        })
      } finally {
        markJobComplete('ai-usage-collector')
      }
    })
    logger.info('AI usage collector initialized (hourly at :10)')
  }

  mcpUsageAggregateJob = new Cron('25 0 * * *', { protect: true }, async () => {
    const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const start = performance.now()
    let locked = false
    let succeeded = false
    markJobRunning('mcp-usage-aggregate')

    try {
      // Keep lock acquisition inside the error boundary so DynamoDB failures
      // cannot surface as unhandled cron rejections.
      locked = await claimExecutionLock('mcp-usage-aggregate', day)
      if (!locked) {
        logJobCompletion('mcp-usage-aggregate', 'success', performance.now() - start, { skipped: true })
        return
      }

      const { writeMcpDailyUsageAggregate } = await import('../mcp/usage')
      await writeMcpDailyUsageAggregate(day)
      succeeded = true
      logJobCompletion('mcp-usage-aggregate', 'success', performance.now() - start)
      writeSourceHeartbeat('mcp-usage-aggregate', {
        lastRun: new Date().toISOString(),
        status: 'success',
        durationMs: Math.round(performance.now() - start)
      })
    } catch (error) {
      logger.error('[MCP Usage] Daily aggregate failed:', error)
      logJobCompletion('mcp-usage-aggregate', 'error', performance.now() - start)
      writeSourceHeartbeat('mcp-usage-aggregate', {
        lastRun: new Date().toISOString(),
        status: 'error',
        durationMs: Math.round(performance.now() - start),
        error: String(error)
      })
    } finally {
      if (locked && !succeeded) {
        // Release only on failure so another container can retry; a finished
        // day keeps its lock until expiry. Never let cleanup mask the result.
        await releaseExecutionLock('mcp-usage-aggregate', day).catch(() => {})
      }
      markJobComplete('mcp-usage-aggregate')
    }
  })
})
