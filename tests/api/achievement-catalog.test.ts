import assert from 'node:assert/strict'
import test from 'node:test'
import { findBadgeDefinition, mergeAchievementProgress } from '../../server/utils/achievement-store'
import { BADGE_DEFINITIONS } from '../../app/config/badgeDefinitions'

test('badge awards resolve only catalog badges', () => {
  const known = BADGE_DEFINITIONS[0]!
  assert.equal(findBadgeDefinition(known.id)?.name, known.name)
  assert.equal(findBadgeDefinition('made-up-badge'), undefined)
  assert.equal(findBadgeDefinition(undefined), undefined)
  assert.equal(findBadgeDefinition({ id: known.id }), undefined)
})

test('A progress sync never removes a badge the server already awarded', () => {
  const [first, second] = BADGE_DEFINITIONS as [typeof BADGE_DEFINITIONS[0], typeof BADGE_DEFINITIONS[0]]
  const existing = {
    userId: 'u@example.com', counts: {}, uniques: {}, seen: [],
    awarded: [first.id], awardedAt: { [first.id]: '2026-01-01T00:00:00.000Z' },
    updatedAt: '', createdAt: '2025-01-01T00:00:00.000Z'
  }
  const merged = mergeAchievementProgress(existing, {
    counts: { visits: 3, bad: 'x' as any }, uniques: {}, seen: [],
    awarded: [second.id, 'not-a-badge'], awardedAt: { [second.id]: '2026-02-01T00:00:00.000Z' }
  })
  assert.deepEqual(merged.awarded, [first.id, second.id])
  assert.equal(merged.awardedAt[first.id], '2026-01-01T00:00:00.000Z')
  assert.deepEqual(merged.counts, { visits: 3 })
  assert.equal(merged.createdAt, '2025-01-01T00:00:00.000Z')
})
