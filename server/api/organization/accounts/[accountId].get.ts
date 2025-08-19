/**
 * GET /api/organization/accounts/[accountId]
 * Get account details from Organizations using centralized lookup
 * 
 * DEPRECATED PATTERN: This endpoint uses [accountId] which implies only account IDs work.
 * RECOMMENDED: Use /api/accounts/[identifier]/governance for comprehensive governance info
 * or /api/accounts/[identifier] for basic account details with flexible identification.
 */

import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { lookupAccountOptimized, validateAccountEnvironment } from '../../../utils/account-lookup-optimized'
import { 
  getAccountPolicies,
  getAccountOU
} from '../../../utils/organizations'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/organization/accounts/[accountId]', 'GET', {
  summary: 'Get account from Organizations',
  description: 'Get detailed account information from AWS Organizations',
  tags: ['Organization'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'accountId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Account identifier - can be 12-digit account ID, email, or request ID (backwards compatible)'
    },
    {
      name: 'includePolicies',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: false },
      description: 'Include service control policies'
    }
  ],
  responses: {
    200: {
      description: 'Account information from Organizations',
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
                      accountId: { type: 'string' },
                      accountName: { type: 'string' },
                      accountEmail: { type: 'string' },
                      accountStatus: { type: 'string' },
                      organizationArn: { type: 'string' }
                    }
                  },
                  organizationalUnit: { type: 'object' },
                  policies: { type: 'array' }
                }
              }
            }
          }
        }
      }
    },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const identifier = getRouterParam(event, 'accountId') as string
  const { environment } = parseQueryParams(event)
  const query = getQuery(event)
  const includePolicies = query.includePolicies === 'true'
  const includeDecommissioned = query.includeDecommissioned === 'true' || query.includeDecommissioned === true
  
  // ================================
  // ACCOUNT LOOKUP & VALIDATION
  // ================================
  
  // Use optimized account lookup - match the pattern from other working endpoints
  const lookupResult = await lookupAccountOptimized(event, identifier, {
    includeDecommissioned
  })
  
  if (!lookupResult) {
    throw new Error('Unexpected null result from account lookup')
  }
  
  const { account, identifierType, matchedValue, source } = lookupResult
  
  // Validate account exists in the requested environment
  let targetAccountId: string
  try {
    targetAccountId = validateAccountEnvironment(account, environment)
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }
  
  // ================================
  // ORGANIZATIONS DATA RETRIEVAL
  // ================================
  
  // Get additional organization data with error handling
  let organizationalUnit: any = null
  let policies: any = []
  
  // Only try to get Organizations data if we have proper configuration
  const orgAccountId = environment === 'commercial' 
    ? process.env.AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID
    : process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID
    
  if (orgAccountId) {
    // Get OU information with error handling
    try {
      organizationalUnit = await getAccountOU(targetAccountId, environment)
    } catch (error) {
      console.warn(`Failed to get OU for account ${targetAccountId} in ${environment}:`, error)
      // Continue with null organizationalUnit
    }
    
    // Get policies if requested
    if (includePolicies) {
      try {
        policies = await getAccountPolicies(targetAccountId, environment)
      } catch (error) {
        console.warn(`Failed to get policies for account ${targetAccountId} in ${environment}:`, error)
        // Continue with empty policies array
      }
    }
  } else {
    console.warn(`Organizations account ID not configured for ${environment} environment`)
  }
  
  const result: any = {
    account: {
      ...account,
      targetAccountId, // The actual account ID used for Organizations lookup
      environment
    },
    lookup: {
      identifier,
      identifierType,
      matchedValue,
      source,
      note: `Account found by ${identifierType}: ${matchedValue} (source: ${source})`
    },
    performance: {
      optimized: true,
      note: 'Used targeted DynamoDB queries instead of full table scan'
    },
    organizationalUnit
  }
  
  if (includePolicies) {
    result.policies = policies
  }
  
  return sendSuccess(event, result, {
    accountId: targetAccountId,
    environment,
    includePolicies
  })
}))