/**
 * GET /api/accounts/[identifier]
 * Get detailed information for a specific account using centralized lookup
 * 
 * ACCOUNT IDENTIFICATION:
 * The identifier can be:
 * - Account ID (12-digit AWS account ID)
 * - Email address (root account email)
 * - Request ID (numeric identifier from DynamoDB)
 * 
 * This endpoint demonstrates the standardized account lookup pattern
 * that should be used across all APIs requiring account identification.
 */

import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { lookupAccountOptimized } from '../../utils/account-lookup-optimized'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/[identifier]', 'GET', {
  summary: 'Get account details',
  description: 'Retrieve detailed information for a specific account using flexible identifier lookup',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'identifier',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Account identifier - can be 12-digit account ID, email, or numeric request ID'
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
      description: 'Account details',
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
                    description: 'Complete account information from unified system'
                  },
                  lookup: {
                    type: 'object',
                    properties: {
                      identifier: { type: 'string' },
                      identifierType: { 
                        type: 'string',
                        enum: ['accountId', 'govId', 'requestID', 'email']
                      },
                      matchedValue: { type: 'string' },
                      note: { type: 'string' }
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

export default defineEventHandler(handleAsync(async (event) => {
  const identifier = getRouterParam(event, 'identifier') as string
  const query = getQuery(event)
  
  // ================================
  // PARAMETER VALIDATION & ACCOUNT LOOKUP
  // ================================
  
  const includeDecommissioned = query.includeDecommissioned === 'true' || query.includeDecommissioned === true
  
  // Use optimized account lookup - no more full table scans!
  // This is the standard pattern that all APIs should follow
  const lookupResult = await lookupAccountOptimized(event, identifier, {
    includeDecommissioned
  })
  
  if (!lookupResult) {
    // This shouldn't happen as lookupAccountOptimized throws errors
    throw new Error('Unexpected null result from account lookup')
  }
  
  const { account, identifierType, matchedValue, source } = lookupResult
  
  // ================================
  // RESULT ASSEMBLY
  // ================================
  
  const result = {
    account,
    lookup: {
      identifier,
      identifierType,
      matchedValue,
      source,
      note: `Account found by ${identifierType}: ${matchedValue} (source: ${source})`
    },
    metadata: {
      environments: [],
      hasCommercial: !!(account.accountId || account.id),
      hasGovCloud: !!(account.govCloudAccountId || account.govId),
      isActive: account.status === 'ACTIVE',
      isDecommissioned: account.enclaveStatus === 'Decommissioned'
    },
    performance: {
      optimized: true,
      note: 'Used targeted DynamoDB queries instead of full table scan'
    }
  }
  
  // Add environment information
  if (account.accountId || account.id) result.metadata.environments.push('commercial')
  if (account.govCloudAccountId || account.govId) result.metadata.environments.push('govcloud')
  
  return sendSuccess(event, result)
}))