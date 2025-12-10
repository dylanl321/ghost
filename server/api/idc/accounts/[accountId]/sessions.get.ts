/**
 * GET /api/idc/accounts/:accountId/sessions
 * Get IDC user sessions for an account
 */

import { sendSuccess, errors, parseQueryParams } from '../../../../utils/api-response'
import { getClient } from '../../../../lib/aws-client-factory'
import {
  SSOAdminClient,
  ListInstancesCommand,
  ListPermissionSetsCommand,
  ListAccountAssignmentsCommand
} from '@aws-sdk/client-sso-admin'
import {
  IdentitystoreClient,
  DescribeUserCommand
} from '@aws-sdk/client-identitystore'
import { logger } from '../../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const accountId = getRouterParam(event, 'accountId')
    if (!accountId) return errors.badRequest(event, 'Account ID is required')

    const { environment } = parseQueryParams(event)

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

    // Get permission sets
    const permissionSets = await ssoAdmin.send(new ListPermissionSetsCommand({
      InstanceArn: instanceArn
    }))

    const sessions = []
    const identityStore = await getClient<IdentitystoreClient>(environment, 'identitystore')

    // For each permission set, get account assignments
    for (const permissionSetArn of (permissionSets.PermissionSets || [])) {
      const assignments = await ssoAdmin.send(new ListAccountAssignmentsCommand({
        InstanceArn: instanceArn,
        AccountId: accountId,
        PermissionSetArn: permissionSetArn
      }))

      for (const assignment of (assignments.AccountAssignments || [])) {
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
