/**
 * User Context Builder for AI Chat
 *
 * Builds enriched user context to help the AI chatbot provide more personalized responses.
 * Includes user's favorite accounts, admin roles, and other relevant information.
 */

import type { H3Event } from 'h3'
import { getUserPreferences } from './user-preferences'
import { getUserEmail, isUserAdmin } from './user-roles'
import { scanItems } from './dynamodb'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import { logger } from './logger'

export interface UserContextForAI {
  userName: string
  userEmail: string
  isAdmin: boolean
  timezone: string
  favoriteAccounts: Array<{
    accountId: string
    accountName?: string
  }>
  adminAccounts: Array<{
    accountId: string
    accountName?: string
    role: 'primary' | 'delegate' | 'cost-manager'
  }>
  totalFavorites: number
  totalAdminAccounts: number
}

/**
 * Format user context as natural language for AI
 * This creates a readable context string to prepend to the chat message
 */
export function formatUserContextForAI(context: UserContextForAI | null): string {
  if (!context) {
    return ''
  }

  const parts: string[] = []

  // Basic user info
  parts.push(`## Current User Context`)
  parts.push(``)
  parts.push(`**User:** ${context.userName} (${context.userEmail})`)
  parts.push(`**Timezone:** ${context.timezone}`)
  if (context.isAdmin) {
    parts.push(`**Role:** GHOST Administrator (AWS Product Team member)`)
  }
  parts.push(``)

  // Favorite accounts
  if (context.totalFavorites > 0) {
    parts.push(`**Favorite Accounts (${context.totalFavorites}):**`)

    // Show first 10 favorites with details
    const displayFavorites = context.favoriteAccounts.slice(0, 10)
    for (const fav of displayFavorites) {
      const name = fav.accountName || 'Unknown'
      parts.push(`- ${name} (${fav.accountId})`)
    }

    // Show count if there are more
    if (context.totalFavorites > 10) {
      parts.push(`- ... and ${context.totalFavorites - 10} more favorites`)
    }
    parts.push(``)
  }

  // Admin accounts
  if (context.totalAdminAccounts > 0) {
    parts.push(`**Accounts with Admin Access (${context.totalAdminAccounts}):**`)

    // Show first 10 admin accounts with details
    const displayAdminAccounts = context.adminAccounts.slice(0, 10)
    for (const admin of displayAdminAccounts) {
      const name = admin.accountName || 'Unknown'
      const roleLabel = admin.role === 'primary' ? 'Primary Admin'
                      : admin.role === 'delegate' ? 'Delegate Admin'
                      : 'Cost Manager'
      parts.push(`- ${name} (${admin.accountId}) - ${roleLabel}`)
    }

    // Show count if there are more
    if (context.totalAdminAccounts > 10) {
      parts.push(`- ... and ${context.totalAdminAccounts - 10} more accounts`)
    }
    parts.push(``)
  }

  // Helpful hints for the AI
  parts.push(`---`)
  parts.push(``)
  parts.push(`**Instructions for AI Assistant:**`)
  parts.push(`- When the user asks about "my accounts" or "my costs", prioritize their favorite accounts and accounts where they have admin access`)
  parts.push(`- If the user's query is ambiguous, suggest checking their favorite accounts first`)
  parts.push(`- When discussing costs or resources, offer to look at their favorite accounts if no specific account is mentioned`)
  parts.push(`- Use the user's timezone for date/time references`)
  if (context.isAdmin) {
    parts.push(`- This user is a GHOST administrator with elevated access`)
  }
  parts.push(``)

  return parts.join('\n')
}

/**
 * Username matching helper - matches usernames like "john.doe" to "john.doe@gd-ms.com"
 */
function usernameMatches(username: string | undefined, userPrincipalName: string | undefined): boolean {
  if (!username || !userPrincipalName) return false

  // Extract the username part before @ symbol
  const upnParts = userPrincipalName.split('@')
  if (upnParts.length === 0) return false

  const upnUsername = upnParts[0]?.toLowerCase() || ''
  const checkUsername = username.toLowerCase()

  return upnUsername === checkUsername
}

/**
 * Build user context for AI chatbot
 * This context helps the AI provide more personalized and relevant responses
 */
export async function buildUserContextForAI(event: H3Event): Promise<UserContextForAI | null> {
  try {
    // Get user info from session
    const auth = event.context.auth
    if (!auth || !auth.isAuthenticated || !auth.user) {
      logger.warn('[User Context] No authenticated user found')
      return null
    }

    const user = auth.user
    const userEmail = user?.email || user?.claims?.email || user?.claims?.preferred_username || 'unknown'
    const userName = user?.name || user?.claims?.name || user?.claims?.given_name || userEmail.split('@')[0]
    const userPrincipalName = userEmail

    // Get user preferences (includes favorites and timezone)
    const preferences = await getUserPreferences(userEmail)
    const favoriteAccountIds = (preferences.preferences?.favoriteAccounts || []) as string[]

    // Check if user is admin
    const adminStatus = await isUserAdmin(event)

    // Get all accounts from DynamoDB to find:
    // 1. Account names for favorites
    // 2. Accounts where user has admin roles
    const tableName = await getTableName('externalAccounts')
    const environment = await getTableEnvironment('externalAccounts')
    const accountId = await getTableAccountId('externalAccounts')

    const scanResult = await scanItems(
      tableName,
      undefined, // filterExpression
      undefined, // limit
      undefined, // nextToken
      environment,
      undefined, // expressionAttributeNames
      undefined, // expressionAttributeValues
      accountId
    )
    const allAccounts = scanResult.items as any[]

    // Build favorites list with names
    const favoriteAccounts: UserContextForAI['favoriteAccounts'] = []
    const adminAccounts: UserContextForAI['adminAccounts'] = []

    for (const account of allAccounts) {
      const acctId = account.awsStandardAccountID || account.accountId
      if (!acctId) continue

      const acctName = account.projectName || account.accountName || account.accountAlias

      // Check if this is a favorite account
      if (favoriteAccountIds.includes(acctId)) {
        favoriteAccounts.push({
          accountId: acctId,
          accountName: acctName
        })
      }

      // Check if user is an admin (primary, delegate, or cost manager)
      if (account.primaryAccountAdminUsername &&
          usernameMatches(account.primaryAccountAdminUsername, userPrincipalName)) {
        adminAccounts.push({
          accountId: acctId,
          accountName: acctName,
          role: 'primary'
        })
      }

      if (account.delegateAccountAdminUsername &&
          usernameMatches(account.delegateAccountAdminUsername, userPrincipalName)) {
        adminAccounts.push({
          accountId: acctId,
          accountName: acctName,
          role: 'delegate'
        })
      }

      if (account.costManagerUsername &&
          usernameMatches(account.costManagerUsername, userPrincipalName)) {
        adminAccounts.push({
          accountId: acctId,
          accountName: acctName,
          role: 'cost-manager'
        })
      }
    }

    // Remove duplicates from admin accounts (user might have multiple roles in same account)
    const uniqueAdminAccounts = adminAccounts.reduce((acc, curr) => {
      const existing = acc.find(a => a.accountId === curr.accountId)
      if (!existing) {
        acc.push(curr)
      } else {
        // If user has multiple roles, combine them
        if (existing.role !== curr.role) {
          existing.role = 'primary' // Prioritize primary role in display
        }
      }
      return acc
    }, [] as UserContextForAI['adminAccounts'])

    const context: UserContextForAI = {
      userName,
      userEmail,
      isAdmin: adminStatus,
      timezone: preferences.timezone,
      favoriteAccounts,
      adminAccounts: uniqueAdminAccounts,
      totalFavorites: favoriteAccounts.length,
      totalAdminAccounts: uniqueAdminAccounts.length
    }

    logger.info('[User Context] Built context for AI', {
      userEmail,
      totalFavorites: context.totalFavorites,
      totalAdminAccounts: context.totalAdminAccounts
    })

    return context

  } catch (error: any) {
    logger.error('[User Context] Failed to build user context:', error.message)
    return null
  }
}
