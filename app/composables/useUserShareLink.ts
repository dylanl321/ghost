interface UserShareLinkState {
  username: string
}

interface UserShareLinkOptions {
  username: Ref<string>
}

/**
 * Composable for creating shareable links for user profile pages
 * Captures the username slug for sharing
 */
export const useUserShareLink = (options: UserShareLinkOptions) => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const shortUrl = ref<string | null>(null)

  /**
   * Captures the current page state
   */
  const captureState = (): UserShareLinkState => {
    return {
      username: options.username.value
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
      const originalUrl = `/account/user/${state.username}`

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
          pagePath: `/account/user/${state.username}`,
          configData: state,
          description: 'User Profile Share Link',
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

  return {
    isLoading,
    error,
    shortUrl,
    generateShareLink,
    captureState
  }
}
