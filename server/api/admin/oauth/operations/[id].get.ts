/**
 * GET /api/admin/oauth/operations/:id
 *
 * Returns the safe verification view of a single durable administrative
 * operation in the current deployment (design "Proposed API contract" —
 * `GET /operations/:id`; Requirements 1.1, 1.2, 13.6, 17.5). Used by the panel
 * to poll an operation's state (pending/completed/failed) after a mutation.
 *
 * Capability: the API contract gates this on the operation owner or the current
 * authorized capability. This route requires the baseline read capability
 * `oauth.configuration.view` (held by every OAuth administrator) and binds the
 * read to the server-derived deployment, so a guessed operation id from another
 * deployment cannot be read (it resolves to 404). The `OAuthAdminOperation`
 * projection is already safe — it carries no secrets, tokens, or raw payloads.
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { oauthAdminErrors, requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getOAuthAdminRepository } from '../../../../mcp/oauth/admin/index'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthDetailResponses } from '../_shared'

registerEndpoint('/api/admin/oauth/operations/{id}', 'GET', {
  summary: 'Get a durable OAuth admin operation (verification view)',
  description:
    'Returns the safe verification view of a single administrative operation (type, actor, capability, target references, request fingerprint, expected revision, reason, state/lease, safe result/error, accepted/completed/verified timestamps). Capability: oauth.configuration.view (baseline read; the operation is deployment-scoped so a guessed id from another deployment returns 404). Cache-Control: no-store. Sensitive-field exclusions: the operation projection carries no secrets, tokens, or raw payloads.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Opaque operation id.' }],
  responses: oauthDetailResponses('A single safe operation verification view.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.CONFIGURATION_VIEW)
  const operationId = getRouterParam(event, 'id')
  if (!operationId) throw oauthAdminErrors.notFound({ message: 'Operation not found in this deployment' })
  const operation = await getOAuthAdminRepository().getOperation(access.deployment, operationId)
  if (!operation) throw oauthAdminErrors.notFound({ message: 'Operation not found in this deployment' })
  return sendSuccess(event, operation, { deployment: access.deployment.environment })
}))
