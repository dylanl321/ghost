import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeEffectiveIdentityCenterAssignments } from '../../server/mcp/idc-admin-access'

test('effective Identity Center access combines and deduplicates direct and group sources', () => {
  const assignment = { accountId: '111111111111', permissionSetArn: 'arn:permission-set/admin', role: 'Admin' }
  const records = mergeEffectiveIdentityCenterAssignments('commercial', [assignment], [
    { group: { displayName: 'Platform Admins' }, assignments: [assignment, assignment] },
    { group: { displayName: 'Incident Responders' }, assignments: [assignment] }
  ])
  assert.equal(records.length, 1)
  assert.deepEqual(records[0]?.sources, [
    { type: 'direct' },
    { type: 'group', groupName: 'Platform Admins' },
    { type: 'group', groupName: 'Incident Responders' }
  ])
})
