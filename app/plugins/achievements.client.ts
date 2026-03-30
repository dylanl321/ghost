/**
 * Achievement System Bootstrap Plugin
 *
 * Initializes the achievement engine after the app mounts for authenticated users.
 * Runs client-side only. The engine subscribes to the event bus and evaluates
 * badge rules as events are emitted throughout the app.
 */

const logger = createLogger('AchievementsPlugin')

export default defineNuxtPlugin(async (nuxtApp) => {
  if (!import.meta.client) return

  nuxtApp.hook('app:mounted', async () => {
    try {
      const { loggedIn } = useOidcAuth()
      if (!loggedIn.value) return

      const { initialize } = useAchievements()
      await initialize()

      // Emit session start for visit count and login streak badges
      useEventBus().emit('session.started', { previousSessionTimestamp: null })

      logger.info('Achievement engine initialized')
    } catch (error) {
      // Never block app startup for achievements
      logger.warn('Failed to initialize achievements:', error)
    }
  })
})
