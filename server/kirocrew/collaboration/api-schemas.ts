/**
 * Shared Investigations — Collaboration_API request/response schemas (task 9.1).
 *
 * Owner: Ghostv2 Nitro routes, Zod/OpenAPI schemas, and collaboration services
 * under `/api/kirocrew/v1/collaboration`.
 *
 * These Zod schemas are the single typed contract the versioned Collaboration_API
 * validates every request body and query against, and the shape every response
 * envelope conforms to. They mirror the canonical cross-repository wire contract
 * (`tests/shared-investigations/contract/wire-contract.v1.schema.json`) for the
 * subset the HTTP surface exposes:
 *
 *   - Subject_Reference identity (`SubjectReference`);
 *   - paginated read query params (default 50, maximum 200) and page envelopes;
 *   - mutation commands (create/patch Investigation, reserve Run, append Event,
 *     publish Checkpoint, reserve/complete Artifact, renew/query presence);
 *   - the safe consistent `ErrorEnvelope` every denial serializes to.
 *
 * The schemas are registered with `@asteasolutions/zod-to-openapi` so the same
 * definitions generate the OpenAPI document; nothing here decodes tokens or
 * carries protected server-side fields (group ids, endpoints, storage keys).
 *
 * Requirements: 4.11, 10.14-10.18, 11.4, 14.14, 15.2-15.5, 15.11, 19.1-19.12, 21.1.
 */

import { z } from 'zod'
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
} from './access-patterns'

extendZodWithOpenApi(z)

/** The OpenAPI registry every collaboration schema is registered against. */
export const collaborationOpenApiRegistry = new OpenAPIRegistry()

// ---------------------------------------------------------------------------
// Primitive / shared fragments.
// ---------------------------------------------------------------------------

/** A stable client-generated Operation_ID (idempotency key). */
export const operationIdSchema = z
  .string()
  .min(1)
  .max(200)
  .openapi({ description: 'Client-generated Operation_ID (idempotency key).' })

/** A lowercase SHA-256 hex digest. */
export const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'must be a lowercase sha-256 hex digest')

/** Source_System kinds recognized by a Subject_Reference. */
export const sourceTypeSchema = z.enum(['jira', 'servicenow', 'gitlab', 'aws', 'extension'])

/**
 * Subject_Reference: stable subject identity `(Source_Binding, source type,
 * Stable_Source_ID)`. `displayLabel` is mutable presentation data and is never
 * part of identity (Requirement 6.10, 15.11).
 */
export const subjectReferenceSchema = collaborationOpenApiRegistry.register(
  'SubjectReference',
  z
    .object({
      sourceBindingId: z.string().min(1).max(200),
      sourceType: sourceTypeSchema,
      stableSourceId: z.string().min(1).max(400),
      displayLabel: z.string().max(400).optional()
    })
    .strict()
)

/** Event categories recognized by the durable timeline. */
export const eventTypeSchema = z.enum([
  'check-started',
  'check-finished',
  'finding',
  'decision',
  'source-action-outcome',
  'coverage-gap',
  'self-reported',
  'lifecycle'
])

export const eventProvenanceSchema = z.enum(['adapter', 'self-reported', 'system'])

export const coverageLimitationSchema = z
  .object({
    kind: z.enum([
      'denied',
      'incomplete',
      'capture-failed',
      'unsafe-projection',
      'truncated',
      'interrupted',
      'unsupported',
      'stale'
    ]),
    safeMessage: z.string().max(2000),
    originalOutcome: z.enum(['failed', 'denied', 'interrupted', 'unknown']).optional()
  })
  .strict()

/** Artifact media types on the first-release allow-list (Requirement 11.9). */
export const artifactMediaTypeSchema = z.enum([
  'text/plain; charset=utf-8',
  'text/markdown',
  'application/json',
  'text/csv',
  'application/pdf',
  'image/png',
  'image/jpeg'
])

export const artifactProvenanceSchema = z.enum(['automatic', 'explicit', 'legacy-import'])

// ---------------------------------------------------------------------------
// Error envelope (safe, consistent). Never carries protected fields.
// ---------------------------------------------------------------------------

export const errorCodeSchema = z.enum([
  'reauth_required',
  'forbidden',
  'not_found',
  'conflict',
  'revision_conflict',
  'payload_mismatch',
  'unresolved',
  'payload_too_large',
  'unsupported_media_type',
  'validation_failed'
])

/**
 * The one consistent error envelope every collaboration denial serializes to.
 * It carries only an operator-safe message and, for a stale-Revision conflict,
 * the current expected Revision — never protected object fields, tokens, group
 * ids, or storage detail (Requirement 19.10, 19.13, 24.2).
 */
export const errorEnvelopeSchema = collaborationOpenApiRegistry.register(
  'ErrorEnvelope',
  z
    .object({
      code: errorCodeSchema,
      safeMessage: z.string(),
      retryable: z.boolean(),
      expectedRevision: z.number().int().nonnegative().optional()
    })
    .strict()
)

// ---------------------------------------------------------------------------
// Pagination.
// ---------------------------------------------------------------------------

/**
 * A page-size query param, defaulting to 50 and clamped to `[1, 200]`
 * (Requirement 19.3). Accepts a numeric string from the query string.
 */
export const pageSizeQuerySchema = z.coerce
  .number()
  .int()
  .optional()
  .transform(value => clampPageSize(value))

/** Clamp a requested page size into `[1, MAX_PAGE_SIZE]`, defaulting to 50. */
export function clampPageSize(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return DEFAULT_PAGE_SIZE
  const floored = Math.floor(requested)
  if (floored < 1) return 1
  return Math.min(floored, MAX_PAGE_SIZE)
}

/** Common paginated read query: optional opaque cursor + optional page size. */
export const pageQuerySchema = z
  .object({
    cursor: z.string().min(1).max(4096).optional(),
    pageSize: z.union([z.string(), z.number()]).optional()
  })
  .strip()

/** A generic paginated page envelope over `item`. */
export function pageEnvelopeSchema<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      items: z.array(item),
      nextCursor: z.string().optional()
    })
    .strict()
}

// ---------------------------------------------------------------------------
// Investigations: list filter, create, patch, ack, metadata.
// ---------------------------------------------------------------------------

/** Filter params for `GET /spaces/{space}/investigations`. */
export const investigationListQuerySchema = z
  .object({
    subjectBindingId: z.string().min(1).max(200).optional(),
    subjectType: sourceTypeSchema.optional(),
    subjectStableId: z.string().min(1).max(400).optional(),
    stageId: z.string().min(1).max(200).optional(),
    archived: z.union([z.literal('true'), z.literal('false')]).optional(),
    text: z.string().max(400).optional(),
    cursor: z.string().min(1).max(4096).optional(),
    pageSize: z.union([z.string(), z.number()]).optional()
  })
  .strip()

/**
 * Create an Investigation idempotently: default-first (subject reservation) or
 * explicit-new. The Creation_Operation_Lookup is keyed by `operationId`.
 */
export const createInvestigationBodySchema = collaborationOpenApiRegistry.register(
  'CreateInvestigationCommand',
  z
    .object({
      operationId: operationIdSchema,
      mode: z.enum(['default-first', 'explicit-new']),
      primarySubject: subjectReferenceSchema,
      relatedSubjects: z.array(subjectReferenceSchema).max(50).optional(),
      workflowProfileId: z.string().min(1).max(200),
      workflowVersion: z.number().int().nonnegative(),
      stageId: z.string().min(1).max(200)
    })
    .strict()
)

/** Expected-Revision metadata update. At least one mutable field is required. */
export const patchInvestigationBodySchema = collaborationOpenApiRegistry.register(
  'PatchInvestigationCommand',
  z
    .object({
      operationId: operationIdSchema,
      expectedRevision: z.number().int().nonnegative(),
      stageId: z.string().min(1).max(200).optional(),
      leadSubjectId: z.string().min(1).max(400).optional(),
      selectedCheckpointId: z.string().min(1).max(200).optional(),
      archived: z.boolean().optional()
    })
    .strict()
    .refine(
      body =>
        body.stageId !== undefined ||
        body.leadSubjectId !== undefined ||
        body.selectedCheckpointId !== undefined ||
        body.archived !== undefined,
      { message: 'at least one mutable field is required' }
    )
)

/** Investigation creation acknowledgement (wire `InvestigationAck`). */
export const investigationAckSchema = collaborationOpenApiRegistry.register(
  'InvestigationAck',
  z
    .object({
      operationId: operationIdSchema,
      investigationId: z.string(),
      revision: z.number().int().nonnegative(),
      acceptedServerSequence: z.number().int().nonnegative()
    })
    .strict()
)

/** Generic mutation acknowledgement (wire `MutationAck`). */
export const mutationAckSchema = collaborationOpenApiRegistry.register(
  'MutationAck',
  z
    .object({
      operationId: operationIdSchema,
      acceptedServerSequence: z.number().int().nonnegative().optional(),
      revision: z.number().int().nonnegative().optional(),
      objectId: z.string().optional()
    })
    .strict()
)

// ---------------------------------------------------------------------------
// Runs.
// ---------------------------------------------------------------------------

export const reserveRunBodySchema = collaborationOpenApiRegistry.register(
  'ReserveRunCommand',
  z
    .object({
      operationId: operationIdSchema,
      parentCheckpointId: z.string().min(1).max(200).optional()
    })
    .strict()
)

export const patchRunBodySchema = collaborationOpenApiRegistry.register(
  'PatchRunCommand',
  z
    .object({
      operationId: operationIdSchema,
      state: z.enum(['active', 'finished', 'interrupted'])
    })
    .strict()
)

// ---------------------------------------------------------------------------
// Events.
// ---------------------------------------------------------------------------

export const appendEventBodySchema = collaborationOpenApiRegistry.register(
  'AppendEventCommand',
  z
    .object({
      operationId: operationIdSchema,
      type: eventTypeSchema,
      runId: z.string().min(1).max(200).optional(),
      checkId: z.string().min(1).max(200).optional(),
      sourceSubject: subjectReferenceSchema.optional(),
      occurredAt: z.string().datetime().optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      artifactIds: z.array(z.string().min(1).max(200)).max(200).optional(),
      provenance: eventProvenanceSchema,
      limitations: z.array(coverageLimitationSchema).max(50).optional()
    })
    .strict()
    .refine(
      body => (body.type === 'check-started' || body.type === 'check-finished' ? !!body.checkId : true),
      { message: 'a check event requires a stable checkId' }
    )
)

// ---------------------------------------------------------------------------
// Checkpoints.
// ---------------------------------------------------------------------------

export const publishCheckpointBodySchema = collaborationOpenApiRegistry.register(
  'PublishCheckpointCommand',
  z
    .object({
      operationId: operationIdSchema,
      summary: z.string().min(1).max(20000),
      citedEventIds: z.array(z.string().min(1).max(200)).max(500).optional(),
      citedArtifactIds: z.array(z.string().min(1).max(200)).max(500).optional()
    })
    .strict()
)

// ---------------------------------------------------------------------------
// Artifacts.
// ---------------------------------------------------------------------------

export const reserveArtifactBodySchema = collaborationOpenApiRegistry.register(
  'ReserveArtifactCommand',
  z
    .object({
      operationId: operationIdSchema,
      originalFilename: z.string().min(1).max(400),
      sha256: sha256HexSchema,
      byteCount: z.number().int().nonnegative(),
      mediaType: artifactMediaTypeSchema,
      provenance: artifactProvenanceSchema,
      redacted: z.boolean(),
      truncated: z.boolean(),
      producingRunId: z.string().min(1).max(200).optional(),
      checkId: z.string().min(1).max(200).optional(),
      sourceReferences: z.array(z.string().min(1).max(400)).max(200).optional(),
      collectedAt: z.string().datetime().optional(),
      collectorVersion: z.string().max(200).optional(),
      sourceVersionOrEtag: z.string().max(400).optional()
    })
    .strict()
)

export const completeArtifactBodySchema = collaborationOpenApiRegistry.register(
  'CompleteArtifactCommand',
  z
    .object({
      operationId: operationIdSchema
    })
    .strict()
)

// ---------------------------------------------------------------------------
// Presence: subject-keyed batch query + renewal (Requirement 15.2-15.5, 15.11).
// ---------------------------------------------------------------------------

export const presenceActivityKindSchema = z.enum(['viewing', 'working'])

/**
 * Batch presence query by stable Subject_Reference. Optional Investigation/Run
 * context filters the returned rows but never changes subject identity
 * (Requirement 15.11).
 */
export const presenceQueryBodySchema = collaborationOpenApiRegistry.register(
  'PresenceQueryCommand',
  z
    .object({
      subjects: z.array(subjectReferenceSchema).min(1).max(MAX_PAGE_SIZE),
      investigationId: z.string().min(1).max(200).optional(),
      runId: z.string().min(1).max(200).optional()
    })
    .strict()
)

/**
 * Renew a directly observed viewing/working lease keyed by Subject_Reference,
 * with optional validated Investigation/Run metadata (Requirement 15.2-15.4).
 */
export const presenceRenewBodySchema = collaborationOpenApiRegistry.register(
  'PresenceRenewCommand',
  z
    .object({
      subject: subjectReferenceSchema,
      activityKind: presenceActivityKindSchema,
      investigationId: z.string().min(1).max(200).optional(),
      runId: z.string().min(1).max(200).optional()
    })
    .strict()
)

/** A single non-expired presence row returned by a query (safe projection). */
export const presenceRowSchema = collaborationOpenApiRegistry.register(
  'PresenceRow',
  z
    .object({
      subject: subjectReferenceSchema,
      activityKind: presenceActivityKindSchema,
      gatewayId: z.string(),
      investigationId: z.string().optional(),
      runId: z.string().optional(),
      expiresAt: z.string()
    })
    .strict()
)

export const presenceQueryResultSchema = z
  .object({
    presence: z.array(presenceRowSchema)
  })
  .strict()

export const presenceLeaseAckSchema = z
  .object({
    subject: subjectReferenceSchema,
    activityKind: presenceActivityKindSchema,
    expiresAt: z.string()
  })
  .strict()

// ---------------------------------------------------------------------------
// Inferred TypeScript types.
// ---------------------------------------------------------------------------

export type SubjectReferenceInput = z.infer<typeof subjectReferenceSchema>
export type CreateInvestigationBody = z.infer<typeof createInvestigationBodySchema>
export type PatchInvestigationBody = z.infer<typeof patchInvestigationBodySchema>
export type ReserveRunBody = z.infer<typeof reserveRunBodySchema>
export type PatchRunBody = z.infer<typeof patchRunBodySchema>
export type AppendEventBody = z.infer<typeof appendEventBodySchema>
export type PublishCheckpointBody = z.infer<typeof publishCheckpointBodySchema>
export type ReserveArtifactBody = z.infer<typeof reserveArtifactBodySchema>
export type CompleteArtifactBody = z.infer<typeof completeArtifactBodySchema>
export type PresenceQueryBody = z.infer<typeof presenceQueryBodySchema>
export type PresenceRenewBody = z.infer<typeof presenceRenewBodySchema>
export type InvestigationListQuery = z.infer<typeof investigationListQuerySchema>
export type PresenceRow = z.infer<typeof presenceRowSchema>
export type ErrorEnvelopeShape = z.infer<typeof errorEnvelopeSchema>
