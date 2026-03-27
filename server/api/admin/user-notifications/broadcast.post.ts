/**
 * POST /api/admin/user-notifications/broadcast
 * Send a broadcast notification to users (admin only)
 */

import { requireAdmin } from '../../../utils/user-roles'
import { createBroadcast } from '../../../utils/broadcast-service'
import { getUserSession } from '../../../utils/entra/session'
import type { CreateBroadcastOptions } from '#shared/types/notifications'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const session = await getUserSession(event)
    const adminId = session?.user?.email || session?.user?.id || 'admin'

    const body = await readBody<CreateBroadcastOptions>(event)

    if (!body.title || !body.body) {
      throw createError({ statusCode: 400, message: 'Title and body are required' })
    }

    if (!body.targetAudience) {
      throw createError({ statusCode: 400, message: 'Target audience is required' })
    }

    if (body.targetAudience === 'list' && (!body.targetUserIds || body.targetUserIds.length === 0)) {
      throw createError({ statusCode: 400, message: 'Target user IDs are required for list audience' })
    }

    const result = await createBroadcast(body, adminId)

    if (!result.success) {
      throw createError({ statusCode: 400, message: result.error || 'Failed to send broadcast' })
    }

    return {
      success: true,
      data: {
        broadcastId: result.broadcastId,
        deliveredCount: result.deliveredCount
      }
    }
  } catch (error: any) {
    logger.error('Error sending broadcast:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to send broadcast' })
  }
})
