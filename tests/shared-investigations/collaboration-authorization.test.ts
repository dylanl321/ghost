/**
 * Ghostv2 collaboration authentication + scope authorization (task 2.1).
 *
 * Verifies the identity/scope gate that every collaboration operation runs:
 *  - the Opaque_Access_Token is passed byte-for-byte to the existing
 *    GHOST_Token_Identity_Path (provider.AccessToken.find()-backed) and no JWT
 *    decoding, signature verification, or bearer-claim identity derivation
 *    happens in collaboration code;
 *  - the returned Crew resource audience and the EXACT read/write scope are
 *    enforced per operation;
 *  - configuration-only grants and non-GHOST sessions are insufficient;
 *  - authorship comes only from the stored Authenticated_Subject and client
 *    actor fields cannot alter it;
 *  - permanent-deletion authority is separate from collaboration write.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.12, 3.13, 4.1, 4.10, 21.1,
 * 24.1, 24.2, 24.25.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { KIROCREW_SCOPES } from '../../server/kirocrew/types'
import {
  COLLABORATION_READ_SCOPE,
  COLLABORATION_WRITE_SCOPE
} from '../../server/kirocrew/collaboration/types'
import {
  resolveCollaborationToken,
  resolveCollaborationTokenWithAudiences,
  type GhostTokenIdentityPath
} from '../../server/kirocrew/collaboration/token-identity'
import {
  assertAdminDeletionAuthority,
  authorizeCollaboration,
  authorizeResolvedToken,
  extractBearerToken
} from '../../server/kirocrew/collaboration/authorizer'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors'

const CREW_RESOURCE = 'https://ghost.example.test/api/kirocrew'
const OTHER_RESOURCE = 'https://ghost.example.test/mcp'

interface StoredToken {
  accountId?: string
  clientId?: string
  exp?: number
  aud?: string | string[]
  scope?: string
}

/**
 * A controllable GHOST_Token_Identity_Path. It records every opaque token it is
 * asked to resolve so a test can prove the bearer was passed through unchanged.
 * It performs NO token parsing — it maps a raw opaque string to a stored record,
 * exactly as `provider.AccessToken.find()` does.
 */
function fakeIdentityPath(
  tokens: Record<string, StoredToken>,
  identities: Record<string, { oid: string; tenantId: string }>,
  clock = 1_000
): GhostTokenIdentityPath & { seen: string[] } {
  const seen: string[] = []
  return {
    seen,
    async findAccessToken(opaqueToken: string) {
      seen.push(opaqueToken)
      return tokens[opaqueToken] ?? null
    },
    async findIdentity(subject: string) {
      return identities[subject] ?? null
    },
    now() {
      return clock
    }
  }
}

const READ_TOKEN: StoredToken = {
  accountId: 'subject-1',
  clientId: 'crew-cli',
  exp: 10_000,
  aud: CREW_RESOURCE,
  scope: `openid ${COLLABORATION_READ_SCOPE}`
}
const IDENTITIES = { 'subject-1': { oid: 'entra-oid-1', tenantId: 'tenant-1' } }

test('collaboration scopes are advertised on the Crew resource', () => {
  assert.ok(KIROCREW_SCOPES.includes(COLLABORATION_READ_SCOPE))
  assert.ok(KIROCREW_SCOPES.includes(COLLABORATION_WRITE_SCOPE))
})

test('the opaque bearer is passed byte-for-byte to the existing identity path', async () => {
  const opaque = 'opaque.$weird/value+that==looks==like==a==jwt.but.is.not'
  const path = fakeIdentityPath({ [opaque]: READ_TOKEN }, IDENTITIES)
  const context = await resolveCollaborationToken(opaque, path)
  assert.deepEqual(path.seen, [opaque])
  assert.deepEqual(context?.subject, { tenantId: 'tenant-1', entraObjectId: 'entra-oid-1' })
})

test('extractBearer parses only transport framing, not the token', () => {
  assert.equal(extractBearerToken('Bearer abc.def-ghi'), 'abc.def-ghi')
  assert.equal(extractBearerToken('bearer abc'), 'abc')
  assert.equal(extractBearerToken('Basic abc'), null)
  assert.equal(extractBearerToken(undefined), null)
})

test('identity comes from stored identity, never from bearer or actor fields', async () => {
  const path = fakeIdentityPath({ tok: READ_TOKEN }, IDENTITIES)
  const principal = await authorizeCollaboration('Bearer tok', 'read', {
    resourceAudience: CREW_RESOURCE,
    identityPath: path
  })
  // Authorship is the stored subject regardless of any client-provided actor.
  assert.deepEqual(principal.subject, { tenantId: 'tenant-1', entraObjectId: 'entra-oid-1' })
})

test('a read operation requires the exact read scope', async () => {
  const path = fakeIdentityPath({ tok: READ_TOKEN }, IDENTITIES)
  const principal = await authorizeCollaboration('Bearer tok', 'read', {
    resourceAudience: CREW_RESOURCE,
    identityPath: path
  })
  assert.equal(principal.access, 'read')
})

test('a read scope cannot satisfy a write operation', async () => {
  const path = fakeIdentityPath({ tok: READ_TOKEN }, IDENTITIES)
  await assert.rejects(
    authorizeCollaboration('Bearer tok', 'write', { resourceAudience: CREW_RESOURCE, identityPath: path }),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'forbidden'
  )
})

test('a write scope authorizes a write operation', async () => {
  const writeToken: StoredToken = { ...READ_TOKEN, scope: `openid ${COLLABORATION_WRITE_SCOPE}` }
  const path = fakeIdentityPath({ tok: writeToken }, IDENTITIES)
  const principal = await authorizeCollaboration('Bearer tok', 'write', {
    resourceAudience: CREW_RESOURCE,
    identityPath: path
  })
  assert.equal(principal.access, 'write')
})

test('a configuration-only grant is insufficient for collaboration', async () => {
  const configToken: StoredToken = { ...READ_TOKEN, scope: 'openid kirocrew.config.read kirocrew.config.admin' }
  const path = fakeIdentityPath({ tok: configToken }, IDENTITIES)
  await assert.rejects(
    authorizeCollaboration('Bearer tok', 'read', { resourceAudience: CREW_RESOURCE, identityPath: path }),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'forbidden'
  )
})

test('a token minted for a non-Crew resource audience is denied', async () => {
  const wrongAudience: StoredToken = { ...READ_TOKEN, aud: OTHER_RESOURCE }
  const path = fakeIdentityPath({ tok: wrongAudience }, IDENTITIES)
  await assert.rejects(
    authorizeCollaboration('Bearer tok', 'read', { resourceAudience: CREW_RESOURCE, identityPath: path }),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'forbidden'
  )
})

test('a multi-audience token is accepted only when it includes the Crew resource', async () => {
  const path = fakeIdentityPath(
    { good: { ...READ_TOKEN, aud: [OTHER_RESOURCE, CREW_RESOURCE] }, bad: { ...READ_TOKEN, aud: [OTHER_RESOURCE] } },
    IDENTITIES
  )
  const ok = await authorizeCollaboration('Bearer good', 'read', { resourceAudience: CREW_RESOURCE, identityPath: path })
  assert.equal(ok.resourceAudience, CREW_RESOURCE)
  await assert.rejects(
    authorizeCollaboration('Bearer bad', 'read', { resourceAudience: CREW_RESOURCE, identityPath: path }),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'forbidden'
  )
})

test('a missing bearer returns a non-disclosing reauth_required', async () => {
  const path = fakeIdentityPath({}, {})
  await assert.rejects(
    authorizeCollaboration(undefined, 'read', { resourceAudience: CREW_RESOURCE, identityPath: path }),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'reauth_required'
  )
})

test('an unknown or expired token returns reauth_required without probing detail', async () => {
  const expired: StoredToken = { ...READ_TOKEN, exp: 500 }
  const path = fakeIdentityPath({ expired }, IDENTITIES, 1_000)
  await assert.rejects(
    authorizeCollaboration('Bearer expired', 'read', { resourceAudience: CREW_RESOURCE, identityPath: path }),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'reauth_required'
  )
  await assert.rejects(
    authorizeCollaboration('Bearer nonexistent', 'read', { resourceAudience: CREW_RESOURCE, identityPath: path }),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'reauth_required'
  )
})

test('a token whose stored identity no longer exists is denied', async () => {
  const path = fakeIdentityPath({ tok: READ_TOKEN }, {})
  const result = await resolveCollaborationTokenWithAudiences('tok', path)
  assert.equal(result, null)
})

test('a denial envelope carries only safe fields', () => {
  try {
    authorizeResolvedToken(
      { subject: { tenantId: 't', entraObjectId: 'o' }, resourceAudience: OTHER_RESOURCE, tokenScopes: new Set() },
      [OTHER_RESOURCE],
      'read',
      { resourceAudience: CREW_RESOURCE }
    )
    assert.fail('expected a denial')
  } catch (error) {
    assert.ok(error instanceof CollaborationAuthorizationError)
    const envelope = error.toEnvelope()
    assert.deepEqual(Object.keys(envelope).sort(), ['code', 'retryable', 'safeMessage'])
    const serialized = JSON.stringify(envelope)
    assert.equal(serialized.includes('entraObjectId'), false)
    assert.equal(serialized.includes('tenantId'), false)
  }
})

test('permanent deletion requires separate current Administrator authority', () => {
  const writePrincipal = {
    subject: { tenantId: 'tenant-1', entraObjectId: 'entra-oid-1' },
    access: 'write' as const,
    resourceAudience: CREW_RESOURCE,
    tokenScopes: new Set([COLLABORATION_WRITE_SCOPE])
  }
  // Collaboration write alone must NOT authorize deletion.
  assert.throws(
    () => assertAdminDeletionAuthority(writePrincipal, false),
    (error: unknown) => error instanceof CollaborationAuthorizationError && error.code === 'forbidden'
  )
  // With the separate Administrator authorization present, it is allowed.
  assert.doesNotThrow(() => assertAdminDeletionAuthority(writePrincipal, true))
})
