/**
 * Shared Investigations — atomic collaboration profile publication (Ghostv2).
 *
 * Feature: shared-investigations (task 1.3). Owner: Ghostv2 profile service.
 *
 * The Organization_Profile is published as the `kirocrew.organization` setting
 * record inside a versioned Kiro Crew revision (see ../schema.ts, ../service.ts).
 * This module adds the collaboration-aware publication path:
 *
 *   - `publishCollaborationRevision` validates the `collaboration` section of the
 *     incoming `kirocrew.organization` record BEFORE the revision is committed.
 *     If validation fails, it throws and the underlying revision store is never
 *     asked to publish, so the last valid Organization_Profile stays CURRENT
 *     (Requirement 2.10; design: reject a bad collaboration revision atomically,
 *     prior valid profile remains active).
 *   - `readCurrentCollaborationSection` resolves the CURRENT revision's validated
 *     collaboration section (or a disabled shell when none is published), and
 *     `readCurrentSafeSpaces` returns only the safe projection for consumers
 *     (Requirements 2.3, 6.5).
 *
 * Enablement is disabled by default: an organization record without a
 * collaboration section, or with `enabled: false`, resolves to a disabled
 * section and no exposed spaces (Requirements 2.8, 22.1).
 */
import { getKiroCrewRepository } from '../repository'
import { publishKiroCrewRevision } from '../service'
import type { KiroCrewRecord, KiroCrewRevision } from '../types'
import {
  CollaborationProfileError,
  validateCollaborationSection
} from './profile'
import type { CollaborationSection } from './profile-schema'
import { projectSafeSpaces, type SafeSpaceSummary } from './profile-projection'

const ORGANIZATION_RECORD = 'kirocrew.organization'

/** Locate the organization setting record in a revision's records, if present. */
function organizationValue(records: KiroCrewRecord[]): unknown {
  const record = records.find(candidate => candidate.name === ORGANIZATION_RECORD)
  if (!record || record.type !== 'setting') return undefined
  return record.value
}

/**
 * Validate the collaboration section carried by a publish input's records.
 *
 * Throws {@link CollaborationProfileError} when the collaboration section is
 * present but invalid. Returns the validated section (a disabled shell when the
 * organization record or its collaboration section is absent). Pure and
 * side-effect free so it can be reused by tests and by the publish path.
 */
export function validateIncomingCollaboration(records: KiroCrewRecord[]): CollaborationSection {
  const organization = organizationValue(records)
  return validateCollaborationSection(organization)
}

/**
 * Publish a Kiro Crew revision after validating its collaboration section.
 *
 * The collaboration validation runs first. Only when it passes do we delegate to
 * the existing `publishKiroCrewRevision` (which itself validates the rest of the
 * record set and commits atomically with an expected-revision guard). A rejected
 * collaboration section therefore never advances CURRENT.
 */
export async function publishCollaborationRevision(
  raw: unknown,
  publishedBy: string
): Promise<KiroCrewRevision> {
  const input = raw as { records?: unknown }
  const records = Array.isArray(input?.records) ? (input.records as unknown[]) : []
  // Validate the collaboration section up front. On failure this throws and no
  // publish is attempted, preserving the last valid Organization_Profile. The
  // collaboration section lives in the non-secret `kirocrew.organization`
  // setting record; secret `preserve` placeholders (which carry no value) are
  // irrelevant to it and are skipped defensively.
  const concreteRecords = records.filter(
    (record): record is KiroCrewRecord =>
      !!record && typeof record === 'object' && !('preserve' in (record as Record<string, unknown>))
  )
  validateIncomingCollaboration(concreteRecords)
  return publishKiroCrewRevision(raw, publishedBy)
}

/**
 * Resolve the CURRENT revision's validated collaboration section. Returns a
 * disabled shell when nothing is published or no collaboration section exists.
 *
 * The CURRENT revision was validated at publish time, so this is expected to
 * pass; if a stored profile somehow fails validation, we fail closed to a
 * disabled section rather than exposing an unvalidated profile.
 */
export async function readCurrentCollaborationSection(): Promise<CollaborationSection> {
  const current = await getKiroCrewRepository().current()
  if (!current) return disabledSection()
  try {
    return validateIncomingCollaboration(current.records)
  } catch (error) {
    if (error instanceof CollaborationProfileError) return disabledSection()
    throw error
  }
}

/** Safe, consumer-facing spaces for the CURRENT profile (only when enabled). */
export async function readCurrentSafeSpaces(): Promise<SafeSpaceSummary[]> {
  return projectSafeSpaces(await readCurrentCollaborationSection())
}

function disabledSection(): CollaborationSection {
  return validateCollaborationSection(undefined)
}
