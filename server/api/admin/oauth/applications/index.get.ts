/**
 * GET /api/admin/oauth/applications
 *
 * Returns a cursor-paginated, indexed inventory of registered clients as safe
 * summaries for the current deployment (design "Proposed API contract" —
 * `GET /applications`; Requirements 1.1, 1.2, 5.1, 17.4, 17.5). Uses indexed
 * projections only and never scans the provider artifact table per request.
 *
 * Capability: `oauth.configuration.view`. Identity-bearing filters (`subject`)
 * are honoured only when the caller also holds `oauth.activity.view`; otherwise
 * they are stripped by the query service.
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthListQueryParameters, oauthListResponses, parseOAuthListQuery, pagedMetadata } from '../_shared'

registerEndpoint('/api/admin/oauth/applications', 'GET', {
  summary: 'List OAuth applications (indexed inventory)',
  description:
    'Returns cursor-paginated safe application metadata (client ID/name/type/origin, owner/team/purpose, safe redirects/policy, lifecycle/revision, creation time, observed use) for the current deployment from indexed projections. Capability: oauth.configuration.view. Never scans the provider artifact table per request. Cursor pagination with bounded limits; totals are nullable and never invented from partial coverage. Cache-Control: no-store. Sensitive-field exclusions: no secrets, tokens, or registration access tokens are ever included.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: oauthListQueryParameters,
  responses: oauthListResponses('Cursor-paginated safe application summaries.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.CONFIGURATION_VIEW)
  const query = parseOAuthListQuery(event)
  const result = await getOAuthQueryService().applications(access, query)
  return sendSuccess(event, { items: result.items }, pagedMetadata(result.page))
}))
