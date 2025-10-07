/**
 * IDC Sessions composable
 */

export const useIDCSessions = () => {
  const fetchAccountSessions = async (accountId: string, environment: 'commercial' | 'govcloud' = 'govcloud') => {
    try {
      const response: any = await $fetch(`/api/idc/accounts/${accountId}/sessions`, {
        params: { environment }
      })
      return response.data || []
    } catch (error) {
      console.error('Failed to fetch IDC sessions:', error)
      throw error
    }
  }

  return {
    fetchAccountSessions
  }
}
