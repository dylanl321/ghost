import type { H3Event } from 'h3'
import { createError } from 'h3'
import { lookupAccountOptimized } from './account-lookup-optimized'
import { getAllAccountsUnified } from './accounts-consolidated'

export interface IntegrationAccount {
  accountId?: string
  govCloudAccountId?: string
  requestId?: string | number
  accountName?: string
  [key: string]: unknown
}

export interface IntegrationAccountScope {
  accounts: IntegrationAccount[]
  commercialAccountIds: string[]
  govCloudAccountIds: string[]
}

const split = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(split)
  return typeof value === 'string'
    ? value.split(',').map(item => item.trim()).filter(Boolean)
    : []
}

export const hasIntegrationAccountSelector = (query: Record<string, unknown>): boolean =>
  ['accountIdentifiers', 'accountIds', 'accountId', 'adminOf', 'ownedBy']
    .some(name => split(query[name]).length > 0)

const personMatches = (value: unknown, person: string): boolean => {
  if (typeof value !== 'string') return false
  const normalizedValue = value.trim().toLowerCase()
  const normalizedPerson = person.trim().toLowerCase()
  return normalizedValue === normalizedPerson ||
    normalizedValue.split('@')[0] === normalizedPerson.split('@')[0]
}

const canonicalize = (account: any): IntegrationAccount => ({
  ...account,
  accountId: account.accountId || account.awsStandardAccountID || account.id,
  govCloudAccountId: account.govCloudAccountId || account.awsGovCloudAccountID || account.govId,
  requestId: account.requestId || account.requestID,
  accountName: account.accountName || account.name || account.projectName
})

/**
 * Resolve every account selector accepted by integration APIs through one path.
 * Direct selectors support commercial/GovCloud IDs, request IDs, and account email.
 * Person selectors use the authoritative account metadata already used by GHOST.
 */
export async function resolveIntegrationAccountScope(
  event: H3Event,
  query: Record<string, unknown>,
  options: { required?: boolean } = {}
): Promise<IntegrationAccountScope | undefined> {
  const identifiers = split(query.accountIdentifiers ?? query.accountIds ?? query.accountId)
  const adminOf = split(query.adminOf)
  const ownedBy = split(query.ownedBy)
  const accounts: IntegrationAccount[] = []

  for (const identifier of identifiers) {
    const result = await lookupAccountOptimized(event, identifier, { includeDecommissioned: false })
    if (result?.account) accounts.push(canonicalize(result.account))
  }

  if (adminOf.length > 0 || ownedBy.length > 0) {
    const allAccounts = (await getAllAccountsUnified()).map(canonicalize)
    for (const account of allAccounts) {
      const isAdmin = adminOf.some(person =>
        personMatches(account.primaryAccountAdminUsername, person) ||
        personMatches(account.delegateAccountAdminUsername, person) ||
        personMatches(account.costManagerUsername, person)
      )
      const isOwner = ownedBy.some(person =>
        personMatches(account.accountEmail, person) ||
        personMatches(account.awsAccountEmail, person) ||
        personMatches(account.email, person) ||
        personMatches(account.primaryAccountAdminUsername, person)
      )
      if (isAdmin || isOwner) accounts.push(account)
    }
  }

  if (accounts.length === 0) {
    if (options.required) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Provide accountIdentifiers/accountIds, adminOf, or ownedBy and ensure at least one account resolves.'
      })
    }
    return undefined
  }

  const uniqueAccounts = [...new Map(accounts.map(account => [
    account.accountId || account.govCloudAccountId || String(account.requestId),
    account
  ])).values()]

  return {
    accounts: uniqueAccounts,
    commercialAccountIds: [...new Set(uniqueAccounts.map(account => account.accountId).filter((id): id is string => Boolean(id)))],
    govCloudAccountIds: [...new Set(uniqueAccounts.map(account => account.govCloudAccountId).filter((id): id is string => Boolean(id)))]
  }
}

export const integrationAccountParameters = [
  {
    name: 'accountIdentifiers',
    in: 'query',
    schema: { type: 'string' },
    description: 'Comma-separated account ID, GovCloud ID, request ID, or account email values.'
  },
  {
    name: 'adminOf',
    in: 'query',
    schema: { type: 'string' },
    description: 'Comma-separated user emails/usernames; selects accounts where each person is a primary admin, delegate, or cost manager.'
  },
  {
    name: 'ownedBy',
    in: 'query',
    schema: { type: 'string' },
    description: 'Comma-separated user emails/usernames; selects accounts owned by the account email or primary account admin.'
  }
]
