/**
 * GET /api/admin/oauth/csrf
 *
 * Returns a session-bound CSRF token the panel echoes in the `X-CSRF-Token`
 * header on later browser mutations (design "Proposed API contract" —
 * `GET /csrf`; Requirements 1.1, 13.6, 17.5).
 *
 * Capability: Administrator only. Unlike the read/query routes this route does
 * NOT require a specific OAuth capability — a CSRF token is a session integrity
 * primitive that every administrator needs before any mutation, so it gates on
 * `requireAdmin` plus the standard `Cache-Control: no-store` header only.
 *
 * SAFETY: The token value is NEVER audited or logged (design: "never audits/
 * logs its value"). The token is session-bound: it embeds an HMAC binding over
 * a stable per-session subject, a random nonce, and an expiry, keyed by the
 * server request-state key. Nothing is stored server-side per token —
 * verification (task 7.1 `verifyCsrfToken`) recomputes the binding from the
 * same session, so a token minted for one session cannot validate under
 * another. Mutation routes (tasks 7.2/7.3) verify the `X-CSRF-Token` header
 * plus same-origin before any provider effect.
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../utils/api-response'
import { applyOAuthAdminResponseHeaders } from '../../../mcp/oauth/admin/access-service'
import { issueCsrfToken } from '../../../mcp/oauth/admin/csrf'
import { requireAdmin } from '../../../utils/user-roles'

registerEndpoint('/api/admin/oauth/csrf', 'GET', {
  summary: 'Get a session-bound OAuth admin CSRF token',
  description:
    'Returns a session-bound CSRF token for the current administrator browser session, echoed in the X-CSRF-Token header on subsequent OAuth administration mutations. The token embeds a cryptographic binding to the session and an expiry; nothing is stored server-side and verification recomputes the binding. Capability: Administrator (requireAdmin) only. Cache-Control: no-store. The token value is never audited or logged.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  responses: {
    200: {
      description: 'A CSRF token for the current session.',
      content: {
        'application/json': {
          example: {
            success: true,
            data: { csrfToken: '3f1c…redacted…' },
            metadata: { timestamp: '2026-01-01T00:00:00.000Z' }
          }
        }
      }
    },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Administrator session gate + no-store. No OAuth capability is required to
  // obtain a CSRF token; the mutation routes (later tasks) enforce capability.
  await requireAdmin(event)
  applyOAuthAdminResponseHeaders(event)

  // Session-bound, self-verifying token. Never log or audit this value.
  const csrfToken = issueCsrfToken(event)

  return sendSuccess(event, { csrfToken })
}))
