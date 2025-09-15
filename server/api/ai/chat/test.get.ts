/**
 * GET /api/ai/chat/test
 * Chat API Test Endpoint - Simple endpoint to test chat functionality and authentication
 */

import { defineEventHandler } from 'h3'
import { testBedrockConnection } from '../../../utils/bedrock-client'
import { sendSuccess, sendApiError, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/ai/chat/test', 'GET', {
  summary: 'Test chat API functionality',
  description: 'Test endpoint to verify chat API authentication and Bedrock connectivity',
  tags: ['AI'],
  responses: {
    200: {
      description: 'Test results',
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
                  authentication: {
                    type: 'object',
                    properties: {
                      isAuthenticated: { type: 'boolean' },
                      authType: { type: 'string' },
                      user: { type: 'object' }
                    }
                  },
                  bedrock: {
                    type: 'object',
                    properties: {
                      connected: { type: 'boolean' },
                      model: { type: 'string' },
                      response: { type: 'string' },
                      error: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    401: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Authentication is handled at the application level via Nuxt OIDC
  // AWS credentials are configured at the server level via environment variables
  // No additional authentication check needed here

  // Test Bedrock connection
  const bedrockTest = await testBedrockConnection('claude-sonnet')
  
  return sendSuccess(event, {
    message: 'Chat API is working correctly',
    authentication: {
      isAuthenticated: authContext.isAuthenticated,
      authType: authContext.authType,
      user: authContext.user ? {
        email: authContext.user.claims?.email,
        name: authContext.user.claims?.name
      } : null
    },
    bedrock: {
      connected: bedrockTest.success,
      model: bedrockTest.model,
      response: bedrockTest.success ? bedrockTest.content?.substring(0, 100) + '...' : null,
      error: bedrockTest.error?.message
    }
  })
}))
