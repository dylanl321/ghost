/**
 * GET /api/admin/oauth/alerts/settings
 *
 * Returns the current validated `oauth.alerts.*` settings for the deployment
 * (design "Diagnostics, maintenance, and alerts"; Requirements 1.2, 15.3, 18.6).
 * Reads apply the design defaults for any unset value so the panel always
 * receives a complete settings object.
 *
 * Capability: `oauth.configuration.view` (a read). The OAuth-specific UPDATE and
 * RESET paths require `oauth.operations.manage` (see settings.patch.ts and
 * settings/reset.post.ts) — the design gates only the mutating settings paths
 * on the operations capability.
 *
 * SAFETY: The response carries only the safe settings (enabled flag, bounded
 * thresholds, and the approved-destination reference). No free-form recipient
 * address is ever stored or returned. `Cache-Control: no-store` is applied by
 * the access service.
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getOAuthAlertSettings } from '../../../../mcp/oauth/admin/alert-settings'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/alerts/settings', 'GET', {
  summary: 'Get the OAuth alert settings',
  description:
    'Returns the current validated oauth.alerts.* settings (enabled flag, bounded evidence thresholds, and the approved organization recipients reference) for the current deployment, applying design defaults for any unset value. Capability: oauth.configuration.view (a read). Updating/resetting these OAuth-specific settings requires oauth.operations.manage. Cache-Control: no-store. Sensitive-field exclusions: recipients are referenced by an approved-destination name only; no free-form email address is stored or returned.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  responses: {
    200: {
      description: 'The current OAuth alert settings.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  thresholds: {
                    type: 'object',
                    properties: {
                      registrationRejections: { type: 'integer' },
                      tokenFailures: { type: 'integer' },
                      refreshFailures: { type: 'integer' },
                      consecutiveDiscoveryFailures: { type: 'integer' },
                      consecutiveStorageFailures: { type: 'integer' },
                      signingKeyDeadlineDays: { type: 'integer' },
                      windowMinutes: { type: 'integer' },
                      consecutiveGapMinutes: { type: 'integer' }
                    }
                  },
                  recipientsRef: { type: 'string', enum: ['admin-notifications', 'none'] }
                }
              }
            }
          }
        }
      }
    },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.CONFIGURATION_VIEW)
  const settings = await getOAuthAlertSettings()
  return sendSuccess(event, settings, {
    deployment: access.deployment.environment,
    observedAt: new Date().toISOString()
  })
}))
