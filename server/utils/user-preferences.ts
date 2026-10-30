/**
 * User Preferences DynamoDB Operations
 * CRUD operations for user preferences with auto-creation
 */

import type { UserPreferences, UpdatePreferencesRequest } from '../../shared/types/user-preferences'
import { deleteItem, getItem, putItem, scanItems } from './dynamodb'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import type { H3Event } from 'h3'
import { logger } from './logger'

/**
 * Detect timezone from request headers or query params
 */
function detectTimezoneFromRequest(event?: H3Event): string {
  if (!event) return 'America/New_York'

  try {
    // Check for timezone in headers (some clients send this)
    const timezoneHeader = event.node.req.headers['x-timezone'] as string
    if (timezoneHeader) return timezoneHeader

    // Check for timezone in query params (client can send on first preferences fetch)
    const query = getQuery(event)
    const timezoneParam = query.timezone as string
    if (timezoneParam) return timezoneParam

    // Default to Eastern Time if no timezone provided
    // Note: Client-side will auto-correct this to browser timezone on first load
    return 'America/New_York'
  } catch {
    return 'America/New_York'
  }
}

/**
 * Preferences are keyed by the lower-cased user id. Sessions carry the email as
 * Entra returns it (often mixed case) while notification and digest code look
 * it up lower-cased, so an unnormalized key silently split one user's settings
 * across two rows.
 */
export function normalizePreferencesUserId(userId: string): string {
  return String(userId).trim().toLowerCase()
}

async function preferencesTable() {
  return {
    tableName: await getTableName('userPreferences'),
    environment: await getTableEnvironment('userPreferences'),
    accountId: await getTableAccountId('userPreferences')
  }
}

/**
 * Fold a row stored under a legacy mixed-case key into the normalized row.
 * The newer row's fields win, and its preference keys win over the older
 * row's, so a default row auto-created under the lower-case key cannot mask
 * settings the user saved under the old key. The legacy row is removed only
 * after the merged row is written.
 */
export function mergeLegacyPreferences(
  userId: string,
  normalized: UserPreferences | null,
  legacy: UserPreferences
): UserPreferences {
  if (!normalized) return { ...legacy, userId }
  const [older, newer] = (legacy.updatedAt || '') > (normalized.updatedAt || '')
    ? [normalized, legacy]
    : [legacy, normalized]
  return {
    ...older,
    ...newer,
    userId,
    createdAt: [legacy.createdAt, normalized.createdAt].filter(Boolean).sort()[0] || newer.createdAt,
    preferences: { ...older.preferences, ...newer.preferences }
  }
}

async function migrateLegacyPreferences(
  rawUserId: string,
  userId: string,
  normalized: UserPreferences | null
): Promise<UserPreferences | null> {
  if (rawUserId === userId) return normalized
  const { tableName, environment, accountId } = await preferencesTable()
  const legacy = await getItem(tableName, { userId: rawUserId }, environment, accountId) as UserPreferences | null
  if (!legacy) return normalized

  const merged = mergeLegacyPreferences(userId, normalized, legacy)
  await putItem(tableName, merged, environment, accountId)
  await deleteItem(tableName, { userId: rawUserId }, environment, accountId)
  logger.info(`Migrated user preferences to normalized key for ${userId}`)
  return merged
}

/**
 * Get user preferences by userId
 * Auto-creates with defaults if doesn't exist
 */
export async function getUserPreferences(
  rawUserId: string,
  event?: H3Event
): Promise<UserPreferences> {
  const userId = normalizePreferencesUserId(rawUserId)
  try {
    const tableName = await getTableName('userPreferences')
    const environment = await getTableEnvironment('userPreferences')
    const accountId = await getTableAccountId('userPreferences')

    // Try to get existing preferences
    const existing = await getItem(
      tableName,
      { userId },
      environment,
      accountId
    )

    const current = await migrateLegacyPreferences(rawUserId.trim(), userId, existing as UserPreferences | null)
    if (current) {
      return current
    }

    // Auto-create with defaults
    const now = new Date().toISOString()
    const defaults: UserPreferences = {
      userId,
      timezone: detectTimezoneFromRequest(event),
      lastLoginAt: now,
      preferences: {},
      createdAt: now,
      updatedAt: now
    }

    await putItem(tableName, defaults, environment, accountId)

    logger.info(`Created default preferences for user: ${userId}`)
    return defaults

  } catch (error) {
    logger.error('Error getting user preferences:', error)
    // Return defaults even on error
    const now = new Date().toISOString()
    return {
      userId,
      timezone: 'America/New_York',
      lastLoginAt: now,
      preferences: {},
      createdAt: now,
      updatedAt: now
    }
  }
}

/**
 * Update user preferences (partial update)
 */
export async function updateUserPreferences(
  rawUserId: string,
  updates: UpdatePreferencesRequest
): Promise<UserPreferences> {
  const userId = normalizePreferencesUserId(rawUserId)
  try {
    // Get existing preferences (or create defaults)
    const existing = await getUserPreferences(rawUserId)

    // Only the documented fields are writable. Spreading the request body
    // let callers overwrite createdAt/lastLoginAt or add arbitrary attributes.
    const updated: UserPreferences = {
      ...existing,
      ...(typeof updates?.timezone === 'string' ? { timezone: updates.timezone } : {}),
      userId, // Ensure userId doesn't change
      updatedAt: new Date().toISOString()
    }

    // Merge preferences object if provided
    if (updates?.preferences && typeof updates.preferences === 'object' && !Array.isArray(updates.preferences)) {
      updated.preferences = {
        ...existing.preferences,
        ...updates.preferences
      }
    }

    const tableName = await getTableName('userPreferences')
    const environment = await getTableEnvironment('userPreferences')
    const accountId = await getTableAccountId('userPreferences')

    await putItem(tableName, updated, environment, accountId)

    return updated

  } catch (error) {
    logger.error('Error updating user preferences:', error)
    throw error
  }
}

/**
 * Set a single preference attribute
 */
export async function setUserPreference(
  userId: string,
  key: string,
  value: any
): Promise<UserPreferences> {
  try {
    const existing = await getUserPreferences(userId)

    // Update the specific preference
    const updated: UserPreferences = {
      ...existing,
      userId: normalizePreferencesUserId(userId),
      preferences: {
        ...existing.preferences,
        [key]: value
      },
      updatedAt: new Date().toISOString()
    }

    const tableName = await getTableName('userPreferences')
    const environment = await getTableEnvironment('userPreferences')
    const accountId = await getTableAccountId('userPreferences')

    await putItem(tableName, updated, environment, accountId)

    return updated

  } catch (error) {
    logger.error('Error setting user preference:', error)
    throw error
  }
}

/**
 * Update last login time
 */
export async function updateLastLogin(userId: string): Promise<void> {
  try {
    const existing = await getUserPreferences(userId)

    const updated: UserPreferences = {
      ...existing,
      userId: normalizePreferencesUserId(userId),
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const tableName = await getTableName('userPreferences')
    const environment = await getTableEnvironment('userPreferences')
    const accountId = await getTableAccountId('userPreferences')

    await putItem(tableName, updated, environment, accountId)

  } catch (error) {
    // Don't throw on login tracking errors
    logger.error('Error updating last login:', error)
  }
}

/**
 * Get all user preferences (admin function)
 */
export async function getAllUserPreferences(
  limit: number = 100
): Promise<{ preferences: UserPreferences[]; total: number }> {
  try {
    const tableName = await getTableName('userPreferences')
    const environment = await getTableEnvironment('userPreferences')
    const accountId = await getTableAccountId('userPreferences')

    // One scan page stops at 1 MB, so keep reading until the limit is reached.
    const preferences: UserPreferences[] = []
    let nextToken: string | undefined
    do {
      const page = await scanItems(
        tableName,
        undefined,
        limit - preferences.length,
        nextToken,
        environment,
        undefined,
        undefined,
        accountId
      )
      preferences.push(...page.items as UserPreferences[])
      nextToken = page.nextToken
    } while (nextToken && preferences.length < limit)

    return {
      preferences,
      total: preferences.length
    }

  } catch (error) {
    logger.error('Error listing all user preferences:', error)
    return { preferences: [], total: 0 }
  }
}

/**
 * Delete user preferences (admin function)
 */
export async function deleteUserPreferences(userId: string): Promise<boolean> {
  try {
    const tableName = await getTableName('userPreferences')
    const environment = await getTableEnvironment('userPreferences')
    const accountId = await getTableAccountId('userPreferences')

    // Remove the normalized row and any row left under the legacy key.
    for (const key of new Set([normalizePreferencesUserId(userId), userId.trim()])) {
      await deleteItem(tableName, { userId: key }, environment, accountId)
    }

    return true

  } catch (error) {
    logger.error('Error deleting user preferences:', error)
    return false
  }
}
