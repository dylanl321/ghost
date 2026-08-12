import assert from 'node:assert/strict'
import test from 'node:test'
import { mapMcpGroupsToAccounts } from '../../server/mcp/user-access'

test('maps the caller AWS groups to paired Commercial and GovCloud accounts', () => {
  const result = mapMcpGroupsToAccounts([
    { id: 'commercial-admin', displayName: 'AWS-111111111111_GDSSO_IAMAdmin' },
    { id: 'commercial-read', displayName: 'AWS_111111111111-GDSSO_ReadOnly' },
    { id: 'gov-read', displayName: 'AWS-222222222222_GDSSO_ReadOnly' },
    { id: 'unknown', displayName: 'AWS-333333333333_GDSSO_ReadOnly' }
  ], [{
    accountId: '111111111111',
    govCloudAccountId: '222222222222',
    name: 'Example account'
  }])

  assert.equal(result.accounts.length, 1)
  assert.deepEqual(result.accounts[0], {
    accountId: '111111111111',
    accountName: 'Example account',
    commercialAccountId: '111111111111',
    govCloudAccountId: '222222222222',
    commercialRoles: ['GDSSO_IAMAdmin', 'GDSSO_ReadOnly'],
    govCloudRoles: ['GDSSO_ReadOnly'],
    groups: ['AWS-111111111111_GDSSO_IAMAdmin', 'AWS_111111111111-GDSSO_ReadOnly', 'AWS-222222222222_GDSSO_ReadOnly']
  })
  assert.deepEqual(result.unmatchedGroups, ['AWS-333333333333_GDSSO_ReadOnly'])
})

test('maps captured distribution groups to accounts by account email prefix', () => {
  const result = mapMcpGroupsToAccounts([
    { id: 'distribution', displayName: 'ExampleProject.aws' },
    { id: 'unknown', displayName: 'MissingProject.aws' }
  ], [{
    accountId: '111111111111',
    govCloudAccountId: '222222222222',
    name: 'Example project',
    email: 'exampleproject.aws@gd-ms.com'
  }])

  assert.deepEqual(result.accounts, [{
    accountId: '111111111111',
    accountName: 'Example project',
    commercialAccountId: '111111111111',
    govCloudAccountId: '222222222222',
    commercialRoles: [],
    govCloudRoles: [],
    groups: ['ExampleProject.aws']
  }])
  assert.deepEqual(result.unmatchedGroups, ['MissingProject.aws'])
})
