import assert from 'node:assert/strict'
import test from 'node:test'
import { isMcpOfferingIntroActive } from '../../app/composables/useMcpOfferingDiscovery'

test('MCP offering introduction remains active for the first three impressions', () => {
  assert.equal(isMcpOfferingIntroActive({ seenCount: 0, acknowledged: false }), true)
  assert.equal(isMcpOfferingIntroActive({ seenCount: 1, acknowledged: false }), true)
  assert.equal(isMcpOfferingIntroActive({ seenCount: 2, acknowledged: false }), true)
  assert.equal(isMcpOfferingIntroActive({ seenCount: 3, acknowledged: false }), false)
})

test('MCP offering introduction retires after acknowledgement', () => {
  assert.equal(isMcpOfferingIntroActive({ seenCount: 0, acknowledged: true }), false)
})

test('MCP offering introduction waits for preferences and tolerates malformed counts', () => {
  assert.equal(isMcpOfferingIntroActive({ seenCount: 0, acknowledged: false }, false), false)
  assert.equal(isMcpOfferingIntroActive({ seenCount: Number.NaN, acknowledged: false }), true)
  assert.equal(isMcpOfferingIntroActive({ seenCount: -4, acknowledged: false }), true)
})
