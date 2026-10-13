/**
 * GET /api/admin/oauth/grants
 *
 * Returns cursor-paginated grant summaries for the current deployment (design
 * "Proposed API contract" — `GET /grants`; Requirements 1.1, 1.2, 8.1, 17.4,
 * 17.5). Requested scopes are kept distinct from consented scopes; consent
 * time, expiry, and last observed refresh are shown when available, with the
 * observation coverage.
 *
 * Capability: `oauth.activity.view` (grants carry identity-bearing references;
 * the subject display is only present when this capability is held).
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthListQueryParameters, oauthListResponses, parseOAuthListQuery, pagedMetadata } from './_shared'

registerEndpoint('/api/admin/oauth/grants', 'GET', {
  summary: 'List OAuth grants (safe summaries)',
  description:
    'Returns cursor-paginated safe grant summaries for the current deployment, distinguishing requested from consented scopes with consent time, expiry, last observed refresh, and observation coverage. Capability: oauth.activity.view. The subject display is present only with this capability. Cursor pagination with bounded limits; totals are nullable. Cache-Control: no-store. Sensitive-field exclusions: no tokens or raw identity details; subject references are opaque.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: oauthListQueryParameters,
  responses: oauthListResponses('Cursor-paginated safe grant summaries.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
  const query = parseOAuthListQuery(event)
  const result = await getOAuthQueryService().grants(access, query)
  return sendSuccess(event, { items: result.items }, pagedMetadata(result.page))
}))
