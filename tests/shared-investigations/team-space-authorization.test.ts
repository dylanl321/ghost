/**
 * Ghostv2 current Team_Space authorization — TeamSpaceAuthorizer (task 2.3).
 *
 * Verifies the second authorization gate that runs on every collaboration
 * operation and every page/content stream:
 *  - Tenant containment, published+enabled Team_Space, object containment,
 *    source scope, Evidence_Policy, and route capability are all required as a
 *    conjunction; each failed predicate throws a non-disclosing denial;
 *  - current membership is resolved LIVE through the protected delegation (never
 *    a grant-time snapshot), cached at most five minutes keyed by
 *    (tenantId, objectId, spaceId, profileRevision), invalidated on profile
 *    change, and fails CLOSED after expiry or Graph failure;
 *  - denials leak no group object id, delegation detail, or object existence.
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11, 4.12,
 * 24.2, 24.3.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { CollaborationPrincipal } from '../../server/kirocrew/collaboration/authorizer'
import type {
  CollaborationGraphDelegationRuntime,
  CollaborationGraphDelegationStore,
  EntraTokenResponse,
  LoadedCollaborationDelegation
} from '../../server/kirocrew/collaboration/delegation'
import { REQUIRED_GRAPH_MEMBERSHIP_SCOPE } from '../../server/kirocrew/collaboration/delegation'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors'
import type { CollaborationSection } from '../../server/kirocrew/collaboration/profile-schema'
import {
  COLLABORATION_READ_SCOPE,
  COLLABORATION_WRITE_SCOPE
} from '../../server/kirocrew/collaboration/types'
import {
  MEMBERSHIP_CACHE_TTL_MS,
  TeamSpaceAuthorizer,
  type CurrentMembershipQuery,
  type CurrentProfileSnapshot,
  type TeamSpaceAuthorizerDeps
} from '../../server/kirocrew/collaboration/team-space-authorizer'

const TENANT = '11111111-1111-1111-1111-111111111111'
const OBJECT_ID = 'entra-oid-1'
const GROUP_A = 'aaaaaaaa-1111-1111-1111-111111111111'
const CREW_RESOURCE = 'https://ghost.example.test/api/kirocrew'
const BINDING = 'binding-jira-1'
const POLICY = 'policy-1'
const WORKFLOW = 'workflow-1'
const SPACE = 'space-1'

function readPrincipal(): CollaborationPrincipal {
  return {
    subject: { tenantId: TENANT, entraObjectId: OBJECT_ID },
    access: 'read',
    resourceAudience: CREW_RESOURCE,
    tokenScopes: new Set([COLLABORATION_READ_SCOPE])
  }
}

function writePrincipal(): CollaborationPrincipal {
  return {
    subject: { tenantId: TENANT, entraObjectId: OBJECT_ID },
    access: 'write',
    resourceAudience: CREW_RESOURCE,
    tokenScopes: new Set([COLLABORATION_READ_SCOPE, COLLABORATION_WRITE_SCOPE])
  }
}

/** A minimal, valid CollaborationSection with one enabled space. */
function section(overrides?: Partial<CollaborationSection>): CollaborationSection {
  return {
    schemaVersion: 1,
    enabled: true,
    tenantId: TENANT,
    teamSpaces: [
      {
        spaceId: SPACE,
        label: 'Space One',
        enabled: true,
        memberGroupObjectIds: [GROUP_A],
        sourceScopes: [{ bindingId: BINDING }],
        evidencePolicyId: POLICY,
        workflowProfileIds: [WORKFLOW]
      }
    ],
    sourceBindings: [
      { bindingId: BINDING, sourceType: 'jira', instanceFingerprint: 'a'.repeat(64) }
    ],
    evidencePolicies: [
      {
        policyId: POLICY,
        permittedEvidenceClasses: ['jira-issue'],
        permittedMediaTypes: ['text/plain; charset=utf-8'],
        maxExplicitArtifactBytes: 1024,
        requireRedaction: false
      }
    ],
    workflowProfiles: [
      {
        workflowProfileId: WORKFLOW,
        version: 1,
        label: 'Default',
        stages: [{ stageId: 'open', label: 'Open' }],
        transitions: [],
        defaultStageId: 'open',
        checklistItems: [],
        evidenceExpectations: [],
        checkpointTemplate: { requireForCompletion: true, sections: [] }
      }
    ],
    ...overrides
  } as CollaborationSection
}

/** An in-memory delegation store seeded so the runtime resolves `available`. */
function delegationRuntime(options?: {
  exchange?: (input: { tenantId: string; refreshToken: string }) => Promise<EntraTokenResponse>
  seed?: LoadedCollaborationDelegation | null
  now?: number
}): CollaborationGraphDelegationRuntime {
  const records = new Map<string, LoadedCollaborationDelegation>()
  const seed = options?.seed === undefined ? { tenantId: TENANT, delegation: { refreshToken: 'seed' } } : options.seed
  if (seed) records.set(OBJECT_ID, seed)
  const store: CollaborationGraphDelegationStore = {
    async load(subject) {
      return records.get(subject) ?? null
    },
    async save(subject, tenantId, delegation) {
      records.set(subject, { tenantId, delegation })
      return true
    },
    async remove(subject) {
      records.delete(subject)
    }
  }
  return {
    store,
    async exchangeRefreshToken(input) {
      if (options?.exchange) return options.exchange(input)
      return {
        ok: true,
        status: 200,
        access_token: 'graph-access-token',
        refresh_token: 'rotated',
        expires_in: 3600,
        scope: `openid ${REQUIRED_GRAPH_MEMBERSHIP_SCOPE}`
      }
    },
    now() {
      return options?.now ?? 1_000_000
    }
  }
}

/** A membership query that answers based on a fixed boolean and counts calls. */
function membershipQuery(isMember: boolean): CurrentMembershipQuery & { calls: number } {
  const q = {
    calls: 0,
    async isMemberOfAny() {
      q.calls += 1
      return isMember
    }
  }
  return q
}

function fixedProfile(snapshot: CurrentProfileSnapshot): () => Promise<CurrentProfileSnapshot> {
  return async () => snapshot
}

function deps(overrides: Partial<TeamSpaceAuthorizerDeps> & Pick<TeamSpaceAuthorizerDeps, 'membershipQuery'>): TeamSpaceAuthorizerDeps {
  return {
    resolveCurrentProfile: fixedProfile({ revision: 'rev-1', section: section() }),
    delegationRuntime: delegationRuntime(),
    ...overrides
  }
}

async function assertDenied(promise: Promise<unknown>, code: 'forbidden' | 'not_found'): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === code
  )
}

test('a current member of an enabled space is authorized', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(true) }))
  const result = await auth.authorize(readPrincipal(), { access: 'read', spaceId: SPACE })
  assert.equal(result.spaceId, SPACE)
  assert.equal(result.profileRevision, 'rev-1')
})

test('a non-member is denied with a non-disclosing forbidden', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(false) }))
  await assertDenied(auth.authorize(readPrincipal(), { access: 'read', spaceId: SPACE }), 'forbidden')
})

test('a subject from another Tenant is not-found (no cross-tenant existence)', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(true) }))
  const foreign: CollaborationPrincipal = {
    ...readPrincipal(),
    subject: { tenantId: '22222222-2222-2222-2222-222222222222', entraObjectId: OBJECT_ID }
  }
  await assertDenied(auth.authorize(foreign, { access: 'read', spaceId: SPACE }), 'not_found')
})

test('an unknown space is a non-disclosing not-found', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(true) }))
  await assertDenied(auth.authorize(readPrincipal(), { access: 'read', spaceId: 'space-unknown' }), 'not_found')
})

test('a disabled space is withheld as not-found (Requirement 22.1)', async () => {
  const disabled = section()
  disabled.teamSpaces[0]!.enabled = false
  const auth = new TeamSpaceAuthorizer(
    deps({
      membershipQuery: membershipQuery(true),
      resolveCurrentProfile: fixedProfile({ revision: 'rev-1', section: disabled })
    })
  )
  await assertDenied(auth.authorize(readPrincipal(), { access: 'read', spaceId: SPACE }), 'not_found')
})

test('a write operation with only read scope is denied on route capability', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(true) }))
  await assertDenied(auth.authorize(readPrincipal(), { access: 'write', spaceId: SPACE }), 'forbidden')
})

test('a cross-space object access is not-found, never a distinguishable wrong-space', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(true) }))
  await assertDenied(
    auth.authorize(readPrincipal(), { access: 'read', spaceId: SPACE, object: { spaceId: 'space-other' } }),
    'not_found'
  )
})

test('an in-space object is authorized', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(true) }))
  const result = await auth.authorize(readPrincipal(), {
    access: 'read',
    spaceId: SPACE,
    object: { spaceId: SPACE }
  })
  assert.equal(result.spaceId, SPACE)
})

test('a subject inside source scope is authorized; a foreign binding is not-found', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(true) }))
  const inScope = await auth.authorize(readPrincipal(), {
    access: 'read',
    spaceId: SPACE,
    subject: { sourceBindingId: BINDING, sourceType: 'jira', stableSourceId: 'ISSUE-1' }
  })
  assert.equal(inScope.spaceId, SPACE)
  await assertDenied(
    auth.authorize(readPrincipal(), {
      access: 'read',
      spaceId: SPACE,
      subject: { sourceBindingId: 'binding-other', sourceType: 'jira', stableSourceId: 'ISSUE-1' }
    }),
    'not_found'
  )
})

test('source scope narrowed by stable ids excludes a non-listed subject', async () => {
  const narrowed = section()
  narrowed.teamSpaces[0]!.sourceScopes = [{ bindingId: BINDING, includeStableIds: ['PROJ-1'] }]
  const auth = new TeamSpaceAuthorizer(
    deps({
      membershipQuery: membershipQuery(true),
      resolveCurrentProfile: fixedProfile({ revision: 'rev-1', section: narrowed })
    })
  )
  const included = await auth.authorize(readPrincipal(), {
    access: 'read',
    spaceId: SPACE,
    subject: { sourceBindingId: BINDING, sourceType: 'jira', stableSourceId: 'PROJ-1' }
  })
  assert.equal(included.spaceId, SPACE)
  await assertDenied(
    auth.authorize(readPrincipal(), {
      access: 'read',
      spaceId: SPACE,
      subject: { sourceBindingId: BINDING, sourceType: 'jira', stableSourceId: 'PROJ-2' }
    }),
    'not_found'
  )
})

test('a permitted evidence class is authorized; an out-of-policy class is forbidden', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(true) }))
  const ok = await auth.authorize(readPrincipal(), {
    access: 'read',
    spaceId: SPACE,
    evidenceClass: 'jira-issue'
  })
  assert.equal(ok.spaceId, SPACE)
  await assertDenied(
    auth.authorize(readPrincipal(), { access: 'read', spaceId: SPACE, evidenceClass: 'aws-read-output' }),
    'forbidden'
  )
})

test('write access is granted to a write-scoped current member', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(true) }))
  const result = await auth.authorize(writePrincipal(), { access: 'write', spaceId: SPACE })
  assert.equal(result.spaceId, SPACE)
})

// --- Membership caching (Requirement 4.4, 4.5, 4.6, 24.3) ---

test('membership is cached within five minutes and re-queried after expiry', async () => {
  let clock = 1_000_000
  const query = membershipQuery(true)
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: query, now: () => clock }))
  const op = { access: 'read' as const, spaceId: SPACE }

  await auth.authorize(readPrincipal(), op)
  assert.equal(query.calls, 1)

  // Just before the five-minute boundary: cached, no new query.
  clock = 1_000_000 + MEMBERSHIP_CACHE_TTL_MS - 1
  await auth.authorize(readPrincipal(), op)
  assert.equal(query.calls, 1)

  // At the boundary: the cache is stale and membership is re-resolved.
  clock = 1_000_000 + MEMBERSHIP_CACHE_TTL_MS
  await auth.authorize(readPrincipal(), op)
  assert.equal(query.calls, 2)
})

test('removed membership denies the next operation after cache expiry', async () => {
  let clock = 1_000_000
  let member = true
  const query: CurrentMembershipQuery = {
    async isMemberOfAny() {
      return member
    }
  }
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: query, now: () => clock }))
  const op = { access: 'read' as const, spaceId: SPACE }

  await auth.authorize(readPrincipal(), op) // allowed, cached
  member = false // membership removed in Entra

  // Within the window the cached allow still applies (Requirement 4.4 permits reuse).
  clock = 1_000_000 + MEMBERSHIP_CACHE_TTL_MS - 1
  await auth.authorize(readPrincipal(), op)

  // After expiry the removed membership denies the next operation (Requirement 4.6).
  clock = 1_000_000 + MEMBERSHIP_CACHE_TTL_MS
  await assertDenied(auth.authorize(readPrincipal(), op), 'forbidden')
})

test('a profile publication (revision change) invalidates the cached membership', async () => {
  const query = membershipQuery(true)
  let snapshot: CurrentProfileSnapshot = { revision: 'rev-1', section: section() }
  const auth = new TeamSpaceAuthorizer(
    deps({ membershipQuery: query, resolveCurrentProfile: async () => snapshot })
  )
  const op = { access: 'read' as const, spaceId: SPACE }

  await auth.authorize(readPrincipal(), op)
  assert.equal(query.calls, 1)

  // Same clock, but a new revision is published: the (…,profileRevision) key
  // changes, so membership must be re-resolved rather than reused.
  snapshot = { revision: 'rev-2', section: section() }
  await auth.authorize(readPrincipal(), op)
  assert.equal(query.calls, 2)
})

test('a Graph query failure fails closed and is not cached as a positive', async () => {
  let fail = true
  const query: CurrentMembershipQuery = {
    async isMemberOfAny() {
      if (fail) throw new Error('graph unreachable')
      return true
    }
  }
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: query }))
  const op = { access: 'read' as const, spaceId: SPACE }

  await assertDenied(auth.authorize(readPrincipal(), op), 'forbidden')
  assert.equal(auth.cachedMembershipCount(), 0)

  // A later successful query is not blocked by any cached failure.
  fail = false
  const ok = await auth.authorize(readPrincipal(), op)
  assert.equal(ok.spaceId, SPACE)
})

test('an unavailable delegation fails closed with no grant-snapshot fallback', async () => {
  const auth = new TeamSpaceAuthorizer(
    deps({
      membershipQuery: membershipQuery(true),
      // No persisted delegation -> `missing` -> fail closed.
      delegationRuntime: delegationRuntime({ seed: null })
    })
  )
  await assertDenied(auth.authorize(readPrincipal(), { access: 'read', spaceId: SPACE }), 'forbidden')
  assert.equal(auth.cachedMembershipCount(), 0)
})

test('a revoked delegation fails closed', async () => {
  const auth = new TeamSpaceAuthorizer(
    deps({
      membershipQuery: membershipQuery(true),
      delegationRuntime: delegationRuntime({
        exchange: async () => ({ ok: false, status: 400, error: 'invalid_grant' })
      })
    })
  )
  await assertDenied(auth.authorize(readPrincipal(), { access: 'read', spaceId: SPACE }), 'forbidden')
})

test('every page is reauthorized: a mid-read revocation denies the next page', async () => {
  let clock = 1_000_000
  let member = true
  const query: CurrentMembershipQuery = {
    async isMemberOfAny() {
      return member
    }
  }
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: query, now: () => clock }))
  const op = { access: 'read' as const, spaceId: SPACE }

  await auth.authorizePage(readPrincipal(), op) // page 1 allowed
  member = false
  clock = 1_000_000 + MEMBERSHIP_CACHE_TTL_MS // force re-resolution on next page
  await assertDenied(auth.authorizePage(readPrincipal(), op), 'forbidden')
})

test('a denial envelope leaks no group object id or delegation detail', async () => {
  const auth = new TeamSpaceAuthorizer(deps({ membershipQuery: membershipQuery(false) }))
  try {
    await auth.authorize(readPrincipal(), { access: 'read', spaceId: SPACE })
    assert.fail('expected a denial')
  } catch (error) {
    assert.ok(error instanceof CollaborationAuthorizationError)
    const serialized = JSON.stringify(error.toEnvelope())
    assert.equal(serialized.includes(GROUP_A), false)
    assert.equal(serialized.includes('graph-access-token'), false)
    assert.equal(serialized.includes(OBJECT_ID), false)
  }
})
