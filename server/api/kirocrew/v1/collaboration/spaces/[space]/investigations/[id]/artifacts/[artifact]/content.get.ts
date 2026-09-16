import { defineEventHandler, getHeader, getRouterParams, sendStream, setHeader, setResponseStatus } from 'h3'
import { Readable } from 'node:stream'
import { getCollaborationRuntime } from '../../../../../../../../../../kirocrew/collaboration/api-runtime'
import {
  CollaborationAuthorizationError,
  httpStatusForError,
  objectOp,
  toErrorEnvelope
} from '../../../../../../../../../../kirocrew/collaboration/api-support'

// GET /api/kirocrew/v1/collaboration/spaces/{space}/investigations/{id}/artifacts/{artifact}/content
//
// Authorized attachment download. Reauthorizes the stream (Requirement 8.12,
// 19.10) and serves only bytes + sanitized metadata; never a storage credential
// or presigned URL (Requirement 8.13).
export default defineEventHandler(async event => {
  const runtime = getCollaborationRuntime()
  const params = getRouterParams(event) as Record<string, string | undefined>
  try {
    if (!runtime) throw new CollaborationAuthorizationError({ code: 'not_found', safeMessage: 'The requested collaboration resource was not found.', retryable: false })
    const spaceId = params.space
    const investigationId = params.id
    const artifactId = params.artifact
    if (!spaceId || !investigationId || !artifactId) {
      throw new CollaborationAuthorizationError({ code: 'not_found', safeMessage: 'The requested collaboration resource was not found.', retryable: false })
    }

    const { principal } = await runtime.api.authorize(getHeader(event, 'authorization') ?? null, objectOp('read', spaceId))

    const download = await runtime.artifacts.download(
      { tenantId: principal.subject.tenantId, spaceId, investigationId },
      artifactId
    )
    setHeader(event, 'Content-Type', download.mediaType)
    setHeader(event, 'Content-Length', download.byteCount)
    setHeader(event, 'Content-Disposition', `attachment; filename="${download.sanitizedFilename}"`)
    setHeader(event, 'Cache-Control', 'no-store')
    const stream = download.stream instanceof Readable ? download.stream : new Readable().wrap(download.stream)
    return sendStream(event, stream)
  } catch (error) {
    setResponseStatus(event, httpStatusForError(error))
    return toErrorEnvelope(error)
  }
})
