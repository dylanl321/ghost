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
 * Parameter mapping: state property names → URL query param names
 * This mapping must be inverted identically in parseSharedUrl
 * Manual URL construction is used instead of route.fullPath to:
 * 1. Avoid Vue Router's default JSON array encoding
 * 2. Control exactly which state properties are serialized
 * 3. Ensure deterministic, clean URLs for sharing
 */
const PARAM_MAPPING = {
  dataMode: 'mode',
  view: 'viewBy',
  timeframe: 'timeframe',
  tab: 'tab',
  selectedAccounts: 'accounts'
} as const

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
   * default JSON array encoding (e.g. accounts=[%22123%22])
   * Throws if no accounts are selected
   */
  const buildOriginalUrl = (state: ShareLinkState): string => {
    const params = new URLSearchParams()

    if (state.selectedAccounts.length === 0) {
      throw new Error('Cannot generate share link: at least one account must be selected')
    }

    params.set(PARAM_MAPPING.selectedAccounts, state.selectedAccounts.join(','))
    if (state.timeframe) params.set(PARAM_MAPPING.timeframe, state.timeframe)
    if (state.tab) params.set(PARAM_MAPPING.tab, state.tab)
    if (state.dataMode) params.set(PARAM_MAPPING.dataMode, state.dataMode)
    if (state.view) params.set(PARAM_MAPPING.view, state.view)

    return `/account/costs?${params.toString()}`
  }

  /**
   * Parses shared URL query parameters back into ShareLinkState
   * Inverts the PARAM_MAPPING from buildOriginalUrl exactly
   * Used when loading a page from a shared link
   */
  const parseSharedUrl = (query: Record<string, string>): Partial<ShareLinkState> => {
    const state: Partial<ShareLinkState> = {}

    if (query[PARAM_MAPPING.selectedAccounts]) {
      state.selectedAccounts = query[PARAM_MAPPING.selectedAccounts]
        .split(',')
        .filter(Boolean)
    }
    if (query[PARAM_MAPPING.timeframe]) {
      state.timeframe = query[PARAM_MAPPING.timeframe]
    }
    if (query[PARAM_MAPPING.tab]) {
      state.tab = query[PARAM_MAPPING.tab]
    }
    if (query[PARAM_MAPPING.dataMode]) {
      state.dataMode = query[PARAM_MAPPING.dataMode] as DataMode
    }
    if (query[PARAM_MAPPING.view]) {
      state.view = query[PARAM_MAPPING.view]
    }

    return state
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
      // Capture and validate current state
      const state = captureState()
      logger.info('Generating share link with state:', state)

      // Validate state before building URL
      if (!state.selectedAccounts || !Array.isArray(state.selectedAccounts)) {
        throw new Error('Invalid state: selectedAccounts must be an array')
      }

      // Build clean URL from captured state
      // Uses PARAM_MAPPING for consistent serialization
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
          description: 'Cost Analytics Share Link'
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
   * Works with both full ShareLinkState and Partial from parseSharedUrl
   */
  const applySharedState = (state: ShareLinkState | Partial<ShareLinkState>) => {
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
    captureState,
    parseSharedUrl
  }
}