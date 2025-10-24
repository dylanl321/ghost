/**
 * User Preferences DynamoDB Operations
 * CRUD operations for user preferences with auto-creation
 */

import type { UserPreferences, UpdatePreferencesRequest } from '#shared/types/user-preferences'
import { getItem, putItem, scanItems } from './dynamodb'
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
 * Get user preferences by userId
 * Auto-creates with defaults if doesn't exist
 */
export async function getUserPreferences(
  userId: string,
  event?: H3Event
): Promise<UserPreferences> {
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

    if (existing) {
      return existing as UserPreferences
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
  userId: string,
  updates: UpdatePreferencesRequest
): Promise<UserPreferences> {
  try {
    // Get existing preferences (or create defaults)
    const existing = await getUserPreferences(userId)

    // Merge updates
    const updated: UserPreferences = {
      ...existing,
      ...updates,
      userId, // Ensure userId doesn't change
      updatedAt: new Date().toISOString()
    }

    // Merge preferences object if provided
    if (updates.preferences) {
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

    const result = await scanItems(
      tableName,
      undefined,
      limit,
      undefined,
      environment,
      undefined,
      undefined,
      accountId
    )

    return {
      preferences: result.items as UserPreferences[],
      total: result.count
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

    const { deleteItem } = await import('./dynamodb')
    await deleteItem(
      tableName,
      { userId },
      environment,
      accountId
    )

    return true

  } catch (error) {
    logger.error('Error deleting user preferences:', error)
    return false
  }
}
