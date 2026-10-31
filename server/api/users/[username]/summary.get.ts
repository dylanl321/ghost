/**
 * GET /api/users/:username/summary
 *
 * Get user summary for entity popover
 * Returns basic user info and account associations from Microsoft Graph
 */

import { defineEventHandler } from 'h3'
import { graphRequest } from '../../../utils/entra/graph-client'
import { odataString } from '../../../utils/entra/config'
import type { EntraUser } from '../../../types/entra'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  const username = event.context.params?.username

  if (!username) {
    throw createError({
      statusCode: 400,
      message: 'Username parameter required'
    })
  }

  try {
    // Query Microsoft Graph for user info
    // Try to find user by userPrincipalName (email format)
    let graphUser: EntraUser | null = null

    try {
      // Try exact UPN match first (username@domain.com)
      if (username.includes('@')) {
        graphUser = await graphRequest<EntraUser>(
          event,
          `/users/${encodeURIComponent(username)}?$select=id,displayName,mail,userPrincipalName`
        )
      } else {
        // Search for user by display name or UPN starting with username
        // The username comes from the URL: quote it for OData and encode the
        // query so a quote or ampersand cannot change the Graph request.
        const query = new URLSearchParams({
          $filter: `startsWith(userPrincipalName,${odataString(username)})`,
          $select: 'id,displayName,mail,userPrincipalName',
          $top: '1'
        })
        const searchResponse = await graphRequest<{ value: EntraUser[] }>(event, `/users?${query}`)
        if (searchResponse.value && searchResponse.value.length > 0) {
          graphUser = searchResponse.value[0] ?? null
        }
      }
    } catch (graphError: any) {
      logger.warn(`[User Summary] Could not fetch user from Graph for ${username}:`, graphError.message)
      // Continue without Graph data
    }

    // Extract email for contact purposes
    const userEmail = graphUser?.mail || graphUser?.userPrincipalName || (username.includes('@') ? username : undefined)

    // Generate Teams chat link using msteams:// protocol (opens Teams desktop app directly)
    // This matches the logic used in /app/pages/account/user/[username]/index.vue
    const teamsLink = userEmail ? `msteams:/l/chat/0/0?users=${encodeURIComponent(userEmail)}` : undefined

    // Return summary with available data
    // Note: We don't currently track user-to-account associations in the database
    // This would require additional tables/queries to implement
    return {
      username,
      fullName: graphUser?.displayName || undefined,
      email: userEmail,
      teamsLink, // Teams deep link for starting a chat
      accountCount: 0, // TODO: Implement account association tracking
      accounts: [], // TODO: Query user's account access from security groups or IAM
      lastActive: undefined // TODO: Implement last activity tracking
    }
  } catch (error: any) {
    logger.error(`[User Summary] Error for ${username}:`, error)

    // Return minimal data instead of failing completely
    const fallbackEmail = username.includes('@') ? username : undefined
    return {
      username,
      fullName: undefined,
      email: fallbackEmail,
      teamsLink: fallbackEmail ? `msteams:/l/chat/0/0?users=${encodeURIComponent(fallbackEmail)}` : undefined,
      accountCount: 0,
      accounts: [],
      lastActive: undefined
    }
  }
})
