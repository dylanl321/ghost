/**
 * Shared Investigations — Collaboration_API runtime wiring + route helpers
 * (task 9.1).
 *
 * Owner: Ghostv2 Nitro routes under `/api/kirocrew/v1/collaboration`.
 *
 * The Nitro route files are transport-only: they read the raw request, hand its
 * bytes and the `Authorization` header to this module, and serialize whatever it
 * returns. This module owns:
 *
 *   - the narrow read/write ports the API depends on. The API surface (task 9.1)
 *     is decoupled from the concrete CollaborationRepository read-projection
 *     work (tasks 3.5 / 9.2) behind these interfaces, so the routes are complete
 *     and testable now and the production projections plug in without touching
 *     the handlers;
 *   - `handleRoute`, which wraps a handler with the 128 KiB body limit, the
 *     disabled-first not-found, and the one safe consistent `ErrorEnvelope` on
 *     any failure (Requirement 4.11, 11.4, 19.10, 21.1);
 *   - a disabled-first runtime provider: until collaboration is provisioned AND
 *     the profile enables a Team_Space, every route resolves to a non-disclosing
 *     not-found rather than a distinguishable "disabled" signal (Requirement
 *     4.7, 22.1, 24.2).
 */

import {
  CollaborationApi,
  type CollaborationPresenceService,
  enforceJsonBodyLimit,
  httpStatusForError,
  toErrorEnvelope,
  type ErrorEnvelope
} from './api-support'
import type { CollaborationFeedService } from './change-feed'
import type { ArtifactService } from './artifact-service'
import type { TeamSpaceAuthorizer } from './team-space-authorizer'
import type { AuthorizeOptions, AdminAuthorizationResolver } from './authorizer'
import { CollaborationAuthorizationError, notFound } from './errors'
import type { SafeSpaceSummary } from './profile-projection'
import type {
  AppendEventCommand,
  CommandContext,
  CreateInvestigationCommand,
  CreationResolution,
  InvestigationAck,
  MutationAck,
  PatchInvestigationCommand,
  ReserveRunCommand,
  Sha256Hex
} from './repository-types'
import type { ArtifactEvidencePolicy } from './artifact-types'
import type { SpaceScope, InvestigationScope } from './keys'
import type { SubjectReference } from './subject'
import type { HandoffOptions } from './checkpoint-types'

// ---------------------------------------------------------------------------
// Read/write ports the API surface depends on.
// ---------------------------------------------------------------------------

/** A generic paginated page returned by a read port. */
export interface Page<T> {
  items: T[]
  nextCursor?: string
}

/** Filter/paging options for the Investigation list read. */
export interface InvestigationListOptions {
  subject?: SubjectReference
  stageId?: string
  archived?: boolean
  text?: string
  pageSize: number
  cursor?: string
}

/** Options for an Event timeline page read. */
export interface EventPageOptions {
  pageSize: number
  cursor?: string
}

/** A patch-Run command (state update/finish). */
export interface PatchRunCommand {
  operationId: string
  investigationId: string
  runId: string
  state: 'active' | 'finished' | 'interrupted'
}

/** A publish-Checkpoint command. */
export interface PublishCheckpointCommand {
  operationId: string
  investigationId: string
  summary: string
  citedEventIds?: string[]
  citedArtifactIds?: string[]
}

/**
 * The write surface the API mutations call. The production implementation is the
 * transactional CollaborationRepository (task 3.3+); the API depends only on
 * this interface so `createInvestigation`, `reserveRun`, `appendEvent`, and
 * `patchInvestigation` keep their exact idempotent semantics without the API
 * knowing the storage engine.
 */
export interface CollaborationWritePort {
  createInvestigation(ctx: CommandContext, command: CreateInvestigationCommand): Promise<InvestigationAck>
  resolveCreationOperation(scope: SpaceScope, operationId: string, payloadHash: Sha256Hex): Promise<CreationResolution>
  reserveRun(ctx: CommandContext, command: ReserveRunCommand): Promise<MutationAck>
  patchRun(ctx: CommandContext, command: PatchRunCommand): Promise<MutationAck>
  appendEvent(ctx: CommandContext, command: AppendEventCommand): Promise<MutationAck>
  patchInvestigation(ctx: CommandContext, command: PatchInvestigationCommand): Promise<MutationAck>
  publishCheckpoint(ctx: CommandContext, command: PublishCheckpointCommand): Promise<MutationAck>
}

/**
 * The read surface the API reads call (strong metadata reads, ordered pages,
 * Handoff assembly). Owned by the read-projection work (tasks 3.5 / 9.2); the
 * API depends only on this interface. All reads are already scope-contained by
 * the `InvestigationScope`/`SpaceScope` the handler builds from the authorized
 * principal, and every page is reauthorized by the handler before it is called.
 */
export interface CollaborationReadPort {
  listInvestigations(scope: SpaceScope, options: InvestigationListOptions): Promise<Page<unknown>>
  getInvestigation(scope: InvestigationScope): Promise<unknown | null>
  listEvents(scope: InvestigationScope, options: EventPageOptions): Promise<Page<unknown>>
  /**
   * Assemble the Handoff a continuing Operator receives: the Selected_Checkpoint,
   * its Coverage_Watermark, the Events newer than that watermark up to a FIXED
   * High_Water_Mark, and the first Evidence_Index page (Requirement 12.5, 16.1).
   * When the newer Events or the Evidence_Index exceed one page, the assembled
   * view carries a continuation cursor bound to the fixed mark + authorization
   * scope (Requirement 12.6). `null` means the Investigation is unknown /
   * off-scope, which the handler turns into a non-disclosing not-found.
   */
  readHandoff(scope: InvestigationScope, options?: HandoffOptions): Promise<unknown | null>
  /**
   * Follow a Handoff continuation cursor, returning the next ordered authorized
   * page for the cursor's stream without skipping covered records
   * (Requirement 12.7). A cursor bound to another scope or a tampered cursor
   * raises a non-disclosing not-found (Requirement 12.8). Optional so a runtime
   * without the Checkpoint/Handoff projection wired (disabled-first) simply does
   * not expose continuation.
   */
  continueHandoff?(scope: InvestigationScope, cursor: string): Promise<unknown>
  /** The Team_Space Evidence_Policy the Artifact finalizer enforces. */
  evidencePolicyFor(spaceId: string): Promise<ArtifactEvidencePolicy>
}

/**
 * The administrative deletion surface the admin route calls AFTER both the
 * collaboration object authorization and the separate current Administrator
 * authorization have passed (Requirement 4.10, 24.2). The concrete
 * implementation is the GHOST_Admin_Service tombstone/cleanup state machine
 * (task 4.4): it atomically writes a content-free Tombstone and deletion feed
 * change before denying access, then schedules asynchronous physical cleanup.
 * The API depends only on this narrow port so the authorization boundary is
 * complete and testable now and the durable workflow plugs in later.
 *
 * `requestDeletion` returns only a safe, content-free acknowledgement (the
 * accepted deletion Server_Sequence / a receipt id). It never returns object
 * content, group ids, or storage detail. An unknown/foreign target is a
 * non-disclosing not-found (thrown by the port or, before it is reached, by the
 * object authorization the handler runs first).
 */
export interface AdminDeletionPort {
  requestDeletion(scope: InvestigationScope): Promise<AdminDeletionAck>
}

/** Safe, content-free acknowledgement of an accepted permanent-deletion request. */
export interface AdminDeletionAck {
  investigationId: string
  /** The Server_Sequence at which the Tombstone + deletion feed change committed. */
  acceptedServerSequence?: number
}

// ---------------------------------------------------------------------------
// Runtime.
// ---------------------------------------------------------------------------

/**
 * The assembled collaboration runtime a route handler operates over. Provided by
 * production wiring or, in tests, by a fixture. When `null` (the disabled-first
 * default), routes return a non-disclosing not-found.
 */
export interface CollaborationRuntime {
  api: CollaborationApi
  reads: CollaborationReadPort
  writes: CollaborationWritePort
  feed: CollaborationFeedService
  artifacts: ArtifactService
  presence: CollaborationPresenceService
  /** Safe published space summaries for the current identity's tenant. */
  listSafeSpaces(): Promise<SafeSpaceSummary[]>
  /**
   * The GHOST_Admin_Service deletion surface (task 4.4). Optional: when absent,
   * permanent deletion is not provisioned and the admin route returns a
   * non-disclosing not-found rather than revealing that deletion is unavailable
   * (Requirement 22.1, 24.2).
   */
  admin?: AdminDeletionPort
  /**
   * Resolves separate current Administrator authorization (task 4.4). Optional:
   * when absent, no request can satisfy the admin conjunction, so the admin
   * route denies with a non-disclosing `forbidden` (Requirement 4.10).
   */
  adminAuthorization?: AdminAuthorizationResolver
  authorizeOptions?: AuthorizeOptions
}

/** The result a route handler returns: a JSON body and an HTTP status. */
export interface RouteResult<T = unknown> {
  status: number
  body: T
}

/** The context a route handler receives after body-limit enforcement. */
export interface RouteContext {
  runtime: CollaborationRuntime
  authorization: string | undefined | null
  /** Parsed JSON body (already within the 128 KiB limit), or undefined. */
  body: unknown
  /** Router params (space id, ids). */
  params: Record<string, string | undefined>
  /** Parsed query string params (+ transport-injected `__gatewayId`). */
  query: Record<string, string | undefined>
}

/** A route handler: pure over the runtime + request, returns a RouteResult. */
export type RouteHandler<T = unknown> = (ctx: RouteContext) => Promise<RouteResult<T>>

/** The raw transport inputs a Nitro handler collects before delegating here. */
export interface RawRequest {
  authorization: string | undefined | null
  rawBody: Buffer | string | null | undefined
  params: Record<string, string | undefined>
  query: Record<string, string | undefined>
}

/**
 * Run a route handler with the shared API rules applied:
 *   1. enforce the 128 KiB JSON body limit BEFORE parsing (Requirement 11.4);
 *   2. resolve the disabled-first runtime (non-disclosing not-found when absent);
 *   3. invoke the handler;
 *   4. on any thrown error, serialize the one safe consistent `ErrorEnvelope`
 *      and its HTTP status (Requirement 19.10, 24.2).
 */
export async function handleRoute<T>(
  runtime: CollaborationRuntime | null,
  request: RawRequest,
  handler: RouteHandler<T>
): Promise<RouteResult<T | ErrorEnvelope>> {
  try {
    // Body limit is enforced before ANY domain parsing or authorization work.
    const body = enforceJsonBodyLimit(request.rawBody)

    // Disabled-first: no runtime means collaboration is not provisioned. Return
    // a non-disclosing not-found rather than revealing configuration state.
    if (!runtime) throw notFound()

    return await handler({
      runtime,
      authorization: request.authorization,
      body,
      params: request.params,
      query: request.query
    })
  } catch (error) {
    const envelope = toErrorEnvelope(error)
    return { status: httpStatusForError(error), body: envelope }
  }
}

/**
 * Assemble a {@link CollaborationRuntime} from already-constructed collaboration
 * services. Kept as a thin constructor so both production wiring and tests build
 * the runtime the same way.
 */
export function createCollaborationRuntime(parts: {
  teamSpaceAuthorizer: TeamSpaceAuthorizer
  reads: CollaborationReadPort
  writes: CollaborationWritePort
  feed: CollaborationFeedService
  artifacts: ArtifactService
  presence: CollaborationPresenceService
  listSafeSpaces: () => Promise<SafeSpaceSummary[]>
  admin?: AdminDeletionPort
  adminAuthorization?: AdminAuthorizationResolver
  authorizeOptions?: AuthorizeOptions
}): CollaborationRuntime {
  return {
    api: new CollaborationApi({
      teamSpaceAuthorizer: parts.teamSpaceAuthorizer,
      authorizeOptions: parts.authorizeOptions
    }),
    reads: parts.reads,
    writes: parts.writes,
    feed: parts.feed,
    artifacts: parts.artifacts,
    presence: parts.presence,
    listSafeSpaces: parts.listSafeSpaces,
    admin: parts.admin,
    adminAuthorization: parts.adminAuthorization,
    authorizeOptions: parts.authorizeOptions
  }
}

// ---------------------------------------------------------------------------
// Runtime provider — disabled-first by default.
// ---------------------------------------------------------------------------

let currentRuntime: CollaborationRuntime | null = null

/**
 * Resolve the collaboration runtime for the current request. Returns `null`
 * (disabled-first) unless production wiring or a test has installed one. Routes
 * treat `null` as a non-disclosing not-found (Requirement 22.1, 24.2).
 */
export function getCollaborationRuntime(): CollaborationRuntime | null {
  return currentRuntime
}

/**
 * Install (or clear) the collaboration runtime. Production wiring calls this
 * once the disabled-first infrastructure (tasks 3.x/4.x) is enabled; tests call
 * it with an in-memory runtime and clear it afterward.
 */
export function setCollaborationRuntime(runtime: CollaborationRuntime | null): void {
  currentRuntime = runtime
}

/** Re-export for route handlers that need to raise a typed denial directly. */
export { CollaborationAuthorizationError, notFound }
