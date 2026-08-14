import { defineEventHandler } from 'h3'
import { sendSuccess } from '../../../utils/api-response'
import { getAIUsageCollectorState } from '../../../utils/ai-usage-storage'
import { classifyAIUsageCollectionFailure } from '../../../utils/ai-usage-failures'
import { requireAdmin } from '../../../utils/user-roles'

function errorCategory(message: string): string {
  if (message.includes('sts:AssumeRole')) return 'Assume role'
  if (message.includes('service control policy')) return 'SCP deny'
  if (message.includes('cloudwatch:')) return 'CloudWatch permission'
  if (message.includes('Circuit breaker OPEN')) return 'Circuit breaker'
  if (message.includes('ENOTFOUND') || message.includes('ECONN')) return 'Network'
  return 'Other'
}

function errorAccountId(message: string): string | undefined {
  return message.match(/resource: arn:(?:aws|aws-us-gov):iam::(\d{12}):role/)?.[1] ||
    message.match(/account (\d{12})/)?.[1]
}

function errorRegion(message: string): string | undefined {
  return message.match(/Region: ([a-z0-9-]+)/)?.[1]
}

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const state = await getAIUsageCollectorState()
  const failures = state?.failures || (state?.warnings || []).map(message => ({
    category: errorCategory(message),
    accountId: errorAccountId(message),
    environment: (message.includes('govcloud') || message.includes('aws-us-gov') ? 'govcloud' : 'commercial') as 'commercial' | 'govcloud',
    region: errorRegion(message),
    message
  }))
  const groups = new Map<string, {
    accountId?: string
    enclaveName?: string
    environment: 'commercial' | 'govcloud'
    category: string
    regions: Set<string>
    samples: string[]
    count: number
  }>()
  for (const failure of failures) {
    const key = `${failure.environment}|${failure.accountId || 'organization'}|${failure.category}`
    if (!groups.has(key)) groups.set(key, {
      accountId: failure.accountId,
      enclaveName: failure.enclaveName,
      environment: failure.environment,
      category: failure.category,
      regions: new Set(),
      samples: [],
      count: 0
    })
    const group = groups.get(key)!
    group.count++
    if (failure.region) group.regions.add(failure.region)
    if (group.samples.length < 3 && !group.samples.includes(failure.message)) group.samples.push(failure.message)
  }
  const failureGroups = [...groups.entries()].map(([id, group]) => ({
    id,
    accountId: group.accountId,
    enclaveName: group.enclaveName,
    environment: group.environment,
    category: group.category,
    regions: [...group.regions].sort(),
    count: group.count,
    explanation: `${group.category} prevented ${group.count} collection target${group.count === 1 ? '' : 's'} from completing.`,
    remediation: classifyAIUsageCollectionFailure(group.samples[0] || group.category).remediation,
    samples: group.samples
  })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
  const errorSummary = Object.entries(failures.reduce<Record<string, number>>((summary, failure) => {
    summary[failure.category] = (summary[failure.category] || 0) + 1
    return summary
  }, {})).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)

  const targetAttempted = state?.accountRegionTargetsAttempted || state?.accountsAttempted || 0
  const targetSucceeded = state?.accountRegionTargetsSucceeded || state?.accountsSucceeded || 0
  const accountAttempted = state?.uniqueAccountsAttempted || 0
  const accountSucceeded = state?.uniqueAccountsSucceeded || 0

  return sendSuccess(event, {
    state,
    running: state?.status === 'running',
    targetCoveragePercent: targetAttempted ? (targetSucceeded / targetAttempted) * 100 : 0,
    accountCoveragePercent: accountAttempted ? (accountSucceeded / accountAttempted) * 100 : 0,
    targetAttempted,
    targetSucceeded,
    accountAttempted,
    accountSucceeded,
    failureGroups,
    errorSummary,
    affectedAccounts: new Set(failures.map(failure => failure.accountId).filter(Boolean)).size
  })
})
