/**
 * Feature: oauth-administration — task 7.2 native public-client creation.
 *
 * Focused unit tests for application-creation validation, the native public
 * client metadata profile, safe provider registration, and idempotent creation
 * against the in-memory repository fixture. Covers:
 *   - Validation rejects wildcard redirect / unsupported scheme / unauthorized
 *     resource / unsupported scope; loopback is accepted.
 *   - Built metadata is the native public profile: `none` auth, code response,
 *     authorization_code + refresh_token grants, and no client secret.
 *   - The real provider accepts the built profile (S256 PKCE) and rejects a
 *     secret-bearing / confidential profile.
 *   - An idempotent retry reuses the reserved client id and never registers a
 *     second client.
 *   - The returned result excludes any registration token / client secret.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPair, exportJWK } from 'jose'
import Provider from 'oidc-provider'
import type { OAuthCreateApplicationRequest, OAuthDeploymentContext } from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import type { OAuthAdminAccessContext } from '../../server/mcp/oauth/admin/types'
import {
  OAuthApplicationCreationService,
  validateCreateApplicationRequest,
  buildNativeClientMetadata,
  getSupportedResourcesAndScopes,
  generateClientId
} from '../../server/mcp/oauth/admin/application-creation-service'
import { createGhostOAuthConfiguration } from '../../server/mcp/oauth/provider'
import { GHOST_MCP_SCOPES } from '../../server/mcp/types'

// Deterministic runtime configuration for the resource/scope derivation and
// instruction endpoints. Config helpers read process.env lazily per call.
process.env.GHOST_MCP_BASE_URL = 'https://ghost.example.test'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

function accessWith(actor = 'act_test'): OAuthAdminAccessContext {
  return { deployment: ctx, actor, capabilities: ['oauth.applications.manage'] }
}

const { resources: SUPPORTED_RESOURCES } = getSupportedResourcesAndScopes()

function baseRequest(overrides: Partial<OAuthCreateApplicationRequest> = {}): OAuthCreateApplicationRequest {
  return {
    csrfToken: 'csrf',
    idempotencyKey: 'idem-create-1',
    reason: 'register integration client',
    name: 'Team Integration',
    ownership: { owner: 'ada@example.test', team: 'Platform', purpose: 'CI automation' },
    redirectUris: ['https://app.example.test/callback'],
    permittedResources: [SUPPORTED_RESOURCES[0]!],
    permittedScopes: [GHOST_MCP_SCOPES[0]!],
    ...overrides
  }
}

// --- Validation ------------------------------------------------------------

test('validation rejects a wildcard redirect URI', () => {
  assert.throws(
    () => validateCreateApplicationRequest(baseRequest({ redirectUris: ['https://*.example.test/cb'] })),
    (error: any) => error?.statusCode === 400 && error?.data?.reason === 'WILDCARD_REDIRECT'
  )
})

test('validation rejects an unsupported redirect scheme', () => {
  assert.throws(
    () => validateCreateApplicationRequest(baseRequest({ redirectUris: ['javascript:alert(1)'] })),
    (error: any) => error?.statusCode === 400 && error?.data?.reason === 'UNSUPPORTED_SCHEME'
  )
})

test('validation rejects an unauthorized resource', () => {
  assert.throws(
    () => validateCreateApplicationRequest(baseRequest({ permittedResources: ['https://evil.example.com/api'] })),
    (error: any) => error?.statusCode === 400 && error?.data?.reason === 'UNAUTHORIZED_RESOURCE'
  )
})

test('validation rejects an unsupported scope', () => {
  assert.throws(
    () => validateCreateApplicationRequest(baseRequest({ permittedScopes: ['ghost.superuser'] })),
    (error: any) => error?.statusCode === 400 && error?.data?.reason === 'UNSUPPORTED_SCOPE'
  )
})

test('validation requires an accountable owner and a name', () => {
  assert.throws(
    () => validateCreateApplicationRequest(baseRequest({ ownership: { owner: '' } as any })),
    (error: any) => error?.statusCode === 400
  )
  assert.throws(
    () => validateCreateApplicationRequest(baseRequest({ name: '   ' })),
    (error: any) => error?.statusCode === 400
  )
})

test('validation preserves native loopback redirect URIs', () => {
  const normalized = validateCreateApplicationRequest(baseRequest({
    redirectUris: ['http://127.0.0.1:8976/callback', 'http://localhost:1234/cb']
  }))
  assert.equal(normalized.allowsLoopback, true)
  assert.equal(normalized.redirectUris.length, 2)
})

// --- Native public metadata profile ----------------------------------------

test('built metadata is the native public profile with no client secret', () => {
  const normalized = validateCreateApplicationRequest(baseRequest())
  const metadata = buildNativeClientMetadata('ghost_client_1', normalized)
  assert.equal(metadata.token_endpoint_auth_method, 'none')
  assert.deepEqual(metadata.response_types, ['code'])
  assert.deepEqual(metadata.grant_types, ['authorization_code', 'refresh_token'])
  assert.equal(metadata.application_type, 'native')
  assert.equal(metadata.client_id, 'ghost_client_1')
  // No secret material of any kind is present.
  assert.equal('client_secret' in metadata, false)
  assert.equal(JSON.stringify(metadata).includes('secret'), false)
})

// --- Real provider validation of the built profile -------------------------

async function makeRealProvider(): Promise<Provider> {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(privateKey)
  jwk.kid = 'test-key'
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  const store = new Map<string, Record<string, any>>()
  class MemoryAdapter {
    constructor(private readonly model: string) {}
    private key(id: string) { return `${this.model}#${id}` }
    async upsert(id: string, payload: Record<string, any>) { store.set(this.key(id), payload) }
    async find(id: string) { return store.get(this.key(id)) }
    async findByUserCode() { return undefined }
    async findByUid() { return undefined }
    async consume() {}
    async destroy(id: string) { store.delete(this.key(id)) }
    async revokeByGrantId() {}
  }
  const configuration = createGhostOAuthConfiguration({
    resources: [{ resource: 'https://ghost.example.test/mcp', scopes: GHOST_MCP_SCOPES }],
    jwks: { keys: [jwk] },
    adapter: MemoryAdapter as any
  })
  return new Provider('https://ghost.example.test', configuration)
}

test('the real provider accepts the built native public profile', async () => {
  const provider = await makeRealProvider()
  const normalized = validateCreateApplicationRequest(baseRequest())
  const metadata = buildNativeClientMetadata('ghost_real_1', normalized)
  const ClientModel = provider.Client as any
  const client = new ClientModel(metadata)
  assert.equal(client.clientId, 'ghost_real_1')
  assert.equal(client.tokenEndpointAuthMethod, 'none')
  assert.equal(client.clientAuthMethod, 'none')
  // A native public client has no secret.
  assert.ok(!client.clientSecret)
})

test('the real provider rejects a confidential / secret-requiring profile', async () => {
  const provider = await makeRealProvider()
  const ClientModel = provider.Client as any
  // client_secret_basic requires a secret and is not in the supported auth methods.
  assert.throws(() => new ClientModel({
    client_id: 'ghost_bad_1',
    application_type: 'native',
    token_endpoint_auth_method: 'client_secret_basic',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    redirect_uris: ['https://app.example.test/callback']
  }))
})

// --- End-to-end creation with a stub provider ------------------------------

/**
 * A stub provider that records how many clients were registered and preserves
 * the preset client_id, so we can prove idempotent retries never register a
 * second client without needing a real DynamoDB adapter.
 */
function makeStubProvider() {
  const registrations: Array<{ clientId: string, metadata: Record<string, any> }> = []
  const upsertedIds: string[] = []
  const ClientModel: any = class {
    clientId: string
    private readonly raw: Record<string, any>
    constructor(metadata: Record<string, any>) {
      this.clientId = String(metadata.client_id)
      this.raw = metadata
      registrations.push({ clientId: this.clientId, metadata })
    }
    metadata() { return this.raw }
    static adapter = {
      async upsert(id: string, _payload: Record<string, any>) { upsertedIds.push(id) }
    }
  }
  const provider = { Client: ClientModel } as unknown as Provider
  return { provider, registrations, upsertedIds }
}

test('createApplication registers once and projects a managed native client', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { provider, registrations, upsertedIds } = makeStubProvider()
  const service = new OAuthApplicationCreationService(repository, undefined, async () => provider)
  const access = accessWith()

  const { operation, result } = await service.createApplication(access, baseRequest())
  assert.equal(operation.state, 'completed')
  assert.equal(registrations.length, 1)
  assert.equal(upsertedIds.length, 1)
  assert.ok(result)
  assert.equal(result?.clientRegistration.authMethod, 'none')
  assert.equal(result?.clientRegistration.pkce, 'S256')
  assert.equal(result?.clientRegistration.refreshRotation, false)
  // The redactor must not have stripped the safe confirmation fields.
  assert.equal(result?.instructions.authMethod, 'none')
  assert.ok(result?.instructions.exchangeUrl.endsWith('/oauth/token'))

  // The managed projection was written with origin managed + lifecycle active.
  const detail = await repository.getApplication(ctx, result!.clientId)
  assert.ok(detail)
  assert.equal(detail?.origin, 'managed')
  assert.equal(detail?.lifecycle, 'active')
  assert.equal(detail?.type, 'native-public')
  assert.deepEqual(detail?.permittedScopes, [GHOST_MCP_SCOPES[0]])
})

test('an idempotent retry reuses the reserved client id and never registers a second client', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { provider, registrations } = makeStubProvider()
  const service = new OAuthApplicationCreationService(repository, undefined, async () => provider)
  const access = accessWith()
  const request = baseRequest({ idempotencyKey: 'idem-retry-1' })

  const first = await service.createApplication(access, request)
  const second = await service.createApplication(access, request)

  assert.equal(registrations.length, 1)
  assert.equal(first.operation.operationId, second.operation.operationId)
  // Both surface the same reserved client id.
  assert.equal(first.result?.clientId, second.result?.clientId)
})

test('the creation result excludes any registration token or client secret', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { provider } = makeStubProvider()
  const service = new OAuthApplicationCreationService(repository, undefined, async () => provider)
  const access = accessWith()

  const { result } = await service.createApplication(access, baseRequest({ idempotencyKey: 'idem-safe-1' }))
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes('registration_access_token'), false)
  assert.equal(serialized.includes('client_secret'), false)
  assert.equal(serialized.toLowerCase().includes('secret'), false)
  assert.equal(serialized.toLowerCase().includes('bearer'), false)
})

test('generateClientId produces distinct opaque ids', () => {
  const a = generateClientId()
  const b = generateClientId()
  assert.notEqual(a, b)
  assert.match(a, /^ghost_/)
})
