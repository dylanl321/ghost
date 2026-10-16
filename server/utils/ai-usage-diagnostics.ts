/**
 * Pure, dependency-free diagnostics helpers for the AI usage collector.
 *
 * Kept separate from `ai-usage-collector.ts` (which imports the AWS SDK) so the
 * normalization logic can be unit tested in isolation. Purely additive: these
 * values are only logged to help isolate which collection phase dominates the
 * job duration and never influence collection behavior.
 */

/** Phase timings (milliseconds) and account/region target counts for one run. */
export interface AIUsageCollectionDiagnostics {
  scopeResolutionMs: number
  telemetryCollectionMs: number
  costCollectionMs: number
  causeCollectionMs: number
  persistenceMs: number
  accountRegionTargetsAttempted: number
  accountRegionTargetsSucceeded: number
}

/** Clamp a raw timing/count reading to a finite, non-negative integer. */
export function normalizeDiagnosticValue(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.round(value)
}

/** Normalize every diagnostic field so logged values are always safe integers. */
export function normalizeAIUsageDiagnostics(raw: AIUsageCollectionDiagnostics): AIUsageCollectionDiagnostics {
  return {
    scopeResolutionMs: normalizeDiagnosticValue(raw.scopeResolutionMs),
    telemetryCollectionMs: normalizeDiagnosticValue(raw.telemetryCollectionMs),
    costCollectionMs: normalizeDiagnosticValue(raw.costCollectionMs),
    causeCollectionMs: normalizeDiagnosticValue(raw.causeCollectionMs),
    persistenceMs: normalizeDiagnosticValue(raw.persistenceMs),
    accountRegionTargetsAttempted: normalizeDiagnosticValue(raw.accountRegionTargetsAttempted),
    accountRegionTargetsSucceeded: normalizeDiagnosticValue(raw.accountRegionTargetsSucceeded)
  }
}
