export interface ShortLink {
  shortCode: string
  shortUrl?: string
  originalUrl: string
  pagePath: string
  configData: any
  createdAt: string
  expiresAt?: string
  visitCount: number
  lastVisited?: string
  createdBy?: string
  description?: string
}

export const useShortlinks = () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const links = ref<ShortLink[]>([])
  const total = ref(0)

  /**
   * Fetch all shortlinks with optional filtering
   */
  const fetchShortlinks = async (options?: {
    limit?: number
    offset?: number
    createdBy?: string
  }) => {
    loading.value = true
    error.value = null

    try {
      const query = new URLSearchParams()
      if (options?.limit) query.set('limit', options.limit.toString())
      if (options?.offset) query.set('offset', options.offset.toString())
      if (options?.createdBy) query.set('createdBy', options.createdBy)

      const response = await $fetch<{
        success: boolean
        data: {
          links: ShortLink[]
          total: number
        }
      }>(`/api/shortlinks?${query.toString()}`)

      if (response.success) {
        links.value = response.data.links
        total.value = response.data.total
      }
    } catch (err: any) {
      console.error('Error fetching shortlinks:', err)
      error.value = err?.message || 'Failed to fetch shortlinks'
      links.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  return {
    loading: readonly(loading),
    error: readonly(error),
    links: readonly(links),
    total: readonly(total),
    fetchShortlinks,
  }
}
