/**
 * Composable for handling streaming chat notifications
 * Provides UI state about active background queries
 * 
 * This composable integrates with useBackgroundPolling to:
 * - Show the number of active queries in the footer
 * - Initialize the background polling service on app mount
 */

import { useBackgroundPolling } from './useBackgroundPolling'

export function useStreamingNotifications() {
  const backgroundPolling = useBackgroundPolling()

  /**
   * Start monitoring for background streams
   * Call this in app layout or root component
   */
  const startMonitoring = () => {
    // Initialize background polling (loads pending jobs from storage and resumes polling)
    backgroundPolling.initialize()
  }

  /**
   * Get count of active background queries
   */
  const activeBackgroundStreamCount = computed(() => {
    return backgroundPolling.activeJobCount.value
  })

  /**
   * Check if there are any active streams
   */
  const hasActiveStreams = computed(() => {
    return activeBackgroundStreamCount.value > 0
  })

  return {
    startMonitoring,
    checkBackgroundStreams: () => {}, // No-op, kept for compatibility
    activeBackgroundStreamCount,
    hasActiveStreams
  }
}
