/**
 * SSM Patch Compliance Utility
 *
 * Provides patch compliance data from AWS Systems Manager
 */

import {
  DescribeInstancePatchStatesCommand,
  DescribePatchGroupStateCommand,
  DescribeInstancePatchesCommand,
  DescribeInstanceInformationCommand,
  type SSMClient
} from '@aws-sdk/client-ssm'
import { getSSMClient } from '../lib/aws-client-factory'
import { logger } from './logger'
import type { AWSEnvironmentType } from '../types'

export type PatchComplianceStatus = 'COMPLIANT' | 'NON_COMPLIANT' | 'PENDING' | 'FAILED' | 'UNKNOWN'

export interface InstancePatchStatus {
  instanceId: string
  patchGroup?: string
  status: PatchComplianceStatus
  installedCount: number
  installedPendingRebootCount: number
  missingCount: number
  failedCount: number
  notApplicableCount: number
  operationStartTime?: Date
  operationEndTime?: Date
  operation?: string
  lastNoRebootInstallOperationTime?: Date
}

export interface PatchGroupSummary {
  patchGroup: string
  instanceCount: number
  compliantCount: number
  nonCompliantCount: number
  compliancePercentage: number
  missingPatches: number
  failedPatches: number
}

export interface AccountPatchSummary {
  accountId: string
  environment: AWSEnvironmentType
  region: string
  totalInstances: number
  compliantInstances: number
  nonCompliantInstances: number
  pendingInstances: number
  compliancePercentage: number
  totalMissingPatches: number
  totalFailedPatches: number
  patchGroups: PatchGroupSummary[]
  instances: InstancePatchStatus[]
}

/**
 * Get patch status for a specific instance
 */
export async function getInstancePatchStatus(
  instanceId: string,
  accountId: string,
  environment: AWSEnvironmentType = 'govcloud',
  region?: string
): Promise<InstancePatchStatus | null> {
  try {
    const client = await getSSMClient(environment, region, accountId)

    const command = new DescribeInstancePatchStatesCommand({
      InstanceIds: [instanceId]
    })

    const response = await client.send(command)

    if (!response.InstancePatchStates || response.InstancePatchStates.length === 0) {
      logger.warn(`[SSM Patch] No patch state found for instance ${instanceId}`)
      return null
    }

    const state = response.InstancePatchStates[0]

    // Determine compliance status
    let status: PatchComplianceStatus = 'UNKNOWN'
    if (state.MissingCount === 0 && state.FailedCount === 0) {
      status = 'COMPLIANT'
    } else if (state.FailedCount && state.FailedCount > 0) {
      status = 'FAILED'
    } else if (state.MissingCount && state.MissingCount > 0) {
      status = 'NON_COMPLIANT'
    } else if (state.InstalledPendingRebootCount && state.InstalledPendingRebootCount > 0) {
      status = 'PENDING'
    }

    return {
      instanceId: state.InstanceId!,
      patchGroup: state.PatchGroup,
      status,
      installedCount: state.InstalledCount || 0,
      installedPendingRebootCount: state.InstalledPendingRebootCount || 0,
      missingCount: state.MissingCount || 0,
      failedCount: state.FailedCount || 0,
      notApplicableCount: state.NotApplicableCount || 0,
      operationStartTime: state.OperationStartTime,
      operationEndTime: state.OperationEndTime,
      operation: state.Operation,
      lastNoRebootInstallOperationTime: state.LastNoRebootInstallOperationTime
    }
  } catch (error: any) {
    logger.error(`[SSM Patch] Failed to get patch status for ${instanceId}:`, error.message)

    // Return unknown status instead of throwing
    if (error.name === 'InvalidInstanceId' || error.message?.includes('not found')) {
      return null
    }

    throw error
  }
}

/**
 * Get patch compliance for all instances in an account
 */
export async function getAccountPatchCompliance(
  accountId: string,
  environment: AWSEnvironmentType = 'govcloud',
  region?: string
): Promise<AccountPatchSummary> {
  const targetRegion = region || (environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1')

  const summary: AccountPatchSummary = {
    accountId,
    environment,
    region: targetRegion,
    totalInstances: 0,
    compliantInstances: 0,
    nonCompliantInstances: 0,
    pendingInstances: 0,
    compliancePercentage: 0,
    totalMissingPatches: 0,
    totalFailedPatches: 0,
    patchGroups: [],
    instances: []
  }

  try {
    const client = await getSSMClient(environment, targetRegion, accountId)

    // First, get all managed instances in the account
    const managedInstanceIds: string[] = []
    let instanceNextToken: string | undefined

    do {
      const listCommand = new DescribeInstanceInformationCommand({
        NextToken: instanceNextToken,
        MaxResults: 50
      })

      const listResponse = await client.send(listCommand)

      if (listResponse.InstanceInformationList) {
        for (const instance of listResponse.InstanceInformationList) {
          if (instance.InstanceId) {
            managedInstanceIds.push(instance.InstanceId)
          }
        }
      }

      instanceNextToken = listResponse.NextToken
    } while (instanceNextToken)

    logger.info(`[SSM Patch] Found ${managedInstanceIds.length} managed instances in account ${accountId}`)

    // If no managed instances, return empty summary
    if (managedInstanceIds.length === 0) {
      logger.warn(`[SSM Patch] No managed instances found in account ${accountId}`)
      return summary
    }

    // Get patch states for all managed instances (in batches of 50)
    const allStates: InstancePatchStatus[] = []
    const batchSize = 50

    for (let i = 0; i < managedInstanceIds.length; i += batchSize) {
      const batch = managedInstanceIds.slice(i, i + batchSize)

      const command = new DescribeInstancePatchStatesCommand({
        InstanceIds: batch
      })

      const response = await client.send(command)

      if (response.InstancePatchStates) {
        for (const state of response.InstancePatchStates) {
          let status: PatchComplianceStatus = 'UNKNOWN'
          if (state.MissingCount === 0 && state.FailedCount === 0) {
            status = 'COMPLIANT'
          } else if (state.FailedCount && state.FailedCount > 0) {
            status = 'FAILED'
          } else if (state.MissingCount && state.MissingCount > 0) {
            status = 'NON_COMPLIANT'
          } else if (state.InstalledPendingRebootCount && state.InstalledPendingRebootCount > 0) {
            status = 'PENDING'
          }

          allStates.push({
            instanceId: state.InstanceId!,
            patchGroup: state.PatchGroup,
            status,
            installedCount: state.InstalledCount || 0,
            installedPendingRebootCount: state.InstalledPendingRebootCount || 0,
            missingCount: state.MissingCount || 0,
            failedCount: state.FailedCount || 0,
            notApplicableCount: state.NotApplicableCount || 0,
            operationStartTime: state.OperationStartTime,
            operationEndTime: state.OperationEndTime,
            operation: state.Operation
          })
        }
      }
    }

    // Calculate summary
    summary.instances = allStates
    summary.totalInstances = allStates.length

    for (const state of allStates) {
      summary.totalMissingPatches += state.missingCount
      summary.totalFailedPatches += state.failedCount

      switch (state.status) {
        case 'COMPLIANT':
          summary.compliantInstances++
          break
        case 'NON_COMPLIANT':
        case 'FAILED':
          summary.nonCompliantInstances++
          break
        case 'PENDING':
          summary.pendingInstances++
          break
      }
    }

    // Calculate compliance percentage
    if (summary.totalInstances > 0) {
      summary.compliancePercentage = Math.round(
        (summary.compliantInstances / summary.totalInstances) * 100
      )
    }

    // Group by patch group
    const patchGroupMap = new Map<string, PatchGroupSummary>()
    for (const state of allStates) {
      const groupName = state.patchGroup || 'default'

      if (!patchGroupMap.has(groupName)) {
        patchGroupMap.set(groupName, {
          patchGroup: groupName,
          instanceCount: 0,
          compliantCount: 0,
          nonCompliantCount: 0,
          compliancePercentage: 0,
          missingPatches: 0,
          failedPatches: 0
        })
      }

      const group = patchGroupMap.get(groupName)!
      group.instanceCount++
      group.missingPatches += state.missingCount
      group.failedPatches += state.failedCount

      if (state.status === 'COMPLIANT') {
        group.compliantCount++
      } else if (state.status === 'NON_COMPLIANT' || state.status === 'FAILED') {
        group.nonCompliantCount++
      }
    }

    // Calculate compliance percentage for each group
    for (const group of patchGroupMap.values()) {
      if (group.instanceCount > 0) {
        group.compliancePercentage = Math.round(
          (group.compliantCount / group.instanceCount) * 100
        )
      }
      summary.patchGroups.push(group)
    }

    // Sort patch groups by non-compliance (worst first)
    summary.patchGroups.sort((a, b) => b.nonCompliantCount - a.nonCompliantCount)

    logger.info(`[SSM Patch] Account ${accountId}: ${summary.compliantInstances}/${summary.totalInstances} compliant (${summary.compliancePercentage}%)`)

    return summary

  } catch (error: any) {
    logger.error(`[SSM Patch] Failed to get account patch compliance for ${accountId}:`, error.message)

    // Return empty summary with error indicator
    if (error.name === 'AccessDeniedException') {
      logger.warn(`[SSM Patch] Access denied for account ${accountId} - SSM may not be enabled`)
    }

    return summary
  }
}

/**
 * Get detailed patches for an instance (what's installed, missing, failed)
 */
export async function getInstancePatches(
  instanceId: string,
  accountId: string,
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  filter?: 'All' | 'Installed' | 'Missing' | 'Failed'
): Promise<Array<{
  title: string
  id?: string
  kbId?: string
  classification: string
  severity: string
  state: string
  installedTime?: Date
}>> {
  const patches: Array<{
    title: string
    id?: string
    kbId?: string
    classification: string
    severity: string
    state: string
    installedTime?: Date
  }> = []

  try {
    const client = await getSSMClient(environment, region, accountId)

    const filters = []
    if (filter && filter !== 'All') {
      filters.push({
        Key: 'State',
        Values: [filter]
      })
    }

    let nextToken: string | undefined

    do {
      const command = new DescribeInstancePatchesCommand({
        InstanceId: instanceId,
        Filters: filters.length > 0 ? filters : undefined,
        NextToken: nextToken,
        MaxResults: 50
      })

      const response = await client.send(command)

      if (response.Patches) {
        for (const patch of response.Patches) {
          patches.push({
            title: patch.Title || 'Unknown',
            id: patch.CVEIds?.join(', '),
            kbId: patch.KBId,
            classification: patch.Classification || 'Unknown',
            severity: patch.Severity || 'Unknown',
            state: patch.State || 'Unknown',
            installedTime: patch.InstalledTime
          })
        }
      }

      nextToken = response.NextToken
    } while (nextToken && patches.length < 500) // Limit to 500 patches

    return patches

  } catch (error: any) {
    logger.error(`[SSM Patch] Failed to get patches for ${instanceId}:`, error.message)
    return patches
  }
}
