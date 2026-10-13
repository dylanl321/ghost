/**
 * GET /api/admin/oauth/applications/options
 *
 * Returns the deployment's supported resources and scopes so the create wizard
 * can populate its Permitted Resources / Permitted Scopes multiselects before
 * the form is otherwise valid (design "D. Create-form options fix";
 * Requirements 5.2, 5.3, 5.4, 5.5). It calls `getSupportedResourcesAndScopes()`
 * — which derives the two well-known resource URLs (MCP + Kiro Crew) and the
 * union of their supported scopes plus `openid`/`offline_access` from the same
 * runtime configuration the provider was built from — and returns
 * `{ resources, scopes }` in the standard envelope.
 *
 * Capability: `oauth.applications.manage` — the same capability that governs
 * creation and preview, because only a would-be creator needs the wizard's
 * option lists. The access gate applies `requireAdmin`, the capability check,
 * and `Cache-Control: no-store`.
 *
 * SAFETY: this is a READ. It validates no request body and performs no provider
 * effect, so it needs no CSRF token and no same-origin write gate. When the
 * runtime configuration is only partially derivable it still returns `200` with
 * whatever resources/scopes are available — an empty list surfaces to the
 * wizard as "no options available" rather than an error. The response carries
 * only public resource URLs and public scope names — no secrets, tokens, or
 * identity detail (redactor-safe DTO).
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { getSupportedResourcesAndScopes } from '../../../../mcp/oauth/admin/application-creation-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/applications/options', 'GET', {
  summary: 'Get supported resources and scopes for the create wizard',
  description:
    'Returns the deployment\'s supported resources and scopes ({ resources, scopes }) so the create wizard can populate its Permitted Resources and Permitted Scopes multiselects before the form is otherwise valid. Derived from getSupportedResourcesAndScopes() — the two well-known resource URLs (MCP and Kiro Crew) and the union of their supported scopes plus openid/offline_access — reading the same runtime configuration the provider was built from. Capability: oauth.applications.manage (the same capability that governs creation and preview). This is a non-mutating GET: it validates no request body and produces no provider effect, so it requires no CSRF token or same-origin write gate. When configuration is only partially derivable it returns 200 with whatever is available; an empty list means "no options available" rather than an error. Cache-Control: no-store. Sensitive-field exclusions: only public resource URLs and public scope names are returned — no secrets, tokens, or identity detail.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  responses: {
    200: {
      description: 'The deployment\'s supported resources and scopes for the create wizard.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  resources: { type: 'array', items: { type: 'string' } },
                  scopes: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      }
    },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.APPLICATIONS_MANAGE)
  // Read-only projection of the deployment's supported options from the same
  // runtime config the provider was built from. Never validates a body, never
  // touches the provider; a partial configuration simply yields a shorter list.
  const { resources, scopes } = getSupportedResourcesAndScopes()
  return sendSuccess(event, { resources, scopes }, {
    deployment: access.deployment.environment,
    observedAt: new Date().toISOString()
  })
}))
