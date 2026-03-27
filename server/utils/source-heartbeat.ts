/**
 * Source Heartbeat
 *
 * Persists last-run status for cron-based notification sources
 * using site-config keys like `source.heartbeat.budget-alert-notifier`.
 */

import { putSiteConfigRaw, getConfigValue } from './site-config'
import { logger } from './logger'
import type { SourceHeartbeat } from '#shared/types/notification-sources'

const KEY_PREFIX = 'source.heartbeat.'

/**
 * Write a heartbeat after a cron job completes. Fire-and-forget.
 */
export async function writeSourceHeartbeat(
  sourceId: string,
  heartbeat: SourceHeartbeat
): Promise<void> {
  try {
    await putSiteConfigRaw(`${KEY_PREFIX}${sourceId}`, heartbeat)
  } catch (err: any) {
    logger.warn(`Failed to write heartbeat for ${sourceId}:`, err.message)
  }
}

/**
 * Read the most recent heartbeat for a source.
 */
export async function readSourceHeartbeat(
  sourceId: string
): Promise<SourceHeartbeat | null> {
  try {
    return await getConfigValue<SourceHeartbeat>(`${KEY_PREFIX}${sourceId}`)
  } catch {
    return null
  }
}
