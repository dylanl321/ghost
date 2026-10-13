/**
 * GET /api/admin/oauth/applications/:id
 *
 * Returns provider-reconciled safe detail for a single application in the
 * current deployment (design "Proposed API contract" — `GET /applications/:id`;
 * Requirements 1.1, 1.2, 5.1, 17.5). The query service reconciles the single
 * client against authoritative provider state (repairing divergence or
 * tombstoning a removed record) before returning, and exposes the projection's
 * freshness/coverage. A missing/guessed client id yields a typed 404.
 *
 * Capability: `oauth.configuration.view`. Per the API contract, identity-
 * bearing fields require `oauth.activity.view`; the underlying projection only
 * populates identity-bearing detail when that capability is held, so a
 * configuration-only viewer receives the safe non-identity detail.
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { oauthAdminErrors, requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthDetailResponses } from '../_shared'

registerEndpoint('/api/admin/oauth/applications/{id}', 'GET', {
  summary: 'Get provider-reconciled application detail',
  description:
    'Returns safe detail for a single application, reconciled against authoritative provider state, with projection freshness/coverage. Capability: oauth.configuration.view (identity-bearing fields require oauth.activity.view). A guessed or unknown client id returns 404 without bypassing authorization. Cache-Control: no-store. Sensitive-field exclusions: no secrets, registration access tokens, or invented client secrets are ever included.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Opaque client reference.' }],
  responses: oauthDetailResponses('Provider-reconciled safe application detail.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.CONFIGURATION_VIEW)
  const clientId = getRouterParam(event, 'id')
  if (!clientId) throw oauthAdminErrors.notFound({ message: 'Application not found in this deployment' })
  const detail = await getOAuthQueryService().applicationDetail(access, clientId)
  return sendSuccess(event, detail, { deployment: access.deployment.environment })
}))
