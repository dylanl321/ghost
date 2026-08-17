import assert from 'node:assert/strict'
import test from 'node:test'
import { costDeltas } from '../../server/mcp/cost-comparison'
import { parseCostAnomaly } from '../../server/utils/cost-anomalies'
import { calculateInstanceHealthScore } from '../../server/utils/instance-health'

test('cost comparison reconciles additions, removals, and percentage deltas', () => {
  const result = costDeltas(new Map([['EC2', 150], ['S3', 25]]), new Map([['EC2', 100], ['Lambda', 10]]))
  assert.deepEqual(result, [
    { key: 'EC2', current: 150, comparison: 100, delta: 50, percentChange: 50 },
    { key: 'S3', current: 25, comparison: 0, delta: 25, percentChange: null },
    { key: 'Lambda', current: 0, comparison: 10, delta: -10, percentChange: -100 }
  ])
})

test('cost anomalies retain AWS impact and linked-account evidence', () => {
  const result = parseCostAnomaly({
    AnomalyId: 'a-1',
    AnomalyStartDate: '2026-08-01',
    Impact: { TotalActualSpend: '150', TotalExpectedSpend: '100', TotalImpact: '50' },
    RootCauses: [{ LinkedAccount: '111111111111', Service: 'Amazon EC2' }]
  }, new Map([['111111111111', 'Example']]))
  assert.equal(result.accountName, 'Example')
  assert.equal(result.impact, 50)
  assert.equal(result.impactPercentage, 50)
  assert.equal(result.status, 'ONGOING')
})

test('instance health scoring applies bounded domain deductions', () => {
  assert.equal(calculateInstanceHealthScore(
    { status: 'NON_COMPLIANT', missingCount: 3 },
    { critical: 1, high: 0, medium: 0 },
    { critical: 0, high: 1, medium: 0 },
    { inAlarm: 1 }
  ), 39)
})
