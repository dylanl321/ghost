/**
 * GET /api/admin/oauth/overview
 *
 * Returns INDEPENDENT per-stage OAuth health observations for the current
 * deployment over a bounded recent window (design "Proposed API contract" —
 * `GET /overview`; Requirements 1.1, 1.2, 2.1, 17.5). Each observation carries
 * its source, timestamp, safe outcome, and availability/freshness/coverage;
 * missing/stale/unavailable evidence is surfaced explicitly and is never
 * reported as a healthy stage.
 *
 * Capability: `oauth.configuration.view`. The access gate applies
 * `requireAdmin`, the capability check, and `Cache-Control: no-store`.
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/overview', 'GET', {
  summary: 'Get independent OAuth stage health observations',
  description:
    'Returns independent per-stage health observations for the current server deployment. Capability: oauth.configuration.view. Each observation includes its source, timestamp, safe outcome, next action, and availability/freshness/coverage; a succeeding stage never implies success elsewhere, and missing/stale/unavailable evidence is reported explicitly rather than as healthy or zero failures. Cache-Control: no-store. Sensitive-field exclusions: no tokens, codes, cookies, raw bodies, authorization URLs, raw exceptions, or raw network addresses are ever included.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  responses: {
    200: {
      description: 'A list of independent per-stage health observations with deployment and observation time.',
      content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { type: 'object' } } } } } }
    },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.CONFIGURATION_VIEW)
  const observations = await getOAuthQueryService().overview(access)
  return sendSuccess(event, observations, {
    deployment: access.deployment.environment,
    observedAt: new Date().toISOString()
  })
}))
