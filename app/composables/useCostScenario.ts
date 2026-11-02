import { computed } from 'vue'
import type { Ref } from 'vue'
import { detectGroupSelection } from '#shared/utils/cost-dashboard'
import type { GroupableAccount, GroupSelection } from '#shared/utils/cost-dashboard'

export type Scenario = 'all-accounts' | 'single-account' | 'few-accounts' | 'lob-group' | 'department-group'

export const useCostScenario = (args: {
  selectedAccounts: Ref<string[]>
  activeTab: Ref<string>
  /**
   * Optional account list. When given, selecting every account of one line of
   * business or department switches to that group's scenario, so the group
   * charts no longer depend on which sidebar tab is open.
   */
  accounts?: Ref<GroupableAccount[]>
}) => {
  const { selectedAccounts, activeTab, accounts } = args

  const groupSelection = computed<GroupSelection | null>(() =>
    accounts ? detectGroupSelection(selectedAccounts.value, accounts.value) : null
  )

  const scenario = computed<Scenario>(() => {
    const count = selectedAccounts.value.length
    const tab = activeTab.value

    // Priority order: tab context first, then a whole-group selection, then selection count
    if (tab === 'lob') return 'lob-group'
    if (tab === 'dept') return 'department-group'
    if (groupSelection.value?.kind === 'lob') return 'lob-group'
    if (groupSelection.value?.kind === 'department') return 'department-group'
    if (count === 0) return 'all-accounts'
    if (count === 1) return 'single-account'
    if (count <= 10) return 'few-accounts'
    return 'all-accounts' // fallback for large selections
  })

  return { scenario, groupSelection }
}

/** Maps cost-page accounts to the fields group detection needs, using the sidebar's group keys. */
export function toGroupableAccounts(list: readonly Record<string, any>[]): GroupableAccount[] {
  return list.map(account => ({
    id: account.accountId ?? account.awsStandardAccountID ?? '',
    lineOfBusiness: account.linesOfBusiness || account.lineOfBusiness || null,
    department: account.pepDepartment || account.departmentNumber || account.department || null
  }))
}
