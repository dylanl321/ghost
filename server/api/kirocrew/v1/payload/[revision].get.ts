import { createError, defineEventHandler, getHeader, getRouterParam, setHeader, setResponseStatus } from 'h3'
import { requireKiroCrewToken } from '../../../../kirocrew/auth'
import {
  getKiroCrewPayloadSizeCap,
  getKiroCrewPayloadStore,
  KiroCrewPayloadTooLarge
} from '../../../../kirocrew/payload'

// Serve the Installer_Payload artifact bytes for a revision, read-scoped.
//
// Contract (design §8.6, Requirement 21):
//   - Read scope consistent with /v1/bootstrap and /v1/config
//     (`kirocrew.bootstrap.read`).
//   - <revision> must be a non-negative integer; anything else is a 400.
//   - Unknown revision (no stored artifact) => 404.
//   - Strong etag derived from the artifact sha256, with if-none-match => 304
//     (mirrors bootstrap.get / config.get).
//   - Size cap enforced before streaming; oversized artifact => 413.
//   - No secret values are ever emitted: the artifact is code + app definitions
//     only (product binaries, model weights, and secrets are excluded before
//     upload), so the bytes are served verbatim without leaking a secret.
export default defineEventHandler(async event => {
  await requireKiroCrewToken(event, ['kirocrew.bootstrap.read'])

  const revision = parseRevision(getRouterParam(event, 'revision'))

  const store = getKiroCrewPayloadStore()
  const cap = getKiroCrewPayloadSizeCap()

  // Reject an oversized artifact before reading its body into memory.
  const head = await store.head(revision)
  if (!head) throw notFound(revision)
  if (head.sizeBytes > cap) throw tooLarge(head.sizeBytes, cap)

  const etag = payloadEtag(revision, head.sha256)
  setHeader(event, 'ETag', etag)
  setHeader(event, 'Cache-Control', 'no-store')
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }

  const artifact = await store.get(revision)
  if (!artifact) throw notFound(revision)
  if (artifact.sizeBytes > cap) throw tooLarge(artifact.sizeBytes, cap)

  setHeader(event, 'Content-Type', artifact.contentType || 'application/x-tar')
  setHeader(event, 'Content-Length', artifact.sizeBytes)
  return artifact.body
})

function parseRevision(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw createError({ statusCode: 400, statusMessage: 'payload revision must be a non-negative integer' })
  }
  const revision = Number(raw)
  if (!Number.isSafeInteger(revision)) {
    throw createError({ statusCode: 400, statusMessage: 'payload revision must be a non-negative integer' })
  }
  return revision
}

function payloadEtag(revision: number, sha256: string): string {
  const suffix = sha256 ? sha256.slice(0, 16) : 'nosha'
  return `"kirocrew-payload-r${revision}-${suffix}"`
}

function notFound(revision: number) {
  return createError({ statusCode: 404, statusMessage: `no payload artifact for revision ${revision}` })
}

function tooLarge(sizeBytes: number, cap: number) {
  const error = new KiroCrewPayloadTooLarge(sizeBytes, cap)
  return createError({ statusCode: 413, statusMessage: error.message })
}
