/**
 * Ghostv2 unit tests for the versioned Collaboration_API (task 9.1).
 *
 * These verify the API-layer rules the Nitro routes / Zod schemas / collaboration
 * services own under `/api/kirocrew/v1/collaboration`:
 *  - the 128 KiB JSON body limit is enforced BEFORE domain parsing
 *    (Requirement 11.4);
 *  - every denial serializes to the one safe, consistent `ErrorEnvelope` with a
 *    non-disclosing message and the correct HTTP status (Requirement 19.10,
 *    24.2);
 *  - paginated reads default to 50 and clamp to 200 (Requirement 19.3);
 *  - each route reauthorizes its exact operation through the identity gate
 *    (Opaque_Access_Token via the existing GHOST_Token_Identity_Path) and the
 *    current Team_Space gate, including creation lookup, presence subjects,
 *    pages, and content (Requirement 4.11, 15.2, 15.11, 19.1-19.12, 21.1);
 *  - mutations return the accepted Operation_ID and applicable
 *    Server_Sequence / Revision (Requirement 19.11).
 *
 * The tests drive the exact `RouteHandler`s the Nitro `.ts` files run, over
 * in-memory read/write ports and a fake GHOST identity path, so no server,
 * DynamoDB, or Graph is required.
 *
 * Feature: shared-investigations (task 9.1).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_JSON_BODY_BYTES,
  enforceJsonBodyLimit,
  toErrorEnvelope,
  httpStatusFor,
  parsePageSize,
  CollaborationPresenceService,
  InMemoryPresenceStore
} from '../../server/kirocrew/collaboration/api-support.ts'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors.ts'
import {
  createCollaborationRuntime,
  handleRoute,
  type CollaborationReadPort,
  type CollaborationWritePort,
  type RawRequest,
  type RouteHandler
} from '../../server/kirocrew/collaboration/api-runtime.ts'
import {
  createInvestigation,
  deleteInvestigation,
  getInvestigation,
  listInvestigations,
  listSpaces,
  queryPresence,
  renewPresence,
  resolveCreationOperation,
  creationPayloadHash
} from '../../server/kirocrew/collaboration/api-handlers.ts'
import type { AdminDeletionPort } from '../../server/kirocrew/collaboration/api-runtime.ts'
import type { AdminAuthorizationResolver } from '../../server/kirocrew/collaboration/authorizer.ts'
import { TeamSpaceAuthorizer } from '../../server/kirocrew/collaboration/team-space-authorizer.ts'
import { CollaborationFeedService, FeedCursorCodec, InMemoryChangeFeedStore } from '../../server/kirocrew/collaboration/change-feed.ts'
import { ArtifactService, InMemoryArtifactManifestStore } from '../../server/kirocrew/collaboration/artifact-service.ts'
import type { CollaborationSection } from '../../server/kirocrew/collaboration/profile-schema.ts'
import type { GhostTokenIdentityPath } from '../../server/kirocrew/collaboration/token-identity.ts'
import type {
  CommandContext,
  CreateInvestigationCommand,
  InvestigationAck,
  MutationAck
} from '../../server/kirocrew/collaboration/repository-types.ts'
import type { ArtifactStore } from '../../server/kirocrew/collaboration/artifact-store.ts'

// ---------------------------------------------------------------------------
// Fixtures: identity path, profile, authorizer, runtime.
// ---------------------------------------------------------------------------

const TENANT = 'tenant-A'
const SPACE = 'space-1'
const BINDING = 'binding-x'
const RESOURCE_AUDIENCE = 'https://ghost.example/api/kirocrew'
const READ_SCOPE = 'kirocrew.collaboration.read'
const WRITE_SCOPE = 'kirocrew.collaboration.write'

/** A fake GHOST_Token_Identity_Path that resolves opaque strings to stored state. */
function fakeIdentityPath(
  tokens: Record<string, { accountId: string; scopes: string[] }>,
  identities: Record<string, { oid: string; tenantId: string }>
): GhostTokenIdentityPath {
  return {
    async findAccessToken(opaque: string) {
      const t = tokens[opaque]
      if (!t) return null
      return {
        accountId: t.accountId,
        clientId: 'client-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: [RESOURCE_AUDIENCE],
        scope: t.scopes.join(' ')
      }
    },
    async findIdentity(subject: string) {
      return identities[subject] ?? null
    },
    now() {
      return Math.floor(Date.now() / 1000)
    }
  }
}

/** A minimal enabled collaboration section the authorizer reads. */
function section(spaceEnabled = true): CollaborationSection {
  return {
    schemaVersion: 1,
    enabled: true,
    tenantId: TENANT,
    teamSpaces: [
      {
        spaceId: SPACE,
        label: 'Pilot',
        enabled: spaceEnabled,
        memberGroupObjectIds: ['group-1'],
        sourceScopes: [{ bindingId: BINDING }],
        evidencePolicyId: 'policy-1',
        workflowProfileIds: ['wf-1']
      }
    ],
    sourceBindings: [] as unknown as CollaborationSection['sourceBindings'],
    evidencePolicies: [
      {
        policyId: 'policy-1',
        permittedEvidenceClasses: ['operator-file'],
        permittedMediaTypes: ['application/json'],
        maxExplicitArtifactBytes: 1024
      }
    ] as unknown as CollaborationSection['evidencePolicies'],
    workflowProfiles: [] as unknown as CollaborationSection['workflowProfiles']
  } as CollaborationSection
}

/** A trivial in-memory write port that records commands and returns acks. */
class FakeWritePort implements CollaborationWritePort {
  readonly created: CreateInvestigationCommand[] = []
  private seq = 0
  private byOperation = new Map<string, InvestigationAck>()

  async createInvestigation(_ctx: CommandContext, command: CreateInvestigationCommand): Promise<InvestigationAck> {
    const prior = this.byOperation.get(command.operationId)
    if (prior) return prior
    this.created.push(command)
    const ack: InvestigationAck = {
      operationId: command.operationId,
      investigationId: `inv-${this.created.length}`,
      revision: 0,
      acceptedServerSequence: ++this.seq
    }
    this.byOperation.set(command.operationId, ack)
    return ack
  }
  async resolveCreationOperation(_scope: unknown, operationId: string, payloadHash: string) {
    const ack = this.byOperation.get(operationId)
    if (!ack) return { status: 'unresolved' as const }
    const expected = this.hashes.get(operationId)
    if (expected && expected !== payloadHash) return { status: 'conflict' as const }
    return { status: 'resolved' as const, ack }
  }
  readonly hashes = new Map<string, string>()
  async reserveRun(_ctx: CommandContext, command: { operationId: string }): Promise<MutationAck> {
    return { operationId: command.operationId, acceptedServerSequence: ++this.seq, objectId: 'run-1' }
  }
  async patchRun(_ctx: CommandContext, command: { operationId: string }): Promise<MutationAck> {
    return { operationId: command.operationId, acceptedServerSequence: ++this.seq }
  }
  async appendEvent(_ctx: CommandContext, command: { operationId: string }): Promise<MutationAck> {
    return { operationId: command.operationId, acceptedServerSequence: ++this.seq, objectId: 'evt-1' }
  }
  async patchInvestigation(_ctx: CommandContext, command: { operationId: string }): Promise<MutationAck> {
    return { operationId: command.operationId, acceptedServerSequence: ++this.seq, revision: 1 }
  }
  async publishCheckpoint(_ctx: CommandContext, command: { operationId: string }): Promise<MutationAck> {
    return { operationId: command.operationId, acceptedServerSequence: ++this.seq, objectId: 'cp-1' }
  }
}

/** A read port returning fixed pages. */
class FakeReadPort implements CollaborationReadPort {
  async listInvestigations() {
    return { items: [{ investigationId: 'inv-1', revision: 0 }], nextCursor: undefined }
  }
  async getInvestigation() {
    return { investigationId: 'inv-1', revision: 3 }
  }
  async listEvents() {
    return { items: [], nextCursor: undefined }
  }
  async readHandoff() {
    return { selectedCheckpoint: null }
  }
  async evidencePolicyFor() {
    return { permittedMediaTypes: ['application/json' as const], maxExplicitArtifactBytes: 1024, requireRedaction: false }
  }
}

function buildRuntime(options: {
  member?: boolean
  spaceEnabled?: boolean
  presence?: CollaborationPresenceService
  admin?: AdminDeletionPort
  adminAuthorization?: AdminAuthorizationResolver
} = {}) {
  const identityPath = fakeIdentityPath(
    {
      'reader-token': { accountId: 'acct-1', scopes: [READ_SCOPE] },
      'writer-token': { accountId: 'acct-1', scopes: [READ_SCOPE, WRITE_SCOPE] },
      'config-only-token': { accountId: 'acct-1', scopes: ['kirocrew.config.read'] }
    },
    { 'acct-1': { oid: 'oid-1', tenantId: TENANT } }
  )
  // Delegation runtime whose store returns a delegation carrying a still-fresh
  // cached Graph access token, so resolution short-circuits to `available`
  // without a live token exchange.
  const delegationRuntime = {
    store: {
      async load() {
        return { delegation: { refreshToken: 'r', accessToken: 'graph-token', accessTokenExpiresAt: Date.now() + 3_600_000 }, tenantId: TENANT }
      },
      async save() { return true },
      async remove() {}
    },
    async exchangeRefreshToken() {
      return { ok: true, status: 200, access_token: 'graph-token', scope: 'GroupMember.Read.All', expires_in: 3600 }
    },
    now() { return Date.now() }
  }
  const authorizer = new TeamSpaceAuthorizer({
    resolveCurrentProfile: async () => ({ revision: 'rev-1', section: section(options.spaceEnabled ?? true) }),
    membershipQuery: { isMemberOfAny: async () => options.member ?? true },
    delegationRuntime
  })
  const feed = new CollaborationFeedService(new InMemoryChangeFeedStore(), new FeedCursorCodec('test-key'))
  const artifacts = new ArtifactService(
    { async putOnce() { return { sha256: 'x', byteCount: 0 } }, async inspect() { return { exists: false } }, async openStream() { return null } } as unknown as ArtifactStore,
    new InMemoryArtifactManifestStore()
  )
  return {
    runtime: createCollaborationRuntime({
      teamSpaceAuthorizer: authorizer,
      reads: new FakeReadPort(),
      writes: new FakeWritePort(),
      feed,
      artifacts,
      presence: options.presence ?? new CollaborationPresenceService(new InMemoryPresenceStore()),
      listSafeSpaces: async () => [{ spaceId: SPACE, label: 'Pilot', capabilities: ['read'] }],
      admin: options.admin,
      adminAuthorization: options.adminAuthorization,
      authorizeOptions: { resourceAudience: RESOURCE_AUDIENCE, identityPath }
    })
  }
}

function request(overrides: Partial<RawRequest> = {}): RawRequest {
  return {
    authorization: 'Bearer writer-token',
    rawBody: null,
    params: { space: SPACE },
    query: { __gatewayId: 'gw-1' },
    ...overrides
  }
}

async function run(handler: RouteHandler, runtime: ReturnType<typeof buildRuntime>['runtime'], req: RawRequest) {
  return handleRoute(runtime, req, handler)
}

// ---------------------------------------------------------------------------
// 128 KiB JSON body limit (before domain parsing).
// ---------------------------------------------------------------------------

test('enforceJsonBodyLimit rejects a body over 128 KiB before parsing', () => {
  const oversized = Buffer.alloc(MAX_JSON_BODY_BYTES + 1, 0x20)
  assert.throws(
    () => enforceJsonBodyLimit(oversized),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'payload_too_large'
  )
})

test('enforceJsonBodyLimit accepts a body at exactly 128 KiB and parses JSON', () => {
  const json = JSON.stringify({ a: 'b' })
  const padded = json + ' '.repeat(MAX_JSON_BODY_BYTES - Buffer.byteLength(json))
  assert.deepEqual(enforceJsonBodyLimit(padded), { a: 'b' })
})

test('enforceJsonBodyLimit maps unparsable JSON to validation_failed', () => {
  assert.throws(
    () => enforceJsonBodyLimit('{not json'),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'validation_failed'
  )
})

test('handleRoute enforces the limit before the handler runs (no runtime touched)', async () => {
  let ran = false
  const handler: RouteHandler = async () => {
    ran = true
    return { status: 200, body: {} }
  }
  const result = await handleRoute(null, request({ rawBody: Buffer.alloc(MAX_JSON_BODY_BYTES + 1) }), handler)
  assert.equal(ran, false)
  assert.equal(result.status, 413)
})

// ---------------------------------------------------------------------------
// Error envelope + status mapping.
// ---------------------------------------------------------------------------

test('toErrorEnvelope serializes only safe fields for a typed denial', () => {
  const envelope = toErrorEnvelope(
    new CollaborationAuthorizationError({ code: 'revision_conflict', safeMessage: 'reload', retryable: false, expectedRevision: 4 })
  )
  assert.deepEqual(envelope, { code: 'revision_conflict', safeMessage: 'reload', retryable: false, expectedRevision: 4 })
})

test('toErrorEnvelope collapses an unexpected error to a non-disclosing forbidden', () => {
  const envelope = toErrorEnvelope(new Error('stack with internal detail'))
  assert.equal(envelope.code, 'forbidden')
  assert.doesNotMatch(envelope.safeMessage, /internal detail/)
})

test('httpStatusFor maps codes to the documented HTTP statuses', () => {
  assert.equal(httpStatusFor('reauth_required'), 401)
  assert.equal(httpStatusFor('forbidden'), 403)
  assert.equal(httpStatusFor('not_found'), 404)
  assert.equal(httpStatusFor('conflict'), 409)
  assert.equal(httpStatusFor('revision_conflict'), 409)
  assert.equal(httpStatusFor('payload_too_large'), 413)
  assert.equal(httpStatusFor('unsupported_media_type'), 415)
  assert.equal(httpStatusFor('validation_failed'), 422)
})

// ---------------------------------------------------------------------------
// Pagination clamp.
// ---------------------------------------------------------------------------

test('parsePageSize defaults to 50 and clamps to [1, 200]', () => {
  assert.equal(parsePageSize(undefined), 50)
  assert.equal(parsePageSize('0'), 1)
  assert.equal(parsePageSize('10'), 10)
  assert.equal(parsePageSize('9999'), 200)
  assert.equal(parsePageSize('not-a-number'), 50)
})

// ---------------------------------------------------------------------------
// Route: GET /spaces (identity gate only).
// ---------------------------------------------------------------------------

test('GET /spaces returns safe space summaries for an authorized reader', async () => {
  const { runtime } = buildRuntime()
  const result = await run(listSpaces, runtime, request({ authorization: 'Bearer reader-token' }))
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { items: [{ spaceId: SPACE, label: 'Pilot', capabilities: ['read'] }] })
})

test('GET /spaces denies a config-only grant with a non-disclosing forbidden', async () => {
  const { runtime } = buildRuntime()
  const result = await run(listSpaces, runtime, request({ authorization: 'Bearer config-only-token' }))
  assert.equal(result.status, 403)
  assert.equal((result.body as { code: string }).code, 'forbidden')
})

test('GET /spaces without a bearer is reauth_required (401)', async () => {
  const { runtime } = buildRuntime()
  const result = await run(listSpaces, runtime, request({ authorization: null }))
  assert.equal(result.status, 401)
  assert.equal((result.body as { code: string }).code, 'reauth_required')
})

// ---------------------------------------------------------------------------
// Route: POST /spaces/{space}/investigations (write) + Team_Space gate.
// ---------------------------------------------------------------------------

const CREATE_BODY = {
  operationId: 'op-1',
  mode: 'default-first' as const,
  primarySubject: { sourceBindingId: BINDING, sourceType: 'jira' as const, stableSourceId: 'PROJ-1' },
  workflowProfileId: 'wf-1',
  workflowVersion: 1,
  stageId: 'triage'
}

test('POST investigations creates and returns the accepted Operation_ID + sequence', async () => {
  const { runtime } = buildRuntime()
  const result = await run(createInvestigation, runtime, request({ rawBody: JSON.stringify(CREATE_BODY) }))
  assert.equal(result.status, 201)
  const ack = result.body as InvestigationAck
  assert.equal(ack.operationId, 'op-1')
  assert.equal(ack.acceptedServerSequence, 1)
  assert.equal(ack.revision, 0)
})

test('POST investigations denies a reader (write scope required) non-disclosingly', async () => {
  const { runtime } = buildRuntime()
  const result = await run(createInvestigation, runtime, request({ authorization: 'Bearer reader-token', rawBody: JSON.stringify(CREATE_BODY) }))
  assert.equal(result.status, 403)
})

test('POST investigations fails closed when the caller is not a current member', async () => {
  const { runtime } = buildRuntime({ member: false })
  const result = await run(createInvestigation, runtime, request({ rawBody: JSON.stringify(CREATE_BODY) }))
  assert.equal(result.status, 403)
})

test('POST investigations to a disabled space is a non-disclosing not-found', async () => {
  const { runtime } = buildRuntime({ spaceEnabled: false })
  const result = await run(createInvestigation, runtime, request({ rawBody: JSON.stringify(CREATE_BODY) }))
  assert.equal(result.status, 404)
  assert.equal((result.body as { code: string }).code, 'not_found')
})

test('POST investigations rejects a malformed body as validation_failed', async () => {
  const { runtime } = buildRuntime()
  const result = await run(createInvestigation, runtime, request({ rawBody: JSON.stringify({ operationId: 'op-1' }) }))
  assert.equal(result.status, 422)
})

// ---------------------------------------------------------------------------
// Route: GET investigations (paginated read) + Route: GET one (Revision).
// ---------------------------------------------------------------------------

test('GET investigations returns a page for an authorized reader', async () => {
  const { runtime } = buildRuntime()
  const result = await run(listInvestigations, runtime, request({ authorization: 'Bearer reader-token' }))
  assert.equal(result.status, 200)
  assert.ok(Array.isArray((result.body as { items: unknown[] }).items))
})

test('GET one investigation returns strong metadata with Revision', async () => {
  const { runtime } = buildRuntime()
  const result = await run(getInvestigation, runtime, request({ authorization: 'Bearer reader-token', params: { space: SPACE, id: 'inv-1' } }))
  assert.equal(result.status, 200)
  assert.equal((result.body as { revision: number }).revision, 3)
})

// ---------------------------------------------------------------------------
// Route: creation-operation recovery (before the Investigation ID is known).
// ---------------------------------------------------------------------------

test('GET creation-operations resolves the original ack for a matching payload hash', async () => {
  const { runtime } = buildRuntime()
  // First create so the write port records the operation.
  await run(createInvestigation, runtime, request({ rawBody: JSON.stringify(CREATE_BODY) }))
  const payloadHash = creationPayloadHash(CREATE_BODY)
  const result = await run(
    resolveCreationOperation,
    runtime,
    request({ authorization: 'Bearer reader-token', params: { space: SPACE, operationId: 'op-1' }, query: { payloadHash } })
  )
  assert.equal(result.status, 200)
  assert.equal((result.body as InvestigationAck).operationId, 'op-1')
})

test('GET creation-operations is unresolved (404) before the creation commits', async () => {
  const { runtime } = buildRuntime()
  const payloadHash = creationPayloadHash(CREATE_BODY)
  const result = await run(
    resolveCreationOperation,
    runtime,
    request({ authorization: 'Bearer reader-token', params: { space: SPACE, operationId: 'never' }, query: { payloadHash } })
  )
  assert.equal(result.status, 404)
  assert.equal((result.body as { code: string }).code, 'unresolved')
})

// ---------------------------------------------------------------------------
// Presence: batch query (per-subject reauthorization) + renewal (server-time).
// ---------------------------------------------------------------------------

test('presence renew then query returns the non-expired lease by Subject_Reference', async () => {
  const store = new InMemoryPresenceStore()
  const presence = new CollaborationPresenceService(store, () => 1_000, 60_000)
  const { runtime } = buildRuntime({ presence })

  const subject = { sourceBindingId: BINDING, sourceType: 'jira' as const, stableSourceId: 'PROJ-1' }
  const renewResult = await run(
    renewPresence,
    runtime,
    request({ rawBody: JSON.stringify({ subject, activityKind: 'viewing' }) })
  )
  assert.equal(renewResult.status, 200)

  const queryResult = await run(
    queryPresence,
    runtime,
    request({ authorization: 'Bearer reader-token', rawBody: JSON.stringify({ subjects: [subject] }) })
  )
  assert.equal(queryResult.status, 200)
  const rows = (queryResult.body as { presence: unknown[] }).presence
  assert.equal(rows.length, 1)
})

test('presence query omits an expired lease using server-time expiry', async () => {
  const store = new InMemoryPresenceStore()
  let clock = 1_000
  const presence = new CollaborationPresenceService(store, () => clock, 60_000)
  const subject = { sourceBindingId: BINDING, sourceType: 'jira' as const, stableSourceId: 'PROJ-1' }
  await presence.renew({ tenantId: TENANT, spaceId: SPACE }, {
    subject,
    observer: { subjectObjectId: 'oid-1', gatewayId: 'gw-1', activityKind: 'viewing' }
  })
  clock = 1_000 + 60_001 // past expiry
  const rows = await presence.query({ tenantId: TENANT, spaceId: SPACE }, { subjects: [subject] }, () => true)
  assert.equal(rows.length, 0)
})

test('presence query omits a subject the caller is not authorized for (non-disclosing)', async () => {
  const store = new InMemoryPresenceStore()
  const presence = new CollaborationPresenceService(store, () => 1_000, 60_000)
  const subject = { sourceBindingId: BINDING, sourceType: 'jira' as const, stableSourceId: 'PROJ-1' }
  await presence.renew({ tenantId: TENANT, spaceId: SPACE }, {
    subject,
    observer: { subjectObjectId: 'oid-1', gatewayId: 'gw-1', activityKind: 'viewing' }
  })
  const rows = await presence.query({ tenantId: TENANT, spaceId: SPACE }, { subjects: [subject] }, () => false)
  assert.equal(rows.length, 0)
})

// ---------------------------------------------------------------------------
// Route: DELETE /spaces/{space}/investigations/{id}  (Administrator deletion).
//
// Verifies the task 2.4 boundary: permanent deletion is authorized as the
// conjunction of (1) collaboration object authorization and (2) separate current
// Administrator authorization, and every denial is non-disclosing
// (Requirement 4.10, 24.2, 24.25).
// ---------------------------------------------------------------------------

/** A recording admin deletion port that returns a safe, content-free ack. */
function recordingAdminPort(): AdminDeletionPort & { calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    async requestDeletion(scope) {
      calls.push(scope)
      return { investigationId: scope.investigationId, acceptedServerSequence: 42 }
    }
  }
}

const DELETE_REQUEST = { params: { space: SPACE, id: 'inv-1' } }

test('DELETE investigation accepts a current member holding write + admin authority', async () => {
  const admin = recordingAdminPort()
  const { runtime } = buildRuntime({ admin, adminAuthorization: () => true })
  const result = await run(deleteInvestigation, runtime, request(DELETE_REQUEST))
  assert.equal(result.status, 202)
  assert.deepEqual(result.body, { investigationId: 'inv-1', acceptedServerSequence: 42 })
  assert.equal(admin.calls.length, 1)
})

test('DELETE investigation forbids a write-scoped member WITHOUT admin authority (non-disclosing)', async () => {
  const admin = recordingAdminPort()
  const { runtime } = buildRuntime({ admin, adminAuthorization: () => false })
  const result = await run(deleteInvestigation, runtime, request(DELETE_REQUEST))
  assert.equal(result.status, 403)
  assert.equal((result.body as { code: string }).code, 'forbidden')
  // The admin port is never reached when the admin conjunction fails.
  assert.equal(admin.calls.length, 0)
})

test('DELETE investigation forbids when no admin resolver is provisioned', async () => {
  const admin = recordingAdminPort()
  const { runtime } = buildRuntime({ admin })
  const result = await run(deleteInvestigation, runtime, request(DELETE_REQUEST))
  assert.equal(result.status, 403)
  assert.equal((result.body as { code: string }).code, 'forbidden')
  assert.equal(admin.calls.length, 0)
})

test('DELETE investigation is a non-disclosing not-found when the admin surface is unprovisioned', async () => {
  // A write-scoped current member, but no admin deletion port (disabled-first).
  const { runtime } = buildRuntime({ adminAuthorization: () => true })
  const result = await run(deleteInvestigation, runtime, request(DELETE_REQUEST))
  assert.equal(result.status, 404)
  assert.equal((result.body as { code: string }).code, 'not_found')
})

test('DELETE investigation denies a reader (write scope required) before any admin check', async () => {
  const admin = recordingAdminPort()
  const { runtime } = buildRuntime({ admin, adminAuthorization: () => true })
  const result = await run(deleteInvestigation, runtime, request({ ...DELETE_REQUEST, authorization: 'Bearer reader-token' }))
  assert.equal(result.status, 403)
  assert.equal(admin.calls.length, 0)
})

test('DELETE investigation fails closed for a non-member with a non-disclosing denial', async () => {
  const admin = recordingAdminPort()
  const { runtime } = buildRuntime({ member: false, admin, adminAuthorization: () => true })
  const result = await run(deleteInvestigation, runtime, request(DELETE_REQUEST))
  assert.equal(result.status, 403)
  assert.equal(admin.calls.length, 0)
})

test('DELETE investigation on a disabled space is a non-disclosing not-found', async () => {
  const admin = recordingAdminPort()
  const { runtime } = buildRuntime({ spaceEnabled: false, admin, adminAuthorization: () => true })
  const result = await run(deleteInvestigation, runtime, request(DELETE_REQUEST))
  assert.equal(result.status, 404)
  assert.equal((result.body as { code: string }).code, 'not_found')
  assert.equal(admin.calls.length, 0)
})

// Session identity is the stored GHOST subject; a gateway actor cannot override it.
test('collaboration session uses verified identity and rejects config-only grants', async () => {
  const { readCollaborationSession } = await import('../../server/kirocrew/collaboration/api-handlers')
  const { runtime } = buildRuntime()
  const accepted = await run(readCollaborationSession, runtime, request({
    authorization: 'Bearer reader-token', query: { actor: 'other-operator' }
  }))
  assert.equal(accepted.status, 200)
  assert.deepEqual(accepted.body, { tenantId: TENANT, subjectObjectId: 'oid-1' })
  const denied = await run(readCollaborationSession, runtime, request({ authorization: 'Bearer config-only-token' }))
  assert.equal(denied.status, 403)
})
