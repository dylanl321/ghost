/**
 * POST /api/admin/oauth/diagnostics/:id/cancel
 *
 * Requests cancellation of a durable diagnostic job (design "Proposed API
 * contract" — `POST /diagnostics/:id/cancel`; Requirements 11.5, 13.1). Sets the
 * durable cancellation flag the maintenance worker observes BETWEEN steps; the
 * job then resolves to `cancelled` without running remaining checks. A terminal
 * job is returned unchanged.
 *
 * Capability: `oauth.operations.manage`. Same-origin + session-bound CSRF +
 * envelope (idempotencyKey/reason) are enforced by `parseBrowserMutation`. The
 * deployment is server-derived; a guessed id from another deployment cannot be
 * cancelled and yields 404.
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { registerEndpoint } from '../../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../../utils/api-response'
import { oauthAdminErrors, requireOAuthAdminCapability } from '../../../../../mcp/oauth/admin/access-service'
import { parseBrowserMutation } from '../../../../../mcp/oauth/admin/mutation-context'
import { OAuthDiagnosticService } from '../../../../../mcp/oauth/admin/diagnostic-service'
import { getOAuthAdminRepository } from '../../../../../mcp/oauth/admin/index'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/diagnostics/{id}/cancel', 'POST', {
  summary: 'Cancel a diagnostic job',
  description:
    'Requests cancellation of a durable diagnostic job by setting its durable cancellation flag; the worker observes it between steps and resolves the job to cancelled without running remaining checks. A terminal job is returned unchanged. Capability: oauth.operations.manage. Requires the X-CSRF-Token header (session-bound), a same-origin request, and an envelope with idempotencyKey + reason. The deployment is server-derived; a guessed id from another deployment returns 404. Cache-Control: no-store.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Opaque diagnostic job id.' },
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
            idempotencyKey: { type: 'string', description: 'Client-generated idempotency key.' },
            reason: { type: 'string', description: 'Required audited reason for the cancellation.' }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'The cancellation was requested; returns the updated job.',
      content: {
        'application/json': {
          example: {
            success: true,
            data: { jobId: 'job_…', state: 'pending', cancellationRequested: true },
            metadata: { timestamp: '2026-01-01T00:00:00.000Z' }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.OPERATIONS_MANAGE)
  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw oauthAdminErrors.notFound({ message: 'Diagnostic job not found in this deployment.' })
  // Same-origin + session-bound CSRF + safe envelope. A CSRF/origin failure is
  // 403; a missing envelope field is 400. (Result not needed beyond the gate.)
  await parseBrowserMutation(event, access)
  const service = new OAuthDiagnosticService(getOAuthAdminRepository())
  const job = await service.cancel(access, jobId)
  return sendSuccess(event, job, { deployment: access.deployment.environment })
}))
