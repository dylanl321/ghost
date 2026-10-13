/**
 * Shared Investigations — authorized write-once Artifact content routes
 * (task 4.1).
 *
 * Owner: Ghostv2 ArtifactStore and collaboration API services.
 *
 * These are the `PUT/GET .../artifacts/{artifact}/content` routes from the
 * design's Collaboration_API table: the only path by which Artifact BYTES enter
 * or leave the private Object_Store. They are deliberately kept OUT of the JSON
 * `handleRoute` path (`api-runtime.ts`): that path enforces the 128 KiB JSON
 * mutation limit and JSON-parses the body, neither of which is correct for a
 * binary Artifact that may be up to 10 MiB (Requirement 8.5, 11.7). Instead this
 * module owns:
 *
 *   - **Upload (PUT)** — reauthorize the exact write operation, read the raw
 *     bytes bounded by the hard 10 MiB Explicit_Artifact ceiling, and stream
 *     them through {@link ArtifactService.upload}, which writes the object
 *     exactly once and reconciles a lost prior response by checksum rather than
 *     ever replacing stored bytes (Requirements 8.5, 8.9, 8.10).
 *   - **Download (GET)** — reauthorize the exact read operation and stream the
 *     stored bytes back as an attachment via {@link ArtifactService.download}.
 *     The response carries only a media type, a sanitized filename, a byte
 *     count, and the shared-bytes checksum. A storage credential, bucket name,
 *     object key, or presigned URL is NEVER returned (Requirements 8.12, 8.13).
 *
 * Every failure collapses to the one safe `ErrorEnvelope` (`toErrorEnvelope`),
 * so a denial never distinguishes object existence or leaks storage detail
 * (Requirement 8.13, 24.2). Reauthorization runs on every request — a stream is
 * a protected content boundary just like a page (Requirement 4.11, 19.10).
 */

import { Readable } from 'node:stream'
import {
  getHeader,
  getRouterParams,
  sendStream,
  setResponseHeader,
  setResponseStatus,
  type H3Event
} from 'h3'
import { httpStatusForError, objectOp, toErrorEnvelope } from './api-support'
import { MAX_EXPLICIT_ARTIFACT_BYTES } from './artifact-types'
import { notFound, payloadTooLarge } from './errors'
import { getCollaborationRuntime, type CollaborationRuntime } from './api-runtime'
import { readCollaborationBody } from './request-body'
import { sanitizeArtifactFilename } from './keys'

/** The header the trusted Registry transport uses to carry the Gateway_ID. */
const GATEWAY_ID_HEADER = 'x-kirocrew-gateway-id'

/** A required router param, or a non-disclosing not-found when absent. */
function requireParam(params: Record<string, string | undefined>, name: string): string {
  const value = params[name]
  if (!value) throw notFound()
  return value
}

/**
 * The transport-neutral context a content route operates over. It mirrors
 * `RouteContext` (`api-runtime.ts`) but carries raw BYTES rather than a parsed
 * JSON body so the same handler runs in tests and behind the h3 adapter.
 */
export interface ContentRouteContext {
  runtime: CollaborationRuntime
  authorization: string | undefined | null
  params: Record<string, string | undefined>
  /** The raw uploaded bytes (upload only); already within the 10 MiB bound. */
  bytes?: Buffer
}

/** The result of an upload: a JSON status body (never any storage detail). */
export interface UploadResult {
  status: number
  body: unknown
}

/**
 * A download result: a readable stream plus the safe attachment metadata a
 * transport uses to frame the response. No storage credential or object key is
 * present (Requirement 8.13).
 */
export interface DownloadResult {
  status: number
  stream: NodeJS.ReadableStream
  byteCount: number
  mediaType: string
  sanitizedFilename: string
  sha256: string
}

/**
 * PUT .../artifacts/{artifact}/content — stream declared bytes to the
 * write-once object for a reserved Artifact.
 *
 * The write operation is reauthorized (identity gate + current Team_Space gate)
 * before any bytes are accepted. `ArtifactService.upload` then enforces
 * write-once and reconciliation semantics: a brand-new object is written once;
 * an identical replay is an idempotent success; different bytes for the same
 * Artifact identifier conflict and the stored object is never replaced
 * (Requirements 8.5, 8.9, 8.10).
 */
export async function uploadArtifactContent(ctx: ContentRouteContext): Promise<UploadResult> {
  const spaceId = requireParam(ctx.params, 'space')
  const investigationId = requireParam(ctx.params, 'id')
  const artifactId = requireParam(ctx.params, 'artifact')

  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('write', spaceId))

  const bytes = ctx.bytes ?? Buffer.alloc(0)
  // The hard Explicit_Artifact ceiling is enforced on the bytes actually
  // received; bytes are never truncated to fit (Requirement 11.7, 11.8).
  if (bytes.byteLength > MAX_EXPLICIT_ARTIFACT_BYTES) {
    throw payloadTooLarge('The artifact exceeds the maximum allowed size and cannot be shared.')
  }

  const outcome = await ctx.runtime.artifacts.upload(
    { tenantId: principal.subject.tenantId, spaceId, investigationId },
    artifactId,
    bytes
  )

  // 200 on an idempotent replay (bytes were already durable), 201 on a fresh
  // write. Neither response carries a storage key, version location, or any
  // credential — only the safe reconciliation status the client needs.
  return {
    status: outcome.status === 'already-stored' ? 200 : 201,
    body: { artifactId, state: outcome.manifest.state, byteCount: outcome.manifest.byteCount }
  }
}

/**
 * GET .../artifacts/{artifact}/content — reauthorize and stream the stored bytes
 * back as an attachment.
 *
 * The read operation is reauthorized before the object is opened, and a missing
 * object (reserved-but-not-uploaded, or cleaned up) yields a non-disclosing
 * not-found so a caller cannot probe for other Investigations' artifacts
 * (Requirement 8.12, 8.13). The returned metadata is intentionally minimal: no
 * bucket, key, region, credential, or presigned URL ever crosses this boundary.
 */
export async function downloadArtifactContent(ctx: ContentRouteContext): Promise<DownloadResult> {
  const spaceId = requireParam(ctx.params, 'space')
  const investigationId = requireParam(ctx.params, 'id')
  const artifactId = requireParam(ctx.params, 'artifact')

  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('read', spaceId))

  const download = await ctx.runtime.artifacts.download(
    { tenantId: principal.subject.tenantId, spaceId, investigationId },
    artifactId
  )

  return {
    status: 200,
    stream: download.stream,
    byteCount: download.byteCount,
    mediaType: download.mediaType,
    sanitizedFilename: download.sanitizedFilename,
    sha256: download.sha256
  }
}

// ---------------------------------------------------------------------------
// h3 adapters — transport framing only.
// ---------------------------------------------------------------------------

/** Carry the shared inputs (auth header, gateway id, params) out of an event. */
function contentRequestFrom(event: H3Event): {
  authorization: string | undefined | null
  params: Record<string, string | undefined>
} {
  return {
    authorization: getHeader(event, 'authorization') ?? null,
    params: getRouterParams(event) as Record<string, string | undefined>
  }
}

/**
 * Serialize a Content-Disposition attachment header value for a sanitized
 * filename. The filename is re-sanitized defensively (it is already sanitized
 * response metadata) so a CR/LF or quote can never break out of the header
 * (Requirement 8.2, 8.12).
 */
function attachmentDisposition(sanitizedFilename: string): string {
  const safe = sanitizeArtifactFilename(sanitizedFilename)
  // RFC 6266 filename* percent-encoding for any non-ASCII, plus a plain
  // fallback stripped of quotes.
  const asciiFallback = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
  const encoded = encodeURIComponent(safe)
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Run the PUT upload route for an h3 event. Reads the raw body bounded by the
 * hard 10 MiB Explicit_Artifact ceiling (not the 128 KiB JSON limit), resolves
 * the disabled-first runtime, and writes the safe JSON result. On any failure it
 * serializes the one safe `ErrorEnvelope` and never leaks storage detail.
 */
export async function runArtifactUploadRoute(event: H3Event): Promise<unknown> {
  try {
    const runtime = getCollaborationRuntime()
    if (!runtime) throw notFound()

    // Bound the raw read by the hard Explicit_Artifact ceiling. `readCollaborationBody`
    // rejects an over-limit body (by Content-Length or streamed size) with a
    // non-disclosing payload_too_large before buffering the rest.
    const raw = await readCollaborationBody(event, MAX_EXPLICIT_ARTIFACT_BYTES)

    const { authorization, params } = contentRequestFrom(event)
    const result = await uploadArtifactContent({
      runtime,
      authorization,
      params,
      bytes: raw ?? Buffer.alloc(0)
    })
    setResponseStatus(event, result.status)
    return result.body
  } catch (error) {
    setResponseStatus(event, httpStatusForError(error))
    return toErrorEnvelope(error)
  }
}

/**
 * Run the GET download route for an h3 event. Reauthorizes, opens the stored
 * byte stream, sets the safe attachment headers, and streams the bytes. On any
 * failure it serializes the safe `ErrorEnvelope`.
 */
export async function runArtifactDownloadRoute(event: H3Event): Promise<unknown> {
  try {
    const runtime = getCollaborationRuntime()
    if (!runtime) throw notFound()

    const { authorization, params } = contentRequestFrom(event)
    const result = await downloadArtifactContent({ runtime, authorization, params })

    setResponseStatus(event, result.status)
    setResponseHeader(event, 'Content-Type', result.mediaType)
    setResponseHeader(event, 'Content-Length', result.byteCount)
    setResponseHeader(event, 'Content-Disposition', attachmentDisposition(result.sanitizedFilename))
    // Nosniff so a browser never re-interprets shared evidence as active content.
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    // Normalize to a Node Readable for the transport: the store may hand back a
    // Node stream (in-memory) or an SDK body; `Readable.from` is a no-op wrapper
    // for an existing Readable and adapts any async-iterable byte source.
    const nodeStream =
      result.stream instanceof Readable ? result.stream : Readable.from(result.stream as NodeJS.ReadableStream)
    return await sendStream(event, nodeStream)
  } catch (error) {
    setResponseStatus(event, httpStatusForError(error))
    return toErrorEnvelope(error)
  }
}
