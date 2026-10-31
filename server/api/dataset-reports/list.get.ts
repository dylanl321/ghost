/**
 * List all dataset reports for the current user
 * GET /api/dataset-reports/list
 */

import { listUserReports } from '../../utils/scheduled-reports'
import { getUserEmail } from '../../utils/user-roles'
import { isDatasetReport } from '../../utils/dataset-report-access'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Get user from auth context
    const auth = event.context.auth
    if (!auth || !auth.isAuthenticated) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
      })
    }

    const user = auth.user
    if (!user) {
      throw createError({
        statusCode: 401,
        message: 'User information not available'
      })
    }

    // Get user email
    const userEmail = getUserEmail(event)
    if (!userEmail) {
      throw createError({
        statusCode: 400,
        message: 'User email not available'
      })
    }

    // Get query parameters
    const query = getQuery(event)
    const status = query.status as string | undefined

    // List reports for user, filtering by type='dataset'
    const { reports } = await listUserReports(userEmail, status, 500)

    // Filter to only dataset reports
    const datasetReports = reports.filter(isDatasetReport)

    return {
      success: true,
      data: datasetReports
    }
  } catch (error: any) {
    logger.error('[Dataset Reports API] Error listing reports:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to list dataset reports'
    })
  }
})
