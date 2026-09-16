/**
 * Shared Investigations — scope-contained storage keys (task 3.2).
 *
 * Owner: Ghostv2 CollaborationRepository.
 *
 * Every collaboration record lives in one dedicated single-table
 * Cloud_Record_Store. This module is the *only* place that encodes and parses
 * the DynamoDB primary keys and the derived Global Secondary Index attributes.
 * Every key that this module produces embeds the Tenant and the Team_Space so
 * that:
 *
 *   1. Encoding then parsing any key yields back its Tenant and Team_Space
 *      (round-trip / containment — Property 12, Requirement 7.2).
 *   2. Changing either the Tenant or the Team_Space produces a disjoint key
 *      (no cross-tenant / cross-space key ever collides — Requirement 7.2).
 *   3. Every documented access pattern (subject lookup, active/archive
 *      browsing, timeline reads, Run/Checkpoint/Artifact reads,
 *      Creation_Operation_Lookup, batch presence) resolves to a `GetItem`,
 *      `Query`, or `BatchGetItem` — never a routine `Scan`
 *      (Requirements 7.11, 7.12, 10.16-10.18, 15.2-15.5).
 *
 * Presence keys are derived from the *stable* Subject_Reference
 * `(Source_Binding, source type, Stable_Source_ID)` and the authenticated
 * observer / gateway / activity kind. A mutable `displayLabel` is never part of
 * a presence key, and optional Investigation / Run metadata never changes the
 * subject identity used to partition presence (Requirements 6.6-6.10, 15.2-15.5,
 * 15.11).
 *
 * The physical layout mirrors the design's Cloud_Record_Store layout:
 *
 *   PK SPACE#{tenant}#{space}                 SK SEQ#COUNTER
 *   PK SPACE#{tenant}#{space}                 SK CHANGE#{sequence}
 *   PK SPACE#{tenant}#{space}                 SK CREATEOP#{operationId}
 *   PK SPACE#{tenant}#{space}                 SK SUBJECT#{binding}#{type}#{stableId}#{investigation}
 *   PK INV#{tenant}#{space}#{investigation}   SK META
 *   PK INV#{tenant}#{space}#{investigation}   SK RUN#{run}
 *   PK INV#{tenant}#{space}#{investigation}   SK EVENT#{sequence}#{event}
 *   PK INV#{tenant}#{space}#{investigation}   SK CHECK#{checkId}#FINISH
 *   PK INV#{tenant}#{space}#{investigation}   SK CHECKPOINT#{checkpoint}
 *   PK INV#{tenant}#{space}#{investigation}   SK ARTIFACT#{artifact}
 *   PK INV#{tenant}#{space}#{investigation}   SK IDEMPOTENCY#{operationId}
 *   PK PRESENCE#{tenant}#{space}#{binding}#{type}#{stableSourceId}
 *                                             SK SUBJECT#{subject}#{gateway}#{kind}
 *   PK DELETE#{tenant}#{space}#{investigation} SK TOMBSTONE | JOB#{step}
 */

import type { SubjectReference } from './subject'

/**
 * Attribute names of the single-table primary key and its GSIs.
 *
 * `SubjectLookup` resolves live subjects to Investigations without scanning.
 * `InvestigationBrowse` orders a space's Investigations by active/archived
 * stage and recency for active/archive browsing without scanning.
 */
export const PK = 'pk' as const
export const SK = 'sk' as const
export const GSI1_PK = 'gsi1pk' as const
export const GSI1_SK = 'gsi1sk' as const
export const GSI2_PK = 'gsi2pk' as const
export const GSI2_SK = 'gsi2sk' as const

export const SUBJECT_LOOKUP_INDEX = 'SubjectLookup' as const
export const INVESTIGATION_BROWSE_INDEX = 'InvestigationBrowse' as const

/**
 * Structural delimiter between key segments. Component values are escaped (see
 * {@link encodeComponent}) so a raw delimiter can never appear inside a value,
 * which keeps every key unambiguous and injective.
 */
const DELIM = '#'

/**
 * Escape a single key component so that it cannot contain the structural
 * delimiter or the escape character itself. This is what makes the encoding
 * injective: distinct component tuples always produce distinct strings, so two
 * different scopes can never collide on one key. `Stable_Source_ID` in
 * particular is arbitrary caller text (up to 512 chars) that may legitimately
 * contain `#`, so escaping is mandatory for correctness, not cosmetic.
 */
export function encodeComponent(value: string): string {
  // Order matters: escape the escape char first, then the delimiter.
  return value.replace(/~/g, '~0').replace(/#/g, '~1')
}

/** Inverse of {@link encodeComponent}. */
export function decodeComponent(value: string): string {
  return value.replace(/~1/g, '#').replace(/~0/g, '~')
}

/** Join already-known-literal prefixes with escaped dynamic components. */
function key(prefix: string, ...components: string[]): string {
  if (components.length === 0) return prefix
  return `${prefix}${DELIM}${components.map(encodeComponent).join(DELIM)}`
}

/**
 * Split a key into its raw (still-escaped) segments. The literal prefix is
 * segment 0. We split on the unescaped delimiter only.
 */
function splitKey(value: string): string[] {
  // A `#` is unescaped when it is not part of a `~1` sequence. Because the
  // escape sequences (`~0`, `~1`) never themselves contain a bare `#`, a simple
  // split on `#` is safe: escaped delimiters are `~1`, not `#`.
  return value.split(DELIM)
}

/** The Tenant + Team_Space scope shared by every collaboration key. */
export interface SpaceScope {
  tenantId: string
  spaceId: string
}

// ---------------------------------------------------------------------------
// Space-partition keys: sequence counter, Change_Feed, Creation_Operation
// Lookup, and the subject -> investigation pointer.
// ---------------------------------------------------------------------------

/** Partition key for the Team_Space partition (counter, feed, create-op, subject pointers). */
export function spacePartition(scope: SpaceScope): string {
  return key('SPACE', scope.tenantId, scope.spaceId)
}

export const SEQUENCE_COUNTER_SK = key('SEQ', 'COUNTER')

export function sequenceCounterKey(scope: SpaceScope): { pk: string; sk: string } {
  return { pk: spacePartition(scope), sk: SEQUENCE_COUNTER_SK }
}

/** A Change_Feed item, ordered by zero-padded Server_Sequence for lexical Query order. */
export function changeFeedKey(scope: SpaceScope, serverSequence: number): { pk: string; sk: string } {
  return { pk: spacePartition(scope), sk: key('CHANGE', padSequence(serverSequence)) }
}

/** Prefix used to Query the whole feed for a space in Server_Sequence order. */
export const CHANGE_FEED_SK_PREFIX = `CHANGE${DELIM}`

/** Team_Space-scoped Creation_Operation_Lookup, resolvable before an Investigation ID is known. */
export function creationOperationKey(scope: SpaceScope, operationId: string): { pk: string; sk: string } {
  return { pk: spacePartition(scope), sk: key('CREATEOP', operationId) }
}

/**
 * The subject -> Investigation pointer used by subject lookup. Multiple
 * Investigations for one subject each get their own pointer row under the same
 * `SUBJECT#{binding}#{type}#{stableId}` SK prefix, so all Investigations for a
 * subject are one Query, never a Scan.
 */
export function subjectPointerKey(
  scope: SpaceScope,
  subject: SubjectReference,
  investigationId: string
): { pk: string; sk: string } {
  return {
    pk: spacePartition(scope),
    sk: key('SUBJECT', subject.sourceBindingId, subject.sourceType, subject.stableSourceId, investigationId)
  }
}

/** SK prefix that selects every Investigation pointer for one stable subject. */
export function subjectPointerPrefix(subject: SubjectReference): string {
  return `${key('SUBJECT', subject.sourceBindingId, subject.sourceType, subject.stableSourceId)}${DELIM}`
}

// ---------------------------------------------------------------------------
// Investigation-partition keys: metadata, Runs, Events (timeline), check-finish
// uniqueness, Checkpoints, Artifacts, and per-operation idempotency.
// ---------------------------------------------------------------------------

export interface InvestigationScope extends SpaceScope {
  investigationId: string
}

/** Partition key holding one Investigation's metadata and child rows. */
export function investigationPartition(scope: InvestigationScope): string {
  return key('INV', scope.tenantId, scope.spaceId, scope.investigationId)
}

export const INVESTIGATION_META_SK = 'META'

export function investigationMetaKey(scope: InvestigationScope): { pk: string; sk: string } {
  return { pk: investigationPartition(scope), sk: INVESTIGATION_META_SK }
}

export function runKey(scope: InvestigationScope, runId: string): { pk: string; sk: string } {
  return { pk: investigationPartition(scope), sk: key('RUN', runId) }
}

/** SK prefix selecting every Run in one Investigation. */
export const RUN_SK_PREFIX = `RUN${DELIM}`

/** A durable Event, ordered by zero-padded Server_Sequence for timeline Query order. */
export function eventKey(
  scope: InvestigationScope,
  serverSequence: number,
  eventId: string
): { pk: string; sk: string } {
  return { pk: investigationPartition(scope), sk: key('EVENT', padSequence(serverSequence), eventId) }
}

/** SK prefix selecting one Investigation's ordered Event timeline. */
export const EVENT_SK_PREFIX = `EVENT${DELIM}`

/**
 * Per-Investigation check-finish uniqueness record. One finish payload per
 * `(Investigation_ID, Check_ID)`; this conditional row is what enforces that
 * uniqueness (Requirement 10.16-10.18, 14.14). It does not replace the ordered
 * Event row.
 */
export function checkFinishKey(scope: InvestigationScope, checkId: string): { pk: string; sk: string } {
  return { pk: investigationPartition(scope), sk: `${key('CHECK', checkId)}${DELIM}FINISH` }
}

export function checkpointKey(scope: InvestigationScope, checkpointId: string): { pk: string; sk: string } {
  return { pk: investigationPartition(scope), sk: key('CHECKPOINT', checkpointId) }
}

/** SK prefix selecting every Checkpoint candidate in one Investigation. */
export const CHECKPOINT_SK_PREFIX = `CHECKPOINT${DELIM}`

export function artifactKey(scope: InvestigationScope, artifactId: string): { pk: string; sk: string } {
  return { pk: investigationPartition(scope), sk: key('ARTIFACT', artifactId) }
}

/** SK prefix selecting every Artifact manifest in one Investigation. */
export const ARTIFACT_SK_PREFIX = `ARTIFACT${DELIM}`

/** Per-operation idempotency record scoped to an Investigation. */
export function idempotencyKey(scope: InvestigationScope, operationId: string): { pk: string; sk: string } {
  return { pk: investigationPartition(scope), sk: key('IDEMPOTENCY', operationId) }
}

// ---------------------------------------------------------------------------
// Presence keys: keyed by the STABLE Subject_Reference and the authenticated
// observer / gateway / activity kind. Optional Investigation/Run metadata is
// context stored on the item, never part of the key.
// ---------------------------------------------------------------------------

export type PresenceActivityKind = 'viewing' | 'working'

export interface PresenceObserver {
  /** Authenticated_Subject's Entra object identifier. */
  subjectObjectId: string
  gatewayId: string
  activityKind: PresenceActivityKind
}

/**
 * Presence partition for one live subject. Built from the stable
 * Subject_Reference only — `displayLabel` is deliberately excluded so a label
 * change never moves presence to a new partition (Requirement 6.10, 15.11).
 */
export function presencePartition(scope: SpaceScope, subject: SubjectReference): string {
  return key(
    'PRESENCE',
    scope.tenantId,
    scope.spaceId,
    subject.sourceBindingId,
    subject.sourceType,
    subject.stableSourceId
  )
}

/**
 * One Presence_Lease row. Two leases collide only when the full observer tuple
 * (subject, gateway, activity kind) matches, so a viewing and a working lease,
 * or two gateways, are distinct rows under one subject partition.
 */
export function presenceLeaseKey(
  scope: SpaceScope,
  subject: SubjectReference,
  observer: PresenceObserver
): { pk: string; sk: string } {
  return {
    pk: presencePartition(scope, subject),
    sk: key('SUBJECT', observer.subjectObjectId, observer.gatewayId, observer.activityKind)
  }
}

/** SK prefix selecting every current lease for one subject (batch presence). */
export const PRESENCE_SK_PREFIX = `SUBJECT${DELIM}`

// ---------------------------------------------------------------------------
// Lifecycle / deletion keys.
// ---------------------------------------------------------------------------

/** Partition holding an Investigation's Tombstone and deletion job progress. */
export function deletePartition(scope: InvestigationScope): string {
  return key('DELETE', scope.tenantId, scope.spaceId, scope.investigationId)
}

export const TOMBSTONE_SK = 'TOMBSTONE'

export function tombstoneKey(scope: InvestigationScope): { pk: string; sk: string } {
  return { pk: deletePartition(scope), sk: TOMBSTONE_SK }
}

export function deletionJobKey(scope: InvestigationScope, step: string): { pk: string; sk: string } {
  return { pk: deletePartition(scope), sk: key('JOB', step) }
}

// ---------------------------------------------------------------------------
// Scope extraction — parsing a key back to its Tenant + Team_Space.
// ---------------------------------------------------------------------------

/**
 * Parse the Tenant and Team_Space out of any collaboration partition key. This
 * is the round-trip half of the containment invariant: every key this module
 * produces carries its scope, and this recovers it. Returns `null` for a string
 * that is not a recognized collaboration partition key.
 */
export function scopeFromPartitionKey(pk: string): SpaceScope | null {
  const parts = splitKey(pk)
  const [prefix, tenantId, spaceId] = parts
  if (tenantId === undefined || spaceId === undefined) return null
  switch (prefix) {
    case 'SPACE':
      // SPACE#{tenant}#{space}
      if (parts.length !== 3) return null
      return { tenantId: decodeComponent(tenantId), spaceId: decodeComponent(spaceId) }
    case 'INV':
    case 'DELETE':
      // {prefix}#{tenant}#{space}#{investigation}
      if (parts.length !== 4) return null
      return { tenantId: decodeComponent(tenantId), spaceId: decodeComponent(spaceId) }
    case 'PRESENCE':
      // PRESENCE#{tenant}#{space}#{binding}#{type}#{stableSourceId...}
      if (parts.length < 6) return null
      return { tenantId: decodeComponent(tenantId), spaceId: decodeComponent(spaceId) }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Object_Store keys — the opaque S3 object key that backs an Artifact's bytes.
// Separate from the DynamoDB manifest row (artifactKey above): this is the
// physical write-once object location in the private versioned bucket.
// ---------------------------------------------------------------------------

/**
 * Opaque identifiers permitted in an object key. This conservative alphabet
 * means a malformed or hostile identifier can never inject a separator, walk
 * upward, or escape its scope prefix (Requirements 8.2, 7.2).
 */
const OBJECT_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/

function assertObjectId(kind: string, value: string): void {
  if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value) || value === '.' || value === '..') {
    throw new Error(`invalid opaque ${kind} identifier for object key`)
  }
}

/**
 * Build the write-once Object_Store key for an Artifact. The key is composed
 * ONLY of opaque Tenant, Team_Space, Investigation, and Artifact identifiers.
 * Original filenames never appear as path components (Requirement 8.2).
 */
export function artifactObjectKey(scope: InvestigationScope, artifactId: string): string {
  assertObjectId('tenant', scope.tenantId)
  assertObjectId('space', scope.spaceId)
  assertObjectId('investigation', scope.investigationId)
  assertObjectId('artifact', artifactId)
  return `t/${scope.tenantId}/s/${scope.spaceId}/i/${scope.investigationId}/a/${artifactId}`
}

/** Every produced object key is contained within its Tenant + Team_Space prefix. */
export function isObjectKeyContained(objectKey: string, scope: SpaceScope): boolean {
  const prefix = `t/${scope.tenantId}/s/${scope.spaceId}/`
  return objectKey.startsWith(prefix) && !objectKey.slice(prefix.length).includes('..')
}

/**
 * Reduce an arbitrary original filename to a single safe, path-free token for a
 * Content-Disposition attachment header. Directory components, control
 * characters, quotes, and CR/LF are stripped. The result is response metadata
 * only and is never used to build a storage key (Requirement 8.2, 8.12).
 */
export function sanitizeArtifactFilename(originalFilename: string): string {
  const base = (originalFilename ?? '').split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/\p{Cc}/gu, '')
    .replace(/["\\]/g, '')
    .replace(/[\r\n]/g, '')
    .trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    return 'artifact'
  }
  return cleaned.slice(0, 255)
}

/** Zero-pad a Server_Sequence so lexical Query order equals numeric order. */
export function padSequence(serverSequence: number): string {
  if (!Number.isInteger(serverSequence) || serverSequence < 0) {
    throw new RangeError(`server sequence must be a non-negative integer, got ${serverSequence}`)
  }
  // Team_Space sequences are bounded well within 15 digits.
  return String(serverSequence).padStart(15, '0')
}
