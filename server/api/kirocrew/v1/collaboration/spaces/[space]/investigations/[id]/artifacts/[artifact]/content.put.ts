import { defineEventHandler, getHeader, getRouterParams, setResponseStatus } from 'h3'
import { getCollaborationRuntime } from '../../../../../../../../../../kirocrew/collaboration/api-runtime'
import {
  CollaborationAuthorizationError,
  httpStatusForError,
  objectOp,
  toErrorEnvelope
} from '../../../../../../../../../../kirocrew/collaboration/api-support'
import { MAX_EXPLICIT_ARTIFACT_BYTES } from '../../../../../../../../../../kirocrew/collaboration/artifact-types'
import { readCollaborationBody } from '../../../../../../../../../../kirocrew/collaboration/request-body'

// PUT /api/kirocrew/v1/collaboration/spaces/{space}/investigations/{id}/artifacts/{artifact}/content
//
// Authorized write-once upload. The bytes are streamed to a reserved Artifact.
// This is a binary route (not the 128 KiB JSON envelope): the applicable ceiling
// is the hard 10 MiB Explicit_Artifact limit, enforced before any write.
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

    const { principal } = await runtime.api.authorize(getHeader(event, 'authorization') ?? null, objectOp('write', spaceId))

    const raw = await readCollaborationBody(event, MAX_EXPLICIT_ARTIFACT_BYTES)
    const bytes = raw ?? Buffer.alloc(0)
    if (bytes.byteLength > MAX_EXPLICIT_ARTIFACT_BYTES) {
      throw new CollaborationAuthorizationError({ code: 'payload_too_large', safeMessage: 'The artifact exceeds the maximum allowed size and cannot be shared.', retryable: false })
    }

    const outcome = await runtime.artifacts.upload(
      { tenantId: principal.subject.tenantId, spaceId, investigationId },
      artifactId,
      bytes
    )
    setResponseStatus(event, outcome.status === 'stored' ? 201 : 200)
    return { status: outcome.status, artifactId }
  } catch (error) {
    setResponseStatus(event, httpStatusForError(error))
    return toErrorEnvelope(error)
  }
})
