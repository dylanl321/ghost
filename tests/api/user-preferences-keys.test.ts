import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeLegacyPreferences, normalizePreferencesUserId } from '../../server/utils/user-preferences'

test('preference keys are the trimmed, lower-cased user id', () => {
  assert.equal(normalizePreferencesUserId(' Jane.Doe@Example.COM '), 'jane.doe@example.com')
})

test('a legacy row with real settings is not masked by a newer auto-created default', () => {
  const legacy = {
    userId: 'Jane.Doe@example.com',
    timezone: 'America/Chicago',
    preferences: { notificationPreferences: { muted: true }, favoriteAccounts: ['111111111111'] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  }
  const autoCreated = {
    userId: 'jane.doe@example.com',
    timezone: 'America/New_York',
    preferences: {},
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z'
  }
  const merged = mergeLegacyPreferences('jane.doe@example.com', autoCreated, legacy)
  assert.equal(merged.userId, 'jane.doe@example.com')
  assert.deepEqual(merged.preferences, legacy.preferences)
  assert.equal(merged.createdAt, '2026-01-01T00:00:00.000Z')
})

test('the more recently updated row wins a conflicting preference', () => {
  const merged = mergeLegacyPreferences('a@b.c', {
    userId: 'a@b.c', timezone: 'UTC', preferences: { digest: 'weekly' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z'
  }, {
    userId: 'A@b.c', timezone: 'America/Denver', preferences: { digest: 'daily', muted: false },
    createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z'
  })
  assert.equal(merged.timezone, 'UTC')
  assert.deepEqual(merged.preferences, { digest: 'weekly', muted: false })
})
