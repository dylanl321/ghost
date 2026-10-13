/**
 * GET /api/admin/oauth/issues/:id
 *
 * Returns a single safe issue investigation by group id for the current
 * deployment (design "Proposed API contract" — `GET /issues/:id`; Requirements
 * 1.1, 1.2, 10.1, 17.5). A missing/guessed group id yields a typed 404.
 *
 * Capability: `oauth.activity.view` (read). Updates require
 * `oauth.operations.manage` in a later task; this route is read-only.
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { oauthAdminErrors, requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthDetailResponses } from '../_shared'

registerEndpoint('/api/admin/oauth/issues/{id}', 'GET', {
  summary: 'Get a single OAuth issue investigation',
  description:
    'Returns a single safe issue investigation (first/last observation, attempts, known affected users/clients, severity, owner, bounded notes/mitigation, disposition, verification evidence, revision). Capability: oauth.activity.view (read only). A guessed or unknown group id returns 404 without bypassing authorization. Cache-Control: no-store. Sensitive-field exclusions: no tokens, raw bodies, raw exceptions, or raw network addresses.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Opaque issue group id.' }],
  responses: oauthDetailResponses('A single safe issue investigation.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
  const groupId = getRouterParam(event, 'id')
  if (!groupId) throw oauthAdminErrors.notFound({ message: 'Issue not found in this deployment' })
  const issue = await getOAuthQueryService().issueDetail(access, groupId)
  return sendSuccess(event, issue, { deployment: access.deployment.environment })
}))
