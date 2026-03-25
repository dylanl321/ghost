/**
 * Composable for Dataset Reports API
 */

import type { ScheduledReport } from '~/shared/types/scheduled-reports'
import type { DatasetReportConfig } from '~/shared/types/dataset-reports'

const logger = createLogger('useDatasetReports')

interface CreateDatasetReportRequest {
  reportName: string
  description?: string
  reportConfig: DatasetReportConfig
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
    dayOfWeek?: number
    dayOfMonth?: number
    monthOfQuarter?: number
    time: string
    timezone: string
  }
  recipients: string[]
  emailTemplate: {
    subject: string
    body: string
    isCustom: boolean
  }
}

export function useDatasetReports() {
  const reports = ref<ScheduledReport[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Fetch all dataset reports for the current user
   */
  async function fetchReports(status?: string) {
    loading.value = true
    error.value = null

    try {
      const query = status ? `?status=${status}` : ''
      const response = await $fetch<{ success: boolean; data: ScheduledReport[] }>(
        `/api/dataset-reports/list${query}`
      )

      if (response.success) {
        reports.value = response.data
      } else {
        throw new Error('Failed to fetch reports')
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch dataset reports'
      logger.error('Fetch error:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch a single dataset report by ID
   */
  async function fetchReport(reportId: string): Promise<ScheduledReport> {
    try {
      const response = await $fetch<{ success: boolean; data: ScheduledReport }>(
        `/api/dataset-reports/${reportId}`
      )

      if (response.success) {
        return response.data
      } else {
        throw new Error('Failed to fetch report')
      }
    } catch (err: any) {
      logger.error('Fetch report error:', err)
      throw err
    }
  }

  /**
   * Create a new dataset report
   */
  async function createReport(data: CreateDatasetReportRequest): Promise<ScheduledReport> {
    try {
      const response = await $fetch<{ success: boolean; data: ScheduledReport }>(
        '/api/dataset-reports/create',
        {
          method: 'POST',
          body: data
        }
      )

      if (response.success) {
        return response.data
      } else {
        throw new Error('Failed to create report')
      }
    } catch (err: any) {
      logger.error('Create error:', err)
      throw err
    }
  }

  /**
   * Update an existing dataset report
   */
  async function updateReport(reportId: string, updates: Partial<CreateDatasetReportRequest>): Promise<ScheduledReport> {
    try {
      const response = await $fetch<{ success: boolean; data: ScheduledReport }>(
        `/api/dataset-reports/${reportId}`,
        {
          method: 'PATCH',
          body: updates
        }
      )

      if (response.success) {
        return response.data
      } else {
        throw new Error('Failed to update report')
      }
    } catch (err: any) {
      logger.error('Update error:', err)
      throw err
    }
  }

  /**
   * Delete a dataset report
   */
  async function deleteReport(reportId: string): Promise<void> {
    try {
      const response = await $fetch<{ success: boolean }>(
        `/api/dataset-reports/${reportId}`,
        {
          method: 'DELETE'
        }
      )

      if (!response.success) {
        throw new Error('Failed to delete report')
      }
    } catch (err: any) {
      logger.error('Delete error:', err)
      throw err
    }
  }

  /**
   * Send a test report
   */
  async function sendTestReport(reportId: string, recipients?: string[]): Promise<void> {
    try {
      const response = await $fetch<{ success: boolean }>(
        `/api/dataset-reports/${reportId}/test`,
        {
          method: 'POST',
          body: recipients ? { recipients } : undefined
        }
      )

      if (!response.success) {
        throw new Error('Failed to send test report')
      }
    } catch (err: any) {
      logger.error('Send test error:', err)
      throw err
    }
  }

  /**
   * Toggle pause/resume for a report
   */
  async function togglePause(reportId: string, pause: boolean): Promise<void> {
    try {
      // Reuse existing pause endpoint (it's type-agnostic)
      const response = await $fetch<{ success: boolean }>(
        `/api/scheduled-reports/${reportId}/pause`,
        {
          method: 'PATCH',
          body: { pause }
        }
      )

      if (!response.success) {
        throw new Error('Failed to toggle pause')
      }
    } catch (err: any) {
      logger.error('Toggle pause error:', err)
      throw err
    }
  }

  /**
   * Fetch execution history for a report
   */
  async function fetchExecutionHistory(reportId: string): Promise<any[]> {
    try {
      // Reuse existing history endpoint (it's type-agnostic)
      const response = await $fetch<{ success: boolean; data: any[] }>(
        `/api/scheduled-reports/${reportId}/history`
      )

      if (response.success) {
        return response.data
      } else {
        throw new Error('Failed to fetch history')
      }
    } catch (err: any) {
      logger.error('Fetch history error:', err)
      throw err
    }
  }

  return {
    reports: readonly(reports),
    loading: readonly(loading),
    error: readonly(error),
    fetchReports,
    fetchReport,
    createReport,
    updateReport,
    deleteReport,
    sendTestReport,
    togglePause,
    fetchExecutionHistory
  }
}
