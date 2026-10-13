export interface AccountSelectionState {
  scope: 'all' | 'selected'
  accountIds: string[]
}

function explicitSelection(scope: 'all' | 'selected', accountIds: string[], allAccountIds: string[]) {
  return scope === 'all' ? [...allAccountIds] : [...accountIds]
}

export function toggleDatasetAccount(
  state: AccountSelectionState,
  accountId: string,
  allAccountIds: string[]
): AccountSelectionState {
  const selected = new Set(explicitSelection(state.scope, state.accountIds, allAccountIds))
  if (selected.has(accountId)) selected.delete(accountId)
  else selected.add(accountId)
  return { scope: 'selected', accountIds: [...selected] }
}

export function toggleFilteredDatasetAccounts(
  state: AccountSelectionState,
  filteredAccountIds: string[],
  allAccountIds: string[]
): AccountSelectionState {
  const selected = new Set(explicitSelection(state.scope, state.accountIds, allAccountIds))
  const allFilteredSelected = filteredAccountIds.every(id => selected.has(id))
  for (const id of filteredAccountIds) {
    if (allFilteredSelected) selected.delete(id)
    else selected.add(id)
  }
  return { scope: 'selected', accountIds: [...selected] }
}
