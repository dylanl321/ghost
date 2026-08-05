import type {
  TagCoverageAccount,
  TagCoverageData,
  TagValueAccountCost,
  TagValueCost
} from '../../shared/types/cost-tags'

interface AccountCostPair {
  billable: number
  proforma: number
}

interface BuildTagCoverageOptions {
  includeValues?: boolean
  accountNames?: Map<string, string>
  proformaRequested?: boolean
  proformaAccountTotals?: Map<string, AccountCostPair>
}

function parseTagValue(groupKey: string, tagKey: string): string {
  const expectedPrefix = `${tagKey}$`
  if (groupKey.startsWith(expectedPrefix)) return groupKey.slice(expectedPrefix.length)
  if (groupKey === '$not_tagged' || groupKey === '__untagged__') return ''
  return groupKey
}

export function extractProformaAccountTotals(proformaData: any): Map<string, AccountCostPair> {
  const totals = new Map<string, AccountCostPair>()

  for (const period of proformaData?.comparison?.byTime || []) {
    for (const account of period.accountComparisons || []) {
      if (!account.accountId) continue
      const current = totals.get(account.accountId) || { billable: 0, proforma: 0 }
      current.billable += Number(account.billable) || 0
      current.proforma += Number(account.proforma) || 0
      totals.set(account.accountId, current)
    }
  }

  return totals
}

export function buildTagCoverageData(
  tagKey: string,
  resultsByTime: any[],
  options: BuildTagCoverageOptions = {}
): TagCoverageData {
  const accountTotals = new Map<string, number>()
  const accountTaggedCosts = new Map<string, number>()
  const valueAccounts = new Map<string, Map<string, number>>()

  for (const period of resultsByTime || []) {
    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      if (!accountId) continue

      const groupKey = group.Keys?.[1] || `${tagKey}$`
      const tagValue = parseTagValue(groupKey, tagKey)
      const cost = Number.parseFloat(group.Metrics?.UnblendedCost?.Amount || '0') || 0

      accountTotals.set(accountId, (accountTotals.get(accountId) || 0) + cost)
      if (tagValue.trim()) {
        accountTaggedCosts.set(accountId, (accountTaggedCosts.get(accountId) || 0) + cost)
      }

      const accountCosts = valueAccounts.get(groupKey) || new Map<string, number>()
      accountCosts.set(accountId, (accountCosts.get(accountId) || 0) + cost)
      valueAccounts.set(groupKey, accountCosts)
    }
  }

  const ratios = new Map<string, number>()
  const unavailableAccountIds: string[] = []
  if (options.proformaRequested) {
    for (const [accountId, billableTotal] of accountTotals) {
      if (billableTotal === 0) continue
      const pair = options.proformaAccountTotals?.get(accountId)
      if (!pair || pair.billable === 0) {
        unavailableAccountIds.push(accountId)
        continue
      }
      ratios.set(accountId, pair.proforma / pair.billable)
    }
  }

  const estimationAvailable = Boolean(options.proformaRequested && unavailableAccountIds.length === 0)
  const accounts: TagCoverageAccount[] = []

  for (const [accountId, totalCost] of accountTotals) {
    const taggedCost = accountTaggedCosts.get(accountId) || 0
    const untaggedCost = Math.max(0, totalCost - taggedCost)
    const ratio = ratios.get(accountId)

    accounts.push({
      accountId,
      accountName: options.accountNames?.get(accountId),
      taggedCost,
      untaggedCost,
      coveragePercent: totalCost > 0 ? (taggedCost / totalCost) * 100 : 0,
      ...(estimationAvailable && ratio !== undefined
        ? {
            estimatedProformaTaggedCost: taggedCost * ratio,
            estimatedProformaUntaggedCost: untaggedCost * ratio
          }
        : {})
    })
  }

  accounts.sort((a, b) => b.untaggedCost - a.untaggedCost)

  const values: TagValueCost[] = Array.from(valueAccounts.entries()).map(([groupKey, accountCosts]) => {
    const tagValue = parseTagValue(groupKey, tagKey)
    const contributions: TagValueAccountCost[] = Array.from(accountCosts.entries()).map(([accountId, billableCost]) => {
      const ratio = ratios.get(accountId)
      return {
        accountId,
        accountName: options.accountNames?.get(accountId),
        billableCost,
        ...(estimationAvailable && ratio !== undefined
          ? { estimatedProformaCost: billableCost * ratio }
          : {})
      }
    }).sort((a, b) => b.billableCost - a.billableCost)

    const billableCost = contributions.reduce((sum, account) => sum + account.billableCost, 0)
    return {
      groupKey,
      tagValue,
      isUntagged: !tagValue.trim(),
      billableCost,
      ...(estimationAvailable
        ? { estimatedProformaCost: contributions.reduce((sum, account) => sum + (account.estimatedProformaCost || 0), 0) }
        : {}),
      accounts: contributions
    }
  }).sort((a, b) => b.billableCost - a.billableCost)

  const totalTaggedCost = accounts.reduce((sum, account) => sum + account.taggedCost, 0)
  const totalUntaggedCost = accounts.reduce((sum, account) => sum + account.untaggedCost, 0)
  const grandTotal = totalTaggedCost + totalUntaggedCost

  return {
    tagKey,
    accounts,
    totalTaggedCost,
    totalUntaggedCost,
    overallCoverage: grandTotal > 0 ? (totalTaggedCost / grandTotal) * 100 : 0,
    ...(options.includeValues ? { values } : {}),
    ...(estimationAvailable
      ? {
          estimatedProformaTaggedCost: accounts.reduce((sum, account) => sum + (account.estimatedProformaTaggedCost || 0), 0),
          estimatedProformaUntaggedCost: accounts.reduce((sum, account) => sum + (account.estimatedProformaUntaggedCost || 0), 0)
        }
      : {}),
    ...(options.proformaRequested
      ? {
          proformaEstimation: {
            requested: true,
            available: estimationAvailable,
            method: 'account-weighted-billable-distribution',
            unavailableAccountIds
          }
        }
      : {})
  }
}
