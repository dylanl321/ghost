/**
 * GET /api/user/info
 * 
 * Returns current authenticated user information and session details
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { requireAuth, logApiRequest } from '../../utils/auth-middleware'

// OpenAPI Documentation
registerEndpoint('/api/user/info', 'GET', {
  summary: 'Get current user information',
  description: 'Retrieve information about the currently authenticated user including profile data, roles, permissions, and session details',
  tags: ['Authentication', 'User'],
  security: [
    {
      sessionAuth: []
    }
  ],
  responses: {
    200: {
      description: 'Current user information',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { 
                type: 'boolean',
                example: true
              },
              data: {
                type: 'object',
                properties: {
                  user: {
                    type: 'object',
                    properties: {
                      id: { 
                        type: 'string',
                        description: 'Unique user identifier',
                        example: 'user-123'
                      },
                      email: { 
                        type: 'string',
                        format: 'email',
                        description: 'User email address',
                        example: 'john.doe@company.com'
                      },
                      name: { 
                        type: 'string',
                        description: 'Full name of the user',
                        example: 'John Doe'
                      },
                      roles: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'User roles',
                        example: ['user', 'admin']
                      },
                      permissions: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'User permissions',
                        example: ['accounts:read', 'costs:read']
                      },
                      department: {
                        type: 'string',
                        description: 'User department',
                        example: 'IT'
                      },
                      linesOfBusiness: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Lines of Business user has access to',
                        example: ['IT', 'Cyber']
                      }
                    },
                    required: ['id', 'email']
                  },
                  session: {
                    type: 'object',
                    properties: {
                      loginTime: {
                        type: 'string',
                        format: 'date-time',
                        description: 'When the user logged in',
                        example: '2025-01-14T10:30:00Z'
                      },
                      provider: {
                        type: 'string',
                        description: 'Authentication provider used',
                        example: 'oidc'
                      },
                      expiresAt: {
                        type: 'string',
                        format: 'date-time',
                        description: 'When the session expires',
                        example: '2025-01-15T10:30:00Z'
                      },
                      lastActivity: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Last activity timestamp',
                        example: '2025-01-14T15:45:00Z'
                      },
                      timeRemaining: {
                        type: 'integer',
                        description: 'Minutes until session expires',
                        example: 1440
                      }
                    }
                  },
                  permissions: {
                    type: 'object',
                    properties: {
                      canViewAccounts: { type: 'boolean' },
                      canEditAccounts: { type: 'boolean' },
                      canViewCosts: { type: 'boolean' },
                      canEditBudgets: { type: 'boolean' },
                      canAdministerSystem: { type: 'boolean' }
                    },
                    description: 'Computed permissions for UI display'
                  }
                }
              }
            }
          }
        }
      }
    },
    401: {
      description: 'Unauthorized - User not authenticated',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  statusCode: { type: 'integer', example: 401 },
                  statusMessage: { type: 'string', example: 'Authentication required' }
                }
              }
            }
          }
        }
      }
    },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Log the request
  await logApiRequest(event, 'get-user-info')
  
  // Require authentication
  const session = await requireAuth(event)
  
  // Calculate session time remaining
  let timeRemaining: number | null = null
  if (session.metadata?.expiresAt) {
    const expiresAt = new Date(session.metadata.expiresAt)
    const now = new Date()
    timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60)))
  }
  
  // Compute user permissions for easy UI consumption
  const permissions = {
    canViewAccounts: hasPermission(session.user, ['accounts:read', 'admin']),
    canEditAccounts: hasPermission(session.user, ['accounts:write', 'accounts:edit', 'admin']),
    canViewCosts: hasPermission(session.user, ['costs:read', 'admin']),
    canEditBudgets: hasPermission(session.user, ['budgets:write', 'budgets:edit', 'admin']),
    canAdministerSystem: hasPermission(session.user, ['admin', 'super-admin']),
    canViewOrganization: hasPermission(session.user, ['organization:read', 'admin']),
    canManageUsers: hasPermission(session.user, ['users:manage', 'admin']),
    canViewAnalytics: hasPermission(session.user, ['analytics:read', 'admin']),
    canExportData: hasPermission(session.user, ['export:data', 'admin'])
  }
  
  // Prepare response data
  const responseData = {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles: session.user.roles || [],
      permissions: session.user.permissions || [],
      department: session.user.department,
      linesOfBusiness: session.user.linesOfBusiness || []
    },
    session: {
      loginTime: session.metadata?.loginTime,
      provider: session.metadata?.provider,
      expiresAt: session.metadata?.expiresAt,
      lastActivity: session.metadata?.lastActivity,
      timeRemaining
    },
    permissions
  }
  
  return sendSuccess(event, responseData, {
    cached: false,
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID()
  })
}))

/**
 * Helper function to check if user has any of the specified permissions or roles
 * @param user - User object from session
 * @param requiredPerms - Array of permissions or roles to check
 * @returns Boolean indicating if user has permission
 */
function hasPermission(user: any, requiredPerms: string[]): boolean {
  // Check roles
  if (user.roles && user.roles.some((role: string) => requiredPerms.includes(role))) {
    return true
  }
  
  // Check permissions
  if (user.permissions && user.permissions.some((perm: string) => requiredPerms.includes(perm))) {
    return true
  }
  
  return false
}