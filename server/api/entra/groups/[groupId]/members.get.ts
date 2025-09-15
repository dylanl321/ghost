/**
 * GET /api/entra/groups/[groupId]/members
 * Get all members of a specific Entra ID group
 */

import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { createError } from 'h3'
import { getGroupMembers } from '../../../../utils/entra/graph-client'
import { validateEntraConfig } from '../../../../utils/entra/config'
import { registerEndpoint } from '../../../../plugins/swagger'
import type { GroupMembersResponse, EntraAPIResponse } from '../../../../types/entra'

// Register OpenAPI documentation
registerEndpoint('/api/entra/groups/{groupId}/members', 'GET', {
  summary: 'Get Entra ID group members',
  description: 'Get all members of a specific Entra ID group',
  tags: ['Entra ID'],
  parameters: [
    { $ref: '#/components/parameters/GroupId' },
    {
      name: 'includeDetails',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: false },
      description: 'Include detailed user information'
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
      description: 'Group members retrieved successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  groupId: { type: 'string' },
                  displayName: { type: 'string' },
                  members: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/EntraUser' }
                  },
                  totalCount: { type: 'integer' }
                }
              }
            }
          }
        }
      }
    },
    401: { description: 'Authentication required' },
    403: { description: 'Insufficient permissions' },
    404: { description: 'Group not found' },
    500: { description: 'Server error' }
  }
})

export default defineEventHandler(async (event): Promise<EntraAPIResponse<GroupMembersResponse>> => {
  try {
    // Validate Entra configuration
    const configValidation = validateEntraConfig()
    if (!configValidation.valid) {
      throw createError({
        statusCode: 500,
        statusMessage: `Entra ID configuration error: ${configValidation.errors.join(', ')}`
      })
    }
    
    // Get group ID from route
    const groupId = getRouterParam(event, 'groupId')
    if (!groupId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Group ID is required'
      })
    }
    
    // Get query parameters
    const query = getQuery(event)
    const includeDetails = query.includeDetails === 'true'
    
    console.log(`Fetching members for group ${groupId}`)
    
    // Get group members
    const membersResponse = await getGroupMembers(event, groupId)
    
    // If details are not requested, simplify the response
    if (!includeDetails) {
      membersResponse.members = membersResponse.members.map(member => ({
        id: member.id,
        displayName: member.displayName,
        mail: member.mail,
        userPrincipalName: member.userPrincipalName
      }))
    }
    
    return {
      success: true,
      data: membersResponse,
      cached: false // Will be true when from cache
    }
  } catch (error: any) {
    console.error('Error fetching group members:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to fetch group members'
    })
  }
})