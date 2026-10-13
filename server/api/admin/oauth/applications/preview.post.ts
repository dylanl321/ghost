/**
 * POST /api/admin/oauth/applications/preview
 *
 * Validates a proposed native public client and returns the normalized
 * registration + permission preview WITHOUT creating anything (design
 * "Proposed API contract" — backs the confirmation step; Requirement 6.4).
 *
 * This backs the wizard's confirmation step: the panel submits the same create
 * fields it would POST to `/applications`, and this route runs the identical
 * validation (`validateCreateApplicationRequest`) so the confirmation preview
 * reflects exactly what would be registered (client type/auth profile, redirect
 * URIs, permitted resources, permitted scopes). It also returns the deployment's
 * supported resources/scopes so the form can populate its multiselects from the
 * running provider configuration rather than a hard-coded list.
 *
 * SAFETY: A preview is a pure validation — it reserves no client id, writes no
 * provider or projection state, and runs no operation. It is still a POST, so it
 * enforces the SAME same-origin + session-bound CSRF gate as a real mutation
 * (`parseBrowserMutation`); the `X-CSRF-Token` header is required. No idempotency
 * key is consumed because nothing is created. `Cache-Control: no-store` is
 * applied by the access service. The response carries no secret or token — a
 * native public client has neither (Req 6.6).
 *
 * Errors: a same-origin/CSRF failure is 403; a validation failure (missing
 * name/owner/redirects, wildcard/unsupported redirect scheme, unauthorized
 * resource, unsupported scope) is 400 with a safe reason, exactly matching the
 * create route.
 */

import { defineEventHandler, readBody, getRequestHeader } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability, oauthAdminErrors } from '../../../../mcp/oauth/admin/access-service'
import { verifyCsrfToken, validateSameOrigin } from '../../../../mcp/oauth/admin/csrf'
import { CSRF_HEADER } from '../../../../mcp/oauth/admin/mutation-context'
import {
  validateCreateApplicationRequest,
  getSupportedResourcesAndScopes
} from '../../../../mcp/oauth/admin/application-creation-service'
import { OAUTH_CAPABILITIES, type OAuthCreateApplicationRequest } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/applications/preview', 'POST', {
  summary: 'Preview a native public OAuth application (validate only)',
  description:
    'Validates a proposed native public client and returns the normalized registration/permission preview plus the deployment supported resources/scopes, WITHOUT creating anything. Capability: oauth.applications.manage. Requires the X-CSRF-Token header (session-bound) and a same-origin request; no idempotency key is consumed because nothing is created. Cache-Control: no-store. Sensitive-field exclusions: the response contains no client secret or registration access token.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [
    { name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' }, description: 'Session-bound CSRF token from GET /api/admin/oauth/csrf.' }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['name', 'ownership', 'redirectUris', 'permittedResources', 'permittedScopes'],
          properties: {
            name: { type: 'string' },
            ownership: {
              type: 'object',
              required: ['owner'],
              properties: { owner: { type: 'string' }, team: { type: 'string' }, purpose: { type: 'string' } }
            },
            redirectUris: { type: 'array', items: { type: 'string' } },
            permittedResources: { type: 'array', items: { type: 'string' } },
            permittedScopes: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'The normalized preview and the deployment supported resources/scopes.',
      content: {
        'application/json': {
          example: {
            success: true,
            data: {
              preview: {
                name: 'My CLI',
                clientType: 'native-public',
                authMethod: 'none',
                pkce: 'S256',
                redirectUris: ['http://127.0.0.1:8765/callback'],
                permittedResources: ['https://…/mcp'],
                permittedScopes: ['openid', 'offline_access'],
                allowsLoopback: true
              },
              options: { resources: ['https://…/mcp'], scopes: ['openid', 'offline_access'] }
            },
            metadata: { timestamp: '2026-01-01T00:00:00.000Z' }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Administrator + applications-manage capability, deployment-bound + no-store.
  await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.APPLICATIONS_MANAGE)

  // A preview creates nothing, so it does not consume an idempotency key. It is
  // still a POST, so it enforces the SAME same-origin + session-bound CSRF gate
  // as a mutation (a lighter check than parseBrowserMutation, but still
  // requiring the header). Same-origin first, then CSRF.
  if (!validateSameOrigin(event)) {
    throw oauthAdminErrors.forbidden({ message: 'Request origin is not permitted', data: { reason: 'ORIGIN_REJECTED' } })
  }
  if (!verifyCsrfToken(event, getRequestHeader(event, CSRF_HEADER))) {
    throw oauthAdminErrors.forbidden({ message: 'Invalid or missing CSRF token', data: { reason: 'CSRF_REJECTED' } })
  }

  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  const ownership = (body.ownership && typeof body.ownership === 'object')
    ? (body.ownership as Record<string, unknown>)
    : {}

  // Build the create-shaped request. `csrfToken/idempotencyKey/reason` are not
  // used by validation, but the shared type requires the envelope fields, so we
  // supply placeholders the validator ignores.
  const candidate: OAuthCreateApplicationRequest = {
    csrfToken: '',
    idempotencyKey: '',
    reason: '',
    name: String(body.name ?? ''),
    ownership: {
      owner: typeof ownership.owner === 'string' ? ownership.owner : '',
      ...(typeof ownership.team === 'string' ? { team: ownership.team } : {}),
      ...(typeof ownership.purpose === 'string' ? { purpose: ownership.purpose } : {})
    },
    redirectUris: Array.isArray(body.redirectUris) ? body.redirectUris.map(String) : [],
    permittedResources: Array.isArray(body.permittedResources) ? body.permittedResources.map(String) : [],
    permittedScopes: Array.isArray(body.permittedScopes) ? body.permittedScopes.map(String) : []
  }

  // Run the identical validation the create route uses — throws 400 on any
  // invalid input. Nothing is reserved, registered, or projected.
  const normalized = validateCreateApplicationRequest(candidate)
  const options = getSupportedResourcesAndScopes()

  return sendSuccess(event, {
    preview: {
      name: normalized.name,
      ownership: normalized.ownership,
      clientType: 'native-public' as const,
      authMethod: 'none' as const,
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      pkce: 'S256' as const,
      refreshRotation: false,
      redirectUris: normalized.redirectUris,
      permittedResources: normalized.permittedResources,
      permittedScopes: normalized.permittedScopes,
      allowsLoopback: normalized.allowsLoopback
    },
    options
  })
}))
