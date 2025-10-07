interface AccountShareLinkState {
  accountId: string
  selectedTab: number
}

interface AccountShareLinkOptions {
  accountId: Ref<string>
  selectedTab: Ref<number>
}

/**
 * Composable for creating shareable links for account detail pages
 * Captures current account ID and active tab
 */
export const useAccountShareLink = (options: AccountShareLinkOptions) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const shortUrl = ref<string | null>(null)

  /**
   * Captures the current page state
   */
  const captureState = (): AccountShareLinkState => {
    return {
      accountId: options.accountId.value,
      selectedTab: options.selectedTab.value
    }
  }

  /**
   * Generates a shareable link by calling the shortlinks API
   */
  const generateShareLink = async (): Promise<string | null> => {
    isLoading.value = true
    error.value = null
    shortUrl.value = null

    try {
      // Capture current state
      const state = captureState()

      // Build the original URL path
      const originalUrl = `/account/${state.accountId}?tab=${state.selectedTab}`

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
          pagePath: `/account/${state.accountId}`,
          configData: state,
          description: 'Account Details Share Link',
          expiresInDays: 30 // Links expire in 30 days
        }
      })

      if (response.success && response.data) {
        shortUrl.value = response.data.shortUrl
        return response.data.shortUrl
      } else {
        throw new Error('Failed to create share link')
      }
    } catch (err: any) {
      console.error('Error creating share link:', err)
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
  const applySharedState = (state: AccountShareLinkState) => {
    if (state.selectedTab !== undefined) {
      options.selectedTab.value = state.selectedTab
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
