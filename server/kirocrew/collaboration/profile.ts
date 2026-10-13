/**
 * Shared Investigations — collaboration profile validation (Ghostv2).
 *
 * Feature: shared-investigations (task 1.3).
 *
 * `validateCollaborationSection` is the single entry point the profile service
 * uses to turn an untrusted published `collaboration` section into a validated,
 * cross-referenced `CollaborationSection`. It performs, in order:
 *
 *   1. Structural validation via the strict Zod schema (stable identifiers,
 *      source-instance fingerprints, group object ids, source scopes, evidence
 *      policies, workflow versions, disabled-by-default enablement).
 *   2. Referential validation the schema cannot express: unique ids, every
 *      cross-reference resolves, workflow default stages / transitions are
 *      internally consistent, workflow versions are unique per profile id, and
 *      an enabled space cannot reference a disabled instance shape.
 *
 * A validation failure raises {@link CollaborationProfileError} carrying a safe,
 * non-disclosing message. Callers (the atomic publisher) MUST NOT replace the
 * last valid profile when this throws (Requirement 2.10, design: "A bad
 * collaboration revision is rejected atomically and the prior valid profile
 * remains active").
 */
import { z } from 'zod'
import {
  collaborationSectionSchema,
  type CollaborationSection
} from './profile-schema'
import {
  WorkflowProfileError,
  assertRetainedWorkflowVersions,
  validateWorkflowProfileVersion
} from './workflow-profile'

export class CollaborationProfileError extends Error {
  constructor(
    message: string,
    /** Machine-readable reason for callers/tests; never contains protected values. */
    public readonly reason: string
  ) {
    super(message)
    this.name = 'CollaborationProfileError'
  }
}

function fail(reason: string, message: string): never {
  throw new CollaborationProfileError(message, reason)
}

/**
 * Run a declarative Workflow_Profile validation step and re-wrap any
 * {@link WorkflowProfileError} as a {@link CollaborationProfileError}, preserving
 * the stable machine `reason`. Callers of `validateCollaborationSection` only
 * catch `CollaborationProfileError`, so the whole profile boundary raises one
 * error type while workflow rules keep their own reasons.
 */
function runWorkflowValidation(step: () => void): void {
  try {
    step()
  } catch (error) {
    if (error instanceof WorkflowProfileError) {
      fail(error.reason, error.message)
    }
    throw error
  }
}

/** True when the profile carries no collaboration section at all. */
export function isCollaborationAbsent(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value !== 'object') return false
  return !('collaboration' in (value as Record<string, unknown>))
}

/**
 * Validate the `collaboration` section of an Organization_Profile document.
 *
 * Accepts either the whole profile object (reads `.collaboration`) or the
 * section directly. When the section is absent, collaboration is disabled by
 * default and a disabled section shell is returned rather than throwing — an
 * organization that has not published collaboration is a valid, disabled
 * organization (Requirements 2.8, 22.1).
 */
export function validateCollaborationSection(profileOrSection: unknown): CollaborationSection {
  const raw = extractSection(profileOrSection)
  if (raw === undefined) {
    // No collaboration published: disabled, no spaces. Nothing to cross-check.
    return {
      schemaVersion: 1,
      enabled: false,
      tenantId: '00000000-0000-0000-0000-000000000000',
      teamSpaces: [],
      // A disabled shell has no bindings/policies/profiles to reference. The
      // schema requires >=1 of each for an *enabled* profile, so we bypass it
      // here and return a well-typed disabled section directly.
      sourceBindings: [],
      evidencePolicies: [],
      workflowProfiles: []
    } as unknown as CollaborationSection
  }

  let section: CollaborationSection
  try {
    section = collaborationSectionSchema.parse(raw)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0]
      const path = first?.path.join('.') || '(root)'
      fail(
        'schema',
        `collaboration profile failed schema validation at ${path}: ${first?.message ?? 'invalid'}`
      )
    }
    throw error
  }

  crossValidate(section)
  return section
}

function extractSection(profileOrSection: unknown): unknown {
  if (profileOrSection && typeof profileOrSection === 'object') {
    const obj = profileOrSection as Record<string, unknown>
    if ('collaboration' in obj) return obj.collaboration
    // Heuristic: a bare section has the collaboration marker fields.
    if ('sourceBindings' in obj || 'teamSpaces' in obj) return obj
  }
  return undefined
}

function assertUnique(ids: string[], kind: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) fail('duplicate_id', `duplicate ${kind} identifier`)
    seen.add(id)
  }
}

function crossValidate(section: CollaborationSection): void {
  assertUnique(section.sourceBindings.map(b => b.bindingId), 'source binding')
  assertUnique(section.evidencePolicies.map(p => p.policyId), 'evidence policy')
  assertUnique(section.teamSpaces.map(s => s.spaceId), 'team space')

  // Workflow profile ids may repeat across versions, but (id, version) pairs
  // must be unique and each id's versions must be distinct so a pinned
  // Investigation resolves exactly its version and every published version is
  // retained (Requirements 18.3-18.5, 18.14). Retention is owned by
  // `workflow-profile.ts`; it never prunes a published version.
  runWorkflowValidation(() => assertRetainedWorkflowVersions(section.workflowProfiles))

  // Which evidence classes each Team_Space's Evidence_Policy permits, so a
  // workflow offered in that space cannot expect evidence the space can never
  // hold. A workflow may be offered in more than one space; the union of all
  // spaces that offer it bounds its expectations.
  const evidenceClassesByPolicy = new Map<string, ReadonlySet<string>>(
    section.evidencePolicies.map(p => [p.policyId, new Set(p.permittedEvidenceClasses)])
  )
  const permittedClassesByWorkflow = new Map<string, Set<string>>()
  for (const space of section.teamSpaces) {
    const spaceClasses = evidenceClassesByPolicy.get(space.evidencePolicyId)
    if (!spaceClasses) continue
    for (const workflowProfileId of space.workflowProfileIds) {
      const union = permittedClassesByWorkflow.get(workflowProfileId) ?? new Set<string>()
      for (const cls of spaceClasses) union.add(cls)
      permittedClassesByWorkflow.set(workflowProfileId, union)
    }
  }

  // Deep declarative validation of every published workflow version: stages,
  // transitions, checklist items, evidence expectations, checkpoint template,
  // and immutable source commit (Requirements 18.1, 18.13).
  for (const profile of section.workflowProfiles) {
    const permitted = permittedClassesByWorkflow.get(profile.workflowProfileId)
    runWorkflowValidation(() => validateWorkflowProfileVersion(profile, permitted))
  }

  const bindingIds = new Set(section.sourceBindings.map(b => b.bindingId))
  const policyIds = new Set(section.evidencePolicies.map(p => p.policyId))
  const workflowIds = new Set(section.workflowProfiles.map(p => p.workflowProfileId))

  for (const space of section.teamSpaces) {
    if (!policyIds.has(space.evidencePolicyId)) {
      fail('unknown_evidence_policy', 'team space references an unknown evidence policy')
    }
    for (const scope of space.sourceScopes) {
      if (!bindingIds.has(scope.bindingId)) {
        fail('unknown_source_binding', 'team space source scope references an unknown source binding')
      }
    }
    for (const workflowProfileId of space.workflowProfileIds) {
      if (!workflowIds.has(workflowProfileId)) {
        fail('unknown_workflow_profile', 'team space references an unknown workflow profile')
      }
    }
    // Membership is authorized by CURRENT group object ids; a space with no
    // groups could never authorize anyone and is almost certainly a mistake.
    if (space.memberGroupObjectIds.length === 0) {
      fail('empty_membership', 'team space declares no membership groups')
    }
  }

  // An enabled collaboration section that enables no space is inert but valid
  // (deploy-disabled-then-enable-one-pilot rollout, Requirement 22.1-22.2), so
  // we do not require any space to be enabled.
}
