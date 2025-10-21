/**
 * List all scheduled reports (admin only)
 * GET /api/admin/scheduled-reports/all
 */

import { listAllReports } from '../../../utils/scheduled-reports'

export default defineEventHandler(async (event) => {
  try {
    // Allow all authenticated users to list reports

    // Get query parameters
    const query = getQuery(event)
    const limit = parseInt(query.limit as string) || 100

    // List all reports
    const result = await listAllReports(limit)

    return {
      success: true,
      data: {
        reports: result.reports,
        total: result.total
      }
    }
  } catch (error: any) {
    console.error('Error listing all reports:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to list reports'
    })
  }
})
