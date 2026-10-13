/**
 * PATCH /api/admin/oauth/issues/:id
 *
 * Applies a revision-checked, audited investigation update to a grouped issue
 * (design "Proposed API contract" — `PATCH /issues/:id`; Requirements 1.2, 10.5,
 * 10.6, 13.1, 13.4, 13.6). Updates ONLY the four administrator-owned fields:
 * owner, notes, mitigation, and disposition.
 *
 * Read of an issue is `oauth.activity.view`; UPDATE is `oauth.operations.manage`
 * (design "Proposed API contract"). This route is the UPDATE path.
 *
 * Flow:
 *   1. `requireOAuthAdminCapability(event, 'oauth.operations.manage')`.
 *   2. `parseBrowserMutation(event, access)` — same-origin + session-bound CSRF
 *      + envelope (`idempotencyKey`, `reason`, and the required `expectedRevision`).
 *   3. Normalize/validate ONLY owner/notes/mitigation/disposition (bounded,
 *      sanitized plain text; unknown disposition → 400; empty update → 400).
 *   4. `OAuthIssueUpdateService.update(...)` runs the durable, idempotent,
 *      revision-checked, audited `issue.update` operation. A stale revision is a
 *      409 (Req 13.4).
 *   5. Return `{ operationId, state, issue }`.
 *
 * CRITICAL (Req 10.6): the update never changes the evidence-derived
 * `verification` field — the administrator DISPOSITION is kept distinct from
 * observed RECOVERY verification. `Cache-Control: no-store` is applied by the
 * access service.
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { oauthAdminErrors, requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { parseBrowserMutation } from '../../../../mcp/oauth/admin/mutation-context'
import { OAuthIssueUpdateService, normalizeIssueUpdate } from '../../../../mcp/oauth/admin/issue-update-service'
import { getOAuthAdminRepository } from '../../../../mcp/oauth/admin/index'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/issues/{id}', 'PATCH', {
  summary: 'Update an OAuth issue investigation',
  description:
    'Applies a revision-checked, audited investigation update to a grouped issue, changing only the administrator-owned owner, notes, mitigation, and disposition. Capability: oauth.operations.manage (read of issues is oauth.activity.view). Requires the X-CSRF-Token header (session-bound), a same-origin request, and an envelope with idempotencyKey, reason, and expectedRevision (If-Match). A stale expectedRevision returns 409 without overwriting the newer version. The administrator disposition is kept distinct from the evidence-derived recovery verification, which this route never changes (Req 10.6). Notes and mitigation are bounded, sanitized plain text. Cache-Control: no-store. Sensitive-field exclusions: audit records safe before/after change diffs only, never secrets or raw request content.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Opaque issue group id.' },
    { name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' }, description: 'Session-bound CSRF token from GET /api/admin/oauth/csrf.' }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['idempotencyKey', 'reason', 'expectedRevision'],
          properties: {
            idempotencyKey: { type: 'string', description: 'Client-generated idempotency key; reuse with different input is rejected.' },
            reason: { type: 'string', description: 'Required audited reason for the update.' },
            expectedRevision: { type: 'string', description: 'If-Match optimistic-concurrency revision; a stale value returns 409.' },
            owner: { type: 'string', description: 'Accountable owner (bounded plain text). An empty string clears it.' },
            notes: { type: 'string', description: 'Bounded plain-text investigation notes. An empty string clears them.' },
            mitigation: { type: 'string', description: 'Bounded plain-text mitigation summary. An empty string clears it.' },
            disposition: { type: 'string', enum: ['open', 'investigating', 'mitigated', 'resolved', 'dismissed'], description: 'Administrator disposition (distinct from observed recovery verification).' }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'The investigation update was applied; returns the operation reference and the updated safe issue.',
      content: {
        'application/json': {
          example: {
            success: true,
            data: {
              operationId: 'op_…',
              state: 'completed',
              issue: { groupId: 'iss_…', disposition: 'investigating', verification: 'unverified', revision: 'rev_…' }
            },
            metadata: { timestamp: '2026-01-01T00:00:00.000Z' }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    409: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // 1. UPDATE requires the operations-manage capability (read is activity.view).
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.OPERATIONS_MANAGE)

  const groupId = getRouterParam(event, 'id')
  if (!groupId) throw oauthAdminErrors.notFound({ message: 'Issue not found in this deployment.' })

  // 2. Same-origin + session-bound CSRF + envelope (idempotencyKey/reason/expectedRevision).
  const parsed = await parseBrowserMutation(event, access)
  const body = parsed.body as Record<string, unknown>

  // 3. Validate/normalize ONLY owner/notes/mitigation/disposition. expectedRevision
  //    is required for an issue update (Req 13.4).
  const update = normalizeIssueUpdate(parsed.expectedRevision, body)

  // 4. Run the durable, idempotent, revision-checked, audited update.
  const service = new OAuthIssueUpdateService(getOAuthAdminRepository())
  const { operation, issue } = await service.update(
    access,
    groupId,
    update,
    parsed.envelope.idempotencyKey,
    parsed.envelope.reason
  )

  // 5. Return the operation reference and the updated safe issue.
  return sendSuccess(event, {
    operationId: operation.operationId,
    state: operation.state,
    issue
  }, { deployment: access.deployment.environment })
}))
