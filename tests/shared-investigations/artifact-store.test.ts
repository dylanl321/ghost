/**
 * Ghostv2 tests for task 4.1 — authenticated write-once Artifact storage and
 * reconciliation (ArtifactStore + ArtifactService).
 *
 * Requirements: 8.1-8.5, 8.9, 8.10, 8.12, 8.13.
 *
 * These use the in-memory storage/manifest backends so they exercise the real
 * write-once, reconciliation, and non-disclosing-denial logic without AWS.
 */
import assert from 'node:assert/strict'
import type { Readable } from 'node:stream'
import test from 'node:test'

import {
  artifactObjectKey,
  isObjectKeyContained,
  sanitizeArtifactFilename,
  type InvestigationScope
} from '../../server/kirocrew/collaboration/keys'
import {
  ArtifactStore,
  InMemoryObjectStorageBackend,
  sha256Hex
} from '../../server/kirocrew/collaboration/artifact-store'
import {
  ArtifactService,
  InMemoryArtifactManifestStore,
  reservationPayloadHash,
  type ArtifactAuthor
} from '../../server/kirocrew/collaboration/artifact-service'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors'
import type { ArtifactDeclaration } from '../../server/kirocrew/collaboration/artifact-types'

const SCOPE: InvestigationScope = {
  tenantId: 'tenant-fake-01',
  spaceId: 'space-fake-01',
  investigationId: 'inv-fake-0001'
}

const AUTHOR: ArtifactAuthor = { tenantId: SCOPE.tenantId, entraObjectId: 'oid-fake-01' }

function declaration(overrides: Partial<ArtifactDeclaration> = {}): ArtifactDeclaration {
  return {
    originalFilename: 'jira-evidence.json',
    sha256: '0'.repeat(64),
    byteCount: 5,
    mediaType: 'application/json',
    provenance: 'automatic',
    redacted: true,
    truncated: false,
    ...overrides
  }
}

function makeService(): {
  service: ArtifactService
  backend: InMemoryObjectStorageBackend
  manifests: InMemoryArtifactManifestStore
} {
  const backend = new InMemoryObjectStorageBackend()
  const store = new ArtifactStore(backend)
  const manifests = new InMemoryArtifactManifestStore()
  let counter = 0
  const service = new ArtifactService(
    store,
    manifests,
    () => `art-fake-${++counter}`,
    () => new Date('2024-01-02T03:06:20Z')
  )
  return { service, backend, manifests }
}

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// --- Object keys (Requirement 8.2, 7.2) ------------------------------------

test('object keys are opaque, scope-contained, and free of the filename', () => {
  const key = artifactObjectKey(SCOPE, 'art-fake-1')
  assert.equal(key, 't/tenant-fake-01/s/space-fake-01/i/inv-fake-0001/a/art-fake-1')
  assert.ok(isObjectKeyContained(key, SCOPE))
  assert.ok(!key.includes('jira-evidence'))
})

test('object keys reject identifiers that could escape the scope prefix', () => {
  assert.throws(() => artifactObjectKey({ ...SCOPE, investigationId: '../evil' }, 'art-1'))
  assert.throws(() => artifactObjectKey(SCOPE, 'a/b'))
  assert.throws(() => artifactObjectKey(SCOPE, '..'))
})

test('changing tenant or space produces a disjoint, non-contained key', () => {
  const key = artifactObjectKey(SCOPE, 'art-fake-1')
  assert.ok(!isObjectKeyContained(key, { ...SCOPE, tenantId: 'other-tenant' } as InvestigationScope))
  assert.ok(!isObjectKeyContained(key, { ...SCOPE, spaceId: 'other-space' } as InvestigationScope))
})

test('filenames are sanitized to a path-free attachment token', () => {
  assert.equal(sanitizeArtifactFilename('../../etc/passwd'), 'passwd')
  assert.equal(sanitizeArtifactFilename('C:\\Windows\\evil.exe'), 'evil.exe')
  assert.equal(sanitizeArtifactFilename('re"port\r\n.csv'), 'report.csv')
  assert.equal(sanitizeArtifactFilename('re\u0000port\u0085.csv'), 'report.csv')
  assert.equal(sanitizeArtifactFilename('   '), 'artifact')
  assert.equal(sanitizeArtifactFilename('..'), 'artifact')
})

// --- Reservation idempotency (Requirement 8.4) -----------------------------

test('reserving is idempotent for the same Operation_ID and payload', async () => {
  const { service } = makeService()
  const first = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  const second = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  assert.equal(first.state, 'pending')
  assert.equal(second.artifactId, first.artifactId, 'replay returns the original reservation')
})

test('reusing an Operation_ID with a different payload is a payload mismatch', async () => {
  const { service } = makeService()
  await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  await assert.rejects(
    () => service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration({ byteCount: 99 }), author: AUTHOR }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'payload_mismatch'
  )
})

test('a pending manifest is never marked ready by the storage service', async () => {
  const { service } = makeService()
  const manifest = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  await service.upload(SCOPE, manifest.artifactId, Buffer.from('hello'))
  const { manifest: after } = await service.reconcile(SCOPE, manifest.artifactId)
  assert.equal(after.state, 'pending', 'finalization is task 4.2, not this service')
})

// --- Write-once upload + reconciliation (Requirement 8.5, 8.9, 8.10) -------

test('first upload stores bytes exactly once', async () => {
  const { service } = makeService()
  const m = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  const outcome = await service.upload(SCOPE, m.artifactId, Buffer.from('hello'))
  assert.equal(outcome.status, 'stored')
})

test('re-uploading identical bytes is an idempotent replay, not a rewrite', async () => {
  const { service, backend } = makeService()
  const m = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  await service.upload(SCOPE, m.artifactId, Buffer.from('hello'))
  const key = artifactObjectKey(SCOPE, m.artifactId)
  const firstVersion = (await backend.head(key)).versionId

  const outcome = await service.upload(SCOPE, m.artifactId, Buffer.from('hello'))
  assert.equal(outcome.status, 'already-stored')
  const secondVersion = (await backend.head(key)).versionId
  assert.equal(secondVersion, firstVersion, 'the stored object version is unchanged')
})

test('uploading DIFFERENT bytes for the same artifact conflicts without replacing', async () => {
  const { service, backend } = makeService()
  const m = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  await service.upload(SCOPE, m.artifactId, Buffer.from('hello'))
  const key = artifactObjectKey(SCOPE, m.artifactId)
  const storedBefore = await backend.get(key)
  const bytesBefore = storedBefore ? await collect(storedBefore.stream) : Buffer.alloc(0)

  await assert.rejects(
    () => service.upload(SCOPE, m.artifactId, Buffer.from('DIFFERENT')),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'conflict'
  )

  const storedAfter = await backend.get(key)
  const bytesAfter = storedAfter ? await collect(storedAfter.stream) : Buffer.alloc(0)
  assert.deepEqual(bytesAfter, bytesBefore, 'stored bytes are never replaced')
  assert.equal(bytesAfter.toString(), 'hello')
})

test('reconcile reports object existence and checksum after a lost response', async () => {
  const { service } = makeService()
  const m = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  // Before upload: reserved manifest, no object yet.
  const before = await service.reconcile(SCOPE, m.artifactId)
  assert.equal(before.object.exists, false)
  // Simulate: upload succeeded but the client never got the response.
  await service.upload(SCOPE, m.artifactId, Buffer.from('hello'))
  const after = await service.reconcile(SCOPE, m.artifactId)
  assert.equal(after.object.exists, true)
  assert.equal(after.object.sha256, sha256Hex(Buffer.from('hello')))
})

// --- Download (Requirement 8.12, 8.13) -------------------------------------

test('download streams stored bytes with sanitized attachment metadata', async () => {
  const { service } = makeService()
  const m = await service.reserve({
    scope: SCOPE,
    operationId: 'op-1',
    declaration: declaration({ originalFilename: '../secret/report.csv', mediaType: 'text/csv' }),
    author: AUTHOR
  })
  await service.upload(SCOPE, m.artifactId, Buffer.from('a,b,c'))
  const download = await service.download(SCOPE, m.artifactId)
  assert.equal(download.mediaType, 'text/csv')
  assert.equal(download.sanitizedFilename, 'report.csv')
  assert.equal((await collect(download.stream)).toString(), 'a,b,c')
})

test('download of a reserved-but-unuploaded artifact is a non-disclosing not-found', async () => {
  const { service } = makeService()
  const m = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  await assert.rejects(
    () => service.download(SCOPE, m.artifactId),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'not_found'
  )
})

// --- Cross-scope isolation & non-disclosure (Requirement 8.13) -------------

test('an artifact is not reachable from a different investigation scope', async () => {
  const { service } = makeService()
  const m = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  await service.upload(SCOPE, m.artifactId, Buffer.from('hello'))
  const otherScope: InvestigationScope = { ...SCOPE, investigationId: 'inv-fake-OTHER' }
  for (const op of [
    () => service.download(otherScope, m.artifactId),
    () => service.reconcile(otherScope, m.artifactId),
    () => service.upload(otherScope, m.artifactId, Buffer.from('x'))
  ]) {
    await assert.rejects(op, (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'not_found')
  }
})

test('denials carry only safe envelope fields, never storage detail', async () => {
  const { service } = makeService()
  const m = await service.reserve({ scope: SCOPE, operationId: 'op-1', declaration: declaration(), author: AUTHOR })
  await service.upload(SCOPE, m.artifactId, Buffer.from('hello'))
  try {
    await service.upload(SCOPE, m.artifactId, Buffer.from('DIFFERENT'))
    assert.fail('expected a conflict')
  } catch (e) {
    assert.ok(e instanceof CollaborationAuthorizationError)
    const envelope = e.toEnvelope()
    assert.deepEqual(Object.keys(envelope).sort(), ['code', 'retryable', 'safeMessage'])
    const serialized = JSON.stringify(envelope)
    assert.ok(!/tenant-fake|space-fake|inv-fake|art-fake|t\/tenant/.test(serialized), 'no scope/key leakage')
  }
})

// --- Generative write-once property (Requirement 8.5, 8.10) ----------------

test('property: for any first-writer bytes, later different bytes never replace them', async () => {
  // Deterministic pseudo-random generator so failures reproduce.
  let seed = 0x2545f491
  const rand = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 0xffffffff
  }
  const randomBytes = () => {
    const len = 1 + Math.floor(rand() * 32)
    const b = Buffer.alloc(len)
    for (let i = 0; i < len; i++) b[i] = Math.floor(rand() * 256)
    return b
  }

  for (let trial = 0; trial < 200; trial++) {
    const { service, backend } = makeService()
    const m = await service.reserve({ scope: SCOPE, operationId: `op-${trial}`, declaration: declaration(), author: AUTHOR })
    const winner = randomBytes()
    await service.upload(SCOPE, m.artifactId, winner)
    const key = artifactObjectKey(SCOPE, m.artifactId)

    // A later write of the SAME bytes is an idempotent replay.
    const replay = await service.upload(SCOPE, m.artifactId, Buffer.from(winner))
    assert.equal(replay.status, 'already-stored')

    // A later write of DIFFERENT bytes conflicts and never replaces.
    let challenger = randomBytes()
    if (challenger.equals(winner)) challenger = Buffer.concat([challenger, Buffer.from([0])])
    await assert.rejects(
      () => service.upload(SCOPE, m.artifactId, challenger),
      (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'conflict'
    )

    const stored = await backend.get(key)
    const bytes = stored ? await collect(stored.stream) : Buffer.alloc(0)
    assert.deepEqual(bytes, winner, `trial ${trial}: stored bytes must equal the first writer`)
  }
})

// --- Reservation payload hash stability -------------------------------------

test('reservation payload hash is stable and distinguishes payloads', () => {
  const h1 = reservationPayloadHash(SCOPE, declaration())
  const h2 = reservationPayloadHash(SCOPE, declaration())
  const h3 = reservationPayloadHash(SCOPE, declaration({ byteCount: 6 }))
  assert.equal(h1, h2)
  assert.notEqual(h1, h3)
})
