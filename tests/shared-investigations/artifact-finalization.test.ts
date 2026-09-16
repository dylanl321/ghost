/**
 * Ghostv2 tests for task 4.2 — Artifact validation, finalization, and evidence
 * limits.
 *
 * Requirements: 8.3, 8.6, 8.7, 8.8, 11.2, 11.7-11.10, 11.13-11.15, 23.6.
 *
 * These exercise the real validation + atomic finalization logic through the
 * in-memory storage/manifest backends (no AWS): pending/failed manifests stay
 * uncitable, only validated finalization produces a Ready_Manifest and one
 * Artifact Event, and oversize/unsupported artifacts are rejected without
 * truncation or a raw fallback.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import type { InvestigationScope } from '../../server/kirocrew/collaboration/keys'
import {
  ArtifactStore,
  InMemoryObjectStorageBackend,
  sha256Hex
} from '../../server/kirocrew/collaboration/artifact-store'
import {
  ArtifactService,
  InMemoryArtifactManifestStore,
  type ArtifactAuthor
} from '../../server/kirocrew/collaboration/artifact-service'
import {
  validateArtifactForFinalization
} from '../../server/kirocrew/collaboration/artifact-validation'
import {
  MAX_EXPLICIT_ARTIFACT_BYTES,
  type ArtifactDeclaration,
  type ArtifactEvidencePolicy,
  type ArtifactManifest
} from '../../server/kirocrew/collaboration/artifact-types'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors'

const SCOPE: InvestigationScope = {
  tenantId: 'tenant-fake-01',
  spaceId: 'space-fake-01',
  investigationId: 'inv-fake-0001'
}

const AUTHOR: ArtifactAuthor = { tenantId: SCOPE.tenantId, entraObjectId: 'oid-fake-01' }

const POLICY: ArtifactEvidencePolicy = {
  permittedMediaTypes: ['application/json', 'text/csv', 'text/plain; charset=utf-8'],
  maxExplicitArtifactBytes: MAX_EXPLICIT_ARTIFACT_BYTES,
  requireRedaction: true
}

/** Build a declaration whose declared sha256/byteCount match `bytes`. */
function declarationFor(bytes: Buffer, overrides: Partial<ArtifactDeclaration> = {}): ArtifactDeclaration {
  return {
    originalFilename: 'jira-evidence.json',
    sha256: sha256Hex(bytes),
    byteCount: bytes.length,
    mediaType: 'application/json',
    provenance: 'automatic',
    redacted: true,
    truncated: false,
    collectedAt: '2024-01-02T03:04:05Z',
    collectorVersion: 'lzo-capture/1.2.3',
    ...overrides
  }
}

function makeService(): {
  service: ArtifactService
  manifests: InMemoryArtifactManifestStore
} {
  const backend = new InMemoryObjectStorageBackend()
  const store = new ArtifactStore(backend)
  const manifests = new InMemoryArtifactManifestStore()
  let art = 0
  let evt = 0
  const service = new ArtifactService(
    store,
    manifests,
    () => `art-fake-${++art}`,
    () => new Date('2024-01-02T03:06:20Z'),
    () => `evt-fake-${++evt}`
  )
  return { service, manifests }
}

/** Reserve + upload matching bytes, returning the pending manifest. */
async function reserveAndUpload(
  service: ArtifactService,
  bytes: Buffer,
  overrides: Partial<ArtifactDeclaration> = {},
  operationId = 'op-1'
): Promise<ArtifactManifest> {
  const manifest = await service.reserve({
    scope: SCOPE,
    operationId,
    declaration: declarationFor(bytes, overrides),
    author: AUTHOR
  })
  await service.upload(SCOPE, manifest.artifactId, bytes)
  return manifest
}

// --- Happy-path finalization (Requirement 8.6, 8.8) ------------------------

test('validated bytes commit a Ready_Manifest and one Artifact Event', async () => {
  const { service } = makeService()
  const bytes = Buffer.from('{"finding":"ok"}')
  const m = await reserveAndUpload(service, bytes)

  const { manifest, event } = await service.finalize(SCOPE, m.artifactId, POLICY)

  assert.equal(manifest.state, 'ready')
  assert.equal(manifest.sha256, sha256Hex(bytes))
  assert.equal(manifest.byteCount, bytes.length)
  assert.ok(manifest.readyAt, 'readyAt is stamped on finalization')
  assert.equal(manifest.producingEventId, event.eventId)

  assert.equal(event.kind, 'artifact-ready')
  assert.equal(event.artifactId, m.artifactId)
  assert.equal(event.sha256, sha256Hex(bytes))
  assert.equal(event.serverSequence, 1, 'the store assigns the Server_Sequence atomically')
})

test('finalization is idempotent: a retry returns the same Event without a duplicate', async () => {
  const { service } = makeService()
  const bytes = Buffer.from('a,b,c')
  const m = await reserveAndUpload(service, bytes, { mediaType: 'text/csv', originalFilename: 'r.csv' })

  const first = await service.finalize(SCOPE, m.artifactId, POLICY)
  const second = await service.finalize(SCOPE, m.artifactId, POLICY)

  assert.equal(first.event.eventId, second.event.eventId)
  assert.equal(first.event.serverSequence, second.event.serverSequence)
  assert.equal(second.manifest.state, 'ready')
})

test('each finalized Artifact gets a distinct monotonic Server_Sequence', async () => {
  const { service } = makeService()
  const a = await reserveAndUpload(service, Buffer.from('{"a":1}'), {}, 'op-a')
  const b = await reserveAndUpload(service, Buffer.from('{"b":2}'), {}, 'op-b')

  const fa = await service.finalize(SCOPE, a.artifactId, POLICY)
  const fb = await service.finalize(SCOPE, b.artifactId, POLICY)

  assert.equal(fa.event.serverSequence, 1)
  assert.equal(fb.event.serverSequence, 2)
})

// --- Pending / failed stay uncitable (Requirement 8.8, 23.6) ---------------

test('a pending manifest is not ready and carries no Artifact Event before finalization', async () => {
  const { service } = makeService()
  const m = await reserveAndUpload(service, Buffer.from('{"x":1}'))
  const { manifest } = await service.reconcile(SCOPE, m.artifactId)
  assert.equal(manifest.state, 'pending')
  assert.equal(manifest.producingEventId, undefined)
  assert.equal(manifest.readyAt, undefined)
})

test('a checksum mismatch fails validation and leaves the manifest uncitable', async () => {
  const { service } = makeService()
  // Reserve declaring bytes A, but the stored object is bytes B.
  const declaredBytes = Buffer.from('{"declared":true}')
  const m = await service.reserve({
    scope: SCOPE,
    operationId: 'op-1',
    declaration: declarationFor(declaredBytes),
    author: AUTHOR
  })
  // Upload DIFFERENT bytes than declared (client mis-declared its checksum).
  await service.upload(SCOPE, m.artifactId, Buffer.from('{"actual":false}'))

  await assert.rejects(
    () => service.finalize(SCOPE, m.artifactId, POLICY),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'validation_failed'
  )

  const { manifest } = await service.reconcile(SCOPE, m.artifactId)
  assert.equal(manifest.state, 'validation-failed')
  assert.equal(manifest.producingEventId, undefined, 'no Artifact Event was appended')
})

test('a validation-failed manifest never becomes ready on retry', async () => {
  const { service } = makeService()
  const m = await service.reserve({
    scope: SCOPE,
    operationId: 'op-1',
    declaration: declarationFor(Buffer.from('declared')),
    author: AUTHOR
  })
  await service.upload(SCOPE, m.artifactId, Buffer.from('different'))
  await assert.rejects(() => service.finalize(SCOPE, m.artifactId, POLICY))
  // Even if the same call is retried, it stays failed.
  await assert.rejects(
    () => service.finalize(SCOPE, m.artifactId, POLICY),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'validation_failed'
  )
})

test('finalizing before any bytes are uploaded fails validation', async () => {
  const { service } = makeService()
  const bytes = Buffer.from('{"x":1}')
  const m = await service.reserve({
    scope: SCOPE,
    operationId: 'op-1',
    declaration: declarationFor(bytes),
    author: AUTHOR
  })
  await assert.rejects(
    () => service.finalize(SCOPE, m.artifactId, POLICY),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'validation_failed'
  )
})

// --- 10 MiB ceiling, no truncation (Requirement 11.7, 11.8) ----------------

test('an artifact over 10 MiB is rejected with payload_too_large and never truncated', () => {
  const oversize: ArtifactManifest = {
    ...baseManifest(),
    byteCount: MAX_EXPLICIT_ARTIFACT_BYTES + 1
  }
  assert.throws(
    () => validateArtifactForFinalization(oversize, { sha256: oversize.sha256, byteCount: oversize.byteCount }, POLICY),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'payload_too_large'
  )
})

test('a policy narrower than 10 MiB is enforced as the effective ceiling', () => {
  const narrowPolicy: ArtifactEvidencePolicy = { ...POLICY, maxExplicitArtifactBytes: 1024 }
  const manifest: ArtifactManifest = { ...baseManifest(), byteCount: 2048 }
  assert.throws(
    () => validateArtifactForFinalization(manifest, { sha256: manifest.sha256, byteCount: 2048 }, narrowPolicy),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'payload_too_large'
  )
})

test('exactly the ceiling is allowed when integrity matches', () => {
  const bytes = Buffer.alloc(64, 7)
  const manifest: ArtifactManifest = {
    ...baseManifest(),
    sha256: sha256Hex(bytes),
    byteCount: bytes.length
  }
  const verified = validateArtifactForFinalization(
    manifest,
    { sha256: sha256Hex(bytes), byteCount: bytes.length },
    POLICY
  )
  assert.equal(verified.byteCount, bytes.length)
})

// --- Unsupported media type, no raw fallback (Requirement 11.9, 11.10) -----

test('a media type outside the policy is rejected without a raw fallback', () => {
  // A globally-supported type (png) that the Team_Space policy does not permit.
  const manifest: ArtifactManifest = { ...baseManifest(), mediaType: 'image/png' }
  assert.throws(
    () => validateArtifactForFinalization(manifest, { sha256: manifest.sha256, byteCount: manifest.byteCount }, POLICY),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'unsupported_media_type'
  )
})

// --- Required metadata / provenance (Requirement 8.3, 11.13, 11.14) --------

test('a manifest missing collector version or collection time fails validation', () => {
  const noVersion: ArtifactManifest = { ...baseManifest(), collectorVersion: '' }
  assert.throws(
    () => validateArtifactForFinalization(noVersion, { sha256: noVersion.sha256, byteCount: noVersion.byteCount }, POLICY),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'validation_failed'
  )
  const noTime: ArtifactManifest = { ...baseManifest(), collectedAt: undefined }
  assert.throws(
    () => validateArtifactForFinalization(noTime, { sha256: noTime.sha256, byteCount: noTime.byteCount }, POLICY),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'validation_failed'
  )
})

// --- Redaction policy (Requirement 11.2) -----------------------------------

test('an unredacted explicit artifact is rejected when the policy requires redaction', () => {
  const manifest: ArtifactManifest = { ...baseManifest(), provenance: 'explicit', redacted: false }
  assert.throws(
    () => validateArtifactForFinalization(manifest, { sha256: manifest.sha256, byteCount: manifest.byteCount }, POLICY),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'validation_failed'
  )
})

// --- Non-disclosure of validation denials (Requirement 8.13-style) ---------

test('a validation denial carries only safe envelope fields', async () => {
  const { service } = makeService()
  const m = await service.reserve({
    scope: SCOPE,
    operationId: 'op-1',
    declaration: declarationFor(Buffer.from('declared')),
    author: AUTHOR
  })
  await service.upload(SCOPE, m.artifactId, Buffer.from('different-secret-bytes'))
  try {
    await service.finalize(SCOPE, m.artifactId, POLICY)
    assert.fail('expected validation_failed')
  } catch (e) {
    assert.ok(e instanceof CollaborationAuthorizationError)
    const envelope = e.toEnvelope()
    assert.deepEqual(Object.keys(envelope).sort(), ['code', 'retryable', 'safeMessage'])
    const serialized = JSON.stringify(envelope)
    assert.ok(!/tenant-fake|space-fake|inv-fake|art-fake|different-secret/.test(serialized))
  }
})

// --- Cross-scope isolation --------------------------------------------------

test('finalizing from a different investigation scope is a non-disclosing not-found', async () => {
  const { service } = makeService()
  const m = await reserveAndUpload(service, Buffer.from('{"x":1}'))
  const other: InvestigationScope = { ...SCOPE, investigationId: 'inv-fake-OTHER' }
  await assert.rejects(
    () => service.finalize(other, m.artifactId, POLICY),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'not_found'
  )
})

// --- Generative property: publication iff validated finalization ------------

test('property: ready + one Event iff declared size and checksum match stored bytes', async () => {
  let seed = 0x1a2b3c4d
  const rand = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 0xffffffff
  }
  const randomBytes = () => {
    const len = 1 + Math.floor(rand() * 40)
    const b = Buffer.alloc(len)
    for (let i = 0; i < len; i++) b[i] = Math.floor(rand() * 256)
    return b
  }

  for (let trial = 0; trial < 150; trial++) {
    const { service } = makeService()
    const bytes = randomBytes()
    const declareTruth = rand() < 0.6

    // Sometimes declare the honest checksum/size, sometimes a wrong one.
    const overrides: Partial<ArtifactDeclaration> = declareTruth
      ? {}
      : rand() < 0.5
        ? { sha256: sha256Hex(Buffer.concat([bytes, Buffer.from([1])])) }
        : { byteCount: bytes.length + 1 }

    const declaration = declarationFor(bytes, overrides)
    const m = await service.reserve({ scope: SCOPE, operationId: `op-${trial}`, declaration, author: AUTHOR })
    await service.upload(SCOPE, m.artifactId, bytes)

    if (declareTruth) {
      const { manifest, event } = await service.finalize(SCOPE, m.artifactId, POLICY)
      assert.equal(manifest.state, 'ready', `trial ${trial}: honest declaration must finalize`)
      assert.equal(event.kind, 'artifact-ready')
      assert.equal(manifest.producingEventId, event.eventId)
    } else {
      await assert.rejects(
        () => service.finalize(SCOPE, m.artifactId, POLICY),
        (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'validation_failed',
        `trial ${trial}: mismatched declaration must NOT finalize`
      )
      const { manifest } = await service.reconcile(SCOPE, m.artifactId)
      assert.notEqual(manifest.state, 'ready', `trial ${trial}: mismatch stays uncitable`)
      assert.equal(manifest.producingEventId, undefined)
    }
  }
})

/**
 * A syntactically valid, policy-conformant manifest used by the pure-validator
 * unit tests, where only the field under test is perturbed.
 */
function baseManifest(): ArtifactManifest {
  const bytes = Buffer.from('{"ok":true}')
  return {
    artifactId: 'art-fake-1',
    investigationId: SCOPE.investigationId,
    state: 'pending',
    originalFilename: 'evidence.json',
    sanitizedFilename: 'evidence.json',
    sha256: sha256Hex(bytes),
    byteCount: bytes.length,
    mediaType: 'application/json',
    provenance: 'automatic',
    redacted: true,
    truncated: false,
    collectedAt: '2024-01-02T03:04:05Z',
    collectorVersion: 'lzo-capture/1.2.3',
    reservedAt: '2024-01-02T03:06:20Z',
    reservationOperationId: 'op-1',
    reservationPayloadHash: '0'.repeat(64)
  }
}
