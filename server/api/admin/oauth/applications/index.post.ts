/**
 * POST /api/admin/oauth/applications
 *
 * Creates a native public OAuth client for the current deployment and returns a
 * `202 Accepted` durable operation reference plus a NON-SECRET result (design
 * "Proposed API contract" — `POST /applications`; Requirements 6.1–6.6, 13.1,
 * 13.2, 17.6).
 *
 * Flow:
 *   1. `requireOAuthAdminCapability(event, 'oauth.applications.manage')` — the
 *      Administrator gate plus the applications-manage capability, bound to the
 *      server-derived deployment (never a caller-supplied one).
 *   2. `parseBrowserMutation(event, access)` — same-origin + session-bound CSRF
 *      (`X-CSRF-Token` header) + the safe envelope (`idempotencyKey`, `reason`).
 *      A CSRF/origin failure is 403; a missing envelope field is 400.
 *   3. Read ONLY the create fields from the body (`name`, `ownership`,
 *      `redirectUris`, `permittedResources`, `permittedScopes`). Everything
 *      else is ignored so an unknown/spoofed field cannot reach the provider.
 *   4. `OAuthApplicationCreationService.createApplication(access, request)` runs
 *      the idempotent, revision-safe operation: it validates, reserves a stable
 *      client id BEFORE the provider write (so a retry never creates a second
 *      client), registers the native public client through the supported
 *      provider path, and upserts the managed projection.
 *   5. Return `202` with `{ operationId, state, result }`.
 *
 * SAFETY: The `result` is the redacted, non-secret `CreateApplicationResult` —
 * it carries the client id, native public profile, redirect URIs, permitted
 * resources/scopes, and human-readable integration instructions. It NEVER
 * contains a client secret or a registration access token (there are none for a
 * native public client — Req 6.6). `Cache-Control: no-store` is applied by the
 * access service; a 409 is returned when the same idempotency key is reused
 * with different input.
 */

import { defineEventHandler, setResponseStatus } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { parseBrowserMutation } from '../../../../mcp/oauth/admin/mutation-context'
import { OAuthApplicationCreationService } from '../../../../mcp/oauth/admin/application-creation-service'
import { getOAuthAdminRepository } from '../../../../mcp/oauth/admin/index'
import { OAUTH_CAPABILITIES, type OAuthCreateApplicationRequest } from '#shared/types/oauth-administration'

registerEndpoint('/api/admin/oauth/applications', 'POST', {
  summary: 'Create a native public OAuth application',
  description:
    'Creates a native public OAuth client (token_endpoint_auth_method=none, authorization code, mandatory S256 PKCE, existing refresh policy) for the current deployment and returns a 202 durable operation reference plus a non-secret result. Capability: oauth.applications.manage. Requires the X-CSRF-Token header (session-bound), a same-origin request, and an envelope with idempotencyKey + reason. Reusing an idempotency key with different input returns 409 without executing. Cache-Control: no-store. Sensitive-field exclusions: the response NEVER includes a client secret or a registration access token — a native public client has neither.',
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
          required: ['idempotencyKey', 'reason', 'name', 'ownership', 'redirectUris', 'permittedResources', 'permittedScopes'],
          properties: {
            idempotencyKey: { type: 'string', description: 'Client-generated idempotency key; reuse with different input is rejected.' },
            reason: { type: 'string', description: 'Required audited reason for the creation.' },
            name: { type: 'string', description: 'Human-readable application name.' },
            ownership: {
              type: 'object',
              required: ['owner'],
              properties: {
                owner: { type: 'string', description: 'Accountable owner (metadata, not a permission grant).' },
                team: { type: 'string' },
                purpose: { type: 'string' }
              }
            },
            redirectUris: { type: 'array', items: { type: 'string' }, description: 'At least one redirect URI; wildcards and unsupported schemes are rejected; native loopback is preserved.' },
            permittedResources: { type: 'array', items: { type: 'string' }, description: 'Subset of the deployment configured resources.' },
            permittedScopes: { type: 'array', items: { type: 'string' }, description: 'Subset of the deployment supported scopes.' }
          }
        }
      }
    }
  },
  responses: {
    202: {
      description: 'The creation operation was accepted; returns the operation reference and a non-secret result.',
      content: {
        'application/json': {
          example: {
            success: true,
            data: {
              operationId: 'op_…',
              state: 'completed',
              result: {
                clientId: 'ghost_…',
                clientRegistration: { type: 'native-public', authMethod: 'none', pkce: 'S256' },
                redirectUris: ['http://127.0.0.1:8765/callback'],
                permittedResources: ['https://…/mcp'],
                permittedScopes: ['openid', 'offline_access'],
                instructions: { clientId: 'ghost_…', usePkce: true }
              }
            },
            metadata: { timestamp: '2026-01-01T00:00:00.000Z' }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' },
    409: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // 1. Administrator + applications-manage capability, deployment-bound.
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.APPLICATIONS_MANAGE)

  // 2. Same-origin + session-bound CSRF + safe envelope (idempotencyKey/reason).
  const parsed = await parseBrowserMutation(event, access)
  const body = parsed.body as Record<string, unknown>

  // 3. Read ONLY the documented create fields from the body. Anything else is
  //    ignored so a spoofed field cannot reach the provider. The service does
  //    the authoritative validation/normalization.
  const ownership = (body.ownership && typeof body.ownership === 'object')
    ? (body.ownership as Record<string, unknown>)
    : {}
  const request: OAuthCreateApplicationRequest = {
    csrfToken: parsed.envelope.csrfToken,
    idempotencyKey: parsed.envelope.idempotencyKey,
    reason: parsed.envelope.reason,
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

  // 4. Run the idempotent, revision-safe creation operation.
  const service = new OAuthApplicationCreationService(getOAuthAdminRepository())
  const { operation, result } = await service.createApplication(access, request)

  // 5. Return 202 with the operation reference and the non-secret result.
  const payload = sendSuccess(event, {
    operationId: operation.operationId,
    state: operation.state,
    result
  }, { deployment: access.deployment.environment })
  setResponseStatus(event, 202)
  return payload
}))
