import assert from 'node:assert/strict'
import test from 'node:test'
import { findBadgeDefinition } from '../../server/utils/achievement-store'
import { BADGE_DEFINITIONS } from '../../app/config/badgeDefinitions'

test('badge awards resolve only catalog badges', () => {
  const known = BADGE_DEFINITIONS[0]!
  assert.equal(findBadgeDefinition(known.id)?.name, known.name)
  assert.equal(findBadgeDefinition('made-up-badge'), undefined)
  assert.equal(findBadgeDefinition(undefined), undefined)
  assert.equal(findBadgeDefinition({ id: known.id }), undefined)
})
