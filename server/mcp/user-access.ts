import { getAllAccountsUnified, type UnifiedAccount } from '../utils/accounts-consolidated'
import { parseAWSGroup } from '../utils/entra/group-parser'
import type { EntraGroup } from '../types/entra'
import type { GhostMcpPrincipal } from './types'

export interface McpUserAccountAccess {
  accountId: string
  accountName: string
  commercialAccountId?: string
  govCloudAccountId?: string
  commercialRoles: string[]
  govCloudRoles: string[]
  groups: string[]
}

export interface McpUserAccessResult {
  accounts: McpUserAccountAccess[]
  unmatchedGroups: string[]
  source: 'microsoft_graph' | 'oauth_grant_snapshot'
  warning?: string
}

function accountName(account: UnifiedAccount): string {
  return account.name || account.projectName || account.accountName || account.accountId || 'Unknown account'
}

function accountIds(account: UnifiedAccount) {
  return {
    commercial: account.accountId || account.awsStandardAccountID,
    govcloud: account.govCloudAccountId || account.awsGovCloudAccountID
  }
}

function distributionAccountNames(account: UnifiedAccount): string[] {
  const names = new Set<string>()
  const email = account.email || account.awsAccountEmail
  const emailPrefix = email?.split('@')[0]?.trim().replace(/\.aws$/i, '').toLowerCase()
  if (emailPrefix) names.add(emailPrefix)
  return Array.from(names)
}

function addRole(roles: string[], role: string) {
  if (!roles.some(value => value.toLowerCase() === role.toLowerCase())) roles.push(role)
}

export function mapMcpGroupsToAccounts(groups: EntraGroup[], accounts: UnifiedAccount[]): Omit<McpUserAccessResult, 'source' | 'warning'> {
  const accountsById = new Map<string, UnifiedAccount>()
  const accountsByDistributionName = new Map<string, UnifiedAccount>()
  for (const account of accounts) {
    const ids = accountIds(account)
    if (ids.commercial) accountsById.set(ids.commercial, account)
    if (ids.govcloud) accountsById.set(ids.govcloud, account)
    for (const name of distributionAccountNames(account)) accountsByDistributionName.set(name, account)
  }

  const results = new Map<string, McpUserAccountAccess>()
  const unmatchedGroups: string[] = []

  for (const group of groups) {
    const parsed = parseAWSGroup(group)
    if (!parsed) continue

    let account: UnifiedAccount | undefined
    if ('accountName' in parsed) account = accountsByDistributionName.get(parsed.accountName.toLowerCase())
    else account = accountsById.get(parsed.accountId)

    if (!account) {
      unmatchedGroups.push(parsed.displayName)
      continue
    }

    const ids = accountIds(account)
    const key = ids.commercial || ids.govcloud
    if (!key) {
      unmatchedGroups.push(parsed.displayName)
      continue
    }
    const access: McpUserAccountAccess = results.get(key) || {
      accountId: key,
      accountName: accountName(account),
      commercialAccountId: ids.commercial,
      govCloudAccountId: ids.govcloud,
      commercialRoles: [],
      govCloudRoles: [],
      groups: []
    }

    if ('role' in parsed) {
      const isGovCloud = Boolean(ids.govcloud && parsed.accountId === ids.govcloud)
      addRole(isGovCloud ? access.govCloudRoles : access.commercialRoles, parsed.role)
    }
    if (!access.groups.includes(parsed.displayName)) access.groups.push(parsed.displayName)
    results.set(key, access)
  }

  return {
    accounts: Array.from(results.values()).sort((left, right) => left.accountName.localeCompare(right.accountName)),
    unmatchedGroups: unmatchedGroups.sort()
  }
}

function principalGroups(principal: GhostMcpPrincipal): EntraGroup[] {
  return principal.groups.map((displayName, index) => ({ id: `mcp-grant-${index}`, displayName }))
}

export async function getMcpUserAccountAccess(principal: GhostMcpPrincipal): Promise<McpUserAccessResult> {
  const accounts = await getAllAccountsUnified(true)
  return {
    ...mapMcpGroupsToAccounts(principalGroups(principal), accounts),
    source: 'oauth_grant_snapshot',
    warning: 'This is directory metadata captured during GHOST authorization, not effective IAM Identity Center access.'
  }
}
