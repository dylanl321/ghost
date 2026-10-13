import type { UnifiedAccount } from '../utils/accounts-consolidated'
import type { IdentityCenterUserAccountAccess } from './idc-admin-access'

type ResolverEnvironment = 'commercial' | 'govcloud'

const HUBS = {
  commercial: { accountId: '205950196477', partition: 'aws', defaultRegion: 'us-east-1' },
  govcloud: { accountId: '374673712317', partition: 'aws-us-gov', defaultRegion: 'us-gov-west-1' }
} as const

function accountIds(account: UnifiedAccount) {
  return {
    commercial: account.accountId || account.awsStandardAccountID,
    govcloud: account.govCloudAccountId || account.awsGovCloudAccountID
  }
}

function selectedEnvironment(account: UnifiedAccount, matchedValue: string, identifierType?: string): ResolverEnvironment {
  const ids = accountIds(account)
  if (identifierType === 'govId' || matchedValue === ids.govcloud) return 'govcloud'
  if (identifierType === 'accountId' || matchedValue === ids.commercial) return 'commercial'
  return ids.govcloud ? 'govcloud' : 'commercial'
}

function lifecycleStatus(account: UnifiedAccount): string {
  const enclave = String(account.enclaveStatus || '').trim().toUpperCase().replaceAll(' ', '_')
  if (['DECOMMISSIONED', 'CANCELLED', 'SUSPENDED'].includes(enclave)) return enclave
  const organization = String(account.status || account.accountStatus || 'UNKNOWN').trim().toUpperCase()
  return organization || 'UNKNOWN'
}

function directRoles(
  access: IdentityCenterUserAccountAccess[],
  environment: ResolverEnvironment,
  accountId: string
): string[] {
  const roles = access.flatMap(account => account.assignments)
    .filter(assignment =>
      assignment.environment === environment &&
      assignment.accountId === accountId &&
      assignment.sources.some(source => source.type === 'direct')
    )
    .map(assignment => assignment.permissionSet)
  return [...new Set(roles)].sort()
}

export function buildAccountResolution(
  resolved: { account: UnifiedAccount; identifierType?: string; matchedValue: string },
  access: IdentityCenterUserAccountAccess[]
) {
  const ids = accountIds(resolved.account)
  const environment = selectedEnvironment(resolved.account, resolved.matchedValue, resolved.identifierType)
  const hub = HUBS[environment]
  const canonicalAccountId = environment === 'govcloud' ? ids.govcloud : ids.commercial
  if (!canonicalAccountId) {
    const error = new Error(`The resolved account has no ${environment} account ID.`)
    error.name = 'ACCOUNT_PARTITION_UNAVAILABLE'
    throw error
  }
  const targetDirectRoles = directRoles(access, environment, canonicalAccountId)
  const hubSourceRoles = directRoles(access, environment, hub.accountId)
  const hubRecipes = hubSourceRoles.flatMap(sourceRole => [
    {
      recipe_id: `${environment}-readonly`,
      partition: hub.partition,
      source_account_id: hub.accountId,
      source_role: sourceRole,
      target_account_id: canonicalAccountId,
      target_role: 'GDMSReadOnlyRole',
      requires_confirmation: false
    },
    {
      recipe_id: `${environment}-organizations`,
      partition: hub.partition,
      source_account_id: hub.accountId,
      source_role: sourceRole,
      target_account_id: canonicalAccountId,
      target_role: 'GDMSOrganizationsRole',
      requires_confirmation: true,
      confirmation_value: 'I CONFIRM GDMSOrganizationsRole'
    }
  ])
  return {
    canonical_account_id: canonicalAccountId,
    partition: hub.partition,
    environment,
    lifecycle_status: lifecycleStatus(resolved.account),
    default_region: hub.defaultRegion,
    paired_ids: {
      commercial_account_id: ids.commercial,
      govcloud_account_id: ids.govcloud
    },
    direct_access: {
      preferred_role: targetDirectRoles.includes('GDSSO_SysAdmin') ? 'GDSSO_SysAdmin' : undefined,
      roles: targetDirectRoles,
      choice_required: targetDirectRoles.length > 0 && !targetDirectRoles.includes('GDSSO_SysAdmin')
    },
    hub_recipes: hubRecipes
  }
}
