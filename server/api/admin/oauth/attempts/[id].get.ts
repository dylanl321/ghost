/**
 * GET /api/admin/oauth/attempts/:id
 *
 * Returns the detail for a single attempt: the events sharing the supported
 * correlation reference `:id`, assembled into one evidence-only attempt (design
 * "Proposed API contract" — `GET /attempts/:id`; Requirements 1.1, 1.2, 8.1,
 * 17.5). A reference with no matching server event in the window yields a typed
 * 404 (a guessed reference cannot bypass authorization or invent a result).
 *
 * Capability: `oauth.activity.view`.
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { oauthAdminErrors, requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthDetailResponses, oauthListQueryParameters, parseOAuthListQuery } from '../_shared'

registerEndpoint('/api/admin/oauth/attempts/{id}', 'GET', {
  summary: 'Get a single OAuth attempt by correlation reference',
  description:
    'Returns one evidence-only attempt assembled from events sharing the supported correlation/reference/diagnostic reference in the bounded window. Capability: oauth.activity.view. A reference with no matching server event returns 404; the timeline marks unobserved stages unknown rather than inventing a result. Cache-Control: no-store. Sensitive-field exclusions: no tokens, codes, cookies, raw bodies, authorization URLs, raw exceptions, or raw network addresses.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Opaque correlation/attempt reference.' },
    ...oauthListQueryParameters.filter(p => p.name === 'from' || p.name === 'to')
  ],
  responses: oauthDetailResponses('A single evidence-only attempt.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
  const reference = getRouterParam(event, 'id')
  if (!reference) throw oauthAdminErrors.notFound({ message: 'Attempt not found in this deployment' })
  const query = parseOAuthListQuery(event)
  const attempt = await getOAuthQueryService().attemptDetail(access, reference, query)
  if (!attempt) throw oauthAdminErrors.notFound({ message: 'Attempt not found in this deployment' })
  return sendSuccess(event, attempt, { deployment: access.deployment.environment })
}))
