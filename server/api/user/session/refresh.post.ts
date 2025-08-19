/**
 * POST /api/user/session/refresh
 * 
 * Refresh the current user session (extend expiration time)
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { requireAuth, logApiRequest } from '../../../utils/auth-middleware'

// OpenAPI Documentation
registerEndpoint('/api/user/session/refresh', 'POST', {
  summary: 'Refresh user session',
  description: 'Extend the current user session expiration time',
  tags: ['Authentication', 'User'],
  security: [
    {
      sessionAuth: []
    }
  ],
  requestBody: {
    required: false,
    description: 'Optional parameters for session refresh',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            extendBy: {
              type: 'integer',
              minimum: 5,
              maximum: 1440,
              default: 60,
              description: 'Minutes to extend session by (5-1440 minutes, default 60)'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Session refreshed successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  session: {
                    type: 'object',
                    properties: {
                      expiresAt: { 
                        type: 'string', 
                        format: 'date-time',
                        description: 'New session expiration time'
                      },
                      timeRemaining: { 
                        type: 'integer',
                        description: 'Minutes until new expiration'
                      },
                      extendedBy: {
                        type: 'integer',
                        description: 'Minutes the session was extended by'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    400: {
      description: 'Bad Request - Invalid parameters',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    401: {
      description: 'Unauthorized - User not authenticated',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Log the request
  await logApiRequest(event, 'refresh-session')
  
  // Require authentication
  const session = await requireAuth(event)
  
  // Get request body (optional)
  const body = await readBody(event).catch(() => ({}))
  const { extendBy = 60 } = body
  
  // Validate extendBy parameter
  if (typeof extendBy !== 'number' || extendBy < 5 || extendBy > 1440) {
    return errors.badRequest(event, 'extendBy must be a number between 5 and 1440 minutes')
  }
  
  // Calculate new expiration time
  const now = new Date()
  const newExpiresAt = new Date(now.getTime() + extendBy * 60 * 1000)
  
  // Update session metadata
  const updatedSession = {
    ...session,
    metadata: {
      ...session.metadata,
      expiresAt: newExpiresAt.toISOString(),
      lastActivity: now.toISOString(),
      lastRefresh: now.toISOString()
    }
  }
  
  // Save updated session
  await setUserSession(event, updatedSession)
  
  // Calculate time remaining
  const timeRemaining = Math.floor((newExpiresAt.getTime() - now.getTime()) / (1000 * 60))
  
  return sendSuccess(event, {
    message: `Session extended by ${extendBy} minutes`,
    session: {
      expiresAt: newExpiresAt.toISOString(),
      timeRemaining,
      extendedBy: extendBy
    }
  }, {
    timestamp: now.toISOString(),
    operation: 'session-refresh'
  })
}))