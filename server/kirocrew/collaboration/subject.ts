/**
 * Shared Investigations — subject identity domain type (task 3.2).
 *
 * The `Subject_Reference` is `(Source_Binding, source type, Stable_Source_ID)`.
 * It mirrors the versioned cross-repository wire contract
 * (`tests/shared-investigations/contract/wire-contract.v1.schema.json`, owned
 * jointly by both repositories) for the subset the CollaborationRepository
 * storage keys and access patterns depend on.
 *
 * This lives in its own module (not the identity/scope `types.ts` owned by the
 * authentication layer) so the storage-key layer owns exactly the domain shape
 * it keys on. `displayLabel` is mutable display data and is never part of
 * identity, so it is never used to build a key (Requirement 6.10, 15.11).
 */

/** Source_System kinds recognized by a Subject_Reference. */
export type SourceType = 'jira' | 'servicenow' | 'gitlab' | 'aws' | 'extension'

/**
 * Stable subject identity. Subject lookup and presence keys are built from
 * `sourceBindingId`, `sourceType`, and `stableSourceId` only.
 */
export interface SubjectReference {
  sourceBindingId: string
  sourceType: SourceType
  stableSourceId: string
  /** Optional, mutable, display-only. Never used to build a key. */
  displayLabel?: string
}
