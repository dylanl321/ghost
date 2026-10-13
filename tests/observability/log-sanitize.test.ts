import assert from 'node:assert/strict'
import test from 'node:test'
import { boundedLogField } from '../../server/utils/log-sanitize'

// eslint-disable-next-line no-control-regex -- intentionally matching control chars to assert they are stripped
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]')

test('returns undefined for non-strings so the field is omitted', () => {
  for (const value of [undefined, null, 123, {}, [], true]) {
    assert.equal(boundedLogField(value as unknown), undefined)
  }
})

test('strips control characters that enable log injection', () => {
  const forged = 'oops"}\n{"type":"request_error","injected":true'
  const result = boundedLogField(forged)
  assert.ok(result)
  assert.doesNotMatch(result!, CONTROL_CHARS)
  assert.ok(!result!.includes('\n'))
  // A single JSON.stringify of the record stays on one line.
  assert.equal(JSON.stringify({ errorMessage: result }).includes('\n'), false)
})

test('removes tabs and carriage returns too', () => {
  assert.equal(boundedLogField('a\tb\r\nc'), 'a b  c')
})

test('returns undefined once a value is only control chars/whitespace', () => {
  assert.equal(boundedLogField('\n\t\r '), undefined)
  assert.equal(boundedLogField(''), undefined)
})

test('caps length and marks truncation while staying within the bound', () => {
  const long = 'x'.repeat(1000)
  const result = boundedLogField(long, 256)
  assert.ok(result)
  assert.equal(result!.length, 256)
  assert.ok(result!.endsWith('…'))
})

test('passes short, clean values through unchanged', () => {
  assert.equal(boundedLogField('GET', 16), 'GET')
  assert.equal(boundedLogField('ValidationError'), 'ValidationError')
})
