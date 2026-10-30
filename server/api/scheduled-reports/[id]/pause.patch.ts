/**
 * Pause or resume a scheduled report
 * PATCH /api/scheduled-reports/:id/pause
 */

import { updateReport } from '../../../utils/scheduled-reports'
import { requireScheduledReportAccess } from '../../../utils/dataset-report-access'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Get user from session
    const auth = event.context.auth
    const user = auth?.user
    if (!user) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
      })
    }

    // Get report ID from route params
    const reportId = getRouterParam(event, 'id')
    if (!reportId) {
      throw createError({
        statusCode: 400,
        message: 'Report ID is required'
      })
    }

    await requireScheduledReportAccess(event, reportId)

    // Get desired status from body
    const body = await readBody<{ pause: boolean }>(event)
    if (typeof body?.pause !== 'boolean') {
      throw createError({ statusCode: 400, message: 'pause must be true or false' })
    }

    // Toggle status
    const newStatus = body.pause ? 'paused' : 'active'

    // Update the report
    const updated = await updateReport(reportId, { status: newStatus })

    if (!updated) {
      throw createError({
        statusCode: 500,
        message: 'Failed to update report status'
      })
    }

    return {
      success: true,
      data: updated,
      message: body.pause ? 'Report paused' : 'Report resumed'
    }
  } catch (error: any) {
    logger.error('Error updating report status:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to update report status'
    })
  }
})
