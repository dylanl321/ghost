import {
  DescribeGroupCommand,
  DescribeUserCommand,
  GetUserIdCommand,
  ListGroupMembershipsForMemberCommand,
  IdentitystoreClient
} from '@aws-sdk/client-identitystore'
import {
  DescribePermissionSetCommand,
  ListAccountAssignmentsCommand,
  ListAccountAssignmentsForPrincipalCommand,
  ListInstancesCommand,
  ListPermissionSetsProvisionedToAccountCommand,
  SSOAdminClient
} from '@aws-sdk/client-sso-admin'
import { getClient } from '../lib/aws-client-factory'
import { getAllAccountsUnified, type UnifiedAccount } from '../utils/accounts-consolidated'

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

async function permissionSetName(context: IdentityCenterContext, permissionSetArn: string): Promise<string> {
  const response = await context.ssoAdmin.send(new DescribePermissionSetCommand({
    InstanceArn: context.instanceArn,
    PermissionSetArn: permissionSetArn
  }))
  return response.PermissionSet?.Name || permissionSetArn.split('/').pop() || permissionSetArn
}

async function listUserAssignments(context: IdentityCenterContext, userName: string) {
  const principalId = await getIdentityCenterUserId(context, userName)
  const assignments: Array<{ accountId: string; permissionSetArn: string }> = []
  let nextToken: string | undefined
  do {
    const response = await context.ssoAdmin.send(new ListAccountAssignmentsForPrincipalCommand({
      InstanceArn: context.instanceArn,
      PrincipalId: principalId,
      PrincipalType: 'USER',
      NextToken: nextToken,
      MaxResults: 100
    }))
    for (const assignment of response.AccountAssignments || []) {
      if (assignment.AccountId && assignment.PermissionSetArn) {
        assignments.push({ accountId: assignment.AccountId, permissionSetArn: assignment.PermissionSetArn })
      }
    }
    nextToken = response.NextToken
  } while (nextToken)

  const names = new Map<string, string>()
  await Promise.all(Array.from(new Set(assignments.map(item => item.permissionSetArn))).map(async arn => {
    names.set(arn, await permissionSetName(context, arn))
  }))
  return assignments.map(item => ({ ...item, role: names.get(item.permissionSetArn) || item.permissionSetArn }))
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

async function listPrincipalAssignments(context: IdentityCenterContext, principalId: string, principalType: 'USER' | 'GROUP') {
  const assignments: Array<{ accountId: string; permissionSetArn: string; role: string }> = []
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
      assignments.push({ accountId: assignment.AccountId, permissionSetArn: assignment.PermissionSetArn, role: await permissionSetName(context, assignment.PermissionSetArn) })
    }
    nextToken = response.NextToken
  } while (nextToken)
  return assignments
}

export async function explainMcpIdentityCenterUserAccess(userName: string, environments: IdentityCenterEnvironment[] = ['commercial', 'govcloud']) {
  const records: Array<{ environment: IdentityCenterEnvironment; accountId: string; permissionSet: string; assignmentSource: 'direct' | 'group'; groupName?: string }> = []
  for (const environment of environments) {
    const context = await getIdentityCenterContext(environment)
    const userId = await getIdentityCenterUserId(context, userName)
    const [direct, groups] = await Promise.all([listPrincipalAssignments(context, userId, 'USER'), listGroupMemberships(context, userId)])
    for (const assignment of direct) records.push({ environment, accountId: assignment.accountId, permissionSet: assignment.role, assignmentSource: 'direct' })
    for (const group of groups) {
      const assignments = await listPrincipalAssignments(context, group.groupId, 'GROUP')
      for (const assignment of assignments) records.push({ environment, accountId: assignment.accountId, permissionSet: assignment.role, assignmentSource: 'group', groupName: group.displayName })
    }
  }
  return records.sort((left, right) => `${left.accountId}:${left.permissionSet}:${left.assignmentSource}`.localeCompare(`${right.accountId}:${right.permissionSet}:${right.assignmentSource}`))
}

export async function getMcpIdentityCenterUserAccess(
  userName: string,
  environments: IdentityCenterEnvironment[] = ['commercial', 'govcloud']
): Promise<{ source: 'identity_center_admin'; accounts: IdentityCenterUserAccountAccess[] }> {
  const [catalog, assignmentSets] = await Promise.all([
    getAllAccountsUnified(true),
    Promise.all(environments.map(async environment => ({
      environment,
      assignments: await listUserAssignments(await getIdentityCenterContext(environment), userName)
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
        govCloudRoles: []
      }
      const roles = set.environment === 'commercial' ? current.commercialRoles : current.govCloudRoles
      if (!roles.includes(assignment.role)) roles.push(assignment.role)
      roles.sort()
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
  limit = 50
) {
  const records: Array<Record<string, unknown>> = []
  let truncated = false
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
        const role = await permissionSetName(context, permissionSetArn)
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
            if (records.length >= limit) {
              truncated = true
              break
            }
            records.push({
              environment: target.environment,
              accountId: target.accountId,
              role,
              ...(await describePrincipal(context, assignment.PrincipalType, assignment.PrincipalId))
            })
          }
          if (truncated) break
          assignmentToken = response.NextToken
        } while (assignmentToken)
        if (truncated) break
      }
      if (truncated) break
      permissionToken = permissionSets.NextToken
    } while (permissionToken)
    if (truncated) break
  }
  return { source: 'identity_center_admin' as const, records, count: records.length, truncated }
}
