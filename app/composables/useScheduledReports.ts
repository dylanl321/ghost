/**
 * Scheduled Reports Composable
 * Frontend API for managing scheduled reports
 */

import type {
  ScheduledReport,
  CreateReportRequest,
  UpdateReportRequest,
  ReportExecution,
  ListReportsResponse,
  ReportResponse,
  ExecutionHistoryResponse
} from '~/shared/types/scheduled-reports'

export const useScheduledReports = () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const reports = ref<ScheduledReport[]>([])
  const currentReport = ref<ScheduledReport | null>(null)
  const executions = ref<ReportExecution[]>([])

  /**
   * Fetch user's scheduled reports
   */
  const fetchReports = async (status?: string) => {
    loading.value = true
    error.value = null

    try {
      const query = status ? `?status=${status}` : ''
      const response = await $fetch<ListReportsResponse>(
        `/api/scheduled-reports/list${query}`
      )

      if (response.success) {
        reports.value = response.data.reports
      } else {
        error.value = response.error || 'Failed to fetch reports'
      }
    } catch (err: any) {
      console.error('Error fetching reports:', err)
      error.value = err?.data?.message || err?.message || 'Failed to fetch reports'
      reports.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch a single report by ID
   */
  const fetchReport = async (reportId: string) => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<ReportResponse>(
        `/api/scheduled-reports/${reportId}`
      )

      if (response.success && response.data) {
        currentReport.value = response.data
      } else {
        error.value = response.error || 'Failed to fetch report'
        currentReport.value = null
      }
    } catch (err: any) {
      console.error('Error fetching report:', err)
      error.value = err?.data?.message || err?.message || 'Failed to fetch report'
      currentReport.value = null
    } finally {
      loading.value = false
    }
  }

  /**
   * Create a new scheduled report
   */
  const createReport = async (request: CreateReportRequest): Promise<boolean> => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<ReportResponse>(
        '/api/scheduled-reports/create',
        {
          method: 'POST',
          body: request
        }
      )

      if (response.success) {
        // Refresh the reports list
        await fetchReports()
        return true
      } else {
        error.value = response.error || 'Failed to create report'
        return false
      }
    } catch (err: any) {
      console.error('Error creating report:', err)
      error.value = err?.data?.message || err?.message || 'Failed to create report'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Update a scheduled report
   */
  const updateReport = async (
    reportId: string,
    updates: UpdateReportRequest
  ): Promise<boolean> => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<ReportResponse>(
        `/api/scheduled-reports/${reportId}`,
        {
          method: 'PATCH',
          body: updates
        }
      )

      if (response.success) {
        // Update current report if it's the one being edited
        if (currentReport.value?.reportId === reportId && response.data) {
          currentReport.value = response.data
        }
        // Refresh the reports list
        await fetchReports()
        return true
      } else {
        error.value = response.error || 'Failed to update report'
        return false
      }
    } catch (err: any) {
      console.error('Error updating report:', err)
      error.value = err?.data?.message || err?.message || 'Failed to update report'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Delete a scheduled report
   */
  const deleteReport = async (reportId: string): Promise<boolean> => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{ success: boolean; message?: string; error?: string }>(
        `/api/scheduled-reports/${reportId}`,
        {
          method: 'DELETE'
        }
      )

      if (response.success) {
        // Remove from local list
        reports.value = reports.value.filter(r => r.reportId !== reportId)
        if (currentReport.value?.reportId === reportId) {
          currentReport.value = null
        }
        return true
      } else {
        error.value = response.error || 'Failed to delete report'
        return false
      }
    } catch (err: any) {
      console.error('Error deleting report:', err)
      error.value = err?.data?.message || err?.message || 'Failed to delete report'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Send a test report immediately
   */
  const sendTestReport = async (
    reportId: string,
    testRecipient?: string
  ): Promise<boolean> => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{
        success: boolean
        message?: string
        error?: string
        duration?: number
      }>(
        `/api/scheduled-reports/${reportId}/test`,
        {
          method: 'POST',
          body: testRecipient ? { testRecipient } : {}
        }
      )

      if (response.success) {
        return true
      } else {
        error.value = response.error || 'Failed to send test report'
        return false
      }
    } catch (err: any) {
      console.error('Error sending test report:', err)
      error.value = err?.data?.message || err?.message || 'Failed to send test report'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Pause or resume a report
   */
  const togglePause = async (reportId: string, pause: boolean): Promise<boolean> => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<ReportResponse>(
        `/api/scheduled-reports/${reportId}/pause`,
        {
          method: 'PATCH',
          body: { pause }
        }
      )

      if (response.success) {
        // Update local state
        if (currentReport.value?.reportId === reportId && response.data) {
          currentReport.value = response.data
        }
        await fetchReports()
        return true
      } else {
        error.value = response.error || 'Failed to update report status'
        return false
      }
    } catch (err: any) {
      console.error('Error toggling pause:', err)
      error.value = err?.data?.message || err?.message || 'Failed to update report status'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch execution history for a report
   */
  const fetchExecutionHistory = async (reportId: string) => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<ExecutionHistoryResponse>(
        `/api/scheduled-reports/${reportId}/history`
      )

      if (response.success) {
        executions.value = response.data.executions
      } else {
        error.value = response.error || 'Failed to fetch execution history'
        executions.value = []
      }
    } catch (err: any) {
      console.error('Error fetching execution history:', err)
      error.value = err?.data?.message || err?.message || 'Failed to fetch execution history'
      executions.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Clear error message
   */
  const clearError = () => {
    error.value = null
  }

  return {
    // State
    loading: readonly(loading),
    error: readonly(error),
    reports: readonly(reports),
    currentReport: readonly(currentReport),
    executions: readonly(executions),

    // Methods
    fetchReports,
    fetchReport,
    createReport,
    updateReport,
    deleteReport,
    sendTestReport,
    togglePause,
    fetchExecutionHistory,
    clearError
  }
}

/**
 * Admin composable for managing all scheduled reports
 */
export const useScheduledReportsAdmin = () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const allReports = ref<ScheduledReport[]>([])
  const statistics = ref<any>(null)

  /**
   * Fetch all reports (admin only)
   */
  const fetchAllReports = async () => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<ListReportsResponse>(
        '/api/admin/scheduled-reports/all'
      )

      if (response.success) {
        allReports.value = response.data.reports
      } else {
        error.value = response.error || 'Failed to fetch reports'
      }
    } catch (err: any) {
      console.error('Error fetching all reports:', err)
      error.value = err?.data?.message || err?.message || 'Failed to fetch reports'
      allReports.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch statistics (admin only)
   */
  const fetchStatistics = async () => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{ success: boolean; data?: any; error?: string }>(
        '/api/admin/scheduled-reports/stats'
      )

      if (response.success && response.data) {
        statistics.value = response.data
      } else {
        error.value = response.error || 'Failed to fetch statistics'
      }
    } catch (err: any) {
      console.error('Error fetching statistics:', err)
      error.value = err?.data?.message || err?.message || 'Failed to fetch statistics'
      statistics.value = null
    } finally {
      loading.value = false
    }
  }

  /**
   * Force execute a report now (admin only)
   */
  const runReportNow = async (reportId: string): Promise<boolean> => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{
        success: boolean
        message?: string
        error?: string
        duration?: number
      }>(
        `/api/admin/scheduled-reports/${reportId}/run-now`,
        {
          method: 'POST'
        }
      )

      if (response.success) {
        return true
      } else {
        error.value = response.error || 'Failed to execute report'
        return false
      }
    } catch (err: any) {
      console.error('Error executing report:', err)
      error.value = err?.data?.message || err?.message || 'Failed to execute report'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    loading: readonly(loading),
    error: readonly(error),
    allReports: readonly(allReports),
    statistics: readonly(statistics),

    // Methods
    fetchAllReports,
    fetchStatistics,
    runReportNow
  }
}
