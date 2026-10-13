import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveRequestId } from '../../server/utils/request-id'

test('accepts a conservative safe x-request-id token', () => {
  for (const id of ['abc123', 'req.123_45:ab-CD', 'A'.repeat(128)]) {
    assert.equal(resolveRequestId(id), id)
  }
})

test('rejects unsafe or oversized x-request-id and mints a UUID', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  for (const bad of [
    'has space',
    'inject\nnewline',
    'semi;colon',
    'quote"mark',
    'A'.repeat(129),
    '',
    undefined,
    123,
    ['abc'],
  ]) {
    assert.match(resolveRequestId(bad as unknown), uuid)
  }
})
