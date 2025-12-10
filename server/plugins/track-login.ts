/**
 * Track Last Login Plugin
 * Updates lastLoginAt for authenticated users (once per hour)
 */

import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { getUserSession } from '../utils/entra/session'
import { updateLastLogin } from '../utils/user-preferences'
import { logger } from '../utils/logger'

// Track last update times to debounce (in-memory cache)
const lastUpdateTimes = new Map<string, number>()
const UPDATE_INTERVAL = 60 * 60 * 1000 // 1 hour in milliseconds

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    try {
      // Only track for API requests (not assets, etc.)
      const url = event.node.req.url || ''
      if (!url.startsWith('/api/')) return

      // Get user session
      const session = await getUserSession(event)
      if (!session?.user) return

      // Get user ID
      const userId = session.user.email || session.user.id || session.user.sub
      if (!userId) return

      // Check if we recently updated for this user
      const lastUpdate = lastUpdateTimes.get(userId)
      const now = Date.now()

      if (lastUpdate && (now - lastUpdate) < UPDATE_INTERVAL) {
        // Skip - too soon since last update
        return
      }

      // Update last login time (async, non-blocking)
      updateLastLogin(userId).catch(err => {
        logger.error('Failed to update last login:', err)
      })

      // Record update time
      lastUpdateTimes.set(userId, now)

      // Clean up old entries (keep map from growing indefinitely)
      if (lastUpdateTimes.size > 1000) {
        const cutoff = now - (24 * 60 * 60 * 1000) // 24 hours ago
        for (const [key, time] of lastUpdateTimes.entries()) {
          if (time < cutoff) {
            lastUpdateTimes.delete(key)
          }
        }
      }

    } catch (error) {
      // Silently fail - don't impact request
      // logger.error('Login tracking error:', error)
    }
  })
})
