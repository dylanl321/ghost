/**
 * GET /api/admin/oauth/applications/health
 *
 * Returns the always-present MCP + Kiro Crew application status list for the
 * current deployment (design "B. First-class MCP and Kiro Crew application
 * status" — status read route; Requirements 3.1, 3.9). Each status is derived
 * from configuration truth (the well-known resource URLs and supported scopes),
 * provider/projection truth (the seeded Client projections), and grant truth
 * (live Grant projections), labelled with the backfill checkpoint coverage and
 * freshness. It distinguishes benign "no-activity" from actionable
 * "misconfigured", and reports `unknown` (with a reconcile hint) while coverage
 * is not yet `complete` — so a quiet, freshly deployed environment is
 * informative at a glance rather than an empty/"Unknown" wall.
 *
 * Capability: `oauth.configuration.view` — this is a display projection
 * consistent with Overview, not a mutation. The access gate applies
 * `requireAdmin`, the capability check, and `Cache-Control: no-store`.
 *
 * SAFETY: this is a READ. It never scans the provider on a request hot path —
 * it reads only the already-seeded projections and the durable checkpoint — so
 * no same-origin/CSRF write gate is required. The response carries only public
 * resource URLs, public scope names, opaque references, and coverage/freshness
 * — no secrets, tokens, or identity detail (redactor-safe DTO).
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/applications/health', 'GET', {
  summary: 'Get always-present MCP + Kiro Crew application status',
  description:
    'Returns the always-present application status list for the two well-known deployment applications (MCP and Kiro Crew) for the current server deployment, regardless of recent event traffic. Capability: oauth.configuration.view. Each status is derived from configuration truth (well-known resource URLs and supported scopes), provider/projection truth (seeded Client projections), and grant truth (live Grant projections), and is labelled with backfill coverage and freshness. Benign no-activity is distinguished from actionable misconfiguration; a definite registration state is asserted only once coverage is complete, otherwise the status is unknown with a reconcile-in-progress hint. This read never scans the provider on a request hot path. Cache-Control: no-store. Sensitive-field exclusions: only public resource URLs, public scope names, opaque references, and coverage/freshness are returned — no secrets, tokens, or identity detail.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  responses: {
    200: {
      description: 'The always-present MCP + Kiro Crew application status list with coverage/freshness.',
      content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { type: 'object' } } } } } }
    },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.CONFIGURATION_VIEW)
  const statuses = await getOAuthQueryService().applicationsHealth(access)
  return sendSuccess(event, statuses, {
    deployment: access.deployment.environment,
    observedAt: new Date().toISOString()
  })
}))
