/**
 * GET /api/admin/oauth/audit
 *
 * Returns cursor-paginated OAuth administration audit history for the current
 * deployment (design "Proposed API contract" — `GET /audit`; Requirements 1.1,
 * 1.2, 17.4, 17.5). The repository applies 90-day logical expiry before
 * returning rows.
 *
 * Capability: `oauth.activity.view` (the audit read capability per the API
 * contract).
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthListQueryParameters, oauthListResponses, parseOAuthListQuery, pagedMetadata } from './_shared'

registerEndpoint('/api/admin/oauth/audit', 'GET', {
  summary: 'List OAuth administration audit records',
  description:
    'Returns cursor-paginated safe audit history (actor, capability, environment, operation/read/diagnostic/export reference, reason, safe change field names, outcome, verification evidence) for the current deployment. Capability: oauth.activity.view. Logically expired (>90 days) rows are excluded before return. Cursor pagination with bounded limits; totals are nullable. Cache-Control: no-store. Sensitive-field exclusions: no secrets, tokens, raw request content, raw bodies, raw exceptions, or raw network addresses.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: oauthListQueryParameters,
  responses: oauthListResponses('Cursor-paginated safe audit records.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
  const query = parseOAuthListQuery(event)
  const result = await getOAuthQueryService().audit(access, query)
  return sendSuccess(event, { items: result.items }, pagedMetadata(result.page))
}))
