import assert from 'node:assert/strict'
import test from 'node:test'
import { toggleDatasetAccount, toggleFilteredDatasetAccounts } from '../../shared/utils/dataset-account-selection'

const all = ['111111111111', '222222222222', '333333333333']

test('deselecting from all expands selection intent before removing the account', () => {
  assert.deepEqual(toggleDatasetAccount({ scope: 'all', accountIds: [] }, all[1], all), {
    scope: 'selected', accountIds: [all[0], all[2]]
  })
})

test('select-all toggle can produce a true empty selected scope', () => {
  assert.deepEqual(toggleFilteredDatasetAccounts({ scope: 'all', accountIds: [] }, all, all), {
    scope: 'selected', accountIds: []
  })
})

test('filtered selection preserves accounts outside the filter', () => {
  assert.deepEqual(toggleFilteredDatasetAccounts({ scope: 'all', accountIds: [] }, [all[0], all[1]], all), {
    scope: 'selected', accountIds: [all[2]]
  })
  assert.deepEqual(toggleFilteredDatasetAccounts({ scope: 'selected', accountIds: [all[2]] }, [all[0]], all), {
    scope: 'selected', accountIds: [all[2], all[0]]
  })
})
