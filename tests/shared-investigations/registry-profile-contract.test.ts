import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import { validateCollaborationSection } from '../../server/kirocrew/collaboration/profile'

// Registry is the sibling deployment client. Exercise its published fixture
// against GHOST's authoritative structural and referential validator.
const fixture = new URL('../../../registry/schema/fixtures/collaboration-profile.valid.json', import.meta.url)
test('registry profile uses the authoritative GHOST collaboration schema', { skip: !existsSync(fixture) && 'Sibling registry checkout required for cross-repository contract verification' }, () => {
  const profile = JSON.parse(readFileSync(fixture, 'utf8'))
  const result = validateCollaborationSection(profile)
  assert.equal(result.enabled, true)
  assert.equal(result.teamSpaces.length, 1)
  assert.ok(result.sourceBindings[0]?.bindingId)
})
