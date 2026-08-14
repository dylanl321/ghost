import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPersonalAccountContext } from '../../server/mcp/personal-account-context'

test('resolves favorite and recently viewed accounts while retaining missing saved IDs', () => {
  const context = buildPersonalAccountContext({
    preferences: {
      favoriteAccounts: ['111111111111', 'missing-account', '111111111111'],
      recentlyViewedAccounts: [
        { accountId: '222222222222', viewedAt: '2026-08-14T12:00:00.000Z' },
        { accountId: 'missing-account', viewedAt: '2026-08-13T12:00:00.000Z' }
      ]
    }
  }, [
    { accountId: '111111111111', name: 'Production', awsGovCloudAccountID: '999999999999', enclaveStatus: 'Active' },
    { accountId: '222222222222', projectName: 'Analytics', departmentNumber: '42' }
  ], 50)

  assert.equal(context.favorites.total, 2)
  assert.equal(context.favorites.accounts[0]?.displayName, 'Production')
  assert.equal(context.favorites.accounts[0]?.govCloudAccountId, '999999999999')
  assert.deepEqual(context.favorites.unresolvedAccountIds, ['missing-account'])
  assert.equal(context.recentAccounts.accounts[0]?.displayName, 'Analytics')
  assert.equal(context.recentAccounts.accounts[0]?.viewedAt, '2026-08-14T12:00:00.000Z')
  assert.equal(context.recentAccounts.accounts[1]?.resolved, false)
})

test('bounds each personal account list without changing its stored total', () => {
  const context = buildPersonalAccountContext({
    preferences: {
      favoriteAccounts: ['one', 'two'],
      recentlyViewedAccounts: [{ accountId: 'two' }, { accountId: 'one' }]
    }
  }, [
    { accountId: 'one', name: 'One' },
    { accountId: 'two', name: 'Two' }
  ], 1)

  assert.equal(context.favorites.total, 2)
  assert.equal(context.favorites.truncated, true)
  assert.deepEqual(context.favorites.accounts.map(account => account.accountId), ['one'])
  assert.equal(context.recentAccounts.total, 2)
  assert.equal(context.recentAccounts.truncated, true)
  assert.deepEqual(context.recentAccounts.accounts.map(account => account.accountId), ['two'])
})
