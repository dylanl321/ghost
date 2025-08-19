/**
 * GET /api/user/session
 * 
 * Returns current user session status without requiring authentication
 * (useful for checking if user is logged in without throwing errors)
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { getCurrentUser } from '../../utils/auth-middleware'

// OpenAPI Documentation
registerEndpoint('/api/user/session', 'GET', {
  summary: 'Check current session status',
  description: 'Check if user has an active session without requiring authentication. Returns session info if authenticated, or indicates no session.',
  tags: ['Authentication', 'User'],
  responses: {
    200: {
      description: 'Session status information',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  authenticated: {
                    type: 'boolean',
                    description: 'Whether user is currently authenticated'
                  },
                  user: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      id: { type: 'string' },
                      email: { type: 'string' },
                      name: { type: 'string' },
                      roles: { type: 'array', items: { type: 'string' } }
                    },
                    description: 'Basic user info if authenticated, null otherwise'
                  },
                  session: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      provider: { type: 'string' },
                      loginTime: { type: 'string', format: 'date-time' },
                      expiresAt: { type: 'string', format: 'date-time' },
                      timeRemaining: { type: 'integer', description: 'Minutes until expiration' }
                    },
                    description: 'Session metadata if authenticated, null otherwise'
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
  // Get current user session (doesn't throw if not authenticated)
  const session = await getCurrentUser(event)
  
  if (!session) {
    return sendSuccess(event, {
      authenticated: false,
      user: null,
      session: null
    })
  }
  
  // Calculate time remaining
  let timeRemaining: number | null = null
  if (session.metadata?.expiresAt) {
    const expiresAt = new Date(session.metadata.expiresAt)
    const now = new Date()
    timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60)))
  }
  
  return sendSuccess(event, {
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles: session.user.roles || []
    },
    session: {
      provider: session.metadata?.provider,
      loginTime: session.metadata?.loginTime,
      expiresAt: session.metadata?.expiresAt,
      timeRemaining
    }
  })
}))