import type { DataMode } from '~/types/costs'

const logger = createLogger('ShareLink')

interface ShareLinkState {
  selectedAccounts: string[]
  timeframe: string
  view: string
  tab: string
  dataMode: DataMode
}

interface ShareLinkOptions {
  selectedAccounts: Ref<string[]>
  selectedTimeframe: Ref<string>
  selectedView: Ref<string>
  activeTab: Ref<string>
  dataMode: Ref<DataMode>
}

/**
 * Composable for creating shareable links for the costs page
 * Captures current page state and generates a short link via the API
 */
export const useShareLink = (options: ShareLinkOptions) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const shortUrl = ref<string | null>(null)

  /**
   * Captures the current page state
   */
  const captureState = (): ShareLinkState => {
    return {
      selectedAccounts: [...options.selectedAccounts.value],
      timeframe: options.selectedTimeframe.value,
      view: options.selectedView.value,
      tab: options.activeTab.value,
      dataMode: options.dataMode.value
    }
  }

    /**
   * Builds a clean URL from captured state
   * Uses comma-separated accounts instead of Vue Router's
   * default JSON array encoding
   */
  const buildOriginalUrl = (state: ShareLinkState): string => {
    const params = new URLSearchParams()

    if (state.selectedAccounts.length > 0) {
      params.set('accounts', state.selectedAccounts.join(','))
    } else {
      logger.warn('buildOriginalUrl: No accounts selected when generating share link')
    }

    if (state.timeframe) params.set('timeframe', state.timeframe)
    if (state.tab) params.set('tab', state.tab)
    if (state.dataMode) params.set('mode', state.dataMode)
    if (state.view) params.set('viewBy', state.view)

    return `/account/costs?${params.toString()}`
  }

  /**
   * Generates a shareable link by calling the shortlinks API
   */
  const generateShareLink = async (): Promise<string | null> => {
    logger.info('generateShareLink: Starting...')
    isLoading.value = true
    error.value = null
    shortUrl.value = null
    logger.info('generateShareLink: Reset state - shortUrl:', shortUrl.value, 'error:', error.value)

    try {
      // Capture current state
      const state = captureState()
      logger.info('Generating share link with state:', state)

      if (state.selectedAccounts.length === 0) {
        logger.warn('generateShareLink: No accounts in state, link may be incomplete')
      }

      // Build clean URL from captured state
      const originalUrl = buildOriginalUrl(state)
      logger.info('generateShareLink: Built originalUrl:', originalUrl)

      // Create the short link via API
      const response = await $fetch<{
        success: boolean
        data: {
          shortCode: string
          shortUrl: string
        }
      }>('/api/shortlinks', {
        method: 'POST',
        body: {
          originalUrl,
          pagePath: '/account/costs',
          configData: state,
          description: 'Cost Analytics Share Link',
          expiresInDays: 30 // Links expire in 30 days
        }
      })

      logger.info('Share link API response:', response)

      if (response.success && response.data) {
        shortUrl.value = response.data.shortUrl
        logger.info('Share URL set to:', shortUrl.value)
        logger.info('shortUrl.value after assignment:', shortUrl.value)
        return response.data.shortUrl
      } else {
        logger.error('API response missing success or data:', response)
        throw new Error('Failed to create share link')
      }
    } catch (err: any) {
      logger.error('Error creating share link:', err)
      error.value = err?.data?.statusMessage || err?.message || 'Failed to create share link'
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Applies shared state to current page
   * Used when loading a page from a shared link
   */
  const applySharedState = (state: ShareLinkState) => {
    if (state.selectedAccounts) {
      options.selectedAccounts.value = [...state.selectedAccounts]
    }
    if (state.timeframe) {
      options.selectedTimeframe.value = state.timeframe
    }
    if (state.view) {
      options.selectedView.value = state.view
    }
    if (state.tab) {
      options.activeTab.value = state.tab
    }
    if (state.dataMode) {
      options.dataMode.value = state.dataMode
    }
  }

  return {
    isLoading,
    error,
    shortUrl,
    generateShareLink,
    applySharedState,
    captureState
  }
}