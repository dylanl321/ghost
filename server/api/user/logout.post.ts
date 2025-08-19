/**
 * POST /api/user/logout
 * 
 * Clear the current user session (logout)
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { getCurrentUser, logApiRequest } from '../../utils/auth-middleware'

// OpenAPI Documentation
registerEndpoint('/api/user/logout', 'POST', {
  summary: 'Logout user',
  description: 'Clear the current user session and log out the user',
  tags: ['Authentication', 'User'],
  responses: {
    200: {
      description: 'User logged out successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  message: { 
                    type: 'string',
                    example: 'Logged out successfully'
                  },
                  loggedOut: { 
                    type: 'boolean',
                    example: true
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time'
                  }
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
  // Get current user for logging (before clearing session)
  const currentUser = await getCurrentUser(event)
  
  // Log the logout request
  await logApiRequest(event, 'user-logout', {
    userId: currentUser?.user?.id || 'unknown',
    userEmail: currentUser?.user?.email || 'unknown'
  })
  
  // Clear the user session
  await clearUserSession(event)
  
  const timestamp = new Date().toISOString()
  
  return sendSuccess(event, {
    message: 'Logged out successfully',
    loggedOut: true,
    timestamp
  }, {
    operation: 'logout',
    timestamp
  })
}))