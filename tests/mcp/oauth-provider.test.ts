import assert from 'node:assert/strict'
import test from 'node:test'
import { getOAuthAuthorizationTtlSeconds } from '../../server/mcp/config'
import { classifyGhostRefreshFailure, createGhostOAuthConfiguration, createGhostRefreshEvent, GHOST_REFRESH_TOKEN_ROTATION, shouldIssueGhostRefreshToken } from '../../server/mcp/oauth/provider'
import { canGrantKiroCrewAdmin, requestedGhostResourceScopes } from '../../server/routes/oauth/consent/[uid].post'

function client(options: {
  applicationType?: string
  clientAuthMethod?: string
  refreshGrant?: boolean
}) {
  return {
    applicationType: options.applicationType,
    clientAuthMethod: options.clientAuthMethod,
    grantTypeAllowed: (grantType: string) => grantType === 'refresh_token' && Boolean(options.refreshGrant)
  }
}

test('Ghost issues refresh tokens to registered native public clients', () => {
  assert.equal(shouldIssueGhostRefreshToken(client({
    applicationType: 'native',
    clientAuthMethod: 'none',
    refreshGrant: true
  })), true)
})

test('Ghost rejects refresh tokens for clients outside the native public policy', () => {
  assert.equal(shouldIssueGhostRefreshToken(client({
    applicationType: 'web',
    clientAuthMethod: 'none',
    refreshGrant: true
  })), false)
  assert.equal(shouldIssueGhostRefreshToken(client({
    applicationType: 'native',
    clientAuthMethod: 'client_secret_basic',
    refreshGrant: true
  })), false)
  assert.equal(shouldIssueGhostRefreshToken(client({
    applicationType: 'native',
    clientAuthMethod: 'none',
    refreshGrant: false
  })), false)
})

test('Ghost keeps Codex refresh tokens stable across startup refreshes', () => {
  // The provider configuration disables rotation so an interrupted client-side
  // credential write cannot leave Codex with a consumed refresh token.
  assert.equal(GHOST_REFRESH_TOKEN_ROTATION, false)
})

test('Ghost uses a bounded fixed authorization lifetime', () => {
  const previous = process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS
  try {
    delete process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS
    assert.equal(getOAuthAuthorizationTtlSeconds(), 90 * 24 * 60 * 60)
    process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS = '180'
    assert.equal(getOAuthAuthorizationTtlSeconds(), 180 * 24 * 60 * 60)
    process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS = '999'
    assert.equal(getOAuthAuthorizationTtlSeconds(), 365 * 24 * 60 * 60)
  } finally {
    if (previous === undefined) delete process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS
    else process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS = previous
  }
})

test('Ghost applies the same fixed lifetime to refresh tokens and grants', () => {
  const previous = process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS
  process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS = '90'
  try {
    const configuration = createGhostOAuthConfiguration({ resource: 'https://ghost.example.test/mcp', jwks: { keys: [] } })
    assert.equal(configuration.ttl.RefreshToken, 90 * 24 * 60 * 60)
    assert.equal(configuration.ttl.Grant, configuration.ttl.RefreshToken)
    assert.equal(configuration.rotateRefreshToken, false)
  } finally {
    if (previous === undefined) delete process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS
    else process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS = previous
  }
})

test('Ghost uses dynamic registration instead of URL-valued client metadata documents', () => {
  const configuration = createGhostOAuthConfiguration({ resource: 'https://ghost.example.test/mcp', jwks: { keys: [] } })

  assert.equal(configuration.features.registration.enabled, true)
  assert.equal(configuration.features.clientIdMetadataDocument.enabled, false)
})

test('Ghost categorizes refresh failures without token material', () => {
  assert.equal(classifyGhostRefreshFailure({ error_detail: 'refresh token not found' }), 'token_not_found')
  assert.equal(classifyGhostRefreshFailure({ error_detail: 'refresh token is expired' }), 'token_expired')
  assert.equal(classifyGhostRefreshFailure({ error_detail: 'refresh token already used' }), 'token_reused')
  assert.equal(classifyGhostRefreshFailure({ error_detail: 'grant not found' }), 'grant_not_found')
  assert.equal(classifyGhostRefreshFailure({ error_detail: 'grant is expired' }), 'grant_expired')
  assert.equal(classifyGhostRefreshFailure({ error_detail: 'client mismatch' }), 'client_mismatch')
  assert.equal(classifyGhostRefreshFailure({ error_detail: 'refresh token invalid (referenced account not found)' }), 'account_missing')
  assert.equal(classifyGhostRefreshFailure({ message: 'invalid_grant' }), 'other')
})

test('Ghost refresh telemetry excludes credentials and identity', () => {
  const event = createGhostRefreshEvent('failure', 'token_reused', '2026-08-14T15:00:00.000Z')
  assert.deepEqual(event, {
    type: 'mcp_oauth',
    event: 'refresh',
    timestamp: '2026-08-14T15:00:00.000Z',
    status: 'failure',
    reason: 'token_reused'
  })
  assert.equal(JSON.stringify(event).includes('tokenValue'), false)
  assert.equal(JSON.stringify(event).includes('subject'), false)
  assert.equal(JSON.stringify(event).includes('clientId'), false)
})

test('Ghost consent grants only requested supported resource scopes', () => {
  const resource = 'https://ghost.example.test/mcp'
  assert.deepEqual(requestedGhostResourceScopes(
    { scope: 'openid offline_access ghost.read', resource },
    { [resource]: ['ghost.read'] },
    resource
  ), ['ghost.read'])
})

test('Kiro Crew publishing follows the configured GHOST administrator role', () => {
  assert.equal(canGrantKiroCrewAdmin(['viewer', 'admin']), true)
  assert.equal(canGrantKiroCrewAdmin(['viewer', 'power_user']), false)
})
