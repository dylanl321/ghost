/**
 * Shared Investigations — collaboration section of the versioned
 * Organization_Profile (Ghostv2-owned shared TypeScript schema).
 *
 * Feature: shared-investigations (task 1.3). Owner: Ghostv2 profile service.
 *
 * The GHOST_Profile_Service publishes collaboration enablement, Team_Spaces,
 * Source_Bindings, Evidence_Policies, and versioned Workflow_Profiles through a
 * versioned Organization_Profile (Requirement 2.1). This module is the
 * authoritative structural + referential validator for that `collaboration`
 * section:
 *
 *  - Stable identifiers, source-instance fingerprints, Entra group object IDs,
 *    source scopes, Evidence_Policies, and Workflow_Profile versions are all
 *    validated (Requirements 2.1, 6.5, 6.7, 6.8, 18.13).
 *  - Collaboration is disabled by default: a profile with no explicit
 *    `enabled: true` (or with no collaboration section) yields a disabled
 *    profile, and pilot Team_Spaces stay disabled until explicitly enabled
 *    (Requirements 2.8, 22.1).
 *  - Group object identifiers, source-instance fingerprints, endpoints, storage
 *    settings, tokens, and secret values are SERVER-SIDE only. The safe
 *    projection in `profile-projection.ts` is the only thing exposed to
 *    collaboration consumers/Operators (Requirements 2.3, 6.5).
 *
 * The schema is deliberately `.strict()` everywhere so an Administrator cannot
 * smuggle an endpoint, token, or storage setting into a validated profile —
 * unknown keys are rejected rather than silently carried to a consumer.
 */
import { z } from 'zod'

/** Opaque, stable identifier used inside the profile (space, binding, policy, profile IDs). */
const stableId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, 'must be a stable opaque identifier')

/** Operator-visible label. Never encodes secrets, endpoints, or group object IDs. */
const safeLabel = z.string().min(1).max(256)

/**
 * A Microsoft Entra group object identifier is a GUID. It is a protected,
 * SERVER-SIDE authorization input and is never exposed to Operators
 * (Requirement 2.3). Validated here so a malformed / non-GUID value (e.g. a
 * group *name*, which would leak human-meaningful org structure) is rejected.
 */
const entraGroupObjectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    'must be an Entra group object id (GUID), not a display name'
  )

/** The Entra tenant object identifier (GUID) the profile is bound to. */
const tenantObjectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    'tenantId must be an Entra tenant object id (GUID)'
  )

const sourceType = z.enum(['jira', 'servicenow', 'gitlab', 'aws', 'extension'])

/**
 * A Source_Binding binds a Team_Space to a specific Source_System *instance*.
 * `bindingId` is the Stable published identifier (Requirement 6.7: preserved
 * across profile revisions while the instance is unchanged). `instanceFingerprint`
 * is a stable, non-human-readable fingerprint of the Source_System instance
 * (e.g. a hash of the instance base URL / cloud id): when the instance changes,
 * the fingerprint changes and a NEW bindingId is required (Requirement 6.8).
 * The fingerprint is server-side and never projected to Operators.
 */
const sourceBinding = z
  .object({
    bindingId: stableId,
    sourceType,
    /** Stable, opaque fingerprint of the bound Source_System instance. */
    instanceFingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'instanceFingerprint must be a lowercase sha-256 hex digest'),
    /** Optional short safe label for administrator display only; never an endpoint. */
    label: safeLabel.optional()
  })
  .strict()

/**
 * A source scope restricts which subjects within a bound Source_System instance
 * belong to a Team_Space. It references a Source_Binding by id and optionally
 * narrows by stable source-side identifiers (project/board/table keys), never by
 * endpoint or credential.
 */
const sourceScope = z
  .object({
    bindingId: stableId,
    /** Optional stable source-side selectors (project keys, board ids, table names). */
    includeStableIds: z.array(z.string().min(1).max(512)).max(200).optional()
  })
  .strict()

const evidenceClass = z.enum([
  'jira-issue',
  'servicenow-record',
  'gitlab-pipeline',
  'gitlab-job',
  'gitlab-trace',
  'aws-read-output',
  'operator-file',
  'checkpoint-document'
])

const mediaType = z.enum([
  'text/plain; charset=utf-8',
  'text/markdown',
  'application/json',
  'text/csv',
  'application/pdf',
  'image/png',
  'image/jpeg'
])

/**
 * An Evidence_Policy defines the permitted evidence classes, media types,
 * projection, and byte limits for a Team_Space (Requirement 2.1). It is
 * server-side authorization/validation data and is not projected to Operators.
 */
const evidencePolicy = z
  .object({
    policyId: stableId,
    permittedEvidenceClasses: z.array(evidenceClass).min(1).max(32),
    permittedMediaTypes: z.array(mediaType).min(1).max(16),
    /** Explicit-file upper bound. Never exceeds the 10 MiB hard ceiling. */
    maxExplicitArtifactBytes: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
    /** Whether post-redaction is required before an artifact may be finalized. */
    requireRedaction: z.boolean()
  })
  .strict()

/** A stable, non-human-encoded identifier used inside a Workflow_Profile (stage/checklist/expectation ids). */
const workflowElementId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, 'must be a stable workflow element identifier')

const workflowStage = z
  .object({
    stageId: workflowElementId,
    label: safeLabel
  })
  .strict()

const workflowTransition = z
  .object({
    from: workflowElementId,
    to: workflowElementId
  })
  .strict()

/**
 * A checklist item is declarative process guidance pinned into a Workflow_Profile
 * version (Requirement 18.1). It is data, never executable: it carries a stable
 * id, an Operator-visible label, whether it is required for completion, and an
 * optional stage it belongs to. Pinned checklist meaning must remain stable for
 * existing Investigations (Requirement 18.5), which the version-retention rules
 * in `workflow-profile.ts` guarantee.
 */
const checklistItem = z
  .object({
    checklistItemId: workflowElementId,
    label: safeLabel,
    /** Whether this item must be satisfied before completion is permitted. */
    required: z.boolean().default(false),
    /** Optional stage the item is associated with; must be a declared stage. */
    stageId: workflowElementId.optional()
  })
  .strict()

/**
 * An evidence expectation is a declarative rule describing evidence a stage or
 * checklist item is expected to have (Requirement 18.1). It references declared
 * workflow elements and permitted Evidence_Policy classes by stable id/class —
 * it never embeds queries, endpoints, or code (definitions are non-executable).
 */
const evidenceExpectation = z
  .object({
    expectationId: workflowElementId,
    label: safeLabel,
    /** Evidence classes this expectation is satisfied by (validated against the space Evidence_Policy). */
    evidenceClasses: z.array(evidenceClass).min(1).max(32),
    /** Optional stage this expectation applies to; must be a declared stage. */
    stageId: workflowElementId.optional(),
    /** Optional checklist item this expectation supports; must be a declared checklist item. */
    checklistItemId: workflowElementId.optional(),
    /** Whether the expectation must be met before completion. */
    required: z.boolean().default(false)
  })
  .strict()

/**
 * A declarative Checkpoint template (Requirement 18.1). It describes the
 * sections a ready Checkpoint document is expected to contain and whether a
 * ready Checkpoint is required for completion (Requirement 18.7). It is data
 * only — no executable content.
 */
const checkpointTemplate = z
  .object({
    /** Whether a selected ready Checkpoint is required to complete an Investigation. */
    requireForCompletion: z.boolean().default(true),
    /** Ordered, declarative document sections. Labels only, no executable content. */
    sections: z
      .array(
        z
          .object({
            sectionId: workflowElementId,
            label: safeLabel,
            required: z.boolean().default(false)
          })
          .strict()
      )
      .max(64)
      .default([])
  })
  .strict()

/**
 * A Workflow_Profile is a versioned, declarative definition (Requirement 18.1):
 * stable Stage identifiers and labels, permitted transitions, checklist items,
 * evidence expectations, and a Checkpoint template — all as declarative data
 * with no executable content. Task 1.4 validates these deeper structures; the
 * referential rules (default/transition/checklist/expectation stage references,
 * per-id version uniqueness, retention) live in `workflow-profile.ts` and
 * `profile.ts`.
 */
const workflowProfile = z
  .object({
    workflowProfileId: stableId,
    /** Monotonic published version pinned at Investigation creation (Requirement 18.3). */
    version: z.number().int().min(1),
    label: safeLabel,
    stages: z.array(workflowStage).min(1).max(64),
    transitions: z.array(workflowTransition).max(256).default([]),
    defaultStageId: z.string().min(1).max(128),
    /** Declarative checklist items pinned into this version (Requirement 18.1). */
    checklistItems: z.array(checklistItem).max(256).default([]),
    /** Declarative evidence expectations pinned into this version (Requirement 18.1). */
    evidenceExpectations: z.array(evidenceExpectation).max(256).default([]),
    /** Declarative Checkpoint template pinned into this version (Requirement 18.1, 18.7). */
    checkpointTemplate: checkpointTemplate.default({}),
    /**
     * The immutable reviewed source commit the definition was imported from
     * (design: `sourceCommit?: immutable reviewed commit`). When the reviewed
     * Workflow_Profile source is stored in GitLab, the Administrator publishes a
     * commit-pinned definition (Requirement 18.13); a full 40-hex commit sha is
     * required whenever a source commit is present.
     */
    sourceCommit: z
      .string()
      .regex(/^[0-9a-f]{40}$/, 'sourceCommit must be a full 40-hex commit sha')
      .optional(),
    /**
     * Backward-compatible commit-pinned GitLab source reference. Equivalent to
     * `sourceCommit`; when both are present they must agree (checked in
     * `workflow-profile.ts`). Presence requires an immutable 40-hex commit
     * (Requirement 18.13).
     */
    gitlabSource: z
      .object({
        commit: z.string().regex(/^[0-9a-f]{40}$/, 'gitlabSource.commit must be a full 40-hex commit sha')
      })
      .strict()
      .optional()
  })
  .strict()

const teamSpace = z
  .object({
    spaceId: stableId,
    label: safeLabel,
    /** A pilot / rollout space stays disabled until explicitly enabled (Requirement 22.1). */
    enabled: z.boolean().default(false),
    /** Current Entra group object ids authorizing membership. SERVER-SIDE only. */
    memberGroupObjectIds: z.array(entraGroupObjectId).min(1).max(64),
    sourceScopes: z.array(sourceScope).min(1).max(64),
    evidencePolicyId: stableId,
    /** Workflow_Profile ids offered in this space (first is the default). */
    workflowProfileIds: z.array(stableId).min(1).max(32)
  })
  .strict()

/**
 * The `collaboration` section of the Organization_Profile. `enabled` defaults
 * to false so an omitted flag never activates collaboration (Requirements 2.8,
 * 22.1). When absent entirely (see `parseCollaborationSection`), the profile is
 * treated as disabled with no spaces.
 */
export const collaborationSectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean().default(false),
    tenantId: tenantObjectId,
    teamSpaces: z.array(teamSpace).max(128).default([]),
    sourceBindings: z.array(sourceBinding).min(1).max(256),
    evidencePolicies: z.array(evidencePolicy).min(1).max(256),
    workflowProfiles: z.array(workflowProfile).min(1).max(256)
  })
  .strict()

export type CollaborationSection = z.infer<typeof collaborationSectionSchema>
export type CollaborationTeamSpace = z.infer<typeof teamSpace>
export type CollaborationSourceBinding = z.infer<typeof sourceBinding>
export type CollaborationEvidencePolicy = z.infer<typeof evidencePolicy>
export type CollaborationWorkflowProfile = z.infer<typeof workflowProfile>
export type CollaborationWorkflowStage = z.infer<typeof workflowStage>
export type CollaborationWorkflowTransition = z.infer<typeof workflowTransition>
export type CollaborationChecklistItem = z.infer<typeof checklistItem>
export type CollaborationEvidenceExpectation = z.infer<typeof evidenceExpectation>
export type CollaborationCheckpointTemplate = z.infer<typeof checkpointTemplate>
export type CollaborationSpaceCapability =
  | 'list'
  | 'search'
  | 'read'
  | 'contribute'
  | 'artifact-read'
  | 'artifact-write'
  | 'presence'
