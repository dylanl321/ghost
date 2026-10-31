/**
 * Shared request handling for the AWS Config routes (/api/config/*):
 * environment parsing, account identifier resolution and the aggregator's
 * home region.
 */

import type { H3Event } from 'h3'
import type { AWSEnvironmentType } from '../types'
import { parseAccountFilters, validateAccountFilters, type AccountFilterCriteria } from './account-filters'
import { lookupAccountOptimized } from './account-lookup-optimized'

export function parseConfigEnvironment(value: unknown): AWSEnvironmentType | null {
  if (value === undefined || value === null || value === '') return 'commercial'
  return value === 'commercial' || value === 'govcloud' ? value : null
}

/**
 * The region the Config aggregator lives in. A region the user picks is a
 * filter on resources, not the region to call the aggregator in.
 */
export function configAggregatorRegion(environment: AWSEnvironmentType): string {
  return environment === 'govcloud'
    ? process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1'
    : process.env.AWS_COMMERCIAL_REGION || 'us-east-1'
}

/** The account ID an account record has in the given partition. */
export function partitionAccountId(account: any, environment: AWSEnvironmentType): string | undefined {
  return environment === 'govcloud'
    ? account.govCloudAccountId || account.awsGovCloudAccountID || account.govId || account.primaryAccountID
    : account.accountId || account.awsStandardAccountID || account.id
}

export function hasAccountCriteria(filters: AccountFilterCriteria): boolean {
  return Boolean(filters.accountIds?.length || filters.linesOfBusiness?.length || filters.departments?.length)
}

/**
 * Parse the account filters in a query and resolve account identifiers (request
 * IDs, emails, names) to account IDs in the requested partition.
 */
export async function resolveConfigAccountFilters(
  event: H3Event,
  query: Record<string, any>,
  environment: AWSEnvironmentType
): Promise<{ filters: AccountFilterCriteria; resolvedAccounts: any[]; errors: string[] }> {
  const filters = parseAccountFilters(query)
  const resolvedAccounts: any[] = []
  const errors: string[] = []

  if (filters.accountIds?.length) {
    const resolvedIds: string[] = []
    for (const identifier of filters.accountIds) {
      let lookup: Awaited<ReturnType<typeof lookupAccountOptimized>>
      try {
        lookup = await lookupAccountOptimized(event, identifier, {
          includeDecommissioned: filters.includeDecommissioned || false
        })
      } catch {
        lookup = null
      }
      if (!lookup) {
        errors.push(`No account found for identifier: ${identifier}`)
        continue
      }
      resolvedAccounts.push(lookup.account)
      const accountId = partitionAccountId(lookup.account, environment)
      if (accountId) resolvedIds.push(accountId)
      else errors.push(`Account found for identifier ${identifier} but missing ${environment} account ID`)
    }
    filters.accountIds = resolvedIds
  }

  if (errors.length === 0) errors.push(...validateAccountFilters(filters))
  return { filters, resolvedAccounts, errors }
}
