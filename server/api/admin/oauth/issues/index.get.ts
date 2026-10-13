/**
 * GET /api/admin/oauth/issues
 *
 * Returns cursor-paginated safe issue investigations for the current deployment
 * (design "Proposed API contract" — `GET /issues`; Requirements 1.1, 1.2, 10.1,
 * 17.4, 17.5). Issues group repeated failures by deployment/stage/safe error
 * code/known client/resource and a bounded time window; anonymous counts stay
 * separate from identified users, and administrator disposition stays separate
 * from observed recovery evidence.
 *
 * Capability: `oauth.activity.view` (read). Investigation UPDATES are a later
 * task and require `oauth.operations.manage`; this route is read-only.
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthListQueryParameters, oauthListResponses, parseOAuthListQuery, pagedMetadata } from '../_shared'

registerEndpoint('/api/admin/oauth/issues', 'GET', {
  summary: 'List OAuth issues (grouped investigations)',
  description:
    'Returns cursor-paginated safe issue investigations for the current deployment, grouped by deployment/stage/safe error code/known client/resource/window. Capability: oauth.activity.view (read only; updates require oauth.operations.manage in a later task). Anonymous attempt counts stay separate from identified users; disposition is distinct from observed recovery. Cursor pagination with bounded limits. Cache-Control: no-store. Sensitive-field exclusions: no tokens, raw bodies, raw exceptions, or raw network addresses; notes/mitigation are bounded safe text.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: oauthListQueryParameters,
  responses: oauthListResponses('Cursor-paginated safe issue investigations.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
  const query = parseOAuthListQuery(event)
  const result = await getOAuthQueryService().issues(access, query)
  return sendSuccess(event, { items: result.items }, pagedMetadata(result.page))
}))
