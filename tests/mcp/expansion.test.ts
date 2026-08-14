import assert from 'node:assert/strict'
import test from 'node:test'
import { statusForFindings } from '../../server/mcp/compliance'
import { hashEvidence } from '../../server/mcp/evidence'
import { isLiveGoldenImage } from '../../server/mcp/golden-amis'
import { deduplicateRemediationFindings } from '../../server/mcp/remediation'

test('classifies health domains without an overall score', () => {
  assert.equal(statusForFindings({ critical: 1, high: 0, medium: 0 }), 'critical')
  assert.equal(statusForFindings({ critical: 0, high: 1, medium: 0 }), 'warning')
  assert.equal(statusForFindings({ critical: 0, high: 0, medium: 0 }), 'healthy')
})

test('filters Golden AMIs by both authoritative approval tags', () => {
  assert.equal(isLiveGoldenImage({ Tags: [{ Key: 'GD_Approved', Value: 'Y' }, { Key: 'Release', Value: 'Latest' }] }), true)
  assert.equal(isLiveGoldenImage({ Tags: [{ Key: 'GD_Approved', Value: 'Y' }, { Key: 'Release', Value: 'Previous' }] }), false)
})

test('evidence hashes are stable across object key order', () => {
  assert.equal(hashEvidence({ b: 2, a: { y: 2, x: 1 } }), hashEvidence({ a: { x: 1, y: 2 }, b: 2 }))
})

test('remediation groups deduplicate matching CVE/package/workload findings', () => {
  const groups = deduplicateRemediationFindings([
    { findingArn: 'one', accountId: '1', region: 'us-gov-west-1', severity: 'HIGH', title: 'CVE', type: 'PACKAGE_VULNERABILITY', status: 'ACTIVE', cveIds: ['CVE-2026-1'], packageName: 'openssl', instanceId: 'i-12345678' },
    { findingArn: 'two', accountId: '1', region: 'us-gov-west-1', severity: 'HIGH', title: 'CVE', type: 'PACKAGE_VULNERABILITY', status: 'ACTIVE', cveIds: ['CVE-2026-1'], packageName: 'openssl', instanceId: 'i-12345678' }
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.affectedFindingCount, 2)
  assert.equal(groups[0]?.deploymentState, 'currently_deployed')
})
