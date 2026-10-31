import assert from 'node:assert/strict'
import test from 'node:test'
import { HISTORY_KEY_PREFIX, historyRowKey, normalizeStoredItem, toHistoryEntry } from '../../server/utils/site-config'

test('History rows get their own table key, so they never replace the setting', () => {
  const key = historyRowKey('ui.dashboardLayout.default', '2026-10-30T12:00:00.000Z')
  assert.equal(key, 'history#ui.dashboardLayout.default#2026-10-30T12:00:00.000Z')
  assert.ok(key.startsWith(HISTORY_KEY_PREFIX))
  assert.notEqual(key, 'ui.dashboardLayout.default')
})

test('History rows map back to the entry shape the admin UI shows', () => {
  const entry = toHistoryEntry({
    key: 'history#features.x#2026-10-30T12:00:00.000Z',
    configKey: 'features.x',
    oldValue: false,
    newValue: true,
    changedBy: 'admin@example.com',
    changedAt: '2026-10-30T12:00:00.000Z',
  })
  assert.equal(entry.key, 'features.x')
  assert.equal(entry.newValue, true)
})

test('A setting overwritten by an old-format history row reads back as the value the admin saved', () => {
  const legacy = {
    key: 'ui.dashboardLayout.default',
    PK: 'CONFIG#ui.dashboardLayout.default',
    SK: 'HISTORY#2026-10-01T00:00:00.000Z',
    oldValue: null,
    newValue: { sections: [] },
    changedBy: 'admin@example.com',
    changedAt: '2026-10-01T00:00:00.000Z',
  }
  const item = normalizeStoredItem(legacy)
  assert.deepEqual(item.value, { sections: [] })
  assert.equal(item.type, 'object')
  assert.equal(item.category, 'ui')
  assert.equal(item.updatedBy, 'admin@example.com')
  assert.equal('SK' in item, false)
})

test('Normal config rows pass through unchanged', () => {
  const row = { key: 'features.x', value: true, type: 'boolean', category: 'features' }
  assert.equal(normalizeStoredItem(row), row)
})
