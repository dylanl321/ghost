/**
 * Date Formatter Composable
 * Formats dates using the user's timezone preference
 */

import { useUserPreferences } from './useUserPreferences'

const logger = createLogger('DateFormatter')

export function useDateFormatter() {
  const { timezone } = useUserPreferences()

  /**
   * Format a date with custom options, respecting user timezone preference
   */
  function formatDate(timestamp: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
    if (!timestamp) return 'N/A'

    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp

      return date.toLocaleString('en-US', {
        timeZone: timezone.value,
        ...options
      })
    } catch (error) {
      logger.error('Error formatting date:', error)
      return 'Invalid Date'
    }
  }

  /**
   * Format just the date portion (e.g., "Nov 18, 2025")
   */
  function formatDateOnly(timestamp: string | Date | null | undefined): string {
    return formatDate(timestamp, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  /**
   * Format just the time portion (e.g., "07:16 AM")
   */
  function formatTimeOnly(timestamp: string | Date | null | undefined): string {
    if (!timestamp) return ''

    return formatDate(timestamp, {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  /**
   * Format full date and time (e.g., "Nov 18, 2025, 07:16 AM")
   */
  function formatDateTime(timestamp: string | Date | null | undefined): string {
    return formatDate(timestamp, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  /**
   * Format relative time (e.g., "5m ago", "2h ago", "3d ago")
   */
  function formatRelativeTime(timestamp: string | Date | null | undefined): string {
    if (!timestamp) return 'N/A'

    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays < 30) return `${diffDays}d ago`

      return formatDateOnly(date)
    } catch (error) {
      logger.error('Error formatting relative time:', error)
      return 'N/A'
    }
  }

  /**
   * Format duration in seconds to human-readable format
   */
  function formatDuration(seconds: number | null | undefined): string {
    if (!seconds && seconds !== 0) return 'N/A'

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  /**
   * Format duration to short form (e.g., "2h 15m")
   */
  function formatDurationShort(seconds: number | null | undefined): string {
    if (!seconds && seconds !== 0) return 'N/A'

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  return {
    // Timezone
    timezone,

    // Formatters
    formatDate,
    formatDateOnly,
    formatTimeOnly,
    formatDateTime,
    formatRelativeTime,
    formatDuration,
    formatDurationShort
  }
}
