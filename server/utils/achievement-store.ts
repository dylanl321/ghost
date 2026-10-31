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
    return await readAchievementProgress(userId)
  } catch (error) {
    logger.error('Error getting achievement progress:', error)
    return createDefaultProgress(userId)
  }
}

/**
 * Read progress, throwing on a failed read. Writes use this so a DynamoDB
 * error can never be mistaken for "no progress yet" and overwrite real data.
 */
async function readAchievementProgress(userId: string): Promise<SavedProgress> {
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
}

const MAX_PROGRESS_KEYS = 500
const MAX_LIST_LENGTH = 1000

function boundedRecord<T>(value: unknown, isValid: (item: unknown) => item is T): Record<string, T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, T] => isValid(entry[1]))
      .slice(0, MAX_PROGRESS_KEYS)
  )
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, MAX_LIST_LENGTH)
    : []
}

/**
 * Validate a client sync and merge it with stored progress. Awards are only
 * ever added (a sync sent before a server-side award must not remove it) and
 * only catalog badges are kept.
 */
export function mergeAchievementProgress(existing: SavedProgress, progress: SyncProgressRequest): SavedProgress {
  const clientAwarded = stringList(progress.awarded).filter(id => findBadgeDefinition(id))
  const awarded = [...new Set([...(existing.awarded ?? []), ...clientAwarded])]
  const clientAwardedAt = boundedRecord(progress.awardedAt, (item): item is string => typeof item === 'string')
  const awardedAt: Record<string, string> = {}
  for (const id of awarded) {
    const at = existing.awardedAt?.[id] ?? clientAwardedAt[id]
    if (at) awardedAt[id] = at
  }

  const uniques = boundedRecord(progress.uniques, (item): item is unknown[] => Array.isArray(item))
  return {
    userId: existing.userId,
    counts: boundedRecord(progress.counts, (item): item is number => typeof item === 'number' && Number.isFinite(item)),
    uniques: Object.fromEntries(Object.entries(uniques).map(([key, list]) => [key, stringList(list)])),
    seen: stringList(progress.seen),
    awarded,
    awardedAt,
    updatedAt: new Date().toISOString(),
    createdAt: existing.createdAt
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
    const existing = await readAchievementProgress(userId)
    const updated = mergeAchievementProgress(existing, progress)

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
    const existing = await readAchievementProgress(userId)

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
