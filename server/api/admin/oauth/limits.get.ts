/**
 * GET /api/admin/oauth/limits
 *
 * Returns a non-mutating registration quota observation for a server-selected
 * KNOWN pseudonymous quota reference (the aggregate dynamic-registration
 * bucket) in the current deployment (design "Proposed API contract" —
 * `GET /limits`; Requirements 1.1, 1.2, 12.1, 17.5).
 *
 * Capability: `oauth.configuration.view`.
 *
 * SAFETY: The reader NEVER invokes an incrementing rate-decision path (not even
 * with a zero increment) and reports the configured limit even when live usage
 * is unavailable. The quota reference is server-selected, so a caller cannot
 * probe arbitrary buckets.
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/limits', 'GET', {
  summary: 'Get non-mutating OAuth registration quota observation',
  description:
    'Returns a safe registration quota observation (effective limit, window, available/remaining/reset when known, key type, source, collection time, coverage, and rejected-attempt notice) for a server-selected known pseudonymous bucket. Capability: oauth.configuration.view. The reader never calls an incrementing rate-decision path and reports the configured limit even when usage is unavailable; no caller-supplied key is accepted. Cache-Control: no-store. Sensitive-field exclusions: the quota reference is pseudonymous; no raw network addresses.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  responses: {
    200: {
      description: 'A safe quota observation.',
      content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } } } }
    },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.CONFIGURATION_VIEW)
  const observation = await getOAuthQueryService().limits(access)
  return sendSuccess(event, observation, { deployment: access.deployment.environment })
}))
