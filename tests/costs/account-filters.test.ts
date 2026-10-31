import assert from 'node:assert/strict'
import test from 'node:test'
import { filterAccounts } from '../../server/utils/account-filters'

const accounts = [
  { accountId: '111111111111', name: 'Maritime', linesOfBusiness: 'Maritime', departmentNumber: '100' },
  { accountId: '222222222222', name: 'IT', linesOfBusiness: 'IT', departmentNumber: '1' },
  { accountId: '333333333333', name: 'Airborne', linesOfBusiness: 'Airborne, Range', departmentNumber: '2100' },
  { accountId: '444444444444', name: 'Air', linesOfBusiness: 'Air', departmentNumber: 'de158' }
] as any[]

const ids = (list: any[]) => list.map(account => account.accountId)

test('line-of-business filter matches whole codes, not substrings', async () => {
  // "IT" is a substring of "Maritime" and "Air" of "Airborne".
  assert.deepEqual(ids(await filterAccounts({ linesOfBusiness: ['IT'] }, accounts)), ['222222222222'])
  assert.deepEqual(ids(await filterAccounts({ linesOfBusiness: ['air'] }, accounts)), ['444444444444'])
  assert.deepEqual(ids(await filterAccounts({ linesOfBusiness: ['Range'] }, accounts)), ['333333333333'])
})

test('line-of-business filter accepts the full LOB name', async () => {
  assert.deepEqual(ids(await filterAccounts({ linesOfBusiness: ['Information Technology'] }, accounts)), ['222222222222'])
})

test('department filter matches the exact department number', async () => {
  assert.deepEqual(ids(await filterAccounts({ departments: ['1'] }, accounts)), ['222222222222'])
  assert.deepEqual(ids(await filterAccounts({ departments: ['100'] }, accounts)), ['111111111111'])
  assert.deepEqual(ids(await filterAccounts({ departments: ['DE158'] }, accounts)), ['444444444444'])
})
