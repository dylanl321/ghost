/**
 * GET /api/organization/policies
 * Get Service Control Policies attached to an account or organizational unit
 * Includes both directly attached policies AND inherited policies from parent OUs
 */

import { defineEventHandler, getQuery } from 'h3'
import {
  getAttachedPolicies,
  getOrganizationalUnitTree,
  getAccountOU
} from '../../utils/organizations'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/organization/policies', 'GET', {
  summary: 'Get policies for target (including inherited)',
  description: 'Get Service Control Policies attached to an account or organizational unit, including all policies inherited from parent OUs up to the root',
  tags: ['Organization'],
  parameters: [
    {
      name: 'targetId',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'Target ID (account ID or OU ID)'
    },
    {
      name: 'targetType',
      in: 'query',
      required: true,
      schema: {
        type: 'string',
        enum: ['ACCOUNT', 'ORGANIZATIONAL_UNIT']
      },
      description: 'Type of target'
    },
    { $ref: '#/components/parameters/Environment' }
  ],
  responses: {
    200: {
      description: 'List of policies (direct and inherited)',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  directPolicies: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        type: { type: 'string' },
                        arn: { type: 'string' },
                        source: { type: 'string', enum: ['direct'] },
                        attachedAt: { type: 'string' }
                      }
                    }
                  },
                  inheritedPolicies: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        type: { type: 'string' },
                        arn: { type: 'string' },
                        source: { type: 'string', enum: ['inherited'] },
                        attachedAt: { type: 'string' }
                      }
                    }
                  },
                  allPolicies: {
                    type: 'array',
                    description: 'All policies (direct + inherited) with duplicates removed',
                    items: {
                      type: 'object'
                    }
                  },
                  hierarchy: {
                    type: 'array',
                    description: 'OU hierarchy path from root to target'
                  }
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

interface PolicyInfo {
  id: string
  name: string
  description?: string
  type: string
  arn?: string
  source: 'direct' | 'inherited'
  attachedAt: string
}

export default defineEventHandler(handleAsync(async (event) => {
  const { environment } = parseQueryParams(event)
  const query = getQuery(event)

  const targetId = query.targetId as string
  const targetType = query.targetType as 'ACCOUNT' | 'ORGANIZATIONAL_UNIT'

  if (!targetId) {
    return errors.badRequest(event, 'targetId is required')
  }

  if (!targetType || !['ACCOUNT', 'ORGANIZATIONAL_UNIT'].includes(targetType)) {
    return errors.badRequest(event, 'targetType must be ACCOUNT or ORGANIZATIONAL_UNIT')
  }

  const directPolicies: PolicyInfo[] = []
  const inheritedPolicies: PolicyInfo[] = []

  try {
    // Get the organizational tree to find parent hierarchy
    const { tree: orgTree } = await getOrganizationalUnitTree(environment)
    if (!orgTree) {
      return errors.serverError(event, 'Failed to fetch organizational tree')
    }

    // Build hierarchy path
    const hierarchyPath: Array<{ id: string; name: string; type: string }> = []

    // Find the target in the tree and build path
    const findTargetPath = (node: any, targetId: string, path: any[] = []): any[] | null => {
      const currentPath = [...path, { id: node.id, name: node.name, type: node.id.startsWith('r-') ? 'root' : 'ou' }]

      // Check if current node is the target
      if (node.id === targetId) {
        return currentPath
      }

      // Check if target is an account in this OU
      if (targetType === 'ACCOUNT' && node.accounts?.includes(targetId)) {
        return currentPath
      }

      // Recursively check children
      if (node.children) {
        for (const child of node.children) {
          const result = findTargetPath(child, targetId, currentPath)
          if (result) return result
        }
      }

      return null
    }

    const path = findTargetPath(orgTree, targetId)
    if (path) {
      hierarchyPath.push(...path)
    }

    // For accounts, also get the account's direct OU
    let accountOU = null
    if (targetType === 'ACCOUNT') {
      accountOU = await getAccountOU(targetId, environment)
      if (accountOU && !hierarchyPath.find(p => p.id === accountOU.id)) {
        // If the account OU isn't in the path, add it
        hierarchyPath.push({ id: accountOU.id, name: accountOU.name, type: 'ou' })
      }
    }

    // Get policies directly attached to the target
    try {
      const targetPolicies = await getAttachedPolicies(targetId, targetType, environment)
      for (const policy of targetPolicies) {
        directPolicies.push({
          id: policy.id,
          name: policy.name,
          description: policy.description,
          type: policy.type || 'SERVICE_CONTROL_POLICY',
          arn: policy.arn,
          source: 'direct',
          attachedAt: hierarchyPath[hierarchyPath.length - 1]?.name || targetId
        })
      }
    } catch (error) {
      logger.warn(`Failed to get policies for ${targetType} ${targetId}:`, error)
    }

    // Get inherited policies from all parent OUs
    for (const node of hierarchyPath) {
      // Skip the target itself (we already got its direct policies)
      if (node.id === targetId) continue

      try {
        const ouPolicies = await getAttachedPolicies(node.id, 'ORGANIZATIONAL_UNIT', environment)
        for (const policy of ouPolicies) {
          inheritedPolicies.push({
            id: policy.id,
            name: policy.name,
            description: policy.description,
            type: policy.type || 'SERVICE_CONTROL_POLICY',
            arn: policy.arn,
            source: 'inherited',
            attachedAt: node.name
          })
        }
      } catch (error) {
        logger.warn(`Failed to get policies for OU ${node.id}:`, error)
      }
    }

    // Combine all policies and remove duplicates
    const allPolicies = [...directPolicies, ...inheritedPolicies]
    const uniquePolicies = allPolicies.filter((policy, index, self) =>
      index === self.findIndex(p => p.id === policy.id)
    )

    return sendSuccess(event, {
      directPolicies,
      inheritedPolicies,
      allPolicies: uniquePolicies,
      hierarchy: hierarchyPath,
      summary: {
        totalPolicies: uniquePolicies.length,
        directCount: directPolicies.length,
        inheritedCount: inheritedPolicies.length,
        hierarchyDepth: hierarchyPath.length
      }
    })

  } catch (error) {
    logger.error('Error fetching policies:', error)
    return errors.serverError(event, 'Failed to fetch policies')
  }
}))
