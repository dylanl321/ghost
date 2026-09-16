/**
 * Shared Investigations — Collaboration_API route handlers (task 9.1).
 *
 * Owner: Ghostv2 Nitro routes and collaboration services under
 * `/api/kirocrew/v1/collaboration`.
 *
 * One pure handler per route in the design's Collaboration_API table. Each
 * handler:
 *   - validates its request body/query with the Zod schemas (after the 128 KiB
 *     limit was already enforced upstream in `handleRoute`);
 *   - reauthorizes its exact operation through `ctx.runtime.api` — the identity
 *     gate (Opaque_Access_Token via the existing GHOST_Token_Identity_Path) plus
 *     the current Team_Space gate (Tenant, membership, containment, source
 *     scope, Evidence_Policy, route capability) (Requirement 4.11, 21.1);
 *   - reauthorizes the creation lookup, every presence subject, optional
 *     Investigation/Run metadata, page, and stream (Requirement 15.2, 19.10);
 *   - returns the accepted Operation_ID and applicable Server_Sequence/Revision
 *     for mutations (Requirement 19.11).
 *
 * These are exported so the route tests exercise the exact same code the Nitro
 * `.ts` files run.
 */

import { z } from 'zod'
import {
  appendEventBodySchema,
  completeArtifactBodySchema,
  createInvestigationBodySchema,
  investigationListQuerySchema,
  patchInvestigationBodySchema,
  patchRunBodySchema,
  presenceQueryBodySchema,
  presenceRenewBodySchema,
  publishCheckpointBodySchema,
  reserveArtifactBodySchema,
  reserveRunBodySchema,
  subjectReferenceSchema
} from './api-schemas'
import { CollaborationAuthorizationError } from './errors'
import { canonicalPayloadHash } from './repository'
import { objectOp, parsePageSize, spaceReadOp, spaceWriteOp } from './api-support'
import type { RouteContext, RouteHandler, RouteResult } from './api-runtime'
import type { CommandContext } from './repository-types'
import type { PresenceObserver } from './keys'
import type { SubjectReference } from './subject'
import type { CollaborationOperation } from './team-space-authorizer'

/** A required router param, or a non-disclosing not-found when absent. */
function requireParam(ctx: RouteContext, name: string): string {
  const value = ctx.params[name]
  if (!value) throw new CollaborationAuthorizationError({ code: 'not_found', safeMessage: 'The requested collaboration resource was not found.', retryable: false })
  return value
}

/** Parse a request body with a Zod schema; a schema failure is `validation_failed`. */
function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new CollaborationAuthorizationError({
      code: 'validation_failed',
      safeMessage: 'The request could not be processed.',
      retryable: false
    })
  }
  return result.data
}

/** Parse query params with a Zod schema; a failure is `validation_failed`. */
function parseQuery<T extends z.ZodTypeAny>(schema: T, query: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(query)
  if (!result.success) {
    throw new CollaborationAuthorizationError({
      code: 'validation_failed',
      safeMessage: 'The request could not be processed.',
      retryable: false
    })
  }
  return result.data
}

/** Build the CommandContext from an authorized principal + gateway header. */
function commandContext(
  principal: { subject: { tenantId: string; entraObjectId: string } },
  spaceId: string,
  gatewayId: string
): CommandContext {
  return {
    tenantId: principal.subject.tenantId,
    spaceId,
    author: principal.subject,
    gatewayId
  }
}

/**
 * A Gateway_ID is required for authored mutations (it is part of authorship and
 * of Run/Event attribution). It is carried in a request header, never derived
 * from a client actor identity field. Absent => validation_failed.
 */
function requireGatewayId(ctx: RouteContext): string {
  const value = ctx.query['__gatewayId'] ?? undefined
  if (value && value.length > 0) return value
  // The gateway id is provided by the trusted client transport (header), mapped
  // into query by the Nitro adapter. Without it an authored mutation cannot be
  // attributed.
  throw new CollaborationAuthorizationError({
    code: 'validation_failed',
    safeMessage: 'The request could not be processed.',
    retryable: false
  })
}

// ---------------------------------------------------------------------------
// GET /spaces
// ---------------------------------------------------------------------------

/**
 * Return only authorized published spaces and safe labels/capabilities.
 *
 * `GET /spaces` is a directory read: it requires the identity/read gate (a Crew
 * resource token carrying the collaboration read scope) but not a specific
 * Team_Space membership, since a space is not known yet. `listSafeSpaces`
 * returns only the tenant's enabled, published spaces as safe projections
 * (labels/capabilities) — group ids, endpoints, and policy internals never
 * cross this boundary (Requirement 2.3, 22.1). Per-space membership is enforced
 * on every subsequent space-scoped operation.
 */
export const listSpaces: RouteHandler = async (ctx): Promise<RouteResult> => {
  await ctx.runtime.api.authorizeIdentity(ctx.authorization, 'read')
  const spaces = await ctx.runtime.listSafeSpaces()
  return { status: 200, body: { items: spaces } }
}

// ---------------------------------------------------------------------------
// GET /spaces/{space}/investigations  (filter + paginate)
// ---------------------------------------------------------------------------

export const listInvestigations: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const query = parseQuery(investigationListQuerySchema, ctx.query)
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, spaceReadOp(spaceId))

  const pageSize = parsePageSize(query.pageSize)
  const op = spaceReadOp(spaceId)
  // Reauthorize the page before returning protected records (Requirement 19.10).
  const reauthorize = ctx.runtime.api.reauthorizePage(principal, op)
  if (!(await reauthorize())) {
    throw new CollaborationAuthorizationError({ code: 'forbidden', safeMessage: 'You do not have access to this collaboration resource.', retryable: false })
  }

  const page = await ctx.runtime.reads.listInvestigations(
    { tenantId: principal.subject.tenantId, spaceId },
    {
      subject:
        query.subjectBindingId && query.subjectType && query.subjectStableId
          ? {
              sourceBindingId: query.subjectBindingId,
              sourceType: query.subjectType,
              stableSourceId: query.subjectStableId
            }
          : undefined,
      stageId: query.stageId,
      archived: query.archived === undefined ? undefined : query.archived === 'true',
      text: query.text,
      pageSize,
      cursor: query.cursor
    }
  )
  return { status: 200, body: page }
}

// ---------------------------------------------------------------------------
// POST /spaces/{space}/investigations  (default-first / explicit-new)
// ---------------------------------------------------------------------------

export const createInvestigation: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const body = parseBody(createInvestigationBodySchema, ctx.body)
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, {
    ...spaceWriteOp(spaceId),
    subject: body.primarySubject
  })
  const gatewayId = requireGatewayId(ctx)
  const ack = await ctx.runtime.writes.createInvestigation(
    commandContext(principal, spaceId, gatewayId),
    {
      operationId: body.operationId,
      mode: body.mode,
      primarySubject: body.primarySubject,
      relatedSubjects: body.relatedSubjects,
      workflowProfileId: body.workflowProfileId,
      workflowVersion: body.workflowVersion,
      stageId: body.stageId
    }
  )
  return { status: 201, body: ack }
}

// ---------------------------------------------------------------------------
// GET /spaces/{space}/creation-operations/{operationId}
// ---------------------------------------------------------------------------

export const resolveCreationOperation: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const operationId = requireParam(ctx, 'operationId')
  // The creation lookup is reauthorized as a space read before resolving
  // (Requirement 19.10, design: "reauthorize creation lookup").
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, spaceReadOp(spaceId))

  // The canonical payload hash is required to distinguish a matching recovery
  // from a payload-mismatch conflict. It is supplied as a query param by the
  // recovering client (it persisted the hash before the acknowledgement was
  // lost).
  const payloadHashSchema = z.object({ payloadHash: z.string().regex(/^[0-9a-f]{64}$/) }).strip()
  const { payloadHash } = parseQuery(payloadHashSchema, ctx.query)

  const resolution = await ctx.runtime.writes.resolveCreationOperation(
    { tenantId: principal.subject.tenantId, spaceId },
    operationId,
    payloadHash
  )
  if (resolution.status === 'resolved') {
    return { status: 200, body: resolution.ack }
  }
  if (resolution.status === 'conflict') {
    throw new CollaborationAuthorizationError({ code: 'conflict', safeMessage: 'This operation was already used for a different creation.', retryable: false })
  }
  // unresolved: the creation has not committed yet. Non-disclosing 404.
  throw new CollaborationAuthorizationError({ code: 'unresolved', safeMessage: 'The creation has not completed yet.', retryable: true })
}

// ---------------------------------------------------------------------------
// GET /spaces/{space}/investigations/{id}  (strong metadata read w/ Revision)
// ---------------------------------------------------------------------------

export const getInvestigation: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('read', spaceId))
  const meta = await ctx.runtime.reads.getInvestigation({
    tenantId: principal.subject.tenantId,
    spaceId,
    investigationId
  })
  if (!meta) {
    throw new CollaborationAuthorizationError({ code: 'not_found', safeMessage: 'The requested collaboration resource was not found.', retryable: false })
  }
  return { status: 200, body: meta }
}

// ---------------------------------------------------------------------------
// PATCH /spaces/{space}/investigations/{id}  (expected-Revision update)
// ---------------------------------------------------------------------------

export const patchInvestigation: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const body = parseBody(patchInvestigationBodySchema, ctx.body)
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('write', spaceId))
  const gatewayId = requireGatewayId(ctx)
  const ack = await ctx.runtime.writes.patchInvestigation(
    commandContext(principal, spaceId, gatewayId),
    {
      operationId: body.operationId,
      investigationId,
      expectedRevision: body.expectedRevision,
      stageId: body.stageId,
      leadSubjectId: body.leadSubjectId,
      selectedCheckpointId: body.selectedCheckpointId,
      archived: body.archived
    }
  )
  return { status: 200, body: ack }
}

// ---------------------------------------------------------------------------
// POST /spaces/{space}/investigations/{id}/runs  (reserve current Run)
// ---------------------------------------------------------------------------

export const reserveRun: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const body = parseBody(reserveRunBodySchema, ctx.body)
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('write', spaceId))
  const gatewayId = requireGatewayId(ctx)
  const ack = await ctx.runtime.writes.reserveRun(commandContext(principal, spaceId, gatewayId), {
    operationId: body.operationId,
    investigationId,
    parentCheckpointId: body.parentCheckpointId
  })
  return { status: 201, body: ack }
}

// ---------------------------------------------------------------------------
// PATCH /spaces/{space}/investigations/{id}/runs/{run}  (update/finish)
// ---------------------------------------------------------------------------

export const patchRun: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const runId = requireParam(ctx, 'run')
  const body = parseBody(patchRunBodySchema, ctx.body)
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('write', spaceId))
  const gatewayId = requireGatewayId(ctx)
  const ack = await ctx.runtime.writes.patchRun(commandContext(principal, spaceId, gatewayId), {
    operationId: body.operationId,
    investigationId,
    runId,
    state: body.state
  })
  return { status: 200, body: ack }
}

// ---------------------------------------------------------------------------
// GET /spaces/{space}/investigations/{id}/events   (ordered page)
// POST /spaces/{space}/investigations/{id}/events  (append immutable Event)
// ---------------------------------------------------------------------------

export const listEvents: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('read', spaceId))
  const op = objectOp('read', spaceId)
  const reauthorize = ctx.runtime.api.reauthorizePage(principal, op)
  if (!(await reauthorize())) {
    throw new CollaborationAuthorizationError({ code: 'forbidden', safeMessage: 'You do not have access to this collaboration resource.', retryable: false })
  }
  const pageSize = parsePageSize(ctx.query.pageSize)
  const page = await ctx.runtime.reads.listEvents(
    { tenantId: principal.subject.tenantId, spaceId, investigationId },
    { pageSize, cursor: ctx.query.cursor }
  )
  return { status: 200, body: page }
}

export const appendEvent: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const body = parseBody(appendEventBodySchema, ctx.body)
  const op: CollaborationOperation = {
    access: 'write',
    spaceId,
    object: { spaceId },
    ...(body.sourceSubject ? { subject: body.sourceSubject } : {})
  }
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, op)
  const gatewayId = requireGatewayId(ctx)
  const ack = await ctx.runtime.writes.appendEvent(commandContext(principal, spaceId, gatewayId), {
    operationId: body.operationId,
    investigationId,
    type: body.type,
    runId: body.runId,
    checkId: body.checkId,
    sourceSubject: body.sourceSubject,
    occurredAt: body.occurredAt,
    body: body.body,
    artifactIds: body.artifactIds,
    provenance: body.provenance,
    limitations: body.limitations
  })
  return { status: 201, body: ack }
}

// ---------------------------------------------------------------------------
// POST /spaces/{space}/investigations/{id}/checkpoints  (publish candidate)
// ---------------------------------------------------------------------------

export const publishCheckpoint: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const body = parseBody(publishCheckpointBodySchema, ctx.body)
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('write', spaceId))
  const gatewayId = requireGatewayId(ctx)
  const ack = await ctx.runtime.writes.publishCheckpoint(commandContext(principal, spaceId, gatewayId), {
    operationId: body.operationId,
    investigationId,
    summary: body.summary,
    citedEventIds: body.citedEventIds,
    citedArtifactIds: body.citedArtifactIds
  })
  return { status: 201, body: ack }
}

// ---------------------------------------------------------------------------
// GET /spaces/{space}/investigations/{id}/handoff
// ---------------------------------------------------------------------------

export const readHandoff: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('read', spaceId))
  const handoff = await ctx.runtime.reads.readHandoff({
    tenantId: principal.subject.tenantId,
    spaceId,
    investigationId
  })
  if (!handoff) {
    throw new CollaborationAuthorizationError({ code: 'not_found', safeMessage: 'The requested collaboration resource was not found.', retryable: false })
  }
  return { status: 200, body: handoff }
}

// ---------------------------------------------------------------------------
// Artifacts.
// ---------------------------------------------------------------------------

/** POST .../artifacts — reserve an Artifact + Pending_Manifest idempotently. */
export const reserveArtifact: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const body = parseBody(reserveArtifactBodySchema, ctx.body)
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('write', spaceId))
  const manifest = await ctx.runtime.artifacts.reserve({
    scope: { tenantId: principal.subject.tenantId, spaceId, investigationId },
    operationId: body.operationId,
    author: { tenantId: principal.subject.tenantId, entraObjectId: principal.subject.entraObjectId },
    declaration: {
      originalFilename: body.originalFilename,
      sha256: body.sha256,
      byteCount: body.byteCount,
      mediaType: body.mediaType,
      provenance: body.provenance,
      redacted: body.redacted,
      truncated: body.truncated,
      producingRunId: body.producingRunId,
      checkId: body.checkId,
      sourceReferences: body.sourceReferences,
      collectedAt: body.collectedAt,
      collectorVersion: body.collectorVersion,
      sourceVersionOrEtag: body.sourceVersionOrEtag
    }
  })
  return { status: 201, body: safeManifest(manifest) }
}

/** GET .../artifacts/{artifact} — read authorized manifest/reconciliation state. */
export const readArtifact: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const artifactId = requireParam(ctx, 'artifact')
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('read', spaceId))
  const { manifest, object } = await ctx.runtime.artifacts.reconcile(
    { tenantId: principal.subject.tenantId, spaceId, investigationId },
    artifactId
  )
  return {
    status: 200,
    body: {
      manifest: safeManifest(manifest),
      object: { exists: object.exists, byteCount: object.byteCount, sha256: object.sha256 }
    }
  }
}

/** POST .../artifacts/{artifact}/complete — validate + commit Ready_Manifest. */
export const completeArtifact: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const investigationId = requireParam(ctx, 'id')
  const artifactId = requireParam(ctx, 'artifact')
  parseBody(completeArtifactBodySchema, ctx.body)
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, objectOp('write', spaceId))
  const policy = await ctx.runtime.reads.evidencePolicyFor(spaceId)
  const finalized = await ctx.runtime.artifacts.finalize(
    { tenantId: principal.subject.tenantId, spaceId, investigationId },
    artifactId,
    policy
  )
  return {
    status: 200,
    body: {
      manifest: safeManifest(finalized.manifest),
      acceptedServerSequence: finalized.event.serverSequence
    }
  }
}

/**
 * Project an Artifact manifest to the safe fields a client may see. Storage
 * credentials, object keys, and presigned access are never present on a manifest
 * and are therefore never at risk here; this projection additionally drops the
 * server-internal reservation idempotency fields (Requirement 8.13).
 */
function safeManifest(manifest: {
  artifactId: string
  investigationId: string
  state: string
  sanitizedFilename: string
  sha256: string
  byteCount: number
  mediaType: string
  provenance: string
  redacted: boolean
  truncated: boolean
  producingRunId?: string
  checkId?: string
  reservedAt: string
  readyAt?: string
}): Record<string, unknown> {
  return {
    artifactId: manifest.artifactId,
    investigationId: manifest.investigationId,
    state: manifest.state,
    sanitizedFilename: manifest.sanitizedFilename,
    sha256: manifest.sha256,
    byteCount: manifest.byteCount,
    mediaType: manifest.mediaType,
    provenance: manifest.provenance,
    redacted: manifest.redacted,
    truncated: manifest.truncated,
    producingRunId: manifest.producingRunId,
    checkId: manifest.checkId,
    reservedAt: manifest.reservedAt,
    readyAt: manifest.readyAt
  }
}

// ---------------------------------------------------------------------------
// GET /spaces/{space}/changes  (fixed-high-water incremental feed)
// ---------------------------------------------------------------------------

export const readChanges: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, spaceReadOp(spaceId))

  const feedScope = {
    tenantId: principal.subject.tenantId,
    subjectObjectId: principal.subject.entraObjectId,
    spaceId,
    sourceBindingId: ctx.query.sourceBindingId ?? ''
  }
  // The feed service reauthorizes before every page via this predicate
  // (Requirement 19.10). It re-runs the current Team_Space gate for the space.
  const op = spaceReadOp(spaceId)
  const reauthorize = ctx.runtime.api.reauthorizePage(principal, op)

  const cursor = ctx.query.cursor
  const page = cursor
    ? await ctx.runtime.feed.continueSync(feedScope, reauthorize, cursor)
    : await ctx.runtime.feed.startSync(feedScope, reauthorize, {
        fromSequence: ctx.query.fromSequence ? Number(ctx.query.fromSequence) : 0,
        pageSize: parsePageSize(ctx.query.pageSize)
      })
  return {
    status: 200,
    body: { items: page.items, highWaterMark: page.highWaterMark, nextCursor: page.nextCursor }
  }
}

// ---------------------------------------------------------------------------
// POST /spaces/{space}/presence/query  (batch by Subject_Reference)
// PUT  /spaces/{space}/presence        (renew a lease)
// ---------------------------------------------------------------------------

export const queryPresence: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const body = parseBody(presenceQueryBodySchema, ctx.body)
  // The space-level read is authorized once; each subject is reauthorized for
  // source scope (and optional Investigation/Run containment) inside the service
  // (Requirement 15.2, 15.11, 19.10).
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, spaceReadOp(spaceId))

  const reauthorizeSubject = (subject: SubjectReference): Promise<boolean> => {
    // Subject-keyed presence is authorized against the space's source scope even
    // when no Investigation exists; optional Investigation/Run context is a
    // separately checked containment when supplied (Requirement 15.2, 15.11).
    const op: CollaborationOperation = {
      access: 'read',
      spaceId,
      subject,
      ...(body.investigationId ? { object: { spaceId } } : {})
    }
    // Reuse the per-page reauthorization predicate: it re-runs the current
    // Team_Space gate for this exact subject-scoped operation and returns a
    // boolean without disclosing which predicate failed (Requirement 19.10).
    return Promise.resolve(ctx.runtime.api.reauthorizePage(principal, op)())
  }

  const presence = await ctx.runtime.presence.query(
    { tenantId: principal.subject.tenantId, spaceId },
    { subjects: body.subjects, investigationId: body.investigationId, runId: body.runId },
    reauthorizeSubject
  )
  return { status: 200, body: { presence } }
}

export const renewPresence: RouteHandler = async (ctx): Promise<RouteResult> => {
  const spaceId = requireParam(ctx, 'space')
  const body = parseBody(presenceRenewBodySchema, ctx.body)
  const op: CollaborationOperation = {
    access: 'write',
    spaceId,
    subject: body.subject,
    ...(body.investigationId ? { object: { spaceId } } : {})
  }
  const { principal } = await ctx.runtime.api.authorize(ctx.authorization, op)
  const gatewayId = requireGatewayId(ctx)

  const observer: PresenceObserver = {
    subjectObjectId: principal.subject.entraObjectId,
    gatewayId,
    activityKind: body.activityKind
  }
  const ack = await ctx.runtime.presence.renew(
    { tenantId: principal.subject.tenantId, spaceId },
    { subject: body.subject, observer, investigationId: body.investigationId, runId: body.runId }
  )
  return { status: 200, body: ack }
}

/** The canonical payload hash of a create-investigation body (for recovery). */
export function creationPayloadHash(body: z.infer<typeof createInvestigationBodySchema>): string {
  return canonicalPayloadHash({
    kind: 'create-investigation',
    mode: body.mode,
    primarySubject: JSON.stringify({
      sourceBindingId: body.primarySubject.sourceBindingId,
      sourceType: body.primarySubject.sourceType,
      stableSourceId: body.primarySubject.stableSourceId
    }),
    relatedSubjects: (body.relatedSubjects ?? []).map(s =>
      JSON.stringify({ sourceBindingId: s.sourceBindingId, sourceType: s.sourceType, stableSourceId: s.stableSourceId })
    ),
    workflowProfileId: body.workflowProfileId,
    workflowVersion: body.workflowVersion,
    stageId: body.stageId
  })
}

/** Re-export the subject schema so route adapters can validate params if needed. */
export { subjectReferenceSchema }
