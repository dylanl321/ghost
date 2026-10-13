/**
 * GET /api/admin/oauth/configuration
 *
 * Returns the safe effective OAuth configuration projection for the current
 * deployment: issuer, approved public endpoints, resources, scopes, grant
 * types, client-auth methods, PKCE, registration policy, lifetimes, refresh
 * rotation, quotas, and durability — each labelled configured/effective/
 * observed with its provenance, plus public JWK metadata and optional release
 * evidence (design "Proposed API contract" — `GET /configuration`;
 * Requirements 1.1, 1.2, 3.1, 17.5).
 *
 * Capability: `oauth.configuration.view`.
 *
 * SAFETY: The projection exposes only safe public metadata. Private JWK
 * parameters, cookie keys, configuration secrets, and credential documents are
 * excluded; unavailable release/pipeline/image/task/signing-date evidence is
 * reported as unknown rather than inferred.
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/configuration', 'GET', {
  summary: 'Get the safe effective OAuth configuration',
  description:
    'Returns the safe effective OAuth configuration projection for the current deployment with configured/effective/observed values and provenance. Capability: oauth.configuration.view. Cache-Control: no-store. Sensitive-field exclusions: private JWK parameters, cookie keys, configuration secrets, and credential documents are excluded; unavailable release/pipeline/image/task/signing-date evidence is reported as unknown.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  responses: {
    200: {
      description: 'The safe effective configuration projection.',
      content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } } } }
    },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.CONFIGURATION_VIEW)
  const configuration = await getOAuthQueryService().configuration(access)
  return sendSuccess(event, configuration, {
    deployment: access.deployment.environment,
    observedAt: new Date().toISOString()
  })
}))
