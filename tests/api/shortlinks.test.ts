import assert from 'node:assert/strict'
import test from 'node:test'
import { SHORT_CODE_PATTERN, validateShortLinkInput } from '../../server/lib/shortlinks'

const valid = { originalUrl: 'https://ghost.example/account/costs', pagePath: '/account/costs', configData: { timeframe: '30d' } }

test('Short links only point to paths inside the app', () => {
  assert.equal(validateShortLinkInput(valid), null)
  assert.match(validateShortLinkInput({ ...valid, pagePath: 'https://evil.example' })!, /pagePath/)
  assert.match(validateShortLinkInput({ ...valid, pagePath: '//evil.example' })!, /pagePath/)
  assert.match(validateShortLinkInput({ ...valid, pagePath: '/\\evil.example' })!, /pagePath/)
})

test('Short link options are bounded', () => {
  assert.match(validateShortLinkInput({ ...valid, expiresInDays: 0 })!, /expiresInDays/)
  assert.match(validateShortLinkInput({ ...valid, configData: [] })!, /configData/)
  assert.match(validateShortLinkInput({ ...valid, configData: { big: 'x'.repeat(9000) } })!, /configData/)
  assert.equal(SHORT_CODE_PATTERN.test('abcD1234'), true)
  assert.equal(SHORT_CODE_PATTERN.test('../admin'), false)
})
