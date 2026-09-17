/**
 * POST /api/admin/oauth/diagnostics
 *
 * Creates a durable, named diagnostic job for the current deployment and returns
 * `202 Accepted` with the job reference and state (design "Proposed API
 * contract" — `POST /diagnostics`; Requirements 11.1, 11.5, 13.1, 13.2, 13.6).
 *
 * Flow:
 *   1. `requireOAuthAdminCapability(event, 'oauth.operations.manage')` — the
 *      Administrator gate plus the operations-manage capability, bound to the
 *      server-derived deployment.
 *   2. `parseBrowserMutation(event, access)` — same-origin + session-bound CSRF
 *      (`X-CSRF-Token`) + the safe envelope (`idempotencyKey`, `reason`).
 *   3. Read ONLY the `checks` array from the body and validate every entry is a
 *      NAMED approved check (`OAUTH_DIAGNOSTIC_CHECKS`). An unknown/arbitrary
 *      target is a 400 before any job is reserved.
 *   4. `OAuthDiagnosticService.create(...)` durably reserves the `pending` job
 *      (durable intent before running — Req 13.2). The maintenance loop
 *      (server/plugins/oauth-diagnostics.ts) later runs it under the OAuth
 *      maintenance lock; the panel polls `GET /diagnostics/:id`.
 *   5. Return `202` with `{ jobId, state }`.
 *
 * SAFETY: The job never accepts a caller-supplied URL/target — only the named
 * checks are accepted (Req 11.1). Reusing an idempotency key returns the
 * existing job rather than reserving another. `Cache-Control: no-store` is
 * applied by the access service.
 */

import { defineEventHandler, setResponseStatus } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { oauthAdminErrors, requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { parseBrowserMutation } from '../../../../mcp/oauth/admin/mutation-context'
import { OAuthDiagnosticService } from '../../../../mcp/oauth/admin/diagnostic-service'
import { isApprovedCheck, OAUTH_DIAGNOSTIC_CHECKS } from '../../../../mcp/oauth/admin/diagnostic-checks'
import { getOAuthAdminRepository } from '../../../../mcp/oauth/admin/index'
import { OAUTH_CAPABILITIES, type OAuthDiagnosticCheck } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/diagnostics', 'POST', {
  summary: 'Create a named OAuth diagnostic job',
  description:
    'Creates a durable diagnostic job that runs one or more NAMED approved checks (protected-resource-discovery, authorization-server-discovery, public-jwks-metadata, provider-storage-read, crew-configuration-health) against the current deployment and returns a 202 job reference. Capability: oauth.operations.manage. Requires the X-CSRF-Token header (session-bound), a same-origin request, and an envelope with idempotencyKey + reason. A caller-supplied URL/target or unknown check is rejected with 400 without reserving a job. Reusing an idempotency key returns the existing job. Diagnostics never register clients, begin consent, exchange tokens, or increment quota. Cache-Control: no-store. Sensitive-field exclusions: results carry only bounded safe summaries, never raw response bodies.',
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
          required: ['idempotencyKey', 'reason', 'checks'],
          properties: {
            idempotencyKey: { type: 'string', description: 'Client-generated idempotency key; a retry returns the existing job.' },
            reason: { type: 'string', description: 'Required audited reason for running diagnostics.' },
            checks: {
              type: 'array',
              minItems: 1,
              maxItems: 2,
              items: { type: 'string', enum: [...OAUTH_DIAGNOSTIC_CHECKS] },
              description: 'One or two named approved checks. Arbitrary targets are rejected.'
            }
          }
        }
      }
    }
  },
  responses: {
    202: {
      description: 'The diagnostic job was reserved; returns the job reference and state.',
      content: {
        'application/json': {
          example: {
            success: true,
            data: { jobId: 'job_…', state: 'pending' },
            metadata: { timestamp: '2026-01-01T00:00:00.000Z' }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' },
    409: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // 1. Administrator + operations-manage capability, deployment-bound.
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.OPERATIONS_MANAGE)

  // 2. Same-origin + session-bound CSRF + safe envelope (idempotencyKey/reason).
  const parsed = await parseBrowserMutation(event, access)
  const body = parsed.body as Record<string, unknown>

  // 3. Read ONLY the checks array and validate every entry is a NAMED check.
  //    A non-array or an unknown/arbitrary target is a 400 before reservation.
  const rawChecks = Array.isArray(body.checks) ? body.checks : []
  if (rawChecks.length === 0) {
    throw oauthAdminErrors.badRequest({ message: 'At least one named diagnostic check is required.', data: { field: 'checks' } })
  }
  const checks: OAuthDiagnosticCheck[] = []
  for (const candidate of rawChecks) {
    if (!isApprovedCheck(candidate)) {
      throw oauthAdminErrors.badRequest({ message: 'Unknown diagnostic check requested.', data: { field: 'checks', reason: 'UNKNOWN_CHECK' } })
    }
    checks.push(candidate)
  }

  // 4. Durably reserve the pending job (the maintenance loop runs it).
  const service = new OAuthDiagnosticService(getOAuthAdminRepository())
  const job = await service.create(access, checks, parsed.envelope.reason, parsed.envelope.idempotencyKey)

  // 5. Return 202 with the job reference and state.
  const payload = sendSuccess(event, { jobId: job.jobId, state: job.state }, { deployment: access.deployment.environment })
  setResponseStatus(event, 202)
  return payload
}))
