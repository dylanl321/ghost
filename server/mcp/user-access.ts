import { getAllAccountsUnified, type UnifiedAccount } from '../utils/accounts-consolidated'
import { getUserGroups } from '../utils/entra/graph-client'
import { parseAWSGroup } from '../utils/entra/group-parser'
import { createEntraServiceEvent } from '../utils/entra/service-session'
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

function addRole(roles: string[], role: string) {
  if (!roles.some(value => value.toLowerCase() === role.toLowerCase())) roles.push(role)
}

export function mapMcpGroupsToAccounts(groups: EntraGroup[], accounts: UnifiedAccount[]): Omit<McpUserAccessResult, 'source' | 'warning'> {
  const accountsById = new Map<string, UnifiedAccount>()
  for (const account of accounts) {
    const ids = accountIds(account)
    if (ids.commercial) accountsById.set(ids.commercial, account)
    if (ids.govcloud) accountsById.set(ids.govcloud, account)
  }

  const results = new Map<string, McpUserAccountAccess>()
  const unmatchedGroups: string[] = []

  for (const group of groups) {
    const parsed = parseAWSGroup(group)
    if (!parsed || 'accountName' in parsed) continue

    const account = accountsById.get(parsed.accountId)
    if (!account) {
      unmatchedGroups.push(parsed.displayName)
      continue
    }

    const ids = accountIds(account)
    const key = ids.commercial || ids.govcloud || parsed.accountId
    const access = results.get(key) || {
      accountId: key,
      accountName: accountName(account),
      commercialAccountId: ids.commercial,
      govCloudAccountId: ids.govcloud,
      commercialRoles: [],
      govCloudRoles: [],
      groups: []
    }

    const isGovCloud = Boolean(ids.govcloud && parsed.accountId === ids.govcloud)
    addRole(isGovCloud ? access.govCloudRoles : access.commercialRoles, parsed.role)
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

  try {
    const groups = await getUserGroups(await createEntraServiceEvent(), principal.oid)
    return {
      ...mapMcpGroupsToAccounts(groups, accounts),
      source: 'microsoft_graph'
    }
  } catch {
    return {
      ...mapMcpGroupsToAccounts(principalGroups(principal), accounts),
      source: 'oauth_grant_snapshot',
      warning: 'Microsoft Graph could not refresh account access. Results use the group membership captured when this MCP authorization was approved.'
    }
  }
}

export async function requireMcpAccountRole(
  principal: GhostMcpPrincipal,
  accountId: string,
  roleName: string,
  environment: 'commercial' | 'govcloud'
): Promise<{ account: McpUserAccountAccess; resolvedAccountId: string }> {
  const access = await getMcpUserAccountAccess(principal)
  const account = access.accounts.find(candidate =>
    candidate.accountId === accountId ||
    candidate.commercialAccountId === accountId ||
    candidate.govCloudAccountId === accountId
  )
  if (!account) {
    const error = new Error('The authenticated user does not have access to this AWS account.')
    error.name = 'ACCOUNT_ACCESS_DENIED'
    throw error
  }

  const roles = environment === 'govcloud' ? account.govCloudRoles : account.commercialRoles
  if (!roles.some(role => role.toLowerCase() === roleName.toLowerCase())) {
    const error = new Error(`The authenticated user does not have the ${roleName} role in this ${environment} account.`)
    error.name = 'ROLE_ACCESS_DENIED'
    throw error
  }

  const resolvedAccountId = environment === 'govcloud' ? account.govCloudAccountId : account.commercialAccountId
  if (!resolvedAccountId) {
    const error = new Error(`The account does not have a ${environment} Identity Center identifier.`)
    error.name = 'ACCOUNT_ENVIRONMENT_MISSING'
    throw error
  }

  return { account, resolvedAccountId }
}
