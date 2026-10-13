/**
 * OAuth Administration — application-creation validation, operation execution,
 * and safe native public-client registration.
 *
 * This is the `application.create` action-specific layer that plugs its
 * `runEffect` into {@link OAuthAdminOperationService.run} (design "Managed
 * policy and operation flow"; component table `OAuthAdminOperationService`).
 * The operation service owns the durable, idempotent, revision-checked, audited
 * lifecycle; this module owns only:
 *
 *   1. Validation + normalization of the create request (Req 6.1, 6.3).
 *   2. Building the native public client metadata the provider supports
 *      (Req 6.2).
 *   3. Registering the client through a SUPPORTED provider path (Req 6.3, 6.5).
 *   4. Upserting the managed application projection and returning a NON-SECRET
 *      result with integration instructions (Req 6.4, 6.6).
 *
 * SAFETY / provider profile (design provider finding row — "supports only the
 * existing native public client profile. Management never invents a secret or
 * assumes an unsupported `Client.add` method."):
 *   - The provider is configured for native public clients:
 *     `token_endpoint_auth_method=none`, grant types authorization_code +
 *     refresh_token, response type `code`, mandatory S256 PKCE, opaque tokens,
 *     non-rotating native refresh. This service builds ONLY that profile and
 *     never emits/derives a `client_secret` (Req 6.2, 6.6).
 *   - Registration uses the SUPPORTED path `add_client.js` uses internally:
 *     `new provider.Client(metadata)` (which runs the provider's own metadata
 *     validation and REJECTS unsupported metadata — Req 6.3) followed by
 *     `provider.Client.adapter.upsert(clientId, client.metadata())` through the
 *     same adapter the provider reads clients from. We do NOT invent a
 *     `Client.add` static (it does not exist on the Provider instance).
 *   - A STABLE `client_id` is reserved BEFORE the provider write and reused on
 *     an idempotent retry, so a retry can never create a second client
 *     (Req 6.5, 13.5). The reserved id is recorded on the operation's
 *     `targetReferences`.
 *   - `permittedResources`/`permittedScopes` are administration policy (a read
 *     model), NOT standard `oidc-provider` client metadata; they are validated
 *     against the deployment's configured resources/scopes and stored on the
 *     managed projection, never pushed as unrecognized provider metadata.
 */

import { randomBytes } from 'node:crypto'
import type Provider from 'oidc-provider'
import type {
  OAuthApplicationDetail,
  OAuthCreateApplicationRequest,
  OAuthDeploymentContext,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRepository } from './types'
import { oauthAdminErrors } from './access-service'
import { oauthAdminRedactor } from './redactor'
import {
  OAuthAdminOperationService,
  computeRequestFingerprint,
  type EffectOutcome
} from './operation-service'
import { redirectsAllowLoopback } from './projection-mappers'
import { getOAuthProvider } from '../provider'
import { GHOST_MCP_SCOPES } from '../../types'
import { getGhostBaseUrl, getMcpResourceUrl } from '../../config'
import { getKiroCrewResourceUrl } from '../../../kirocrew/config'
import { KIROCREW_SCOPES } from '../../../kirocrew/types'

/** Maximum accepted length for a human-supplied free-text field. */
const MAX_TEXT_LENGTH = 200
/** Bounds on the collections a single create may register. */
const MAX_REDIRECT_URIS = 10
const MAX_RESOURCES = 8
const MAX_SCOPES = 32

/** Redirect URI schemes a native public client may register. */
const ALLOWED_REDIRECT_SCHEMES = new Set(['https:', 'http:'])

/**
 * The normalized, validated create input. Produced by
 * {@link validateCreateApplicationRequest} and consumed by both the fingerprint
 * (so an idempotent retry is stable) and the provider effect.
 */
export interface NormalizedCreateApplication {
  name: string
  ownership: { owner: string, team?: string, purpose?: string }
  redirectUris: string[]
  permittedResources: string[]
  permittedScopes: string[]
  allowsLoopback: boolean
}

/**
 * The non-secret result returned to the browser after a successful creation.
 * EXCLUDES any client secret and any registration access token (Req 6.6).
 */
export interface CreateApplicationResult {
  clientId: OpaqueReference
  /**
   * Native public client profile echoed for confirmation (no secret material).
   * NOTE: this field is intentionally NOT named `profile` because the redactor
   * denylist drops any key containing `profile`; `clientRegistration` carries
   * the same confirmation without being scrubbed.
   */
  clientRegistration: {
    type: 'native-public'
    /** `token_endpoint_auth_method` value; named to avoid the redactor denylist. */
    authMethod: 'none'
    grantTypes: string[]
    responseTypes: string[]
    pkce: 'S256'
    /** Whether refresh credentials rotate; named to avoid the redactor denylist. */
    refreshRotation: boolean
  }
  redirectUris: string[]
  permittedResources: string[]
  permittedScopes: string[]
  /** Human-readable, non-secret integration instructions. */
  instructions: OAuthIntegrationInstructions
}

/** Safe, non-secret integration guidance rendered next to the created client. */
export interface OAuthIntegrationInstructions {
  clientId: OpaqueReference
  /** Authorization endpoint URL; named to avoid the redactor denylist. */
  authorizeUrl: string
  /** Token endpoint URL; named to avoid the redactor denylist. */
  exchangeUrl: string
  redirectUris: string[]
  usePkce: true
  pkceMethod: 'S256'
  /** `token_endpoint_auth_method` value; named to avoid the redactor denylist. */
  authMethod: 'none'
  scopes: string[]
  resources: string[]
  notes: string[]
}

/**
 * The deployment's supported resources and scopes, mirroring the provider
 * configuration exactly (two resources — MCP + KiroCrew — and the union of
 * their scopes plus `openid`/`offline_access`). Kept as a function so it reads
 * the same runtime configuration the provider was built from.
 */
export function getSupportedResourcesAndScopes(): { resources: string[], scopes: string[] } {
  const mcpResource = getMcpResourceUrl().href
  const kiroCrewResource = getKiroCrewResourceUrl().href
  const resourceScopes = [...new Set([...GHOST_MCP_SCOPES, ...KIROCREW_SCOPES])]
  const scopes = [...new Set(['openid', 'offline_access', ...resourceScopes])]
  return { resources: [mcpResource, kiroCrewResource], scopes }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw oauthAdminErrors.badRequest({ message: `Missing required field: ${field}`, data: { field } })
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw oauthAdminErrors.badRequest({ message: `Field must not be empty: ${field}`, data: { field } })
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw oauthAdminErrors.badRequest({ message: `Field is too long: ${field}`, data: { field } })
  }
  return trimmed
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requireText(value, field)
}

/**
 * Validate & normalize a single redirect URI for a native public client.
 * Rejects wildcards, unsupported schemes, and malformed URIs; PRESERVES native
 * loopback addresses (127.0.0.1 / ::1 / localhost) which the native public
 * profile requires (Req 6.2/6.3).
 */
function normalizeRedirectUri(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw oauthAdminErrors.badRequest({
      message: 'Redirect URI must be a non-empty string',
      data: { reason: 'INVALID_REDIRECT' }
    })
  }
  const uri = raw.trim()
  // A wildcard redirect is never acceptable (open-redirect / token exfiltration).
  if (uri.includes('*')) {
    throw oauthAdminErrors.badRequest({
      message: 'Wildcard redirect URIs are not permitted',
      data: { reason: 'WILDCARD_REDIRECT', redirectUri: uri }
    })
  }
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw oauthAdminErrors.badRequest({
      message: 'Redirect URI is not a valid absolute URI',
      data: { reason: 'MALFORMED_REDIRECT', redirectUri: uri }
    })
  }
  // Reject unsupported schemes (e.g. `javascript:`, `data:`, `ftp:`). Loopback
  // http/https is preserved by the scheme allowlist below.
  if (!ALLOWED_REDIRECT_SCHEMES.has(parsed.protocol)) {
    throw oauthAdminErrors.badRequest({
      message: `Unsupported redirect URI scheme: ${parsed.protocol}`,
      data: { reason: 'UNSUPPORTED_SCHEME', redirectUri: uri }
    })
  }
  // A URL fragment is not permitted on an OAuth redirect URI.
  if (parsed.hash) {
    throw oauthAdminErrors.badRequest({
      message: 'Redirect URI must not contain a fragment',
      data: { reason: 'REDIRECT_FRAGMENT', redirectUri: uri }
    })
  }
  return parsed.href
}

/**
 * Validate & normalize the create request. Enforces (Req 6.1, 6.3):
 *   - Required accountable owner + application name.
 *   - Redirect URIs: at least one, bounded count, wildcard/scheme/format
 *     rejection, loopback preserved.
 *   - Requested resources are a subset of the deployment's configured resources.
 *   - Requested scopes are a subset of the deployment's supported scope set.
 *
 * Rejects unauthorized resources / unsupported scopes / unsafe metadata before
 * any provider effect runs.
 */
export function validateCreateApplicationRequest(
  request: OAuthCreateApplicationRequest
): NormalizedCreateApplication {
  const name = requireText(request.name, 'name')
  const ownership = request.ownership || {}
  // Accountable owner is mandatory; team/purpose are optional accountable
  // metadata (never a permission grant).
  const owner = requireText(ownership.owner, 'ownership.owner')
  const team = optionalText(ownership.team, 'ownership.team')
  const purpose = optionalText(ownership.purpose, 'ownership.purpose')

  const rawRedirects = Array.isArray(request.redirectUris) ? request.redirectUris : []
  if (rawRedirects.length === 0) {
    throw oauthAdminErrors.badRequest({
      message: 'At least one redirect URI is required',
      data: { reason: 'REDIRECT_REQUIRED' }
    })
  }
  if (rawRedirects.length > MAX_REDIRECT_URIS) {
    throw oauthAdminErrors.badRequest({
      message: 'Too many redirect URIs',
      data: { reason: 'TOO_MANY_REDIRECTS' }
    })
  }
  // Normalize + de-duplicate while preserving order.
  const redirectUris = [...new Set(rawRedirects.map(normalizeRedirectUri))]

  const { resources: supportedResources, scopes: supportedScopes } = getSupportedResourcesAndScopes()

  const rawResources = Array.isArray(request.permittedResources) ? request.permittedResources : []
  if (rawResources.length === 0) {
    throw oauthAdminErrors.badRequest({
      message: 'At least one permitted resource is required',
      data: { reason: 'RESOURCE_REQUIRED' }
    })
  }
  if (rawResources.length > MAX_RESOURCES) {
    throw oauthAdminErrors.badRequest({ message: 'Too many resources', data: { reason: 'TOO_MANY_RESOURCES' } })
  }
  const permittedResources = [...new Set(rawResources.map(entry => String(entry)))]
  for (const resource of permittedResources) {
    if (!supportedResources.includes(resource)) {
      // An unauthorized resource is rejected before any provider effect (Req 6.3).
      throw oauthAdminErrors.badRequest({
        message: 'Requested resource is not configured for this deployment',
        data: { reason: 'UNAUTHORIZED_RESOURCE', resource }
      })
    }
  }

  const rawScopes = Array.isArray(request.permittedScopes) ? request.permittedScopes : []
  if (rawScopes.length === 0) {
    throw oauthAdminErrors.badRequest({
      message: 'At least one permitted scope is required',
      data: { reason: 'SCOPE_REQUIRED' }
    })
  }
  if (rawScopes.length > MAX_SCOPES) {
    throw oauthAdminErrors.badRequest({ message: 'Too many scopes', data: { reason: 'TOO_MANY_SCOPES' } })
  }
  const permittedScopes = [...new Set(rawScopes.map(entry => String(entry)))]
  for (const scope of permittedScopes) {
    if (!supportedScopes.includes(scope)) {
      // An unsupported scope is rejected before any provider effect (Req 6.3).
      throw oauthAdminErrors.badRequest({
        message: 'Requested scope is not supported by this deployment',
        data: { reason: 'UNSUPPORTED_SCOPE', scope }
      })
    }
  }

  return {
    name,
    ownership: { owner, ...(team ? { team } : {}), ...(purpose ? { purpose } : {}) },
    redirectUris,
    permittedResources,
    permittedScopes,
    allowsLoopback: redirectsAllowLoopback(redirectUris)
  }
}

/**
 * Build the native public client metadata the provider supports (Req 6.2).
 * The `client_id` is preset so the operation service can reserve a stable id
 * before the write and reuse it on a retry. NEVER includes a `client_secret`
 * (the `none` auth method needs no secret).
 */
export function buildNativeClientMetadata(
  clientId: OpaqueReference,
  normalized: NormalizedCreateApplication
): Record<string, unknown> {
  return {
    client_id: clientId,
    client_name: normalized.name,
    application_type: 'native',
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    redirect_uris: normalized.redirectUris,
    // The provider enforces S256 PKCE globally; scope is advertised on the
    // client for discovery. Resources are per-request indicators, not client
    // metadata, so they are NOT set here.
    scope: normalized.permittedScopes.join(' ')
  }
}

/**
 * Generate a fresh, opaque, URL-safe client id. Deliberately not derived from
 * the request so two different requests never collide; stability across a retry
 * is provided by the operation service reserving this id on the operation's
 * target references and reusing it.
 */
export function generateClientId(): OpaqueReference {
  return `ghost_${randomBytes(18).toString('base64url')}`
}

/** Build the non-secret integration instructions for the created client. */
function buildInstructions(
  clientId: OpaqueReference,
  normalized: NormalizedCreateApplication
): OAuthIntegrationInstructions {
  const issuer = getGhostBaseUrl().origin
  return {
    clientId,
    authorizeUrl: `${issuer}/oauth/authorize`,
    exchangeUrl: `${issuer}/oauth/token`,
    redirectUris: normalized.redirectUris,
    usePkce: true,
    pkceMethod: 'S256',
    authMethod: 'none',
    scopes: normalized.permittedScopes,
    resources: normalized.permittedResources,
    notes: [
      'This is a native public client and uses no confidential credential.',
      'Every authorization request must use PKCE with the S256 code challenge method.',
      'Refresh tokens are long-lived and non-rotating for the native public profile.'
    ]
  }
}

/**
 * Register the native public client through the SUPPORTED provider path.
 *
 * Mirrors `oidc-provider`'s own `add_client` helper: construct
 * `new provider.Client(metadata)` (running the provider's metadata validation,
 * which rejects unsupported metadata — Req 6.3) then persist the canonical
 * `client.metadata()` through the same adapter the provider reads clients from
 * (`provider.Client.adapter.upsert`). The preset `client_id` is preserved so
 * the reserved id is the created id.
 *
 * An unsupported/invalid metadata shape throws the provider's own
 * `InvalidClientMetadata`; the operation service records it as a safe failure.
 */
export async function registerNativeClientWithProvider(
  provider: Provider,
  metadata: Record<string, unknown>
): Promise<OpaqueReference> {
  // Provider-driven validation. The Client constructor runs the client schema
  // and rejects unsupported metadata (unknown auth method, disallowed grant/
  // response types, malformed redirect URIs, secret-requiring methods, ...).
  const ClientModel = provider.Client as unknown as {
    new (metadata: Record<string, unknown>): { clientId: string, metadata(): Record<string, unknown> }
    adapter: { upsert(id: string, payload: Record<string, unknown>): Promise<void> }
  }
  const client = new ClientModel(metadata)
  // Persist the canonical provider metadata through the provider's own adapter
  // (the same DynamoOidcAdapter the provider uses in durable mode). This is the
  // supported storage path used by add_client.js.
  await ClientModel.adapter.upsert(client.clientId, client.metadata())
  return client.clientId
}

/**
 * The application-creation service. Wires the `application.create` operation
 * type through {@link OAuthAdminOperationService.run}, supplying the provider
 * registration effect and the managed projection upsert.
 */
export class OAuthApplicationCreationService {
  constructor(
    private readonly repository: OAuthAdminRepository,
    private readonly operations: OAuthAdminOperationService = new OAuthAdminOperationService(repository),
    /** Injected provider accessor so tests can supply a stub provider. */
    private readonly providerAccessor: () => Promise<Provider> = getOAuthProvider,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Validate, reserve, register, and project a new native public client.
   * Returns the reconciled managed application detail plus a non-secret result.
   *
   * The stable client id is generated once and reserved on the operation's
   * target references BEFORE the provider write, so an idempotent retry (same
   * scoped idempotency key + fingerprint) returns the original operation
   * without registering a second client (Req 6.5, 13.5).
   */
  async createApplication(
    access: OAuthAdminAccessContext,
    request: OAuthCreateApplicationRequest
  ): Promise<{ operation: Awaited<ReturnType<OAuthAdminOperationService['run']>>, result?: CreateApplicationResult }> {
    // 1. Validate + normalize before any durable/provider effect (Req 6.1/6.3).
    const normalized = validateCreateApplicationRequest(request)

    // 2. Reserve a stable client id up front. This id is the operation target,
    //    so a reconciled retry reuses it rather than allocating a second client.
    const clientId = generateClientId()
    const requestFingerprint = computeRequestFingerprint('application.create', normalized)

    const operation = await this.operations.run(
      access,
      {
        type: 'application.create',
        idempotencyKey: request.idempotencyKey,
        requestFingerprint,
        // Stable target reserved before the provider write (Req 13.5).
        targetReferences: [clientId],
        reason: request.reason
      },
      async (op): Promise<EffectOutcome> => {
        // The reserved client id is the operation's first target reference. On a
        // reconciled/interrupted run this is the SAME id, so re-registration is
        // idempotent (the adapter upsert is a conditional-free overwrite of the
        // same record) and never creates a second client.
        const reservedClientId = String(op.targetReferences[0] ?? clientId)
        const provider = await this.providerAccessor()
        const metadata = buildNativeClientMetadata(reservedClientId, normalized)

        // 3. Register through the supported provider path (Req 6.2/6.3).
        const createdId = await registerNativeClientWithProvider(provider, metadata)

        // 4. Upsert the managed projection. A newly created admin app is
        //    `managed` origin and `active` lifecycle (design "Managed policy
        //    and operation flow").
        const detail = this.buildManagedProjection(access.deployment, createdId, normalized)
        await this.repository.upsertApplication(access.deployment, detail)

        // 5. Return a NON-SECRET result (Req 6.6): the redactor strips any
        //    accidental secret/token before persistence.
        const result: CreateApplicationResult = {
          clientId: createdId,
          clientRegistration: {
            type: 'native-public',
            authMethod: 'none',
            grantTypes: ['authorization_code', 'refresh_token'],
            responseTypes: ['code'],
            pkce: 'S256',
            refreshRotation: false
          },
          redirectUris: normalized.redirectUris,
          permittedResources: normalized.permittedResources,
          permittedScopes: normalized.permittedScopes,
          instructions: buildInstructions(createdId, normalized)
        }

        return {
          state: 'completed',
          result: result as unknown as Record<string, unknown>,
          changedFields: ['clientId', 'name', 'redirectUris', 'permittedResources', 'permittedScopes'],
          after: {
            clientId: createdId,
            name: normalized.name,
            redirectUris: normalized.redirectUris,
            permittedResources: normalized.permittedResources,
            permittedScopes: normalized.permittedScopes
          }
        }
      }
    )

    // The persisted operation result is already redacted; return it as the safe
    // non-secret result for the caller/route.
    const result = operation.result
      ? (oauthAdminRedactor.redact(operation.result) as unknown as CreateApplicationResult)
      : undefined
    return { operation, result }
  }

  /**
   * Build the managed application detail projection for a freshly created
   * native public client. Origin `managed`, lifecycle `active`; the revision
   * anchors later optimistic-concurrency edits.
   */
  private buildManagedProjection(
    ctx: OAuthDeploymentContext,
    clientId: OpaqueReference,
    normalized: NormalizedCreateApplication
  ): OAuthApplicationDetail {
    const collectedAt = new Date(this.now()).toISOString()
    return {
      clientId,
      name: normalized.name,
      type: 'native-public',
      origin: 'managed',
      ownership: normalized.ownership,
      lifecycle: 'active',
      createdAt: collectedAt,
      observedUse: undefined,
      redirectPolicy: {
        redirectUris: normalized.redirectUris,
        allowsLoopback: normalized.allowsLoopback
      },
      permittedResources: normalized.permittedResources,
      permittedScopes: normalized.permittedScopes,
      revision: collectedAt,
      updatedAt: collectedAt,
      metadata: { coverage: 'complete', freshness: 'fresh', availability: 'available', collectedAt }
    }
  }
}
