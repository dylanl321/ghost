/**
 * GET /api/entra/accounts/[identifier]/groups
 * Get all Entra ID groups for a specific AWS account
 * 
 * ACCOUNT IDENTIFICATION:
 * The identifier can be:
 * - Account ID (12-digit AWS account ID)
 * - Email address (root account email)
 * - Request ID (numeric identifier from DynamoDB)
 */

import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { createError } from 'h3'
import { getAWSGroups, getGroupMembers } from '../../../../utils/entra/graph-client'
import { findDistributionGroup } from '../../../../utils/entra/distribution-groups'
import { findAccountByIdentifierOptimized } from '../../../../utils/account-lookup-optimized'
import { extractUniqueOwners, sortGroupsByRole, parseAWSGroupWithContext } from '../../../../utils/entra/group-parser'
import { validateEntraConfig } from '../../../../utils/entra/config'
import { lookupAccountOptimized } from '../../../../utils/account-lookup-optimized'
import { registerEndpoint } from '../../../../plugins/swagger'
import type { AccountGroups, EntraAPIResponse } from '../../../../types/entra'

// Register OpenAPI documentation
registerEndpoint('/api/entra/accounts/{accountId}/groups', 'GET', {
  summary: 'Get Entra ID groups for AWS account',
  description: 'Get all Entra ID groups (commercial, govcloud, and distribution) for a specific AWS account',
  tags: ['Entra ID'],
  parameters: [
    { $ref: '#/components/parameters/AccountId' },
    { $ref: '#/components/parameters/IncludeMembers' },
    { $ref: '#/components/parameters/SortByRole' }
  ],
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] },
    { OIDCAuth: [] },
    { DevBypass: [] }
  ],
  responses: {
    200: {
      description: 'Account groups retrieved successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { $ref: '#/components/schemas/AccountGroups' }
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

export default defineEventHandler(async (event): Promise<EntraAPIResponse<AccountGroups>> => {
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
    
    // Use the standardized account lookup to resolve the identifier and get both account IDs
    let accountLookup: any
    let commercialAccountId: string | null = null
    let govcloudAccountId: string | null = null
    let accountEmail: string | null = null
    
    try {
      const lookupResult = await lookupAccountOptimized(event, identifier)
      accountLookup = lookupResult.account
      
      // Extract both commercial and govcloud account IDs
      commercialAccountId = accountLookup.accountId || accountLookup.awsStandardAccountID || accountLookup.id
      govcloudAccountId = accountLookup.govCloudAccountId || accountLookup.awsGovCloudAccountID || accountLookup.govId
      accountEmail = accountLookup.email
      
      console.log(`Account lookup successful for ${identifier}:`, {
        commercialAccountId,
        govcloudAccountId,
        email: accountEmail
      })
    } catch (error: any) {
      // If account not found, still try with the identifier as-is
      console.log(`Account lookup failed for ${identifier}, trying as direct account ID`)
      if (/^\d{12}$/.test(identifier)) {
        commercialAccountId = identifier
      }
    }
    
    // Get query parameters
    const query = getQuery(event)
    const includeMembers = query.includeMembers === 'true'
    const sortByRole = query.sortByRole !== 'false'
    
    // Initialize result structure
    let accountGroups = {
      accountId: commercialAccountId || govcloudAccountId || identifier,
      commercial: [] as any[],
      govcloud: [] as any[],
      distribution: null as any,
      uniqueOwners: [] as any[]
    }
    
    // Track cache hits
    let cacheHits = {
      commercial: false,
      govcloud: false,
      distribution: false
    }
    
    // Fetch groups for commercial account ID if it exists
    if (commercialAccountId) {
      console.log(`Fetching commercial Entra groups for account ${commercialAccountId}`)
      try {
        const commercialGroupsResponse = await getAWSGroups(event, {
          accountId: commercialAccountId,
          includeDistribution: false
        })
        
        // Track cache status
        cacheHits.commercial = commercialGroupsResponse.fromCache
        
        // Process raw groups and apply correct environment context
        const rawGroups = Object.values(commercialGroupsResponse.data).flatMap(account => 
          [...(account.commercial || []), ...(account.govcloud || [])]
        ).filter(group => group.accountId === commercialAccountId)
        
        // Re-parse with commercial environment context
        accountGroups.commercial = rawGroups.map(rawGroup => {
          const parsed = parseAWSGroupWithContext(rawGroup as any, 'commercial')
          return parsed && 'role' in parsed ? parsed : null
        }).filter(Boolean) as any[]
        
        console.log(`Found ${accountGroups.commercial.length} commercial groups`)
      } catch (error) {
        console.error(`Failed to fetch commercial groups for ${commercialAccountId}:`, error)
      }
    }
    
    // Fetch groups for govcloud account ID if it exists and is different
    if (govcloudAccountId && govcloudAccountId !== commercialAccountId) {
      console.log(`Fetching govcloud Entra groups for account ${govcloudAccountId}`)
      try {
        const govcloudGroupsResponse = await getAWSGroups(event, {
          accountId: govcloudAccountId,
          includeDistribution: false
        })
        
        // Track cache status
        cacheHits.govcloud = govcloudGroupsResponse.fromCache
        
        // Process raw groups and apply correct environment context
        const rawGroups = Object.values(govcloudGroupsResponse.data).flatMap(account => 
          [...(account.commercial || []), ...(account.govcloud || [])]
        ).filter(group => group.accountId === govcloudAccountId)
        
        // Re-parse with govcloud environment context
        accountGroups.govcloud = rawGroups.map(rawGroup => {
          const parsed = parseAWSGroupWithContext(rawGroup as any, 'govcloud')
          return parsed && 'role' in parsed ? parsed : null
        }).filter(Boolean) as any[]
        
        console.log(`Found ${accountGroups.govcloud.length} govcloud groups`)
      } catch (error) {
        console.error(`Failed to fetch govcloud groups for ${govcloudAccountId}:`, error)
      }
    }
    
    // Try to find distribution group using the account email
    if (!accountGroups.distribution && accountEmail) {
      try {
        const emailPrefix = accountEmail.split('@')[0]
        console.log(`Found account email '${accountEmail}', searching for distribution group '${emailPrefix}'`)
        const distributionGroup = await findDistributionGroup(event, emailPrefix)
        if (distributionGroup) {
          accountGroups.distribution = distributionGroup
          console.log(`Found distribution group: ${distributionGroup.displayName}`)
        } else {
          console.log(`No distribution group found for '${emailPrefix}'`)
        }
      } catch (error) {
        console.error('Failed to find distribution group:', error)
      }
    }
    
    // Sort groups by role if requested
    if (sortByRole) {
      accountGroups.commercial = sortGroupsByRole(accountGroups.commercial)
      accountGroups.govcloud = sortGroupsByRole(accountGroups.govcloud)
    }
    
    // Extract unique owners from all groups (commercial, govcloud, and distribution)
    accountGroups.uniqueOwners = extractUniqueOwners(accountGroups)
    
    // Add member details if requested
    if (includeMembers) {
      console.log('Fetching member details for all groups...')
      
      // Fetch members for commercial groups
      for (const group of accountGroups.commercial) {
        try {
          const members = await getGroupMembers(event, group.id, false)
          group.memberCount = members.totalCount || 0
          group.members = members.members || []
        } catch (error) {
          console.error(`Failed to get members for group ${group.id}:`, error)
          group.memberCount = 0
          group.members = []
        }
      }
      
      // Fetch members for govcloud groups
      for (const group of accountGroups.govcloud) {
        try {
          const members = await getGroupMembers(event, group.id, false)
          group.memberCount = members.totalCount || 0
          group.members = members.members || []
        } catch (error) {
          console.error(`Failed to get members for group ${group.id}:`, error)
          group.memberCount = 0
          group.members = []
        }
      }
      
      // Fetch members for distribution group
      if (accountGroups.distribution) {
        try {
          const members = await getGroupMembers(event, accountGroups.distribution.id, false)
          accountGroups.distribution.memberCount = members.totalCount || 0
          accountGroups.distribution.members = members.members || []
        } catch (error) {
          console.error(`Failed to get members for distribution group ${accountGroups.distribution.id}:`, error)
          accountGroups.distribution.memberCount = 0
          accountGroups.distribution.members = []
        }
      }
    }
    
    // Build metadata
    const metadata = {
      requestedAccountId: identifier,
      commercialAccountId,
      govcloudAccountId,
      resolvedEmail: accountEmail,
      includeMembers,
      sortedByRole: sortByRole,
      totalGroups: accountGroups.commercial.length + accountGroups.govcloud.length,
      totalMembers: includeMembers ? 
        accountGroups.commercial.reduce((sum, g) => sum + (g.memberCount || 0), 0) +
        accountGroups.govcloud.reduce((sum, g) => sum + (g.memberCount || 0), 0) +
        (accountGroups.distribution?.memberCount || 0) : undefined,
      totalOwners: accountGroups.uniqueOwners.length,
      timestamp: new Date().toISOString(),
      cacheHits,
      cacheKey: `entra:account:${commercialAccountId || govcloudAccountId || identifier}`
    }
    
    // Determine overall cache status (true if all requested data came from cache)
    const overallCached = (
      (!commercialAccountId || cacheHits.commercial) &&
      (!govcloudAccountId || cacheHits.govcloud) &&
      (!accountGroups.distribution || cacheHits.distribution)
    )
    
    return {
      success: true,
      data: accountGroups,
      metadata,
      cached: overallCached
    }
  } catch (error: any) {
    console.error('Error fetching account groups:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to fetch account groups'
    })
  }
})