import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAccountResolution } from '../../server/mcp/account-resolver'

const account = {
  accountId: '111111111111',
  govCloudAccountId: '222222222222',
  status: 'ACTIVE',
  enclaveStatus: 'Sustainment',
  name: 'Example'
}

test('prefers paired GovCloud ID for aliases and returns direct SysAdmin', () => {
  const result = buildAccountResolution(
    { account, identifierType: 'name', matchedValue: 'Example' },
    [{
      accountId: '111111111111',
      accountName: 'Example',
      commercialRoles: [],
      govCloudRoles: ['GDSSO_SysAdmin'],
      assignments: [{
        environment: 'govcloud',
        accountId: '222222222222',
        permissionSet: 'GDSSO_SysAdmin',
        sources: [{ type: 'direct' }]
      }]
    }]
  )
  assert.equal(result.canonical_account_id, '222222222222')
  assert.equal(result.partition, 'aws-us-gov')
  assert.equal(result.default_region, 'us-gov-west-1')
  assert.equal(result.direct_access.preferred_role, 'GDSSO_SysAdmin')
  assert.equal(result.direct_access.choice_required, false)
})

test('returns choice and concrete recipes from direct master assignments only', () => {
  const result = buildAccountResolution(
    { account, identifierType: 'govId', matchedValue: '222222222222' },
    [
      {
        accountId: '222222222222',
        accountName: 'Example',
        commercialRoles: [],
        govCloudRoles: ['GDSSO_Auditor'],
        assignments: [{
          environment: 'govcloud',
          accountId: '222222222222',
          permissionSet: 'GDSSO_Auditor',
          sources: [{ type: 'direct' }]
        }]
      },
      {
        accountId: '374673712317',
        accountName: 'GovCloud master',
        commercialRoles: [],
        govCloudRoles: ['GDSSO_SysAdmin', 'GroupOnly'],
        assignments: [
          {
            environment: 'govcloud',
            accountId: '374673712317',
            permissionSet: 'GDSSO_SysAdmin',
            sources: [{ type: 'direct' }]
          },
          {
            environment: 'govcloud',
            accountId: '374673712317',
            permissionSet: 'GroupOnly',
            sources: [{ type: 'group', groupName: 'example' }]
          }
        ]
      }
    ]
  )
  assert.equal(result.direct_access.choice_required, true)
  assert.deepEqual(result.direct_access.roles, ['GDSSO_Auditor'])
  assert.equal(result.hub_recipes.length, 2)
  assert.equal(result.hub_recipes[0]?.source_account_id, '374673712317')
  assert.equal(result.hub_recipes[0]?.source_role, 'GDSSO_SysAdmin')
  assert.equal(result.hub_recipes[0]?.target_role, 'GDMSReadOnlyRole')
  assert.equal(result.hub_recipes[1]?.requires_confirmation, true)
  assert.equal(JSON.stringify(result).includes('credential'), false)
  assert.equal(JSON.stringify(result).includes('GroupOnly'), false)
})

test('preserves suspended lifecycle status and exact commercial IDs', () => {
  const result = buildAccountResolution(
    {
      account: { accountId: '111111111111', status: 'SUSPENDED' },
      identifierType: 'accountId',
      matchedValue: '111111111111'
    },
    []
  )
  assert.equal(result.canonical_account_id, '111111111111')
  assert.equal(result.partition, 'aws')
  assert.equal(result.lifecycle_status, 'SUSPENDED')
  assert.deepEqual(result.hub_recipes, [])
})
