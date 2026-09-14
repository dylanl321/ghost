import assert from 'node:assert/strict'
import test from 'node:test'
import { marshall } from '@aws-sdk/util-dynamodb'
import { createGhostOAuthConfiguration, grantIncludesMcpResource } from '../../server/mcp/oauth/provider'
import { bootstrapFromRevision, redactRevision, revisionEtag } from '../../server/kirocrew/service'
import { validateKiroCrewRecords } from '../../server/kirocrew/schema'
import { KIROCREW_SCOPES } from '../../server/kirocrew/types'
import { DynamoKiroCrewRepository, KiroCrewRevisionConflict, MemoryKiroCrewRepository } from '../../server/kirocrew/repository'

const bootstrap = {
  name: 'kirocrew.bootstrap',
  type: 'setting' as const,
  value: {
    schemaVersion: 1,
    install: { products: 'cli,crew', channel: 'stable' },
    identityCenter: {
      startUrl: 'https://example.awsapps.com/start',
      ssoRegion: 'us-east-1'
    },
    crew: { apps: ['idc-accounts'] }
  }
}

test('the OAuth provider isolates Kiro Crew and MCP resources', async () => {
  const mcp = 'https://ghost.example.test/mcp'
  const kirocrew = 'https://ghost.example.test/api/kirocrew'
  const configuration = createGhostOAuthConfiguration({
    resources: [
      { resource: mcp, scopes: ['ghost.read'] },
      { resource: kirocrew, scopes: KIROCREW_SCOPES }
    ],
    jwks: { keys: [] }
  })
  const resourceInfo = configuration.features.resourceIndicators.getResourceServerInfo
  assert.deepEqual(await resourceInfo({}, kirocrew), {
    scope: KIROCREW_SCOPES.join(' '),
    audience: kirocrew,
    accessTokenTTL: 3600,
    accessTokenFormat: 'opaque'
  })
  assert.equal(configuration.scopes.includes('ghost.read'), true)
  assert.equal(configuration.scopes.includes('kirocrew.config.read'), true)
  await assert.rejects(() => resourceInfo({}, 'https://ghost.example.test/unknown'))
})

test('revoking a Kiro Crew-only grant cannot remove MCP delegation state', () => {
  const mcp = 'https://ghost.example.test/mcp'
  assert.equal(grantIncludesMcpResource({
    resources: { 'https://ghost.example.test/api/kirocrew': 'kirocrew.config.read' }
  }, mcp), false)
  assert.equal(grantIncludesMcpResource({
    resources: { [mcp]: 'ghost.read' }
  }, mcp), true)
})

test('configuration validates named records and bootstrap allowlist', () => {
  const records = validateKiroCrewRecords([
    bootstrap,
    { name: 'servicenow.password', type: 'secret', value: 'value' },
    { name: 'application.config', type: 'file', mediaType: 'application/json', value: '{"enabled":true}' }
  ])
  assert.equal(records.length, 3)
})

test('bootstrap accepts pointer-bound provisioning controls', () => {
  const records = validateKiroCrewRecords([{
    ...bootstrap,
    value: {
      ...bootstrap.value,
      provisioning_controls: {
        skills_sync: {
          repo_url: 'https://git.example.test/org/ai-agent-skills.git',
          repo_subpath: 'skills',
          ref: 'master',
          auto_remediate: true,
          locked: false,
          require_operator_confirm: false
        }
      }
    }
  }])
  assert.equal(records.length, 1)
})

test('secret-shaped non-secret fields and prohibited credentials are rejected', () => {
  assert.throws(() => validateKiroCrewRecords([
    bootstrap,
    { name: 'application.password', type: 'setting', value: 'not-allowed' }
  ]), /secret-shaped/)
  assert.throws(() => validateKiroCrewRecords([
    bootstrap,
    { name: 'aws_access_key_id', type: 'secret', value: 'AKIAEXAMPLE' }
  ]), /prohibited/)
  assert.throws(() => validateKiroCrewRecords([
    bootstrap,
    { name: 'ghost.oauth.refresh_token', type: 'secret', value: 'token' }
  ]), /prohibited/)
})

test('PEM content is allowed only in the bootstrap trust record', () => {
  const records = validateKiroCrewRecords([{
    ...bootstrap,
    value: {
      ...bootstrap.value,
      tls: { caCertPem: '-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----' }
    }
  }])
  assert.equal(records.length, 1)
  assert.throws(() => validateKiroCrewRecords([
    bootstrap,
    { name: 'application.pem', type: 'file', mediaType: 'text/plain', value: '-----BEGIN PRIVATE KEY-----' }
  ]), /PEM/)
})

test('ETags are stable and admin views redact secret values', () => {
  const revision = {
    schemaVersion: 1 as const,
    revision: 7,
    updatedAt: '2026-09-10T12:00:00.000Z',
    publishedBy: 'admin@example.test',
    records: validateKiroCrewRecords([
      bootstrap,
      { name: 'servicenow.token', type: 'secret', value: 'protected' }
    ])
  }
  assert.equal(revisionEtag(revision, 'config'), revisionEtag(revision, 'config'))
  assert.equal(bootstrapFromRevision(revision).revision, 7)
  const serialized = JSON.stringify(redactRevision(revision))
  assert.equal(serialized.includes('protected'), false)
  assert.equal(serialized.includes('configured'), true)
})

test('repository revisions are monotonic and reject stale publishers', async () => {
  const repository = new MemoryKiroCrewRepository()
  const first = await repository.publish({
    expectedRevision: 0,
    records: validateKiroCrewRecords([bootstrap]),
    publishedBy: 'admin@example.test'
  })
  assert.equal(first.revision, 1)
  await assert.rejects(
    repository.publish({
      expectedRevision: 0,
      records: first.records,
      publishedBy: 'other@example.test'
    }),
    (error: unknown) => error instanceof KiroCrewRevisionConflict && error.actualRevision === 1
  )
})

test('Dynamo repository reads Ghost-owned configuration with its supplied task-role client', async () => {
  const revision = {
    profileId: 'PROFILE#default',
    recordId: 'REV#000000000001',
    schemaVersion: 1,
    revision: 1,
    updatedAt: '2026-09-10T12:00:00.000Z',
    publishedBy: 'test',
    records: validateKiroCrewRecords([bootstrap])
  }
  const responses = [
    { Item: marshall({ profileId: 'PROFILE#default', recordId: 'CURRENT', revision: 1 }) },
    { Item: marshall(revision) }
  ]
  const client = {
    send: async () => responses.shift() || {}
  }
  const repository = new DynamoKiroCrewRepository('ghost-kirocrew-config-dev', client as any)
  const current = await repository.current()
  assert.equal(current?.revision, 1)
  assert.equal(current?.records[0]?.name, 'kirocrew.bootstrap')
})
