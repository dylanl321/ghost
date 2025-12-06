/**
 * Composable for handling streaming chat notifications
 * Shows toast notifications when background queries complete
 */

import { useChatThreadsStore } from '~/stores/useChatThreadsStore'

export function useStreamingNotifications() {
  const threadsStore = useChatThreadsStore()
  const toast = useToast()
  const router = useRouter()

  // Track which streams we've already notified about
  const notifiedStreams = new Set<string>()

  /**
   * Check for completed background streams and show notifications
   */
  const checkBackgroundStreams = () => {
    threadsStore.streamingMessages.forEach((message, messageId) => {
      // Skip if we've already notified
      if (notifiedStreams.has(messageId)) return

      // Only notify for completed or errored messages
      if (message.status?.status === 'complete') {
        notifiedStreams.add(messageId)

        toast.add({
          title: 'Query Complete',
          description: 'Your AI chat query finished while you were away',
          icon: 'i-heroicons-check-circle',
          color: 'green',
          timeout: 5000,
          actions: [{
            label: 'View Response',
            click: () => {
              router.push('/chat')
            }
          }]
        })
      } else if (message.status?.status === 'error') {
        notifiedStreams.add(messageId)

        toast.add({
          title: 'Query Failed',
          description: message.status.error || 'An error occurred',
          icon: 'i-heroicons-exclamation-circle',
          color: 'red',
          timeout: 5000,
          actions: [{
            label: 'View Details',
            click: () => {
              router.push('/chat')
            }
          }]
        })
      }
    })
  }

  /**
   * Start monitoring for background streams
   * Call this in app layout or root component
   */
  const startMonitoring = () => {
    // Check every 2 seconds for completed streams
    const interval = setInterval(() => {
      checkBackgroundStreams()
    }, 2000)

    // Cleanup on unmount
    onUnmounted(() => {
      clearInterval(interval)
    })
  }

  /**
   * Get count of active background streams
   */
  const activeBackgroundStreamCount = computed(() => {
    return threadsStore.getActiveStreamCount // Use getter, not method
  })

  /**
   * Check if there are any active streams
   */
  const hasActiveStreams = computed(() => {
    return activeBackgroundStreamCount.value > 0
  })

  return {
    startMonitoring,
    checkBackgroundStreams,
    activeBackgroundStreamCount,
    hasActiveStreams
  }
}
