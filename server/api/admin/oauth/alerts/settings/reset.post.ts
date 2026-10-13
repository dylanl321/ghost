/**
 * POST /api/admin/oauth/alerts/settings/reset
 *
 * Resets every `oauth.alerts.*` setting to its design default for the
 * deployment (design "Diagnostics, maintenance, and alerts"; Requirements 1.2,
 * 15.3, 18.6).
 *
 * Flow:
 *   1. `requireOAuthAdminCapability(event, 'oauth.operations.manage')` — the
 *      Administrator gate plus the operations-manage capability. Every OAuth
 *      alert RESET path is gated on this capability (Req 15.3).
 *   2. `parseBrowserMutation(event, access)` — same-origin + session-bound CSRF
 *      (`X-CSRF-Token`) + the safe envelope (`idempotencyKey`, `reason`).
 *   3. Reset ONLY the `oauth.alerts.*` keys to their design defaults through the
 *      existing site configuration and write a bounded, safe audit record.
 *
 * SAFETY: Only `oauth.alerts.*` keys are reset — non-OAuth provider
 * configuration is never touched. `Cache-Control: no-store` is applied by the
 * access service.
 */

import { createHash } from 'node:crypto'
import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../../mcp/oauth/admin/access-service'
import { parseBrowserMutation } from '../../../../../mcp/oauth/admin/mutation-context'
import { resetOAuthAlertSettings } from '../../../../../mcp/oauth/admin/alert-settings'
import { getOAuthAdminRepository } from '../../../../../mcp/oauth/admin/index'
import { logicalExpiryFor } from '../../../../../mcp/oauth/admin/repository-support'
import { OAUTH_CAPABILITIES, type OAuthAuditRecord } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/alerts/settings/reset', 'POST', {
  summary: 'Reset the OAuth alert settings to defaults',
  description:
    'Resets every oauth.alerts.* setting (enabled flag, evidence thresholds, recipients reference) to its design default for the current deployment. Capability: oauth.operations.manage. Requires the X-CSRF-Token header (session-bound), a same-origin request, and an envelope with idempotencyKey + reason. Only oauth.alerts.* keys are reset; non-OAuth configuration is never touched. Cache-Control: no-store.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [
    { name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' }, description: 'Session-bound CSRF token from GET /api/admin/oauth/csrf.' }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['idempotencyKey', 'reason'],
          properties: {
            idempotencyKey: { type: 'string' },
            reason: { type: 'string' }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'The OAuth alert settings after reset to defaults.',
      content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } } } }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // 1. Administrator + operations-manage capability, deployment-bound.
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.OPERATIONS_MANAGE)

  // 2. Same-origin + session-bound CSRF + safe envelope (idempotencyKey/reason).
  const parsed = await parseBrowserMutation(event, access)

  // 3. Reset ONLY the oauth.alerts.* keys to their design defaults.
  const settings = await resetOAuthAlertSettings(access, access.actor)

  // Bounded, safe audit (best-effort).
  const timestamp = new Date().toISOString()
  const auditId = `aud_${createHash('sha256')
    .update(access.deployment.deploymentId)
    .update('\u0000')
    .update(access.actor)
    .update('\u0000')
    .update('oauth-alerts-settings-reset')
    .update('\u0000')
    .update(timestamp)
    .digest('base64url')
    .slice(0, 24)}`
  const record: OAuthAuditRecord = {
    auditId,
    timestamp,
    deployment: access.deployment.environment,
    actor: access.actor,
    capability: OAUTH_CAPABILITIES.OPERATIONS_MANAGE,
    referenceKind: 'operation',
    referenceId: 'oauth.alerts.settings.reset',
    reason: parsed.envelope.reason,
    changedFields: ['enabled', 'thresholds', 'recipientsRef'],
    after: { ...settings },
    outcome: 'success',
    ...logicalExpiryFor(timestamp)
  }
  await getOAuthAdminRepository().putAuditRecord(access.deployment, record).catch(() => {})

  return sendSuccess(event, settings, {
    deployment: access.deployment.environment,
    observedAt: new Date().toISOString()
  })
}))
