import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeActivityMessage } from '../../server/utils/activity-message'
import { serializeLogArg } from '../../server/utils/logger'

test('Activity messages take the user from the session, not the client', () => {
  assert.equal(
    normalizeActivityMessage('Action - USER:someone.else, TYPE:export.csv', 'jdoe'),
    'Action - USER:jdoe, TYPE:export.csv'
  )
  assert.equal(normalizeActivityMessage('Login - USER:x\nNavigation - USER:y', 'jdoe'), 'Login - USER:jdoe Navigation - USER:y')
  assert.equal(normalizeActivityMessage('no user field', 'jdoe'), null)
})

test('Log serialization keeps nested errors and survives circular objects', () => {
  const circular: any = { name: 'loop' }
  circular.self = circular
  assert.match(serializeLogArg(circular), /\[Circular\]/)
  const nested = JSON.parse(serializeLogArg({ error: new Error('boom') }))
  assert.equal(nested.error.message, 'boom')
})
