import assert from 'node:assert/strict'
import test from 'node:test'
import { isApiKeyOwner, validateIntegrationApiKeyRequest } from '../../server/utils/api-keys'

test('integration key creation accepts supported scopes and expiration choices', () => {
  assert.equal(validateIntegrationApiKeyRequest({
    name: 'Reporting job',
    scopes: ['accounts:read', 'costs:read'],
    expiresInDays: 90
  }), null)
  assert.equal(validateIntegrationApiKeyRequest({
    name: 'Long-lived integration',
    scopes: ['security:read'],
    neverExpires: true
  }), null)
})

test('integration key creation rejects invalid names, scopes, and expirations', () => {
  assert.match(validateIntegrationApiKeyRequest({ name: '', scopes: ['accounts:read'] }) || '', /name is required/)
  assert.match(validateIntegrationApiKeyRequest({ name: 'test', scopes: [] }) || '', /one scope/)
  assert.match(validateIntegrationApiKeyRequest({ name: 'test', scopes: ['admin'] }) || '', /Invalid scopes/)
  assert.match(validateIntegrationApiKeyRequest({
    name: 'test',
    scopes: ['accounts:read'],
    expiresInDays: 1.5
  }) || '', /whole number/)
  assert.match(validateIntegrationApiKeyRequest({
    name: 'test',
    scopes: ['accounts:read'],
    expiresInDays: 90,
    neverExpires: true
  }) || '', /either an expiration/)
})

test('API key ownership comparison is case-insensitive and denies other users', () => {
  const key = { createdBy: 'owner@example.com' }
  assert.equal(isApiKeyOwner(key, 'OWNER@example.com'), true)
  assert.equal(isApiKeyOwner(key, 'other@example.com'), false)
  assert.equal(isApiKeyOwner(undefined, 'owner@example.com'), false)
})
