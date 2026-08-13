import assert from 'node:assert/strict'
import test from 'node:test'
import { GHOST_REFRESH_TOKEN_ROTATION, shouldIssueGhostRefreshToken } from '../../server/mcp/oauth/provider'

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
