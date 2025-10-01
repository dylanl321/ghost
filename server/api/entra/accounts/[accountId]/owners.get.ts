/**
 * GET /api/entra/accounts/[identifier]/owners
 * Get all owners for AWS account groups from Entra ID
 * 
 * ACCOUNT IDENTIFICATION:
 * The identifier can be:
 * - Account ID (12-digit AWS account ID)
 * - Email address (root account email)
 * - Request ID (numeric identifier from DynamoDB)
 */

import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { createError } from 'h3'
import { getAWSGroups, getUserDetails } from '../../../../utils/entra/graph-client'
import { extractUniqueOwners } from '../../../../utils/entra/group-parser'
import { validateEntraConfig } from '../../../../utils/entra/config'
import { lookupAccountOptimized } from '../../../../utils/account-lookup-optimized'
import { registerEndpoint } from '../../../../plugins/swagger'
import type { GroupOwner, EntraAPIResponse } from '../../../../types/entra'

// Register OpenAPI documentation
registerEndpoint('/api/entra/accounts/{accountId}/owners', 'GET', {
  summary: 'Get AWS account group owners',
  description: 'Get all owners for AWS account groups from Entra ID with optional user details',
  tags: ['Entra ID'],
  parameters: [
    { $ref: '#/components/parameters/AccountId' },
    {
      name: 'resolveDetails',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: false },
      description: 'Resolve detailed user information for owners'
    }
  ],
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] },
    { OIDCAuth: [] },
    { DevBypass: [] }
  ],
  responses: {
    200: {
      description: 'Account owners retrieved successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  owners: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/GroupOwner' }
                  },
                  commercialGroupOwners: {
                    type: 'object',
                    additionalProperties: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  },
                  govcloudGroupOwners: {
                    type: 'object',
                    additionalProperties: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  },
                  distributionOwners: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  totalOwners: { type: 'integer' }
                }
              }
            }
          }
        }
      }
    },
    401: { description: 'Authentication required' },
    403: { description: 'Insufficient permissions' },
    404: { description: 'Account not found' },
    500: { description: 'Server error' }
  }
})

interface OwnersResponse {
  accountId: string
  owners: GroupOwner[]
  commercialGroupOwners: Record<string, string[]>
  govcloudGroupOwners: Record<string, string[]>
  distributionOwners: string[]
  totalOwners: number
}

export default defineEventHandler(async (event): Promise<EntraAPIResponse<OwnersResponse>> => {
  try {
    // Validate Entra configuration
    const configValidation = validateEntraConfig()
    if (!configValidation.valid) {
      throw createError({
        statusCode: 500,
        statusMessage: `Entra ID configuration error: ${configValidation.errors.join(', ')}`
      })
    }
    
    // Get identifier from route (can be account ID, email, or request ID)
    const identifier = getRouterParam(event, 'accountId')
    if (!identifier) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Account identifier is required'
      })
    }
    
    // Use the standardized account lookup to resolve the identifier
    let accountId: string
    try {
      const lookupResult = await lookupAccountOptimized(event, identifier)
      // Get the actual 12-digit account ID from the result
      accountId = lookupResult.account.accountId || 
                  lookupResult.account.awsStandardAccountID || 
                  lookupResult.account.id || 
                  identifier // fallback to the identifier if it's already an account ID
    } catch (error: any) {
      // If account not found, still try with the identifier as-is
      // (in case it's a valid account ID not in our database)
      console.log(`Account lookup failed for ${identifier}, trying as direct account ID`)
      accountId = identifier
    }
    
    // Get query parameters
    const query = getQuery(event)
    const resolveDetails = query.resolveDetails === 'true'
    
    console.log(`Fetching owners for account ${accountId} (identifier: ${identifier})`)
    
    // Get all groups for this account
    const allGroups = await getAWSGroups(event, {
      accountId,
      includeDistribution: true
    })
    
    const accountGroups = allGroups[accountId] || {
      accountId,
      commercial: [],
      govcloud: [],
      distribution: null,
      uniqueOwners: []
    }
    
    // Extract unique owners
    const uniqueOwners = extractUniqueOwners(accountGroups)
    
    // Resolve owner details if requested
    if (resolveDetails) {
      for (const owner of uniqueOwners) {
        if (owner.type === 'user' && owner.identifier.includes('.')) {
          try {
            // Try to get user details
            // Format might be first.last, so we need to search
            const userPrincipalName = `${owner.identifier}@${process.env.ENTRA_DEFAULT_DOMAIN || 'gd-ms.com'}`
            const userDetails = await getUserDetails(event, userPrincipalName)
            owner.details = userDetails
          } catch (error) {
            console.log(`Could not resolve details for owner ${owner.identifier}`)
          }
        }
      }
    }
    
    // Build detailed owner mapping
    const commercialGroupOwners: Record<string, string[]> = {}
    for (const group of accountGroups.commercial) {
      commercialGroupOwners[group.displayName] = group.owners
    }
    
    const govcloudGroupOwners: Record<string, string[]> = {}
    for (const group of accountGroups.govcloud) {
      govcloudGroupOwners[group.displayName] = group.owners
    }
    
    const distributionOwners = accountGroups.distribution?.owners || []
    
    const response: OwnersResponse = {
      accountId,
      owners: uniqueOwners,
      commercialGroupOwners,
      govcloudGroupOwners,
      distributionOwners,
      totalOwners: uniqueOwners.length
    }
    
    return {
      success: true,
      data: response,
      cached: false
    }
  } catch (error: any) {
    console.error('Error fetching account owners:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to fetch account owners'
    })
  }
})