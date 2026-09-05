import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSecurityProviderFailureLog,
  decodeSecurityCursor,
  encodeSecurityCursor,
  mergeSecurityStreams,
  sanitizeProviderError,
  securityQueryFingerprint,
  type SecurityStreamState
} from '../../server/utils/security-api-pagination'
import { parseInspectorQuery, parseSecurityHubQuery } from '../../server/utils/security-api-parameters'

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

test('date rules, historical states, defaults, and deprecated numeric pages parse consistently', () => {
  const securityHub = parseSecurityHubQuery({
    workflowStatus: 'RESOLVED,SUPPRESSED',
    recordState: 'ARCHIVED',
    page: '3',
    limit: '50'
  })
  assert.deepEqual(securityHub.workflowStatuses, ['RESOLVED', 'SUPPRESSED'])
  assert.deepEqual(securityHub.recordStates, ['ARCHIVED'])
  assert.equal(securityHub.page, 3)
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

// Build an AWS-SDK-shaped error that also carries sensitive fields we must never log.
function providerError() {
  return Object.assign(new Error('User arn:aws:iam::123456789012:role/GhostRole is not authorized'), {
    name: 'AccessDeniedException',
    stack: 'AccessDeniedException: at arn:aws:inspector2 (/app/secret-path.js:1:1)',
    $metadata: {
      requestId: 'req-abcdef-0001',
      httpStatusCode: 403,
      attempts: 3,
      cfId: 'cf-should-not-leak'
    }
  })
}

test('provider failure log carries only the allowlisted diagnostic fields', () => {
  const payload = buildSecurityProviderFailureLog('Amazon Inspector', providerError(), {
    operation: 'ListFindings',
    environment: 'commercial',
    page: 2,
    regionCount: 2,
    accountCount: 47
  }, 1_700_000_000_000)

  assert.deepEqual(payload, {
    type: 'security_provider_failure',
    level: 'error',
    provider: 'Amazon Inspector',
    code: 'AccessDeniedException',
    requestId: 'req-abcdef-0001',
    httpStatus: 403,
    attempts: 3,
    operation: 'ListFindings',
    environment: 'commercial',
    page: 2,
    regionCount: 2,
    accountCount: 47,
    timestamp: '2023-11-14T22:13:20.000Z'
  })
})

test('provider failure log omits raw error and undefined context', () => {
  // No name, no metadata, and no caller context: only the stable fields survive
  // and code falls back to the generic label.
  const payload = buildSecurityProviderFailureLog('Amazon Inspector', {}, undefined, 0)
  assert.deepEqual(Object.keys(payload).sort(), ['code', 'level', 'provider', 'timestamp', 'type'])
  assert.equal(payload.level, 'error')
  assert.equal(payload.code, 'ProviderError')
})

test('sanitizeProviderError emits one safe line and never leaks sensitive fields', () => {
  const originalWrite = process.stdout.write.bind(process.stdout)
  const lines: string[] = []
  ;(process.stdout as any).write = (chunk: string) => { lines.push(String(chunk)); return true }

  let thrown: any
  try {
    sanitizeProviderError('Amazon Inspector', providerError(), {
      operation: 'ListFindingAggregations',
      environment: 'govcloud',
      regionCount: 2,
      accountCount: 47
    })
  } catch (error) {
    thrown = error
  } finally {
    ;(process.stdout as any).write = originalWrite
  }

  // Exactly one structured record was emitted.
  assert.equal(lines.length, 1)
  const emitted = lines[0]!
  const record = JSON.parse(emitted)
  assert.equal(record.type, 'security_provider_failure')
  assert.equal(record.level, 'error')
  assert.equal(record.operation, 'ListFindingAggregations')
  assert.equal(record.httpStatus, 403)
  assert.equal(record.attempts, 3)

  // The raw error text, stack, ARNs, account IDs, and unlisted metadata must never appear.
  for (const secret of [
    'arn:aws:iam',
    'arn:aws:inspector2',
    '123456789012',
    'secret-path.js',
    'not authorized',
    'cf-should-not-leak',
    'stack',
    'message'
  ]) {
    assert.ok(!emitted.includes(secret), `emitted record must not contain "${secret}"`)
  }

  // The public 502 keeps its sanitized shape.
  assert.equal(thrown?.statusCode, 502)
  assert.equal(thrown?.data?.provider, 'Amazon Inspector')
  assert.equal(thrown?.data?.code, 'AccessDeniedException')
  assert.equal(thrown?.data?.requestId, 'req-abcdef-0001')
  assert.equal(thrown?.data?.httpStatus, undefined)
})
