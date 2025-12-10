/**
 * GET /api/admin/streaming/log-groups
 *
 * List available Strands ECS log groups (containers)
 */

import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import {
  listStrandsLogGroups,
  getStrandsLogConfig
} from '../../../utils/strands-cloudwatch-logs'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Get available log groups
    const logGroups = await listStrandsLogGroups()

    // Get config
    const config = getStrandsLogConfig()

    // Extract container names from log group names
    const containers = logGroups.map(lg => {
      const prefix = config.logGroupPrefix
      return lg.replace(`${prefix}/`, '')
    })

    return {
      success: true,
      logGroups,
      containers,
      config: {
        accountId: config.accountId,
        region: config.region,
        cluster: config.cluster,
        defaultContainers: config.defaultContainers
      }
    }
  } catch (error: any) {
    logger.error('[Admin] Error listing log groups:', error)

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to list log groups'
    })
  }
})
