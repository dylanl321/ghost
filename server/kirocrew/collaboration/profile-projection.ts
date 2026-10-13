/**
 * Shared Investigations — safe collaboration profile projections (Ghostv2).
 *
 * Feature: shared-investigations (task 1.3).
 *
 * A validated {@link CollaborationSection} contains SERVER-SIDE authorization
 * inputs: Entra group object identifiers, source-instance fingerprints, evidence
 * policy internals, and workflow definitions. Collaboration consumers (the
 * Operator, the dashboard, the Registry client status payload) must see ONLY
 * safe labels and capabilities (Requirements 2.3, 6.5; design GHOST_Profile_Service:
 * "expose only safe labels/capabilities").
 *
 * These functions are the single boundary that turns the internal profile into
 * the consumer-facing `SpaceSummary` shape from the wire contract. Group object
 * ids, fingerprints, endpoints, policy internals, and tenant ids never cross it.
 */
import type {
  CollaborationSection,
  CollaborationSpaceCapability,
  CollaborationTeamSpace
} from './profile-schema'

/** Consumer-facing Team_Space projection (wire-contract SpaceSummary shape). */
export interface SafeSpaceSummary {
  spaceId: string
  label: string
  capabilities: CollaborationSpaceCapability[]
}

/**
 * Derive the capabilities a space advertises. Every enabled space supports the
 * baseline collaboration surface; capabilities are not per-Operator here (that
 * is decided per operation by TeamSpaceAuthorizer in task 2.x) — this is the
 * published surface the space offers.
 */
function spaceCapabilities(space: CollaborationTeamSpace): CollaborationSpaceCapability[] {
  if (!space.enabled) return []
  return ['list', 'search', 'read', 'contribute', 'artifact-read', 'artifact-write', 'presence']
}

/** Project one Team_Space to its safe, consumer-facing summary. */
export function projectSpace(space: CollaborationTeamSpace): SafeSpaceSummary {
  return {
    spaceId: space.spaceId,
    label: space.label,
    capabilities: spaceCapabilities(space)
  }
}

/**
 * Project the enabled Team_Spaces of a validated collaboration section to safe
 * summaries. When collaboration is disabled, no spaces are exposed. Disabled
 * pilot spaces are also withheld — a space the Administrator has not enabled is
 * not offered to any consumer (Requirement 22.1).
 */
export function projectSafeSpaces(section: CollaborationSection): SafeSpaceSummary[] {
  if (!section.enabled) return []
  return section.teamSpaces.filter(space => space.enabled).map(projectSpace)
}

/**
 * Whether collaboration is active for this profile. False when the section is
 * disabled or no space is enabled (Requirements 2.8, 22.1).
 */
export function isCollaborationActive(section: CollaborationSection): boolean {
  return section.enabled && section.teamSpaces.some(space => space.enabled)
}
