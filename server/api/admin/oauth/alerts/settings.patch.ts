/**
 * PATCH /api/admin/oauth/alerts/settings
 *
 * Updates the validated `oauth.alerts.*` settings for the deployment (design
 * "Diagnostics, maintenance, and alerts"; Requirements 1.2, 15.3, 18.6).
 *
 * Flow:
 *   1. `requireOAuthAdminCapability(event, 'oauth.operations.manage')` — the
 *      Administrator gate plus the operations-manage capability. Every OAuth
 *      alert UPDATE path is gated on this capability (Req 15.3).
 *   2. `parseBrowserMutation(event, access)` — same-origin + session-bound CSRF
 *      (`X-CSRF-Token`) + the safe envelope (`idempotencyKey`, `reason`).
 *   3. Read ONLY `enabled`, `thresholds`, and `recipientsRef` from the body and
 *      validate the patch (bounded positive thresholds, sane windows, and a
 *      recipients reference that names an EXISTING approved organization
 *      destination — never a free-form address; Req 15.4 / 18.6). Invalid input
 *      is a 400 before any write.
 *   4. Persist ONLY the changed `oauth.alerts.*` keys through the existing site
 *      configuration and write a bounded, safe settings-change audit record.
 *
 * SAFETY: Only `oauth.alerts.*` keys are written — non-OAuth provider
 * configuration is never touched. No free-form recipient address is accepted.
 * The audit records only safe changed-field NAMES and the safe new values
 * (enabled flag / bounded thresholds / approved reference), never a raw address
 * or the CSRF token. `Cache-Control: no-store` is applied by the access service.
 */

import { createHash } from 'node:crypto'
import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { parseBrowserMutation } from '../../../../mcp/oauth/admin/mutation-context'
import { getOAuthAlertSettings, updateOAuthAlertSettings, type OAuthAlertSettingsPatch } from '../../../../mcp/oauth/admin/alert-settings'
import { getOAuthAdminRepository } from '../../../../mcp/oauth/admin/index'
import { logicalExpiryFor } from '../../../../mcp/oauth/admin/repository-support'
import { OAUTH_CAPABILITIES, type OAuthAuditRecord } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/alerts/settings', 'PATCH', {
  summary: 'Update the OAuth alert settings',
  description:
    'Updates the oauth.alerts.* settings (enabled flag, bounded evidence thresholds, approved organization recipients reference) for the current deployment. Capability: oauth.operations.manage. Requires the X-CSRF-Token header (session-bound), a same-origin request, and an envelope with idempotencyKey + reason. Thresholds must be bounded positive integers; recipientsRef must reference an approved organization destination ("admin-notifications" or "none") — a free-form address is rejected with 400. Only oauth.alerts.* keys are written; non-OAuth configuration is never touched. Cache-Control: no-store.',
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
            reason: { type: 'string' },
            enabled: { type: 'boolean', description: 'Master switch for OAuth alert evaluation/delivery.' },
            thresholds: {
              type: 'object',
              description: 'Any subset of the evidence thresholds. Each must be a bounded positive integer.',
              properties: {
                registrationRejections: { type: 'integer', minimum: 1 },
                tokenFailures: { type: 'integer', minimum: 1 },
                refreshFailures: { type: 'integer', minimum: 1 },
                consecutiveDiscoveryFailures: { type: 'integer', minimum: 1 },
                consecutiveStorageFailures: { type: 'integer', minimum: 1 },
                signingKeyDeadlineDays: { type: 'integer', minimum: 1 },
                windowMinutes: { type: 'integer', minimum: 1 },
                consecutiveGapMinutes: { type: 'integer', minimum: 1 }
              }
            },
            recipientsRef: { type: 'string', enum: ['admin-notifications', 'none'], description: 'Reference to an approved organization destination. Free-form addresses are rejected.' }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'The updated OAuth alert settings.',
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
  const body = parsed.body as Record<string, unknown>

  // 3. Read ONLY the three settings fields and validate + persist via the
  //    shared alert-settings module (thresholds bounded; recipients approved).
  const patch: OAuthAlertSettingsPatch = {}
  if (body.enabled !== undefined) patch.enabled = body.enabled as boolean
  if (body.thresholds !== undefined) patch.thresholds = body.thresholds as OAuthAlertSettingsPatch['thresholds']
  if (body.recipientsRef !== undefined) patch.recipientsRef = body.recipientsRef as string

  const before = await getOAuthAlertSettings()
  const settings = await updateOAuthAlertSettings(access, patch, access.actor)

  // 4. Bounded, safe settings-change audit (best-effort — a settings write is
  //    not an enforcement-changing provider operation, so a failed audit must
  //    not fail the change after it landed). Records only safe changed-field
  //    names and safe values, never the CSRF token or a raw address.
  const changedFields = (['enabled', 'thresholds', 'recipientsRef'] as const)
    .filter(field => JSON.stringify(before[field]) !== JSON.stringify(settings[field]))
  await writeSettingsAudit(access, parsed.envelope.reason, changedFields, before, settings).catch(() => {})

  return sendSuccess(event, settings, {
    deployment: access.deployment.environment,
    observedAt: new Date().toISOString()
  })
}))

/** Write a single bounded, safe audit record for an OAuth alert settings change. */
async function writeSettingsAudit(
  access: Awaited<ReturnType<typeof requireOAuthAdminCapability>>,
  reason: string,
  changedFields: readonly string[],
  before: Awaited<ReturnType<typeof getOAuthAlertSettings>>,
  after: Awaited<ReturnType<typeof getOAuthAlertSettings>>
): Promise<void> {
  const timestamp = new Date().toISOString()
  const auditId = `aud_${createHash('sha256')
    .update(access.deployment.deploymentId)
    .update('\u0000')
    .update(access.actor)
    .update('\u0000')
    .update('oauth-alerts-settings-update')
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
    referenceId: 'oauth.alerts.settings',
    reason,
    changedFields: [...changedFields],
    before: pickChanged(before, changedFields),
    after: pickChanged(after, changedFields),
    outcome: 'success',
    ...logicalExpiryFor(timestamp)
  }
  await getOAuthAdminRepository().putAuditRecord(access.deployment, record)
}

/** Project only the changed, safe settings fields for the audit diff. */
function pickChanged(
  settings: Awaited<ReturnType<typeof getOAuthAlertSettings>>,
  fields: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    out[field] = (settings as unknown as Record<string, unknown>)[field]
  }
  return out
}
