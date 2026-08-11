import type { AIUsageEnvironment, AIUsageEnvironmentFilter } from '../../shared/types/ai-usage'
import { getAllAccountsUnified, type UnifiedAccount } from './accounts-consolidated'

export interface AIUsageAccountScope {
  enclaveId: string
  enclaveName: string
  commercialAccountId?: string
  govCloudAccountId?: string
  lineOfBusiness?: string
  department?: string
  members: Array<{ environment: AIUsageEnvironment; accountId: string }>
}

function value(account: UnifiedAccount, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = account[key]
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) return String(candidate).trim()
  }
  return undefined
}

export function toAIUsageAccountScope(
  account: UnifiedAccount,
  environment: AIUsageEnvironmentFilter = 'all'
): AIUsageAccountScope | null {
  const commercialAccountId = value(account, 'accountId', 'awsStandardAccountID')
  const govCloudAccountId = value(account, 'govCloudAccountId', 'awsGovCloudAccountID')
  const enclaveId = commercialAccountId || govCloudAccountId
  if (!enclaveId) return null

  const members: AIUsageAccountScope['members'] = []
  if (commercialAccountId && environment !== 'govcloud') members.push({ environment: 'commercial', accountId: commercialAccountId })
  if (govCloudAccountId && environment !== 'commercial') members.push({ environment: 'govcloud', accountId: govCloudAccountId })
  if (members.length === 0) return null

  return {
    enclaveId,
    enclaveName: value(account, 'name', 'projectName', 'accountName', 'pepCloudRecordName') || `Account ${enclaveId}`,
    commercialAccountId,
    govCloudAccountId,
    lineOfBusiness: value(account, 'linesOfBusiness', 'lineOfBusiness', 'pepLob', 'pepContractLineOfBusiness'),
    department: value(account, 'pepDepartment', 'departmentNumber', 'department'),
    members
  }
}

function matchesAny(valueToMatch: string | undefined, filters: string[]): boolean {
  if (filters.length === 0) return true
  const candidate = (valueToMatch || '').toLowerCase()
  return filters.some(filter => candidate.includes(filter.toLowerCase()))
}

export async function resolveAIUsageScopes(options: {
  environment?: AIUsageEnvironmentFilter
  accountIds?: string[]
  linesOfBusiness?: string[]
  departments?: string[]
  includeDecommissioned?: boolean
} = {}): Promise<AIUsageAccountScope[]> {
  const accounts = await getAllAccountsUnified(options.includeDecommissioned || false)
  const requestedIds = new Set((options.accountIds || []).map(id => id.trim()).filter(Boolean))

  return accounts
    .map(account => toAIUsageAccountScope(account, options.environment || 'all'))
    .filter((scope): scope is AIUsageAccountScope => Boolean(scope))
    .filter(scope => requestedIds.size === 0 || [
      scope.enclaveId,
      scope.commercialAccountId,
      scope.govCloudAccountId
    ].some(id => id && requestedIds.has(id)))
    .filter(scope => matchesAny(scope.lineOfBusiness, options.linesOfBusiness || []))
    .filter(scope => matchesAny(scope.department, options.departments || []))
}

export function findAIUsageScope(
  scopes: AIUsageAccountScope[],
  environment: AIUsageEnvironment,
  accountId: string
): AIUsageAccountScope | undefined {
  return scopes.find(scope => scope.members.some(member => member.environment === environment && member.accountId === accountId))
}
