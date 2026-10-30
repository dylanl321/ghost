/**
 * GET /api/organization/accounts/[identifier]/governance
 * Get comprehensive governance information for an account including SCPs and organizational location
 * 
 * ACCOUNT IDENTIFICATION:
 * The identifier can be:
 * - Account ID (12-digit AWS account ID)
 * - Email address (root account email)
 * - Request ID (custom identifier used in account requests)
 * 
 * RETURNED INFORMATION:
 * - Account details and status
 * - Organizational Unit (OU) hierarchy and location
 * - Service Control Policies (SCPs) attached directly and inherited
 * - Cross-environment analysis (Commercial + GovCloud if applicable)
 * 
 * GOVERNANCE CONTEXT:
 * SCPs are inherited from all parent OUs up to the root, providing complete
 * policy context for compliance and access management.
 */

import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import {
  getAccountOU,
  getOrganizationalUnitTree,
  collectScpPolicies,
  type ScpPolicyInfo
} from '../../../../utils/organizations'
import { lookupAccountOptimized } from '../../../../utils/account-lookup-optimized'
import { sendSuccess, errors, handleAsync } from '../../../../utils/api-response'
import { registerEndpoint } from '../../../../plugins/swagger'
import { logger } from '../../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/organization/accounts/[identifier]/governance', 'GET', {
  summary: 'Get account governance information',
  description: 'Retrieve comprehensive governance information including SCPs, OU location, and organizational context for an account. By default, analyzes both commercial and govcloud environments (if the account exists in both) for complete governance visibility. Use the environment parameter to limit analysis to a specific environment for faster responses.',
  tags: ['Organization'],
  parameters: [
    {
      name: 'identifier',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Account identifier - can be 12-digit account ID, email address, or numeric request ID'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['commercial', 'govcloud'],
        default: 'both'
      },
      description: 'AWS environment to analyze. Defaults to analyzing both environments where the account exists. Specify "commercial" or "govcloud" for faster responses when you only need one environment.'
    },
    {
      name: 'includeDecommissioned',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include decommissioned accounts in search (default: false)'
    }
  ],
  responses: {
    200: {
      description: 'Account governance information',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  account: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      govId: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' },
                      status: { type: 'string' },
                      enclaveStatus: { type: 'string' },
                      environments: { 
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  },
                  organizationalContext: {
                    type: 'object',
                    description: 'Governance information by environment. Contains "commercial" and/or "govcloud" properties based on where the account exists and which environments were requested for analysis.',
                    additionalProperties: {
                      type: 'object',
                      properties: {
                        accountLocation: { 
                          type: 'object',
                          description: 'Organizational Unit where the account is located',
                          nullable: true
                        },
                        ouHierarchy: { 
                          type: 'array',
                          description: 'Complete hierarchy path from root to account OU',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              type: { type: 'string' }
                            }
                          }
                        },
                        directPolicies: { 
                          type: 'array',
                          description: 'Service Control Policies attached directly to this account',
                          items: { $ref: '#/components/schemas/PolicyInfo' }
                        },
                        inheritedPolicies: { 
                          type: 'array',
                          description: 'Service Control Policies inherited from parent OUs',
                          items: { $ref: '#/components/schemas/PolicyInfo' }
                        },
                        allPolicies: { 
                          type: 'array',
                          description: 'All policies (direct + inherited) with duplicates removed',
                          items: { $ref: '#/components/schemas/PolicyInfo' }
                        }
                      }
                    }
                  },
                  summary: {
                    type: 'object',
                    properties: {
                      totalPolicies: { type: 'integer' },
                      environments: { type: 'array' },
                      ouDepth: { type: 'integer' },
                      hasCustomPolicies: { type: 'boolean' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

type PolicyInfo = ScpPolicyInfo

interface EnvironmentGovernance {
  accountLocation: any
  ouHierarchy: Array<{
    id: string
    name: string
    type: string
  }>
  directPolicies: PolicyInfo[]
  inheritedPolicies: PolicyInfo[]
  allPolicies: PolicyInfo[]
}

export default defineEventHandler(handleAsync(async (event) => {
  const identifier = getRouterParam(event, 'identifier') as string
  const query = getQuery(event)
  
  // ================================
  // PARAMETER VALIDATION & ACCOUNT LOOKUP
  // ================================
  
  const includeDecommissioned = query.includeDecommissioned === 'true' || query.includeDecommissioned === true
  const requestedEnvironment = query.environment as string
  
  // Validate environment parameter
  if (requestedEnvironment && !['commercial', 'govcloud'].includes(requestedEnvironment)) {
    return errors.badRequest(event, 'Environment parameter must be "commercial" or "govcloud"')
  }
  
  // Use optimized account lookup - no more full table scans!
  const lookupResult = await lookupAccountOptimized(event, identifier, {
    includeDecommissioned
  })
  
  if (!lookupResult) {
    // This shouldn't happen as lookupAccountOptimized throws errors
    return errors.notFound(event, `Account not found with identifier: ${identifier}`)
  }
  
  const { account: targetAccount, identifierType, matchedValue, source } = lookupResult
  
  // ================================
  // GOVERNANCE ANALYSIS
  // ================================
  
  const organizationalContext: {
    commercial?: EnvironmentGovernance
    govcloud?: EnvironmentGovernance
  } = {}
  
  // Determine which environments to analyze based on account availability and user request
  const availableEnvironments: ('commercial' | 'govcloud')[] = []
  if (targetAccount.accountId || targetAccount.id) availableEnvironments.push('commercial')
  if (targetAccount.govCloudAccountId || targetAccount.govId) availableEnvironments.push('govcloud')
  
  // Filter environments based on user request
  const environments = requestedEnvironment 
    ? availableEnvironments.filter(env => env === requestedEnvironment)
    : availableEnvironments
    
  if (environments.length === 0) {
    if (requestedEnvironment) {
      return errors.badRequest(event, 
        `Account does not exist in ${requestedEnvironment} environment. Available environments: ${availableEnvironments.join(', ')}`
      )
    } else {
      return errors.notFound(event, 'Account does not exist in any AWS environment')
    }
  }
  
  // Analyze governance for each environment
  for (const environment of environments) {
    const accountId = environment === 'commercial' 
      ? (targetAccount.accountId || targetAccount.id)
      : (targetAccount.govCloudAccountId || targetAccount.govId)
    
    if (!accountId) continue
    
    try {
      // ================================
      // GET ORGANIZATIONAL CONTEXT
      // ================================
      
      // Get account's OU location
      const accountLocation = await getAccountOU(accountId, environment)
      
      if (!accountLocation) {
        // Account exists but not in organization (suspended, moved, etc.)
        organizationalContext[environment] = {
          accountLocation: null,
          ouHierarchy: [],
          directPolicies: [],
          inheritedPolicies: [],
          allPolicies: []
        }
        continue
      }
      
      // Get full OU hierarchy to trace inheritance path
      const { tree: orgTree } = await getOrganizationalUnitTree(environment)
      
      // ================================
      // BUILD OU HIERARCHY PATH
      // ================================
      
      // Trace path from account's OU to root
      const ouHierarchy = []
      
      // Path runs top-down: root -> parent OUs -> the account's OU
      const findOUPath = (tree: any, targetId: string, path: any[] = []): any[] | null => {
        if (tree.id === targetId) {
          return [...path, { id: tree.id, name: tree.name, type: tree.type || 'OrganizationalUnit' }]
        }
        
        if (tree.children) {
          for (const child of tree.children) {
            const result = findOUPath(child, targetId, [...path, { id: tree.id, name: tree.name, type: tree.type || 'OrganizationalUnit' }])
            if (result) return result
          }
        }
        
        return null
      }
      
      const hierarchyPath = orgTree ? findOUPath(orgTree, accountLocation.id) : null
      if (hierarchyPath) {
        ouHierarchy.push(...hierarchyPath)
      }
      
      // ================================
      // COLLECT SERVICE CONTROL POLICIES
      // ================================

      const { directPolicies, inheritedPolicies, allPolicies } = await collectScpPolicies(
        { id: accountId, type: 'ACCOUNT', label: targetAccount.name || accountId },
        ouHierarchy,
        environment
      )

      organizationalContext[environment] = {
        accountLocation,
        ouHierarchy,
        directPolicies,
        inheritedPolicies,
        allPolicies
      }
      
    } catch (error) {
      logger.error(`Error analyzing governance for ${accountId} in ${environment}:`, error)
      
      // Return partial data even if there's an error
      organizationalContext[environment] = {
        accountLocation: null,
        ouHierarchy: [],
        directPolicies: [],
        inheritedPolicies: [],
        allPolicies: []
      }
    }
  }
  
  // ================================
  // GENERATE SUMMARY
  // ================================
  
  const allPoliciesAcrossEnvironments = Object.values(organizationalContext)
    .flatMap(env => env?.allPolicies || [])
  
  const uniquePolicyIds = new Set(allPoliciesAcrossEnvironments.map(p => p.id))
  const hasCustomPolicies = allPoliciesAcrossEnvironments.some(p => 
    p.type === 'SERVICE_CONTROL_POLICY' && !p.name.includes('FullAWSAccess')
  )
  
  const maxOUDepth = Math.max(
    ...Object.values(organizationalContext).map(env => env?.ouHierarchy.length || 0)
  )
  
  const summary = {
    totalPolicies: uniquePolicyIds.size,
    environments: environments,
    availableEnvironments: availableEnvironments,
    requestedEnvironment: requestedEnvironment || 'both',
    environmentsAnalyzed: environments.length,
    ouDepth: maxOUDepth,
    hasCustomPolicies
  }
  
  // ================================
  // RESULT ASSEMBLY
  // ================================
  
  const result = {
    account: {
      id: targetAccount.accountId || targetAccount.id,
      govId: targetAccount.govCloudAccountId || targetAccount.govId,
      name: targetAccount.name,
      email: targetAccount.email,
      status: targetAccount.status,
      enclaveStatus: targetAccount.enclaveStatus,
      environments: environments,
      availableEnvironments: availableEnvironments
    },
    lookup: {
      identifier,
      identifierType,
      matchedValue,
      source,
      note: `Account found by ${identifierType}: ${matchedValue} (source: ${source})`
    },
    organizationalContext,
    summary,
    performance: {
      optimized: true,
      environmentFiltering: requestedEnvironment ? `Limited to ${requestedEnvironment} environment for faster response` : 'Analyzed all available environments',
      note: 'Used targeted DynamoDB queries instead of full table scan'
    },
    note: requestedEnvironment 
      ? `SCPs are inherited from all parent OUs. Analysis limited to ${requestedEnvironment} environment as requested.`
      : 'SCPs are inherited from all parent OUs. Direct policies are attached specifically to this account.'
  }
  
  return sendSuccess(event, result)
}))