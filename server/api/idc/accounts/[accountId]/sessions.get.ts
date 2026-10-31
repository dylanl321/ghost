/**
 * GET /api/idc/accounts/:accountId/sessions
 * Get IDC user sessions for an account
 */

import { sendSuccess, errors, parseQueryParams, validateEnvironment } from '../../../../utils/api-response'
import { getClient } from '../../../../lib/aws-client-factory'
import {
  ListInstancesCommand,
  ListPermissionSetsCommand,
  ListAccountAssignmentsCommand,
  type AccountAssignment,
  type SSOAdminClient
} from '@aws-sdk/client-sso-admin'
import { DescribeUserCommand, type IdentitystoreClient } from '@aws-sdk/client-identitystore'
import { logger } from '../../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const accountId = getRouterParam(event, 'accountId')
    if (!accountId || !/^\d{12}$/.test(accountId)) return errors.badRequest(event, 'A 12-digit account ID is required')

    const { environment } = parseQueryParams(event)
    if (!validateEnvironment(environment)) return errors.badRequest(event, 'environment must be commercial or govcloud')

    // Get SSO Admin client
    const ssoAdmin = await getClient<SSOAdminClient>(environment, 'sso-admin')

    // List SSO instances
    const instances = await ssoAdmin.send(new ListInstancesCommand({}))
    if (!instances.Instances?.[0]) {
      return sendSuccess(event, [], { message: 'No IDC instance found' })
    }

    const instance = instances.Instances[0]
    const instanceArn = instance.InstanceArn!
    const identityStoreId = instance.IdentityStoreId!

    // Both list calls page; reading only the first page dropped assignments
    // once an instance had more permission sets than one page holds.
    const permissionSetArns: string[] = []
    let permissionSetToken: string | undefined
    do {
      const page = await ssoAdmin.send(new ListPermissionSetsCommand({
        InstanceArn: instanceArn,
        NextToken: permissionSetToken
      }))
      permissionSetArns.push(...(page.PermissionSets || []))
      permissionSetToken = page.NextToken
    } while (permissionSetToken)

    const sessions = []
    const identityStore = await getClient<IdentitystoreClient>(environment, 'identitystore')

    // For each permission set, get account assignments
    for (const permissionSetArn of permissionSetArns) {
      const accountAssignments: AccountAssignment[] = []
      let assignmentToken: string | undefined
      do {
        const page = await ssoAdmin.send(new ListAccountAssignmentsCommand({
          InstanceArn: instanceArn,
          AccountId: accountId,
          PermissionSetArn: permissionSetArn,
          NextToken: assignmentToken
        }))
        accountAssignments.push(...(page.AccountAssignments || []))
        assignmentToken = page.NextToken
      } while (assignmentToken)

      for (const assignment of accountAssignments) {
        if (assignment.PrincipalType !== 'USER') continue

        try {
          const userInfo = await identityStore.send(new DescribeUserCommand({
            IdentityStoreId: identityStoreId,
            UserId: assignment.PrincipalId!
          }))

          sessions.push({
            userId: assignment.PrincipalId!,
            userName: userInfo.UserName || '',
            userPrincipalName: userInfo.UserName,
            isActive: true,
            accountId,
            permissionSetName: permissionSetArn.split('/').pop()
          })
        } catch (e) {
          logger.warn(`Failed to get user ${assignment.PrincipalId}:`, e)
        }
      }
    }

    return sendSuccess(event, sessions)
  } catch (error: any) {
    logger.error('IDC sessions error:', error)
    return errors.serverError(event, error.message)
  }
})
