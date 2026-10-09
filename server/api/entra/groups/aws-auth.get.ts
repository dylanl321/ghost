/**
 * GET /api/entra/groups/aws-auth
 * List all AWS authentication groups from Entra ID
 */

import { defineEventHandler, getQuery } from 'h3'
import { createError } from 'h3'
import { getAWSGroups } from '../../../utils/entra/graph-client'
import { getAccountGroupStatistics } from '../../../utils/entra/group-parser'
import { summarizeGroupsByRole } from '../../../utils/entra/aws-group-matcher'
import { validateEntraConfig } from '../../../utils/entra/config'
import { registerEndpoint } from '../../../plugins/swagger'
import type { EntraAPIResponse } from '../../../types/entra'
import { logger } from '../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/entra/groups/aws-auth', 'GET', {
  summary: 'List AWS authentication groups',
  description: 'Get all AWS authentication groups from Entra ID with filtering and statistics',
  tags: ['Entra ID'],
  parameters: [
    { $ref: '#/components/parameters/EntraEnvironment' },
    { $ref: '#/components/parameters/Role' },
    { $ref: '#/components/parameters/Search' }
  ],
  security: [
    { OIDCAuth: [] }
  ],
  responses: {
    200: {
      description: 'AWS authentication groups retrieved successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  accounts: {
                    type: 'object',
                    additionalProperties: {
                      type: 'object',
                      properties: {
                        accountId: { type: 'string' },
                        commercial: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ParsedAWSGroup' }
                        },
                        govcloud: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ParsedAWSGroup' }
                        },
                        statistics: {
                          type: 'object',
                          properties: {
                            totalGroups: { type: 'integer' },
                            commercialGroups: { type: 'integer' },
                            govcloudGroups: { type: 'integer' },
                            totalOwners: { type: 'integer' },
                            roles: { type: 'array', items: { type: 'string' } }
                          }
                        }
                      }
                    }
                  },
                  summary: {
                    type: 'object',
                    properties: {
                      totalAccounts: { type: 'integer' },
                      totalGroups: { type: 'integer' },
                      rolesSummary: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    401: { description: 'Authentication required' },
    403: { description: 'Insufficient permissions' },
    500: { description: 'Server error' }
  }
})

interface AWSAuthGroupsResponse {
  accounts: Record<string, {
    accountId: string
    commercial: any[]
    govcloud: any[]
    statistics: ReturnType<typeof getAccountGroupStatistics>
  }>
  summary: {
    totalAccounts: number
    totalGroups: number
    rolesSummary: ReturnType<typeof summarizeGroupsByRole>
  }
}

export default defineEventHandler(async (event): Promise<EntraAPIResponse<AWSAuthGroupsResponse>> => {
  try {
    // Validate Entra configuration
    const configValidation = validateEntraConfig()
    if (!configValidation.valid) {
      throw createError({
        statusCode: 500,
        statusMessage: `Entra ID configuration error: ${configValidation.errors.join(', ')}`
      })
    }
    
    // Get query parameters
    const query = getQuery(event)
    const environment = query.environment as 'commercial' | 'govcloud' | undefined
    const role = query.role as string | undefined
    const searchTerm = query.search as string | undefined
    
    logger.debug('Fetching all AWS authentication groups')
    
    // Get all AWS groups
    const allGroups = await getAWSGroups(event, {
      environment,
      role,
      searchTerm,
      includeDistribution: false // Don't include distribution groups in this endpoint
    })
    
    // Build response with statistics
    const response: AWSAuthGroupsResponse = {
      accounts: {},
      summary: {
        totalAccounts: 0,
        totalGroups: 0,
        rolesSummary: {}
      }
    }
    
    // Process each account
    for (const [accountId, groups] of Object.entries(allGroups)) {
      // Filter by environment if specified
      let commercialGroups = groups.commercial || []
      let govcloudGroups = groups.govcloud || []
      
      if (environment === 'commercial') {
        govcloudGroups = []
      } else if (environment === 'govcloud') {
        commercialGroups = []
      }
      
      // Filter by role if specified
      if (role) {
        commercialGroups = commercialGroups.filter(g => 
          g.role.toLowerCase().includes(role.toLowerCase())
        )
        govcloudGroups = govcloudGroups.filter(g => 
          g.role.toLowerCase().includes(role.toLowerCase())
        )
      }
      
      // Filter by search term if specified
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        commercialGroups = commercialGroups.filter(g => 
          g.displayName.toLowerCase().includes(term) ||
          g.description.toLowerCase().includes(term) ||
          g.owners.some(o => o.toLowerCase().includes(term))
        )
        govcloudGroups = govcloudGroups.filter(g => 
          g.displayName.toLowerCase().includes(term) ||
          g.description.toLowerCase().includes(term) ||
          g.owners.some(o => o.toLowerCase().includes(term))
        )
      }
      
      // Skip if no groups after filtering
      if (commercialGroups.length === 0 && govcloudGroups.length === 0) {
        continue
      }
      
      // Get statistics for this account
      const statistics = getAccountGroupStatistics({
        accountId,
        commercial: commercialGroups,
        govcloud: govcloudGroups,
        distribution: null,
        uniqueOwners: []
      })
      
      response.accounts[accountId] = {
        accountId,
        commercial: commercialGroups,
        govcloud: govcloudGroups,
        statistics
      }
      
      response.summary.totalGroups += statistics.totalGroups
    }
    
    // Calculate summary
    response.summary.totalAccounts = Object.keys(response.accounts).length
    response.summary.rolesSummary = summarizeGroupsByRole(allGroups)
    
    return {
      success: true,
      data: response,
      cached: false
    }
  } catch (error: any) {
    logger.error('Error fetching AWS auth groups:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to fetch AWS authentication groups'
    })
  }
})
