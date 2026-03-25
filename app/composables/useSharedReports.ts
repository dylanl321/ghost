/**
 * Composable for managing shared reports
 * Handles creating, listing, and deleting shareable report links
 */

import type { SharedReport, CreateShareReportRequest, CreateShareReportResponse } from '~/shared/types/shared-reports'

const logger = createLogger('SharedReports')

export function useSharedReports() {
  const toast = useToast()
  const sharedReports = ref<SharedReport[]>([])
  const isLoading = ref(false)
  const isCreating = ref(false)
  const error = ref<string | null>(null)

  /**
   * Fetch user's shared reports
   */
  async function fetchSharedReports() {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<{ success: boolean; data: SharedReport[]; error?: string }>(
        '/api/reports/shared-reports/list',
        { method: 'GET' }
      )

      if (response.success) {
        sharedReports.value = response.data
      } else {
        error.value = response.error || 'Failed to fetch shared reports'
        toast.add({
          title: 'Error',
          description: error.value,
          color: 'red'
        })
      }
    } catch (err: any) {
      error.value = err.message || 'Unknown error fetching shared reports'
      logger.error('Error fetching shared reports:', err)
      toast.add({
        title: 'Error',
        description: 'Failed to load shared reports',
        color: 'red'
      })
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Create a new shareable report
   */
  async function createSharedReport(request: CreateShareReportRequest): Promise<CreateShareReportResponse> {
    isCreating.value = true
    error.value = null

    try {
      const response = await $fetch<CreateShareReportResponse>(
        '/api/reports/share-report',
        {
          method: 'POST',
          body: request
        }
      )

      if (response.success) {
        toast.add({
          title: 'Success',
          description: 'Shareable report link created',
          color: 'green'
        })

        // Refresh the list
        await fetchSharedReports()
      } else {
        error.value = response.error || 'Failed to create shareable report'
        toast.add({
          title: 'Error',
          description: error.value,
          color: 'red'
        })
      }

      return response
    } catch (err: any) {
      error.value = err.message || 'Unknown error creating shareable report'
      logger.error('Error creating shareable report:', err)
      toast.add({
        title: 'Error',
        description: 'Failed to create shareable report',
        color: 'red'
      })

      return {
        success: false,
        error: error.value
      }
    } finally {
      isCreating.value = false
    }
  }

  /**
   * Delete a shared report
   */
  async function deleteSharedReport(shareId: string) {
    try {
      const response = await $fetch<{ success: boolean; error?: string }>(
        `/api/reports/shared-reports/${shareId}`,
        { method: 'DELETE' }
      )

      if (response.success) {
        toast.add({
          title: 'Success',
          description: 'Shared report deleted',
          color: 'green'
        })

        // Remove from local list
        sharedReports.value = sharedReports.value.filter(r => r.shareId !== shareId)
      } else {
        toast.add({
          title: 'Error',
          description: response.error || 'Failed to delete shared report',
          color: 'red'
        })
      }

      return response
    } catch (err: any) {
      logger.error('Error deleting shared report:', err)
      toast.add({
        title: 'Error',
        description: 'Failed to delete shared report',
        color: 'red'
      })

      return {
        success: false,
        error: err.message || 'Unknown error deleting shared report'
      }
    }
  }

  /**
   * Copy share link to clipboard
   */
  async function copyShareLink(shortUrl: string) {
    try {
      await navigator.clipboard.writeText(shortUrl)
      toast.add({
        title: 'Success',
        description: 'Link copied to clipboard',
        color: 'green'
      })
    } catch (err) {
      logger.error('Failed to copy link:', err)
      toast.add({
        title: 'Error',
        description: 'Failed to copy link to clipboard',
        color: 'red'
      })
    }
  }

  /**
   * Format file size for display
   */
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * Format date for display
   */
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  /**
   * Check if a report is expired
   */
  function isExpired(expiresAt?: string): boolean {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  return {
    // State
    sharedReports: readonly(sharedReports),
    isLoading: readonly(isLoading),
    isCreating: readonly(isCreating),
    error: readonly(error),

    // Actions
    fetchSharedReports,
    createSharedReport,
    deleteSharedReport,
    copyShareLink,

    // Utilities
    formatFileSize,
    formatDate,
    isExpired
  }
}
