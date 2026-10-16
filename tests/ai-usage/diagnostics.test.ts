import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeDiagnosticValue,
  normalizeAIUsageDiagnostics,
  type AIUsageCollectionDiagnostics
} from '../../server/utils/ai-usage-diagnostics'

test('normalizeDiagnosticValue rounds positive readings to integers', () => {
  assert.equal(normalizeDiagnosticValue(2712975.4), 2712975)
  assert.equal(normalizeDiagnosticValue(0.6), 1)
  assert.equal(normalizeDiagnosticValue(0), 0)
})

test('normalizeDiagnosticValue clamps negative and non-finite readings to zero', () => {
  assert.equal(normalizeDiagnosticValue(-5), 0)
  assert.equal(normalizeDiagnosticValue(Number.NaN), 0)
  assert.equal(normalizeDiagnosticValue(Number.POSITIVE_INFINITY), 0)
})

test('normalizeAIUsageDiagnostics returns finite non-negative integers for every field', () => {
  const raw: AIUsageCollectionDiagnostics = {
    scopeResolutionMs: 12.9,
    telemetryCollectionMs: 2_200_123.7,
    costCollectionMs: Number.NaN,
    causeCollectionMs: -3,
    persistenceMs: Number.POSITIVE_INFINITY,
    accountRegionTargetsAttempted: 48.2,
    accountRegionTargetsSucceeded: 47.8
  }

  const normalized = normalizeAIUsageDiagnostics(raw)

  assert.deepEqual(normalized, {
    scopeResolutionMs: 13,
    telemetryCollectionMs: 2_200_124,
    costCollectionMs: 0,
    causeCollectionMs: 0,
    persistenceMs: 0,
    accountRegionTargetsAttempted: 48,
    accountRegionTargetsSucceeded: 48
  })

  for (const value of Object.values(normalized)) {
    assert.ok(Number.isInteger(value) && value >= 0)
  }
})
