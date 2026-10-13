/**
 * Shared Investigations — in-memory Checkpoint/Handoff read model (task 9.2).
 *
 * Owner: Ghostv2 collaboration domain.
 *
 * A deterministic in-memory backing store implementing both the
 * {@link CitationReadPort} (citation validation for Checkpoint publication) and
 * the {@link HandoffReadPort} (Handoff assembly). It mirrors the durable
 * Investigation partition the CollaborationRepository writes — Investigation
 * metadata, durable Events, Ready Artifacts, and Checkpoint candidates — so the
 * Checkpoint and Handoff services can be unit-tested without DynamoDB, exactly
 * as the feed service is tested against {@link InMemoryChangeFeedStore}.
 *
 * Reads are scope-contained by `(tenant, space, investigation)` and ordered by
 * Server_Sequence; there is no cross-scope enumeration.
 */

import type { InvestigationScope, SpaceScope } from './keys'
import type { ServerSequence } from './repository-types'
import type {
  CheckpointRecord,
  EvidenceIndexEntry,
  HandoffEvent
} from './checkpoint-types'
import type { CitationReadPort, HandoffReadPort } from './checkpoint-service'

interface InvestigationMeta {
  revision: number
  selectedCheckpointId?: string
}

/** A Ready Artifact plus the Server_Sequence at which it became citable. */
export interface ReadyArtifactRow extends EvidenceIndexEntry {
  serverSequence: ServerSequence
}

function scopeKey(scope: InvestigationScope): string {
  return `${scope.tenantId}\u0000${scope.spaceId}\u0000${scope.investigationId}`
}

function spaceKey(scope: SpaceScope): string {
  return `${scope.tenantId}\u0000${scope.spaceId}`
}

export class InMemoryCheckpointReadModel implements CitationReadPort, HandoffReadPort {
  private readonly meta = new Map<string, InvestigationMeta>()
  private readonly events = new Map<string, HandoffEvent[]>()
  private readonly readyArtifacts = new Map<string, ReadyArtifactRow[]>()
  private readonly checkpoints = new Map<string, CheckpointRecord>()
  private readonly sequenceBySpace = new Map<string, number>()

  // -- seeding helpers (used by tests / production projection wiring) --------

  setInvestigation(scope: InvestigationScope, meta: InvestigationMeta): void {
    this.meta.set(scopeKey(scope), { ...meta })
  }

  selectCheckpoint(scope: InvestigationScope, checkpointId: string, revision: number): void {
    const key = scopeKey(scope)
    const prior = this.meta.get(key) ?? { revision }
    this.meta.set(key, { ...prior, revision, selectedCheckpointId: checkpointId })
  }

  addEvent(scope: InvestigationScope, event: HandoffEvent): void {
    const key = scopeKey(scope)
    const list = this.events.get(key) ?? []
    list.push({ ...event })
    this.events.set(key, list)
    this.bumpSequence(scope, event.serverSequence)
  }

  addReadyArtifact(scope: InvestigationScope, row: ReadyArtifactRow): void {
    const key = scopeKey(scope)
    const list = this.readyArtifacts.get(key) ?? []
    list.push({ ...row })
    this.readyArtifacts.set(key, list)
    this.bumpSequence(scope, row.serverSequence)
  }

  addCheckpoint(scope: InvestigationScope, record: CheckpointRecord): void {
    this.checkpoints.set(`${scopeKey(scope)}\u0000${record.checkpointId}`, { ...record })
    this.bumpSequence(scope, record.serverSequence)
  }

  removeCheckpoint(scope: InvestigationScope, checkpointId: string): void {
    this.checkpoints.delete(`${scopeKey(scope)}\u0000${checkpointId}`)
  }

  private bumpSequence(scope: SpaceScope, sequence: ServerSequence): void {
    const k = spaceKey(scope)
    this.sequenceBySpace.set(k, Math.max(this.sequenceBySpace.get(k) ?? 0, sequence))
  }

  // -- CitationReadPort -------------------------------------------------------

  async hasEvent(scope: InvestigationScope, eventId: string): Promise<boolean> {
    const list = this.events.get(scopeKey(scope)) ?? []
    return list.some((e) => e.eventId === eventId)
  }

  async hasReadyArtifact(scope: InvestigationScope, artifactId: string): Promise<boolean> {
    const list = this.readyArtifacts.get(scopeKey(scope)) ?? []
    return list.some((a) => a.artifactId === artifactId)
  }

  // -- HandoffReadPort --------------------------------------------------------

  async getInvestigation(
    scope: InvestigationScope
  ): Promise<{ revision: number; selectedCheckpointId?: string } | null> {
    const found = this.meta.get(scopeKey(scope))
    return found ? { ...found } : null
  }

  async getCheckpoint(scope: InvestigationScope, checkpointId: string): Promise<CheckpointRecord | null> {
    const found = this.checkpoints.get(`${scopeKey(scope)}\u0000${checkpointId}`)
    return found ? { ...found } : null
  }

  async currentSequence(scope: SpaceScope): Promise<ServerSequence> {
    return this.sequenceBySpace.get(spaceKey(scope)) ?? 0
  }

  async eventsAfter(
    scope: InvestigationScope,
    exclusiveStart: ServerSequence,
    highWaterMark: ServerSequence,
    limit: number
  ): Promise<HandoffEvent[]> {
    const list = this.events.get(scopeKey(scope)) ?? []
    return list
      .filter((e) => e.serverSequence > exclusiveStart && e.serverSequence <= highWaterMark)
      .sort((a, b) => a.serverSequence - b.serverSequence)
      .slice(0, Math.max(0, limit))
      .map((e) => ({ ...e }))
  }

  async readyArtifactsAfter(
    scope: InvestigationScope,
    exclusiveStart: ServerSequence,
    highWaterMark: ServerSequence,
    limit: number
  ): Promise<ReadyArtifactRow[]> {
    const list = this.readyArtifacts.get(scopeKey(scope)) ?? []
    return list
      .filter((a) => a.serverSequence > exclusiveStart && a.serverSequence <= highWaterMark)
      .sort((a, b) => a.serverSequence - b.serverSequence)
      .slice(0, Math.max(0, limit))
      .map((a) => ({ ...a }))
  }
}
