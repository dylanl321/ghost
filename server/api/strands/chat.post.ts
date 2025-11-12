/**
 * POST /api/strands/chat
 * Strands Chat API Endpoint - Proxies to Strands server with MCP tool integration
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { sendStrandsChatRequest, StrandsClientError } from '../../utils/strands-client'
import type { StrandsMessage } from '../../types/strands'

export interface StrandsChatRequest {
  message: string
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  sessionId?: string
}

export interface StrandsChatResponse {
  responseBody: string
  sessionId?: string
  metadata?: {
    model?: string
    tokens?: {
      input?: number
      output?: number
    }
    toolsUsed?: string[]
  }
  references?: Array<{ document: string }>
}

// Register OpenAPI documentation
registerEndpoint('/api/strands/chat', 'POST', {
  summary: 'Chat with Strands Agent',
  description: 'Send a message to the Strands agent for AWS-related questions with MCP tool integration (cost explorer, config, security hub, etc.)',
  tags: ['Strands', 'AI'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['message'],
          properties: {
            message: {
              type: 'string',
              description: 'The user message to send to the Strands agent',
              maxLength: 10000
            },
            conversationHistory: {
              type: 'array',
              description: 'Previous conversation messages for context',
              items: {
                type: 'object',
                properties: {
                  role: {
                    type: 'string',
                    enum: ['user', 'assistant']
                  },
                  content: {
                    type: 'string'
                  }
                }
              }
            },
            sessionId: {
              type: 'string',
              description: 'Optional session ID for maintaining conversation context'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Successful chat response from Strands agent',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              responseBody: { type: 'string' },
              sessionId: { type: 'string' },
              metadata: {
                type: 'object',
                properties: {
                  model: { type: 'string' },
                  tokens: {
                    type: 'object',
                    properties: {
                      input: { type: 'number' },
                      output: { type: 'number' }
                    }
                  },
                  toolsUsed: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                }
              },
              references: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    document: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' },
    503: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Parse request body
  const body = await readBody(event) as StrandsChatRequest
  const { message, conversationHistory = [], sessionId } = body

  logger.info('[Strands Chat API] Request received', {
    messageLength: message?.length,
    historyLength: conversationHistory.length,
    sessionId
  })

  // Validate input
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    logger.error('[Strands Chat API] Invalid message:', message)
    return errors.badRequest(event, 'message is required and must be a non-empty string')
  }

  if (message.length > 10000) {
    return errors.badRequest(event, 'Message exceeds maximum length of 10,000 characters')
  }

  // Build messages array for Strands
  const strandsMessages: StrandsMessage[] = []

  // Add conversation history
  for (const msg of conversationHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      strandsMessages.push({
        role: msg.role,
        content: msg.content,
        timestamp: new Date().toISOString()
      })
    }
  }

  // Add current user message
  strandsMessages.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  })

  // Call Strands server
  try {
    const strandsResponse = await sendStrandsChatRequest({
      messages: strandsMessages,
      sessionId,
      stream: false
    })

    logger.info('[Strands Chat API] Response received', {
      messageLength: strandsResponse.message?.length,
      sessionId: strandsResponse.sessionId,
      toolsUsed: strandsResponse.metadata?.toolsUsed?.length || 0
    })

    // Format response for frontend (compatible with existing chat UI)
    const response: StrandsChatResponse = {
      responseBody: strandsResponse.message || 'No response generated',
      sessionId: strandsResponse.sessionId,
      metadata: strandsResponse.metadata,
      references: [] // Strands doesn't provide document references, but we keep the structure
    }

    return sendSuccess(event, response)

  } catch (error: any) {
    logger.error('[Strands Chat API] Error:', error)

    // Handle Strands-specific errors
    if (error instanceof StrandsClientError) {
      // Service unavailable (503) for server errors or timeouts
      if (error.statusCode === 408 || (error.statusCode && error.statusCode >= 500)) {
        return errors.serverError(
          event,
          'Strands server is temporarily unavailable. Please try again later.',
          503
        )
      }

      // Client errors (400-499)
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        return errors.badRequest(event, error.message || 'Invalid request to Strands server')
      }

      // Generic error
      return errors.serverError(event, error.message || 'Error communicating with Strands server')
    }

    // Generic error handling
    throw error
  }
}))

