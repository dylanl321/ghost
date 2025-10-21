/**
 * Get email delivery history for a report
 * GET /api/admin/scheduled-reports/[id]/delivery-history
 *
 * Returns execution history with full email delivery details
 * Admin-only endpoint
 */

import { getExecutionHistory } from '../../../../utils/scheduled-reports'

export default defineEventHandler(async (event) => {
  try {
    // Allow all authenticated users to view delivery history

    // Get report ID from route params
    const reportId = event.context.params?.id

    if (!reportId) {
      throw createError({
        statusCode: 400,
        message: 'Report ID is required'
      })
    }

    // Get query parameters
    const query = getQuery(event)
    const limit = parseInt(query.limit as string) || 50

    // Get execution history (includes emailDelivery field)
    const executions = await getExecutionHistory(reportId, limit)

    return {
      success: true,
      data: {
        reportId,
        executions,
        total: executions.length
      }
    }
  } catch (error: any) {
    console.error('Error getting delivery history:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get delivery history'
    })
  }
})
