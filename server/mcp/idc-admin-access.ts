import {
  DescribeGroupCommand,
  DescribeUserCommand,
  GetUserIdCommand,
  ListGroupMembershipsForMemberCommand,
  type IdentitystoreClient
} from '@aws-sdk/client-identitystore'
import {
  DescribePermissionSetCommand,
  ListAccountAssignmentsCommand,
  ListAccountAssignmentsForPrincipalCommand,
  ListInstancesCommand,
  ListPermissionSetsProvisionedToAccountCommand,
  type SSOAdminClient
} from '@aws-sdk/client-sso-admin'
import { getClient } from '../lib/aws-client-factory'
import { getAllAccountsUnified, type UnifiedAccount } from '../utils/accounts-consolidated'
import { decodeCursor, encodeCursor } from './results'

type IdentityCenterEnvironment = 'commercial' | 'govcloud'

interface IdentityCenterContext {
  environment: IdentityCenterEnvironment
  instanceArn: string
  identityStoreId: string
  ssoAdmin: SSOAdminClient
  identityStore: IdentitystoreClient
}

export interface IdentityCenterUserAccountAccess {
  accountId: string
  accountName: string
  commercialAccountId?: string
  govCloudAccountId?: string
  commercialRoles: string[]
  govCloudRoles: string[]
  assignments: Array<{
    environment: IdentityCenterEnvironment
    accountId: string
    permissionSet: string
    sources: Array<{ type: 'direct' | 'group'; groupName?: string }>
  }>
}

function accountIds(account: UnifiedAccount) {
  return {
    commercial: account.accountId || account.awsStandardAccountID,
    govcloud: account.govCloudAccountId || account.awsGovCloudAccountID
  }
}

function accountName(account: UnifiedAccount): string {
  return account.name || account.projectName || account.accountName || account.accountId || 'Unknown account'
}

async function getIdentityCenterContext(environment: IdentityCenterEnvironment): Promise<IdentityCenterContext> {
  const [ssoAdmin, identityStore] = await Promise.all([
    getClient<SSOAdminClient>(environment, 'sso-admin'),
    getClient<IdentitystoreClient>(environment, 'identitystore')
  ])
  let nextToken: string | undefined
  do {
    const response = await ssoAdmin.send(new ListInstancesCommand({ NextToken: nextToken, MaxResults: 10 }))
    const instance = response.Instances?.[0]
    if (instance?.InstanceArn && instance.IdentityStoreId) {
      return {
        environment,
        instanceArn: instance.InstanceArn,
        identityStoreId: instance.IdentityStoreId,
        ssoAdmin,
        identityStore
      }
    }
    nextToken = response.NextToken
  } while (nextToken)
  const error = new Error(`No ${environment} IAM Identity Center instance is available.`)
  error.name = 'IDC_INSTANCE_NOT_FOUND'
  throw error
}

async function getIdentityCenterUserId(context: IdentityCenterContext, userName: string): Promise<string> {
  try {
    const response = await context.identityStore.send(new GetUserIdCommand({
      IdentityStoreId: context.identityStoreId,
      AlternateIdentifier: {
        UniqueAttribute: { AttributePath: 'UserName', AttributeValue: userName }
      }
    }))
    if (response.UserId) return response.UserId
  } catch (error: any) {
    if (error?.name !== 'ResourceNotFoundException') throw error
  }
  const error = new Error(`The user ${userName} was not found in ${context.environment} IAM Identity Center.`)
  error.name = 'IDC_USER_NOT_FOUND'
  throw error
}

async function permissionSetName(context: IdentityCenterContext, permissionSetArn: string, cache?: Map<string, Promise<string>>): Promise<string> {
  const key = `${context.environment}:${permissionSetArn}`
  const cached = cache?.get(key)
  if (cached) return cached
  const pending = describePermissionSetName(context, permissionSetArn)
  cache?.set(key, pending)
  return pending
}

async function describePermissionSetName(context: IdentityCenterContext, permissionSetArn: string): Promise<string> {
  const response = await context.ssoAdmin.send(new DescribePermissionSetCommand({
    InstanceArn: context.instanceArn,
    PermissionSetArn: permissionSetArn
  }))
  return response.PermissionSet?.Name || permissionSetArn.split('/').pop() || permissionSetArn
}

async function listGroupMemberships(context: IdentityCenterContext, userId: string) {
  const groups: Array<{ groupId: string; displayName: string }> = []
  let nextToken: string | undefined
  do {
    const response = await context.identityStore.send(new ListGroupMembershipsForMemberCommand({
      IdentityStoreId: context.identityStoreId,
      MemberId: { UserId: userId },
      NextToken: nextToken,
      MaxResults: 100
    }))
    for (const membership of response.GroupMemberships || []) {
      const groupId = membership.GroupId
      if (!groupId) continue
      const group = await context.identityStore.send(new DescribeGroupCommand({ IdentityStoreId: context.identityStoreId, GroupId: groupId }))
      groups.push({ groupId, displayName: group.DisplayName || groupId })
    }
    nextToken = response.NextToken
  } while (nextToken)
  return groups
}

async function listPrincipalAssignments(context: IdentityCenterContext, principalId: string, principalType: 'USER' | 'GROUP', cache = new Map<string, Promise<string>>()) {
  const assignments: Array<{ accountId: string; permissionSetArn: string }> = []
  let nextToken: string | undefined
  do {
    const response = await context.ssoAdmin.send(new ListAccountAssignmentsForPrincipalCommand({
      InstanceArn: context.instanceArn,
      PrincipalId: principalId,
      PrincipalType: principalType,
      NextToken: nextToken,
      MaxResults: 100
    }))
    for (const assignment of response.AccountAssignments || []) {
      if (!assignment.AccountId || !assignment.PermissionSetArn) continue
      assignments.push({ accountId: assignment.AccountId, permissionSetArn: assignment.PermissionSetArn })
    }
    nextToken = response.NextToken
  } while (nextToken)
  const names = new Map<string, string>()
  await Promise.all([...new Set(assignments.map(item => item.permissionSetArn))].map(async arn => names.set(arn, await permissionSetName(context, arn, cache))))
  return assignments.map(item => ({ ...item, role: names.get(item.permissionSetArn) || item.permissionSetArn }))
}

export interface EffectiveIdentityCenterAssignment {
  environment: IdentityCenterEnvironment
  accountId: string
  permissionSet: string
  sources: Array<{ type: 'direct' | 'group'; groupName?: string }>
}

export function mergeEffectiveIdentityCenterAssignments(
  environment: IdentityCenterEnvironment,
  direct: Array<{ accountId: string; permissionSetArn: string; role: string }>,
  grouped: Array<{ group: { displayName: string }; assignments: Array<{ accountId: string; permissionSetArn: string; role: string }> }>
): EffectiveIdentityCenterAssignment[] {
  const result = new Map<string, EffectiveIdentityCenterAssignment>()
  const add = (assignment: { accountId: string; permissionSetArn: string; role: string }, source: { type: 'direct' | 'group'; groupName?: string }) => {
    const key = `${assignment.accountId}:${assignment.permissionSetArn}`
    const current = result.get(key) || { environment, accountId: assignment.accountId, permissionSet: assignment.role, sources: [] }
    if (!current.sources.some(item => item.type === source.type && item.groupName === source.groupName)) current.sources.push(source)
    result.set(key, current)
  }
  direct.forEach(assignment => add(assignment, { type: 'direct' }))
  grouped.forEach(({ group, assignments }) => assignments.forEach(assignment => add(assignment, { type: 'group', groupName: group.displayName })))
  return [...result.values()].sort((left, right) => `${left.accountId}:${left.permissionSet}`.localeCompare(`${right.accountId}:${right.permissionSet}`))
}

async function effectiveAssignmentsForEnvironment(context: IdentityCenterContext, userName: string): Promise<EffectiveIdentityCenterAssignment[]> {
  const userId = await getIdentityCenterUserId(context, userName)
  const cache = new Map<string, Promise<string>>()
  const [direct, groups] = await Promise.all([
    listPrincipalAssignments(context, userId, 'USER', cache),
    listGroupMemberships(context, userId)
  ])
  const grouped = await Promise.all(groups.map(async group => ({
    group,
    assignments: await listPrincipalAssignments(context, group.groupId, 'GROUP', cache)
  })))
  return mergeEffectiveIdentityCenterAssignments(context.environment, direct, grouped)
}

export async function explainMcpIdentityCenterUserAccess(userName: string, environments: IdentityCenterEnvironment[] = ['commercial', 'govcloud']) {
  return (await Promise.all(environments.map(async environment => effectiveAssignmentsForEnvironment(await getIdentityCenterContext(environment), userName)))).flat()
}

export async function getMcpIdentityCenterUserAccess(
  userName: string,
  environments: IdentityCenterEnvironment[] = ['commercial', 'govcloud']
): Promise<{ source: 'identity_center_admin'; accounts: IdentityCenterUserAccountAccess[] }> {
  const [catalog, assignmentSets] = await Promise.all([
    getAllAccountsUnified(true),
    Promise.all(environments.map(async environment => ({
      environment,
      assignments: await effectiveAssignmentsForEnvironment(await getIdentityCenterContext(environment), userName)
    })))
  ])
  const accountsById = new Map<string, UnifiedAccount>()
  for (const account of catalog) {
    const ids = accountIds(account)
    if (ids.commercial) accountsById.set(ids.commercial, account)
    if (ids.govcloud) accountsById.set(ids.govcloud, account)
  }

  const results = new Map<string, IdentityCenterUserAccountAccess>()
  for (const set of assignmentSets) {
    for (const assignment of set.assignments) {
      const account = accountsById.get(assignment.accountId)
      const ids = account ? accountIds(account) : {
        commercial: set.environment === 'commercial' ? assignment.accountId : undefined,
        govcloud: set.environment === 'govcloud' ? assignment.accountId : undefined
      }
      const key = ids.commercial || ids.govcloud || assignment.accountId
      const current = results.get(key) || {
        accountId: key,
        accountName: account ? accountName(account) : assignment.accountId,
        commercialAccountId: ids.commercial,
        govCloudAccountId: ids.govcloud,
        commercialRoles: [],
        govCloudRoles: [],
        assignments: []
      }
      const roles = set.environment === 'commercial' ? current.commercialRoles : current.govCloudRoles
      if (!roles.includes(assignment.permissionSet)) roles.push(assignment.permissionSet)
      roles.sort()
      current.assignments.push(assignment)
      results.set(key, current)
    }
  }
  return {
    source: 'identity_center_admin',
    accounts: Array.from(results.values()).sort((left, right) => left.accountName.localeCompare(right.accountName))
  }
}

async function describePrincipal(context: IdentityCenterContext, principalType: string, principalId: string) {
  if (principalType === 'USER') {
    const user = await context.identityStore.send(new DescribeUserCommand({
      IdentityStoreId: context.identityStoreId,
      UserId: principalId
    }))
    return { principalType, principalId, displayName: user.DisplayName || user.UserName || principalId, userName: user.UserName }
  }
  const group = await context.identityStore.send(new DescribeGroupCommand({
    IdentityStoreId: context.identityStoreId,
    GroupId: principalId
  }))
  return { principalType, principalId, displayName: group.DisplayName || principalId }
}

export async function getMcpIdentityCenterAccountAccess(
  targets: Array<{ environment: IdentityCenterEnvironment; accountId: string }>,
  limit = 50,
  cursor?: string
) {
  const allRecords: Array<Record<string, unknown>> = []
  const cache = new Map<string, Promise<string>>()
  for (const target of targets) {
    const context = await getIdentityCenterContext(target.environment)
    let permissionToken: string | undefined
    do {
      const permissionSets = await context.ssoAdmin.send(new ListPermissionSetsProvisionedToAccountCommand({
        InstanceArn: context.instanceArn,
        AccountId: target.accountId,
        NextToken: permissionToken,
        MaxResults: 100
      }))
      for (const permissionSetArn of permissionSets.PermissionSets || []) {
        const role = await permissionSetName(context, permissionSetArn, cache)
        let assignmentToken: string | undefined
        do {
          const response = await context.ssoAdmin.send(new ListAccountAssignmentsCommand({
            InstanceArn: context.instanceArn,
            AccountId: target.accountId,
            PermissionSetArn: permissionSetArn,
            NextToken: assignmentToken,
            MaxResults: 100
          }))
          for (const assignment of response.AccountAssignments || []) {
            if (!assignment.PrincipalId || !assignment.PrincipalType) continue
            allRecords.push({
              environment: target.environment,
              accountId: target.accountId,
              role,
              ...(await describePrincipal(context, assignment.PrincipalType, assignment.PrincipalId))
            })
          }
          assignmentToken = response.NextToken
        } while (assignmentToken)
      }
      permissionToken = permissionSets.NextToken
    } while (permissionToken)
  }
  allRecords.sort((left, right) => `${left.environment}:${left.accountId}:${left.role}:${left.principalType}:${left.displayName}`.localeCompare(`${right.environment}:${right.accountId}:${right.role}:${right.principalType}:${right.displayName}`))
  const offset = decodeCursor<{ offset?: number }>(cursor)?.offset || 0
  const records = allRecords.slice(offset, offset + limit)
  const nextOffset = offset + records.length
  const nextCursor = nextOffset < allRecords.length ? encodeCursor({ offset: nextOffset }) : undefined
  const partitions = targets.map(target => {
    const total = allRecords.filter(record => record.environment === target.environment && record.accountId === target.accountId).length
    const returned = records.filter(record => record.environment === target.environment && record.accountId === target.accountId).length
    const truncated = allRecords.slice(nextOffset).some(record => record.environment === target.environment && record.accountId === target.accountId)
    return { ...target, total, returned, truncated }
  })
  return { source: 'identity_center_admin' as const, records, count: records.length, total: allRecords.length, truncated: Boolean(nextCursor), nextCursor, partitions }
}
