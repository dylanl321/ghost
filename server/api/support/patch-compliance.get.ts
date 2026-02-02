/**
 * GET /api/support/patch-compliance
 * SSM patch compliance status for instances and accounts
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import {
  getInstancePatchStatus,
  getAccountPatchCompliance,
  getInstancePatches
} from '../../utils/ssm-patch-compliance'
import { lookupAccountUnified } from '../../utils/accounts-consolidated'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'

registerEndpoint('/api/support/patch-compliance', 'GET', {
  summary: 'Get SSM patch compliance status',
  description: 'Retrieve patch compliance status for instances or accounts from AWS Systems Manager',
  tags: ['Support Tools', 'Patching'],
  parameters: [
    {
      name: 'accountId',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'AWS account ID to query'
    },
    {
      name: 'instanceId',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Specific instance ID to query (if omitted, returns account-wide summary)'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment (default: govcloud)'
    },
    {
      name: 'region',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'AWS region (default: us-gov-west-1 for govcloud, us-east-1 for commercial)'
    },
    {
      name: 'includePatches',
      in: 'query',
      required: false,
      schema: { type: 'boolean' },
      description: 'Include detailed patch list for instance query (default: false)'
    },
    {
      name: 'patchFilter',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['All', 'Installed', 'Missing', 'Failed'] },
      description: 'Filter patches by state (only with includePatches=true)'
    }
  ],
  responses: {
    200: {
      description: 'Patch compliance status',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  accountName: { type: 'string' },
                  compliancePercentage: { type: 'number' },
                  status: { type: 'string' },
                  instances: { type: 'array' },
                  patchGroups: { type: 'array' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const queryParams = getQuery(event)
  const accountId = queryParams.accountId as string
  const instanceId = queryParams.instanceId as string | undefined
  const environment = (queryParams.environment as AWSEnvironmentType) || 'govcloud'
  const region = queryParams.region as string | undefined
  const includePatches = queryParams.includePatches === 'true'
  const patchFilter = queryParams.patchFilter as 'All' | 'Installed' | 'Missing' | 'Failed' | undefined

  // Validate required parameters
  if (!accountId) {
    return errors.badRequest(event, 'accountId is required')
  }

  // Validate environment
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  // Get account info
  const account = await lookupAccountUnified({ accountId })
  const accountName = account?.name || account?.projectName

  // Use GovCloud account ID if querying govcloud environment
  const targetAccountId = environment === 'govcloud' && account?.govCloudAccountId
    ? account.govCloudAccountId
    : accountId

  logger.info(`[Patch Compliance] Account: ${accountId}, Instance: ${instanceId || 'all'}, Environment: ${environment}`)

  try {
    // If instanceId provided, get specific instance status
    if (instanceId) {
      const instanceStatus = await getInstancePatchStatus(instanceId, targetAccountId, environment, region)

      if (!instanceStatus) {
        return sendSuccess(event, {
          accountId,
          accountName,
          instanceId,
          environment,
          found: false,
          message: 'Instance not found or SSM not enabled on instance'
        })
      }

      // Optionally include detailed patch list
      let patches = undefined
      if (includePatches) {
        patches = await getInstancePatches(
          instanceId,
          targetAccountId,
          environment,
          region,
          patchFilter
        )
      }

      return sendSuccess(event, {
        accountId,
        accountName,
        instanceId,
        environment,
        found: true,
        status: instanceStatus.status,
        patchGroup: instanceStatus.patchGroup,
        installedCount: instanceStatus.installedCount,
        installedPendingRebootCount: instanceStatus.installedPendingRebootCount,
        missingCount: instanceStatus.missingCount,
        failedCount: instanceStatus.failedCount,
        notApplicableCount: instanceStatus.notApplicableCount,
        lastPatchOperation: instanceStatus.operation,
        operationStartTime: instanceStatus.operationStartTime,
        operationEndTime: instanceStatus.operationEndTime,
        patches: patches ? {
          total: patches.length,
          filter: patchFilter || 'All',
          items: patches
        } : undefined
      })
    }

    // Get account-wide patch compliance
    const compliance = await getAccountPatchCompliance(targetAccountId, environment, region)

    // Add recommendations based on compliance status
    const recommendations: string[] = []

    if (compliance.nonCompliantInstances > 0) {
      recommendations.push(`${compliance.nonCompliantInstances} instance(s) need patching attention`)
    }

    if (compliance.totalMissingPatches > 10) {
      recommendations.push(`Total of ${compliance.totalMissingPatches} patches missing across all instances`)
    }

    if (compliance.totalFailedPatches > 0) {
      recommendations.push(`${compliance.totalFailedPatches} patch installation(s) failed - investigate SSM agent issues`)
    }

    if (compliance.pendingInstances > 0) {
      recommendations.push(`${compliance.pendingInstances} instance(s) have patches pending reboot`)
    }

    // Find patch groups with issues
    const problemGroups = compliance.patchGroups.filter(g => g.nonCompliantCount > 0)
    if (problemGroups.length > 0) {
      recommendations.push(`Patch groups needing attention: ${problemGroups.map(g => g.patchGroup).join(', ')}`)
    }

    if (compliance.compliancePercentage === 100) {
      recommendations.push('All instances are fully patched and compliant')
    }

    return sendSuccess(event, {
      accountId,
      accountName,
      environment,
      region: compliance.region,
      summary: {
        totalInstances: compliance.totalInstances,
        compliantInstances: compliance.compliantInstances,
        nonCompliantInstances: compliance.nonCompliantInstances,
        pendingInstances: compliance.pendingInstances,
        compliancePercentage: compliance.compliancePercentage,
        totalMissingPatches: compliance.totalMissingPatches,
        totalFailedPatches: compliance.totalFailedPatches,
        overallStatus: compliance.compliancePercentage === 100
          ? 'COMPLIANT'
          : compliance.nonCompliantInstances > 0
            ? 'NON_COMPLIANT'
            : 'PENDING'
      },
      patchGroups: compliance.patchGroups,
      instances: compliance.instances.map(inst => ({
        instanceId: inst.instanceId,
        status: inst.status,
        patchGroup: inst.patchGroup,
        missingCount: inst.missingCount,
        failedCount: inst.failedCount,
        installedPendingRebootCount: inst.installedPendingRebootCount
      })),
      recommendations,
      lastUpdated: new Date().toISOString()
    })

  } catch (error: any) {
    logger.error('[Patch Compliance] Error:', error)

    // Handle common errors
    if (error.name === 'AccessDeniedException') {
      return errors.serverError(event, 'Access denied to SSM in this account', {
        hint: 'SSM may not be enabled or the role lacks required permissions'
      })
    }

    if (error.name === 'InvalidInstanceId') {
      return errors.badRequest(event, 'Invalid instance ID format')
    }

    return errors.serverError(event, error.message || 'Failed to get patch compliance status')
  }
}))
