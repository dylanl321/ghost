/**
 * Achievement Progress DynamoDB Operations
 *
 * CRUD operations for user achievement progress.
 * Follows the same pattern as user-preferences.ts.
 */

import type { SavedProgress, SyncProgressRequest } from '../../shared/types/achievements'
import { getItem, putItem } from './dynamodb'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import { logger } from './logger'
import { BADGE_DEFINITIONS } from '../../app/config/badgeDefinitions'

function createDefaultProgress(userId: string): SavedProgress {
  const now = new Date().toISOString()
  return {
    userId,
    counts: {},
    uniques: {},
    seen: [],
    awarded: [],
    awardedAt: {},
    updatedAt: now,
    createdAt: now
  }
}

/**
 * Get achievement progress for a user.
 * Returns defaults if no progress exists yet.
 */
export async function getAchievementProgress(userId: string): Promise<SavedProgress> {
  try {
    const tableName = await getTableName('achievementProgress')
    const environment = await getTableEnvironment('achievementProgress')
    const accountId = await getTableAccountId('achievementProgress')

    const existing = await getItem(tableName, { userId }, environment, accountId)

    if (existing) {
      const defaults = createDefaultProgress(userId)
      return {
        ...defaults,
        ...existing,
        counts: existing.counts ?? defaults.counts,
        uniques: existing.uniques ?? defaults.uniques,
        seen: existing.seen ?? defaults.seen,
        awarded: existing.awarded ?? defaults.awarded,
        awardedAt: existing.awardedAt ?? defaults.awardedAt,
      } as SavedProgress
    }

    // Return defaults without auto-creating (created on first sync)
    return createDefaultProgress(userId)

  } catch (error) {
    logger.error('Error getting achievement progress:', error)
    return createDefaultProgress(userId)
  }
}

/**
 * Save achievement progress (full replace).
 * Called by the debounced client sync.
 */
export async function saveAchievementProgress(
  userId: string,
  progress: SyncProgressRequest
): Promise<SavedProgress> {
  try {
    const existing = await getAchievementProgress(userId)

    const updated: SavedProgress = {
      userId,
      counts: progress.counts ?? {},
      uniques: progress.uniques ?? {},
      seen: progress.seen ?? [],
      awarded: progress.awarded ?? [],
      awardedAt: progress.awardedAt ?? {},
      updatedAt: new Date().toISOString(),
      createdAt: existing.createdAt
    }

    const tableName = await getTableName('achievementProgress')
    const environment = await getTableEnvironment('achievementProgress')
    const accountId = await getTableAccountId('achievementProgress')

    await putItem(tableName, updated, environment, accountId)

    return updated

  } catch (error) {
    logger.error('Error saving achievement progress:', error)
    throw error
  }
}

/**
 * Record a single badge award into the progress.
 * Merges the badge into existing progress without overwriting other fields.
 */
export async function recordBadgeAward(
  userId: string,
  badgeId: string
): Promise<SavedProgress> {
  try {
    const existing = await getAchievementProgress(userId)

    // Skip if already awarded
    if (existing.awarded?.includes(badgeId)) {
      return existing
    }

    const updated: SavedProgress = {
      ...existing,
      awarded: [...existing.awarded, badgeId],
      awardedAt: {
        ...existing.awardedAt,
        [badgeId]: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    }

    const tableName = await getTableName('achievementProgress')
    const environment = await getTableEnvironment('achievementProgress')
    const accountId = await getTableAccountId('achievementProgress')

    await putItem(tableName, updated, environment, accountId)

    return updated

  } catch (error) {
    logger.error('Error recording badge award:', error)
    throw error
  }
}

/**
 * Look up a badge in the catalog. The award endpoint only records catalog
 * badges and takes their display text from here, not from the client.
 */
export function findBadgeDefinition(badgeId: unknown) {
  if (typeof badgeId !== 'string') return undefined
  return BADGE_DEFINITIONS.find(badge => badge.id === badgeId)
}
