/**
 * GET /api/admin/alert-config/[section]
 *
 * Fetches a specific section of the budget alert configuration.
 *
 * Supported sections:
 * - settings: Core system settings
 * - alert-levels: Alert threshold configurations
 * - recipients: Recipients by type configurations
 * - static-recipients: Static email mappings
 * - lob-recipients: LOB-specific recipients
 * - account-recipients: Account-specific recipients
 * - threshold-scaling: Threshold scaling configuration
 * - pace-alerting: Pace alerting configuration
 * - ml-config: ML forecast configuration
 * - dry-run: Dry run mode configuration
 * - theme: Email theme colors
 * - anomaly-detection: Anomaly detection settings
 * - standalone-anomaly-alerts: Standalone anomaly alert settings
 *
 * @openapi
 * /api/admin/alert-config/{section}:
 *   get:
 *     summary: Get specific alert config section
 *     tags:
 *       - Admin
 *       - Budget Alerts
 *     parameters:
 *       - name: section
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Configuration section retrieved successfully
 *       400:
 *         description: Invalid section
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

import {
  getSettings,
  getAlertLevels,
  getRecipientsByType,
  getStaticRecipients,
  getLobRecipients,
  getAllAccountRecipients,
  getThresholdScaling,
  getPaceAlerting,
  getMlConfig,
  getDryRunConfig,
  getThemeColors,
  getAnomalyDetection,
  getStandaloneAnomalyAlerts
} from '../../../utils/budget-alert-config'
import { logger } from '../../../utils/logger'

const SECTION_HANDLERS: Record<string, () => Promise<any>> = {
  'settings': getSettings,
  'alert-levels': getAlertLevels,
  'recipients': getRecipientsByType,
  'static-recipients': getStaticRecipients,
  'lob-recipients': getLobRecipients,
  'account-recipients': getAllAccountRecipients,
  'threshold-scaling': getThresholdScaling,
  'pace-alerting': getPaceAlerting,
  'ml-config': getMlConfig,
  'dry-run': getDryRunConfig,
  'theme': getThemeColors,
  'anomaly-detection': getAnomalyDetection,
  'standalone-anomaly-alerts': getStandaloneAnomalyAlerts
}

export default defineEventHandler(async (event) => {
  const section = getRouterParam(event, 'section')

  // hasOwn: names such as "constructor" would otherwise resolve to Object.prototype
  if (!section || !Object.hasOwn(SECTION_HANDLERS, section)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid section: ${section}`,
      data: { validSections: Object.keys(SECTION_HANDLERS) }
    })
  }

  try {
    const handler = SECTION_HANDLERS[section]
    const data = await handler()

    return {
      success: true,
      section,
      data,
      count: Array.isArray(data) ? data.length : (data ? 1 : 0)
    }
  } catch (error: any) {
    logger.error('[Alert Config API] Error fetching section:', {
      section,
      error: error.message,
      stack: error.stack
    })

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch ${section} configuration`,
      data: { details: error.message }
    })
  }
})
