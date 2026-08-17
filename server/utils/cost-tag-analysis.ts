import type {
  TagCoverageAccount,
  TagCoverageData,
  TagValueAccountCost,
  TagValueCost
} from '../../shared/types/cost-tags'
import { normalizeCostTagIdentity } from '../../shared/utils/cost-tag-identities'

interface AccountCostPair {
  billable: number
  proforma: number
}

interface BuildTagCoverageOptions {
  includeValues?: boolean
  accountNames?: Map<string, string>
  costMetric?: 'UnblendedCost' | 'NetUnblendedCost'
  proformaRequested?: boolean
  proformaAccountTotals?: Map<string, AccountCostPair>
  proformaAccountPeriodTotals?: Map<string, AccountCostPair>
}

function accountPeriodKey(periodStart: string, accountId: string): string {
  return `${periodStart}|${accountId}`
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

export function extractProformaAccountPeriodTotals(proformaData: any): Map<string, AccountCostPair> {
  const totals = new Map<string, AccountCostPair>()
  for (const period of proformaData?.comparison?.byTime || []) {
    const start = period.timePeriod?.Start
    if (!start) continue
    for (const account of period.accountComparisons || []) {
      if (!account.accountId) continue
      totals.set(accountPeriodKey(start, account.accountId), {
        billable: Number(account.billable) || 0,
        proforma: Number(account.proforma) || 0
      })
    }
  }
  return totals
}

export function buildTagCoverageData(
  tagKey: string,
  resultsByTime: any[],
  options: BuildTagCoverageOptions = {}
): TagCoverageData {
  const costMetric = options.costMetric || 'UnblendedCost'
  const accountTotals = new Map<string, number>()
  const accountTaggedCosts = new Map<string, number>()
  const accountPositiveTotals = new Map<string, number>()
  const accountPositiveTaggedCosts = new Map<string, number>()
  const valueAccounts = new Map<string, Map<string, number>>()
  const valueIdentities = new Map<string, ReturnType<typeof normalizeCostTagIdentity>>()
  const valueRawValues = new Map<string, Set<string>>()
  const valueAccountRawValues = new Map<string, Map<string, Set<string>>>()
  const estimatedAccountTotals = new Map<string, number>()
  const estimatedAccountTaggedCosts = new Map<string, number>()
  const estimatedValueAccounts = new Map<string, Map<string, number>>()
  const unavailableAccountIds = new Set<string>()

  const ratioFor = (periodStart: string, accountId: string): number | undefined => {
    if (options.proformaAccountPeriodTotals) {
      const periodPair = options.proformaAccountPeriodTotals.get(accountPeriodKey(periodStart, accountId))
      return periodPair && periodPair.billable !== 0 ? periodPair.proforma / periodPair.billable : undefined
    }
    const aggregatePair = options.proformaAccountTotals?.get(accountId)
    if (aggregatePair && aggregatePair.billable !== 0) return aggregatePair.proforma / aggregatePair.billable
    return undefined
  }

  for (const period of resultsByTime || []) {
    const periodStart = period.TimePeriod?.Start || ''
    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      if (!accountId) continue

      const rawGroupKey = group.Keys?.[1] || `${tagKey}$`
      const identity = normalizeCostTagIdentity(rawGroupKey, tagKey)
      const groupKey = identity.groupKey
      const cost = Number.parseFloat(group.Metrics?.[costMetric]?.Amount || '0') || 0

      valueIdentities.set(groupKey, valueIdentities.get(groupKey) || identity)
      const rawValues = valueRawValues.get(groupKey) || new Set<string>()
      rawValues.add(identity.rawValue)
      valueRawValues.set(groupKey, rawValues)

      const accountRawValues = valueAccountRawValues.get(groupKey) || new Map<string, Set<string>>()
      const rawValuesForAccount = accountRawValues.get(accountId) || new Set<string>()
      rawValuesForAccount.add(identity.rawValue)
      accountRawValues.set(accountId, rawValuesForAccount)
      valueAccountRawValues.set(groupKey, accountRawValues)

      accountTotals.set(accountId, (accountTotals.get(accountId) || 0) + cost)
      accountPositiveTotals.set(accountId, (accountPositiveTotals.get(accountId) || 0) + Math.max(0, cost))
      if (!identity.isUntagged) {
        accountTaggedCosts.set(accountId, (accountTaggedCosts.get(accountId) || 0) + cost)
        accountPositiveTaggedCosts.set(accountId, (accountPositiveTaggedCosts.get(accountId) || 0) + Math.max(0, cost))
      }

      const accountCosts = valueAccounts.get(groupKey) || new Map<string, number>()
      accountCosts.set(accountId, (accountCosts.get(accountId) || 0) + cost)
      valueAccounts.set(groupKey, accountCosts)

      if (options.proformaRequested) {
        const ratio = ratioFor(periodStart, accountId)
        if (ratio === undefined) {
          unavailableAccountIds.add(accountId)
        } else {
          const estimatedCost = cost * ratio
          estimatedAccountTotals.set(accountId, (estimatedAccountTotals.get(accountId) || 0) + estimatedCost)
          if (!identity.isUntagged) {
            estimatedAccountTaggedCosts.set(accountId, (estimatedAccountTaggedCosts.get(accountId) || 0) + estimatedCost)
          }
          const estimates = estimatedValueAccounts.get(groupKey) || new Map<string, number>()
          estimates.set(accountId, (estimates.get(accountId) || 0) + estimatedCost)
          estimatedValueAccounts.set(groupKey, estimates)
        }
      }
    }
  }

  const ratios = new Map<string, number>()
  if (options.proformaRequested) {
    for (const [accountId, billableTotal] of accountTotals) {
      if (billableTotal === 0) continue
      const pair = options.proformaAccountTotals?.get(accountId)
      if (!pair || pair.billable === 0) {
        if (!options.proformaAccountPeriodTotals) unavailableAccountIds.add(accountId)
        continue
      }
      ratios.set(accountId, pair.proforma / pair.billable)
    }
  }

  const estimationAvailable = Boolean(options.proformaRequested && unavailableAccountIds.size === 0)
  const accounts: TagCoverageAccount[] = []

  for (const [accountId, totalCost] of accountTotals) {
    const taggedCost = accountTaggedCosts.get(accountId) || 0
    const untaggedCost = totalCost - taggedCost
    const positiveTotal = accountPositiveTotals.get(accountId) || 0
    const positiveTaggedCost = accountPositiveTaggedCosts.get(accountId) || 0
    const positiveUntaggedCost = Math.max(0, positiveTotal - positiveTaggedCost)
    const ratio = ratios.get(accountId)
    const estimatedTaggedCost = estimatedAccountTaggedCosts.get(accountId)
    const estimatedTotalCost = estimatedAccountTotals.get(accountId)

    accounts.push({
      accountId,
      accountName: options.accountNames?.get(accountId),
      taggedCost,
      untaggedCost,
      positiveTaggedCost,
      positiveUntaggedCost,
      coveragePercent: positiveTotal > 0 ? (positiveTaggedCost / positiveTotal) * 100 : 0,
      ...(estimationAvailable && ratio !== undefined
        ? {
            estimatedProformaTaggedCost: estimatedTaggedCost ?? taggedCost * ratio,
            estimatedProformaUntaggedCost: estimatedTotalCost !== undefined && estimatedTaggedCost !== undefined
              ? estimatedTotalCost - estimatedTaggedCost
              : untaggedCost * ratio
          }
        : {})
    })
  }

  accounts.sort((a, b) => b.untaggedCost - a.untaggedCost)

  const values: TagValueCost[] = Array.from(valueAccounts.entries()).map(([groupKey, accountCosts]) => {
    const identity = valueIdentities.get(groupKey) || normalizeCostTagIdentity(groupKey, tagKey)
    const estimatedAccounts = estimatedValueAccounts.get(groupKey)
    const accountRawValues = valueAccountRawValues.get(groupKey)
    const contributions: TagValueAccountCost[] = Array.from(accountCosts.entries()).map(([accountId, billableCost]) => {
      const ratio = ratios.get(accountId)
      return {
        accountId,
        accountName: options.accountNames?.get(accountId),
        billableCost,
        rawValues: [...(accountRawValues?.get(accountId) || [])].sort(),
        ...(estimationAvailable && ratio !== undefined
          ? { estimatedProformaCost: estimatedAccounts?.get(accountId) ?? billableCost * ratio }
          : {})
      }
    }).sort((a, b) => b.billableCost - a.billableCost)

    const billableCost = contributions.reduce((sum, account) => sum + account.billableCost, 0)
    return {
      groupKey,
      tagValue: identity.tagValue,
      displayName: identity.displayName,
      isUntagged: identity.isUntagged,
      isPerson: identity.isPerson,
      creatorType: identity.creatorType,
      rawValues: [...(valueRawValues.get(groupKey) || [])].sort(),
      billableCost,
      ...(estimationAvailable
        ? { estimatedProformaCost: contributions.reduce((sum, account) => sum + (account.estimatedProformaCost || 0), 0) }
        : {}),
      accounts: contributions
    }
  }).sort((a, b) => b.billableCost - a.billableCost)

  const totalTaggedCost = accounts.reduce((sum, account) => sum + account.taggedCost, 0)
  const totalUntaggedCost = accounts.reduce((sum, account) => sum + account.untaggedCost, 0)
  const positiveTaggedCost = accounts.reduce((sum, account) => sum + (account.positiveTaggedCost || 0), 0)
  const positiveUntaggedCost = accounts.reduce((sum, account) => sum + (account.positiveUntaggedCost || 0), 0)
  const positiveTotal = positiveTaggedCost + positiveUntaggedCost

  return {
    tagKey,
    costMetric,
    accounts,
    totalTaggedCost,
    totalUntaggedCost,
    signedTotalCost: totalTaggedCost + totalUntaggedCost,
    positiveTaggedCost,
    positiveUntaggedCost,
    overallCoverage: positiveTotal > 0 ? (positiveTaggedCost / positiveTotal) * 100 : 0,
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
            method: 'account-time-bucket-weighted-billable-distribution',
            unavailableAccountIds: [...unavailableAccountIds].sort()
          }
        }
      : {})
  }
}

export function shapeTagCoverageData(
  data: TagCoverageData,
  options: { includeAccounts?: boolean; valueGroupKey?: string } = {}
): TagCoverageData {
  if (!data.values) return data
  const includeAccounts = options.includeAccounts !== false
  const values = options.valueGroupKey
    ? data.values.filter(value => value.groupKey === options.valueGroupKey)
    : data.values

  return {
    ...data,
    values: includeAccounts
      ? values
      : values.map(value => ({
          ...value,
          accountCount: value.accounts.length,
          accounts: []
        }))
  }
}
