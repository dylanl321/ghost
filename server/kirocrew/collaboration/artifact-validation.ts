/**
 * Shared Investigations — Artifact validation (task 4.2).
 *
 * Owner: Ghostv2 artifact/domain validation.
 *
 * Pure, side-effect-free validation of an Artifact against the immutable stored
 * bytes and the Team_Space Evidence_Policy, run *before* a Ready_Manifest and
 * Artifact Event are committed. This module never touches storage or the
 * timeline; it only decides "may these post-redaction bytes be published as
 * this manifest in this policy?" and returns either the verified integrity
 * values (for finalization) or a typed, non-disclosing denial.
 *
 * The checks, in order (fail-fast, and ordered so a limit rejection is
 * distinguishable from a content rejection per Requirement 11.8):
 *
 *   1. Size ceiling  — reject over 10 MiB (or the policy's narrower cap) with a
 *                      limit-specific error and NO truncation (Req 11.7, 11.8).
 *   2. Media type    — reject a type outside the first-release allow-list or the
 *                      policy's permitted set, with NO raw fallback (Req 11.9,
 *                      11.10).
 *   3. Required metadata / provenance — the manifest must carry the integrity
 *                      and capture-context fields the Artifact_Manifest requires
 *                      (Req 8.3, 11.13, 11.14).
 *   4. Redaction policy — an explicit file must be redacted when the policy
 *                      requires it (Req 11.2).
 *   5. Integrity     — the SHA-256 and byte count of the ACTUAL stored bytes
 *                      must equal the declared values; the shared bytes are the
 *                      post-redaction bytes (Req 8.6, 8.7, 11.13).
 *
 * A failure of checks 3-5 is `validation_failed`; check 1 is `payload_too_large`
 * and check 2 is `unsupported_media_type`, so the client can tell a limit/type
 * rejection from a checksum mismatch without leaking any protected value.
 *
 * Requirements: 8.3, 8.6, 8.7, 11.2, 11.7-11.10, 11.13-11.15.
 */

import { payloadTooLarge, unsupportedMediaType, validationFailed } from './errors'
import {
  MAX_EXPLICIT_ARTIFACT_BYTES,
  SUPPORTED_ARTIFACT_MEDIA_TYPES,
  type ArtifactEvidencePolicy,
  type ArtifactManifest,
  type Sha256Hex
} from './artifact-types'

/** The verified integrity values a passing validation yields for finalization. */
export interface VerifiedArtifactIntegrity {
  sha256: Sha256Hex
  byteCount: number
}

/** What the validator inspects about the immutable stored object. */
export interface StoredObjectIntegrity {
  /** SHA-256 of the bytes actually persisted (computed by the ArtifactStore). */
  sha256?: Sha256Hex
  /** Byte count of the bytes actually persisted. */
  byteCount?: number
}

const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/

/**
 * Validate a reserved manifest against the stored bytes and the Team_Space
 * Evidence_Policy. Returns the verified integrity on success; throws a typed
 * {@link CollaborationAuthorizationError} on any failure. The thrown error is
 * safe to serialize to the wire (no bytes, checksums, or policy internals).
 */
export function validateArtifactForFinalization(
  manifest: ArtifactManifest,
  stored: StoredObjectIntegrity,
  policy: ArtifactEvidencePolicy
): VerifiedArtifactIntegrity {
  assertWithinSizeLimit(manifest, stored, policy)
  assertPermittedMediaType(manifest, policy)
  assertRequiredMetadata(manifest)
  assertRedactionPolicy(manifest, policy)
  return assertIntegrityMatches(manifest, stored)
}

/**
 * Check the declared and stored byte counts against the hard 10 MiB ceiling and
 * the policy's (never wider) limit. This runs first and against BOTH the
 * declared and the actual size, so an oversize upload is rejected with a
 * limit-specific error whether the client under-declared or not, and is never
 * truncated to fit (Requirement 11.7, 11.8).
 */
function assertWithinSizeLimit(
  manifest: ArtifactManifest,
  stored: StoredObjectIntegrity,
  policy: ArtifactEvidencePolicy
): void {
  const effectiveLimit = Math.min(MAX_EXPLICIT_ARTIFACT_BYTES, policy.maxExplicitArtifactBytes)
  const declared = manifest.byteCount
  const actual = stored.byteCount
  if (!Number.isInteger(declared) || declared < 0) throw validationFailed()
  if (declared > effectiveLimit) throw payloadTooLarge()
  if (typeof actual === 'number' && actual > effectiveLimit) throw payloadTooLarge()
}

/**
 * The manifest media type must be on the first-release allow-list AND permitted
 * by the Team_Space Evidence_Policy. A type outside either set is rejected
 * outright with no raw-content fallback (Requirement 11.9, 11.10).
 */
function assertPermittedMediaType(manifest: ArtifactManifest, policy: ArtifactEvidencePolicy): void {
  if (!SUPPORTED_ARTIFACT_MEDIA_TYPES.includes(manifest.mediaType)) {
    throw unsupportedMediaType()
  }
  if (!policy.permittedMediaTypes.includes(manifest.mediaType)) {
    throw unsupportedMediaType()
  }
}

/**
 * The Artifact_Manifest must record the integrity and capture-context metadata
 * required to describe the shared bytes: a well-formed SHA-256, a non-negative
 * byte count, a provenance, a collector version, and a collection time
 * (Requirements 8.3, 11.13, 11.14). Missing/malformed metadata is a content
 * validation failure, not a size/type rejection.
 */
function assertRequiredMetadata(manifest: ArtifactManifest): void {
  if (typeof manifest.sha256 !== 'string' || !LOWERCASE_SHA256.test(manifest.sha256)) {
    throw validationFailed()
  }
  if (!Number.isInteger(manifest.byteCount) || manifest.byteCount < 0) {
    throw validationFailed()
  }
  if (manifest.provenance !== 'automatic' && manifest.provenance !== 'explicit' && manifest.provenance !== 'legacy-import') {
    throw validationFailed()
  }
  if (typeof manifest.collectorVersion !== 'string' || manifest.collectorVersion.trim() === '') {
    throw validationFailed()
  }
  if (typeof manifest.collectedAt !== 'string' || !isIsoTimestamp(manifest.collectedAt)) {
    throw validationFailed()
  }
}

/**
 * An Explicit_Artifact must be redacted before finalization when the policy
 * requires it (Requirement 11.2). Automatic evidence is redacted client-side
 * before upload, so this guards operator-supplied explicit files specifically.
 */
function assertRedactionPolicy(manifest: ArtifactManifest, policy: ArtifactEvidencePolicy): void {
  if (policy.requireRedaction && manifest.provenance === 'explicit' && !manifest.redacted) {
    throw validationFailed()
  }
}

/**
 * The SHA-256 and byte count of the ACTUAL stored (post-redaction) bytes must
 * match the declared manifest values (Requirement 8.6, 8.7, 11.13). If the
 * store has not yet reported an integrity value the artifact cannot be
 * finalized. On success, the returned values are the verified integrity the
 * Ready_Manifest and Artifact Event record.
 */
function assertIntegrityMatches(
  manifest: ArtifactManifest,
  stored: StoredObjectIntegrity
): VerifiedArtifactIntegrity {
  if (typeof stored.sha256 !== 'string' || typeof stored.byteCount !== 'number') {
    // Bytes not durably observed yet: cannot finalize.
    throw validationFailed()
  }
  const storedSha = stored.sha256.toLowerCase()
  if (storedSha !== manifest.sha256.toLowerCase()) throw validationFailed()
  if (stored.byteCount !== manifest.byteCount) throw validationFailed()
  return { sha256: storedSha, byteCount: stored.byteCount }
}

/** A permissive ISO-8601 timestamp check (finalization records server time). */
function isIsoTimestamp(value: string): boolean {
  if (value.trim() === '') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed)
}
