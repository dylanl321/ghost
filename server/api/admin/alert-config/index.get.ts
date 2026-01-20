/**
 * GET /api/admin/alert-config
 *
 * Fetches the complete budget alert configuration from DynamoDB.
 * Returns all configuration sections organized by category.
 *
 * @openapi
 * /api/admin/alert-config:
 *   get:
 *     summary: Get budget alert configuration
 *     description: Retrieves all alert configuration including settings, thresholds, recipients, and more
 *     tags:
 *       - Admin
 *       - Budget Alerts
 *     responses:
 *       200:
 *         description: Alert configuration retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

import { getAlertConfigOverview } from '../../../utils/budget-alert-config'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const config = await getAlertConfigOverview()

    return {
      success: true,
      data: config,
      meta: {
        totalAlertLevels: config.alertLevels.length,
        totalRecipientConfigs: config.recipientsByType.length,
        totalLobRecipients: config.lobRecipients.length,
        totalAccountRecipients: config.accountRecipients.length,
        dryRunEnabled: config.dryRun?.enabled ?? false
      }
    }
  } catch (error: any) {
    logger.error('[Alert Config API] Error fetching config:', {
      error: error.message,
      stack: error.stack
    })

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch alert configuration',
      data: { details: error.message }
    })
  }
})
