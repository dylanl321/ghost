import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveRequestAuthContext } from '../../server/middleware/00-request-timing'

test('unauthenticated or missing auth yields no correlation fields', () => {
  assert.deepEqual(resolveRequestAuthContext(undefined), {})
  assert.deepEqual(resolveRequestAuthContext(null), {})
  assert.deepEqual(resolveRequestAuthContext({ isAuthenticated: false, authType: 'oidc' }), {})
})

test('OIDC users resolve a stable id preferring oid, then sub, then id', () => {
  assert.deepEqual(
    resolveRequestAuthContext({ isAuthenticated: true, authType: 'oidc', user: { oid: 'o-1', sub: 's-1', id: 'i-1' } }),
    { authType: 'oidc', userId: 'o-1' }
  )
  assert.deepEqual(
    resolveRequestAuthContext({ isAuthenticated: true, authType: 'oidc', user: { sub: 's-1', id: 'i-1' } }),
    { authType: 'oidc', userId: 's-1' }
  )
  assert.deepEqual(
    resolveRequestAuthContext({ isAuthenticated: true, authType: 'oidc', user: { claims: { id: 'c-1' } } }),
    { authType: 'oidc', userId: 'c-1' }
  )
})

test('API keys use apiKeyId as the stable user id, never the user object', () => {
  assert.deepEqual(
    resolveRequestAuthContext({ isAuthenticated: true, authType: 'apikey', apiKeyId: 'key-123' }),
    { authType: 'apikey', userId: 'key-123' }
  )
})

test('authType is still reported when no stable id is available', () => {
  assert.deepEqual(
    resolveRequestAuthContext({ isAuthenticated: true, authType: 'oidc', user: {} }),
    { authType: 'oidc' }
  )
})
