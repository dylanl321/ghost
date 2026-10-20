import assert from 'node:assert/strict'
import test from 'node:test'
import { getOAuthAuthorizationTtlSeconds } from '../../server/mcp/config'
import { classifyGhostRefreshFailure, createGhostOAuthConfiguration, createGhostRefreshEvent, GHOST_REFRESH_TOKEN_ROTATION, refreshErrorCode, shouldIssueGhostRefreshToken } from '../../server/mcp/oauth/provider'
import { canGrantKiroCrewAdmin, identityGroupNames, isExpiredInteractionSessionError, requestedGhostResourceScopes } from '../../server/routes/oauth/consent/[uid].post'

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

test('Ghost recognises the expired oidc interaction-session failure', () => {
  // Direct SessionNotFound instance, as oidc-provider throws it.
  const direct = Object.assign(new Error('invalid_request'), {
    name: 'SessionNotFound',
    error: 'invalid_request',
    error_description: 'interaction session id cookie not found'
  })
  assert.equal(isExpiredInteractionSessionError(direct), true)

  // Wrapped in a cause chain (Nitro re-throws through its own error).
  const nested = new Error('Interaction failed', {
    cause: Object.assign(new Error('invalid_request'), {
      name: 'SessionNotFound',
      error: 'invalid_request',
      error_description: 'interaction session id cookie not found'
    })
  })
  assert.equal(isExpiredInteractionSessionError(nested), true)

  // An unrelated failure keeps its own error semantics.
  assert.equal(isExpiredInteractionSessionError(new Error('database unavailable')), false)
  assert.equal(isExpiredInteractionSessionError(Object.assign(new Error('bad'), {
    name: 'InvalidClient',
    error: 'invalid_client'
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
  // No errorCode is fabricated when none is supplied.
  assert.equal('errorCode' in event, false)
})

test('Ghost refresh telemetry surfaces only the OAuth protocol error field', () => {
  // ONLY the OAuth protocol `error` field is the safe, low-cardinality code; the
  // free-form description (which can embed token/identity material) is never read.
  const errorCode = refreshErrorCode({
    error: 'invalid_grant',
    error_description: 'refresh token abc.def.ghi not found for alice@example.com',
    message: 'refresh token abc.def.ghi not found for alice@example.com'
  } as any)
  assert.equal(errorCode, 'invalid_grant')

  const event = createGhostRefreshEvent('failure', 'token_not_found', '2026-10-20T00:00:00.000Z', errorCode)
  assert.deepEqual(event, {
    type: 'mcp_oauth',
    event: 'refresh',
    timestamp: '2026-10-20T00:00:00.000Z',
    status: 'failure',
    reason: 'token_not_found',
    errorCode: 'invalid_grant'
  })

  // The serialized event never carries the secret-bearing description, identity,
  // or token material behind the sanitized code.
  const serialized = JSON.stringify(event)
  assert.equal(serialized.includes('alice@example.com'), false)
  assert.equal(serialized.includes('abc.def.ghi'), false)
  assert.equal(serialized.includes('error_description'), false)
})

test('Ghost refresh error code is NEVER derived from free-form message or error_detail', () => {
  // A secret-bearing message/error_description/error_detail with NO OAuth `error`
  // field must yield no errorCode — the message fallback (which would retain the
  // alphanumeric token value after sanitization) must never fire for refresh.
  const secret = 'bearer token=' + 'A'.repeat(200) + ' for user@host'
  assert.equal(refreshErrorCode({ message: secret } as any), undefined)
  assert.equal(refreshErrorCode({ error_detail: secret } as any), undefined)
  assert.equal(refreshErrorCode({ error_description: secret } as any), undefined)

  // And the omitted field means no secret material can reach the event at all.
  const event = createGhostRefreshEvent('failure', 'other', '2026-10-20T00:00:00.000Z', refreshErrorCode({ message: secret } as any))
  const serialized = JSON.stringify(event)
  assert.equal('errorCode' in event, false)
  assert.equal(serialized.includes('AAAA'), false)
  assert.equal(serialized.includes('user@host'), false)

  // Nothing to extract yields no errorCode (so the field is omitted).
  assert.equal(refreshErrorCode(undefined), undefined)
  assert.equal(refreshErrorCode({}), undefined)
  // A non-string protocol error value is ignored, not coerced.
  assert.equal(refreshErrorCode({ error: { nested: 'object' } } as any), undefined)
})

test('Ghost refresh error code sanitizes and bounds a malformed OAuth error value', () => {
  // A malformed protocol `error` value is sanitized (whitespace/punctuation
  // stripped) and bounded to 64 chars — never emitted raw.
  const malformed = 'invalid grant\n<script>=' + 'x'.repeat(200)
  const errorCode = refreshErrorCode({ error: malformed } as any)
  assert.ok(errorCode && errorCode.length <= 64)
  assert.equal(errorCode!.includes(' '), false)
  assert.equal(errorCode!.includes('<'), false)
  assert.equal(errorCode!.includes('='), false)
  assert.equal(errorCode!.includes('\n'), false)
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

test('Kiro Crew OAuth preserves session groups when Graph lookup is unavailable', () => {
  assert.deepEqual(identityGroupNames({
    groups: [{ displayName: 'AWS-Product-Team' }, 'Another-Group']
  }), ['AWS-Product-Team', 'Another-Group'])
  assert.deepEqual(identityGroupNames({
    claims: { groups: ['AWS-Product-Team'] }
  }, ['Graph-Resolved-Group', 'AWS-Product-Team']), ['AWS-Product-Team', 'Graph-Resolved-Group'])
})
