/**
 * GET /api/admin/oauth/attempts
 *
 * Returns bounded, filtered OAuth activity assembled into evidence-only
 * attempts for the current deployment (design "Proposed API contract" —
 * `GET /attempts`; Requirements 1.1, 1.2, 8.1, 17.4, 17.5). Attempts are
 * assembled over the queried event page; the cursor pages the underlying
 * events. Stages that GHOST did not observe are marked unknown rather than
 * invented.
 *
 * Capability: `oauth.activity.view` (identity-bearing activity).
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthListQueryParameters, oauthListResponses, parseOAuthListQuery, pagedMetadata } from '../_shared'

registerEndpoint('/api/admin/oauth/attempts', 'GET', {
  summary: 'List OAuth activity attempts (evidence-only)',
  description:
    'Returns bounded, filtered OAuth activity assembled into evidence-only attempts for the current deployment. Capability: oauth.activity.view. Supports time range, application, subject, resource, outcome, stage, and diagnostic-reference filters. Unobserved callback/installer/cancellation stages are marked unknown; attempts are correlated only through supported references, never by shared IP/display/timestamp. Cursor pagination with bounded limits. Cache-Control: no-store. Sensitive-field exclusions: no tokens, codes, cookies, raw bodies, authorization URLs, raw exceptions, or raw network addresses.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: oauthListQueryParameters,
  responses: oauthListResponses('Cursor-paginated evidence-only attempts.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
  const query = parseOAuthListQuery(event)
  const { attempts, page } = await getOAuthQueryService().attempts(access, query)
  return sendSuccess(event, { items: attempts }, pagedMetadata(page))
}))
