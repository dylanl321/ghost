/**
 * Get scheduled reports statistics (admin only)
 * GET /api/admin/scheduled-reports/stats
 */

import { getReportStatistics } from '../../../utils/scheduled-reports'
import { requireAdmin } from '../../../utils/user-roles'

export default defineEventHandler(async (event) => {
  try {
    // Require admin access
    await requireAdmin(event)

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
