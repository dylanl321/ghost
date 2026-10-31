/**
 * Security Summary DynamoDB Store
 *
 * Persists pre-computed OrgSecuritySummary in the ghost-site-config table
 * so page loads can read from DynamoDB (<100ms) instead of running Athena.
 *
 * NOTE: This item shares the ghost-site-config table but is NOT a config item.
 * The site-config scanner filters it via isSiteConfigItem() using key prefix
 * and structural checks.
 */

import { getItem, putItem } from './dynamodb'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import { organizationCache, CacheKeys, CacheTags } from './cache-manager'
import { buildSecuritySummaryViaAthena, type SecuritySummaryProgressCallback } from './security-hub-athena'
import { logger } from './logger'
import type { OrgSecuritySummary } from '../../shared/types/security-dashboard'

const DYNAMO_KEY = 'security:org-summary'
const TTL_HOURS = 36
// A summary from the capped Security Hub API fallback is incomplete; keep it
// only until the next attempt, not for a day and a half.
const FALLBACK_TTL_HOURS = 1
const MEMORY_TTL_SECONDS = 300

async function getTableConfig() {
  const tableName = await getTableName('siteConfig')
  const environment = await getTableEnvironment('siteConfig')
  const accountId = await getTableAccountId('siteConfig')
  return { tableName, environment, accountId }
}

/**
 * Save a pre-computed security summary to DynamoDB.
 * Truncates large arrays to stay under the 400KB item limit.
 */
export async function saveSecuritySummary(
  summary: OrgSecuritySummary,
  metadata?: { durationMs?: number }
): Promise<void> {
  const { tableName, environment, accountId } = await getTableConfig()

  // Truncate to stay under 400KB DynamoDB item limit
  const truncated: OrgSecuritySummary = {
    ...summary,
    accountRiskRanking: summary.accountRiskRanking.slice(0, 200),
    topFindings: summary.topFindings.slice(0, 20),
    severityByProduct: summary.severityByProduct?.slice(0, 30),
    findingsTrend: summary.findingsTrend?.slice(0, 52),
  }

  const source = summary.dataSource || 'athena'
  const ttlHours = source === 'athena' ? TTL_HOURS : FALLBACK_TTL_HOURS
  const item = {
    key: DYNAMO_KEY,
    type: 'json',  // Required by site-config loader; also filtered via NON_CONFIG_KEY_PREFIXES
    summary: truncated,
    computedAt: new Date().toISOString(),
    computeDurationMs: metadata?.durationMs || 0,
    source,
    ttl: Math.floor(Date.now() / 1000) + ttlHours * 3600,
  }

  await putItem(tableName, item, environment, accountId)
  logger.info(`[SecurityStore] Saved summary to DynamoDB (${truncated.totalFindings} findings, ${truncated.totalAccounts} accounts)`)
}

/**
 * Load the pre-computed security summary from DynamoDB.
 * Returns null if no data exists or TTL has expired.
 */
export async function loadSecuritySummary(): Promise<OrgSecuritySummary | null> {
  try {
    const { tableName, environment, accountId } = await getTableConfig()
    const result = await getItem(tableName, { key: DYNAMO_KEY }, environment, accountId)

    if (!result || !result.summary) return null

    // Check TTL expiry
    if (result.ttl && result.ttl < Math.floor(Date.now() / 1000)) {
      logger.info('[SecurityStore] Stored summary has expired')
      return null
    }

    return result.summary as OrgSecuritySummary
  } catch (err: any) {
    logger.error('[SecurityStore] Failed to load summary from DynamoDB:', err.message)
    return null
  }
}

/**
 * Get metadata about the stored summary without loading the full payload.
 */
export async function getSecuritySummaryMetadata(): Promise<{
  computedAt: string
  durationMs: number
  ageMinutes: number
  source: string
  expired: boolean
} | null> {
  try {
    const { tableName, environment, accountId } = await getTableConfig()
    const result = await getItem(tableName, { key: DYNAMO_KEY }, environment, accountId)

    if (!result || !result.computedAt) return null

    const computedAt = result.computedAt as string
    const ageMinutes = Math.round((Date.now() - new Date(computedAt).getTime()) / 60000)

    return {
      computedAt,
      durationMs: (result.computeDurationMs as number) || 0,
      ageMinutes,
      source: (result.source as string) || 'athena',
      expired: !!result.ttl && (result.ttl as number) < Math.floor(Date.now() / 1000),
    }
  } catch (err: any) {
    logger.error('[SecurityStore] Failed to load summary metadata:', err.message)
    return null
  }
}

let inFlightRefresh: Promise<OrgSecuritySummary> | null = null

/**
 * Recompute the org summary, persist it and refresh the memory cache.
 * Concurrent callers (page loads, the Refresh button, the nightly job,
 * admin recompute) share one run instead of each starting eight Athena
 * queries.
 */
export function refreshSecuritySummary(onProgress?: SecuritySummaryProgressCallback): Promise<OrgSecuritySummary> {
  if (inFlightRefresh) {
    onProgress?.({ stage: 'waiting', message: 'A refresh is already running, waiting for it...', percent: 15 })
    return inFlightRefresh
  }

  const start = Date.now()
  inFlightRefresh = (async () => {
    const result = await buildSecuritySummaryViaAthena(onProgress)
    await saveSecuritySummary(result, { durationMs: Date.now() - start })
    await organizationCache.invalidateByTags([CacheTags.SECURITY])
    await organizationCache.set(CacheKeys.securityOrgSummary(), result, { ttl: MEMORY_TTL_SECONDS, tags: [CacheTags.SECURITY] })
    return result
  })().finally(() => {
    inFlightRefresh = null
  })
  return inFlightRefresh
}

/**
 * The org summary from memory, then DynamoDB, computing it only when
 * neither has one.
 */
export async function getOrgSecuritySummary(
  options: { forceRefresh?: boolean; onProgress?: SecuritySummaryProgressCallback } = {}
): Promise<{ summary: OrgSecuritySummary; source: 'memory' | 'dynamodb' | 'computed' }> {
  if (!options.forceRefresh) {
    const cached = await organizationCache.get<OrgSecuritySummary>(CacheKeys.securityOrgSummary())
    if (cached) return { summary: cached, source: 'memory' }

    const stored = await loadSecuritySummary()
    if (stored) {
      await organizationCache.set(CacheKeys.securityOrgSummary(), stored, { ttl: MEMORY_TTL_SECONDS, tags: [CacheTags.SECURITY] })
      return { summary: stored, source: 'dynamodb' }
    }
  }

  return { summary: await refreshSecuritySummary(options.onProgress), source: 'computed' }
}
