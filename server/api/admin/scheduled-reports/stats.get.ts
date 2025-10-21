/**
 * Get scheduled reports statistics (admin only)
 * GET /api/admin/scheduled-reports/stats
 */

import { getReportStatistics } from '../../../utils/scheduled-reports'

export default defineEventHandler(async (event) => {
  try {
    // Allow all authenticated users to view statistics

    // Get statistics
    const stats = await getReportStatistics()

    return {
      success: true,
      data: stats
    }
  } catch (error: any) {
    console.error('Error getting report statistics:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get statistics'
    })
  }
})
