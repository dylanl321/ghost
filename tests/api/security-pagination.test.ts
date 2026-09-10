import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decodeSecurityCursor,
  encodeSecurityCursor,
  mergeSecurityStreams,
  securityQueryFingerprint,
  type SecurityStreamState
} from '../../server/utils/security-api-pagination'
import { parseInspectorQuery, parseSecurityHubQuery } from '../../server/utils/security-api-parameters'
import { getIntegrationAccountEnvironmentErrors } from '../../server/utils/integration-account-scope'
import { querySecurityHubApi } from '../../server/utils/security-hub-api'
import { queryInspectorApi } from '../../server/utils/inspector-api'

process.env.SECURITY_API_CURSOR_SECRET = 'test-only-security-cursor-secret'

interface Record {
  id: string
  rank: number
}

test('k-way cursor traversal preserves global order without caps, omissions, or duplicates', async () => {
  const source = {
    a: Array.from({ length: 1105 }, (_, index) => ({ id: `a-${index}`, rank: index * 2 })),
    b: Array.from({ length: 2105 }, (_, index) => ({ id: `b-${index}`, rank: index * 2 + 1 }))
  }
  const fingerprint = securityQueryFingerprint({ accounts: ['a', 'b'], sort: 'rank' })
  const initial: SecurityStreamState[] = [{ id: 'a', offset: 0 }, { id: 'b', offset: 0 }]
  let cursor: string | undefined
  const received: Record[] = []

  do {
    const states = decodeSecurityCursor(cursor, fingerprint, initial)
    const result = await mergeSecurityStreams(states, 37, async state => {
      const start = Number(state.token || 0)
      const records = source[state.id as keyof typeof source].slice(start, start + 100)
      const next = start + records.length
      return {
        records,
        nextToken: next < source[state.id as keyof typeof source].length ? String(next) : undefined
      }
    }, (left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
    received.push(...result.records)
    cursor = result.hasMore ? encodeSecurityCursor(fingerprint, result.states) : undefined
  } while (cursor)

  assert.equal(received.length, 3210)
  assert.equal(new Set(received.map(item => item.id)).size, received.length)
  assert.deepEqual(received.map(item => item.rank), [...received.map(item => item.rank)].sort((a, b) => a - b))
  assert.ok(received.some(item => item.id === 'a-1100'), 'must pass the former 1,000-finding cap')
  assert.ok(received.some(item => item.id === 'b-2050'), 'must pass 20 upstream pages')
})

test('signed cursors reject tampering, expiration, and filter or account mismatch', () => {
  const initial = [{ id: 'region:account', offset: 0 }]
  const fingerprint = securityQueryFingerprint({ accounts: ['111111111111'], severity: ['HIGH'] })
  const cursor = encodeSecurityCursor(fingerprint, initial, 1_000)

  assert.throws(() => decodeSecurityCursor(`${cursor}x`, fingerprint, initial, 1_001), /pagination cursor/i)
  assert.throws(() => decodeSecurityCursor(cursor, securityQueryFingerprint({ accounts: ['222222222222'] }), initial, 1_001), /pagination cursor/i)
  assert.throws(() => decodeSecurityCursor(cursor, fingerprint, [{ id: 'other-stream', offset: 0 }], 1_001), /pagination cursor/i)
  assert.throws(() => decodeSecurityCursor(cursor, fingerprint, initial, 1_000 + 15 * 60 * 1000), /pagination cursor/i)
})

test('date rules, historical states, and defaults parse consistently', () => {
  const securityHub = parseSecurityHubQuery({
    workflowStatus: 'RESOLVED,SUPPRESSED',
    recordState: 'ARCHIVED',
    limit: '50'
  })
  assert.deepEqual(securityHub.workflowStatuses, ['RESOLVED', 'SUPPRESSED'])
  assert.deepEqual(securityHub.recordStates, ['ARCHIVED'])
  assert.equal(securityHub.date.dateField, 'firstObservedAt')
  assert.equal('lookbackDays' in securityHub.date ? securityHub.date.lookbackDays : undefined, 30)

  const inspector = parseInspectorQuery({ status: 'CLOSED', severity: 'CRITICAL,HIGH' })
  assert.deepEqual(inspector.statuses, ['CLOSED'])
  assert.equal(inspector.date.start, undefined, 'Inspector defaults to all active/history records without a date cap')

  assert.throws(() => parseSecurityHubQuery({ startDate: '2026-01-01T00:00:00Z' }), /supplied together/i)
  assert.throws(() => parseInspectorQuery({
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-01-02T00:00:00Z',
    lookbackDays: '2'
  }), /cannot be combined/i)
  assert.throws(() => parseInspectorQuery({ status: 'NOT_A_STATUS' }), /unsupported values/i)
})

test('missing partition IDs produce explicit per-account errors', () => {
  const errors = getIntegrationAccountEnvironmentErrors([
    {
      accountId: '111111111111',
      accountName: 'Commercial only'
    },
    {
      accountId: '222222222222',
      govCloudAccountId: '333333333333',
      accountName: 'Dual partition'
    }
  ], 'govcloud')

  assert.deepEqual(errors, [{
    code: 'MISSING_ENVIRONMENT_ACCOUNT_ID',
    environment: 'govcloud',
    account: {
      accountId: '111111111111',
      govCloudAccountId: undefined,
      requestId: undefined,
      accountName: 'Commercial only'
    },
    message: 'Commercial only does not have a govcloud account ID.'
  }])
})

test('finding queries return account errors without broadening to organization scope', async () => {
  const accounts = [{ accountId: '111111111111', accountName: 'Commercial only' }]

  const hub = await querySecurityHubApi(accounts, parseSecurityHubQuery({
    environment: 'govcloud',
    regions: 'us-gov-west-1'
  }))
  assert.deepEqual(hub.records, [])
  assert.equal(hub.errors.length, 1)
  assert.deepEqual(hub.accounts, [])

  const inspector = await queryInspectorApi(accounts, parseInspectorQuery({
    environment: 'govcloud',
    regions: 'us-gov-west-1'
  }))
  assert.deepEqual(inspector.records, [])
  assert.equal(inspector.errors.length, 1)
  assert.deepEqual(inspector.accounts, [])
})

test('curated provider filters are parsed for AWS pushdown', () => {
  const hub = parseSecurityHubQuery({
    product: 'GuardDuty,Inspector',
    findingIds: 'finding-1',
    resourceIds: 'resource-1',
    resourceTypes: 'AwsEc2Instance',
    findingTypes: 'Software and Configuration Checks',
    controls: 'EC2.1',
    complianceStandards: 'standards/aws-foundational-security-best-practices/v/1.0.0',
    complianceStatus: 'FAILED',
    format: 'asff',
    sortBy: 'updatedAt',
    sortOrder: 'asc'
  })
  assert.deepEqual(hub.products, ['GuardDuty', 'Inspector'])
  assert.deepEqual(hub.controls, ['EC2.1'])
  assert.deepEqual(hub.complianceStatuses, ['FAILED'])
  assert.equal(hub.format, 'asff')
  assert.equal(hub.sortBy, 'updatedAt')

  const inspector = parseInspectorQuery({
    findingTypes: 'PACKAGE_VULNERABILITY',
    resourceTypes: 'AWS_ECR_CONTAINER_IMAGE',
    resourceIds: 'sha256:resource',
    findingArns: 'arn:finding',
    vulnerabilityIds: 'CVE-2026-0001,GHSA-example',
    relatedVulnerabilityIds: 'CVE-2025-0001',
    packageNames: 'openssl',
    repositoryNames: 'service',
    imageDigests: 'sha256:image',
    fixAvailable: 'YES,PARTIAL',
    exploitAvailable: 'NO',
    minInspectorScore: '4.5',
    maxInspectorScore: '9.5',
    title: 'OpenSSL'
  })
  assert.deepEqual(inspector.vulnerabilityIds, ['CVE-2026-0001', 'GHSA-example'])
  assert.deepEqual(inspector.fixAvailable, ['YES', 'PARTIAL'])
  assert.equal(inspector.minInspectorScore, 4.5)
  assert.equal(inspector.title, 'OpenSSL')
})
