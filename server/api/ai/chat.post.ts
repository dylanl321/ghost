/**
 * POST /api/ai/chat
 * Simple Chat API Endpoint - Similar to external chatbot pattern
 */

import { defineEventHandler, readBody } from 'h3'
import { invokeBedrock, type BedrockModel } from '../../utils/bedrock-client'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ChatRequest {
  userInput: string
}

export interface ChatResponse {
  responseBody: string
  references: Array<{ document: string }>
}

// Register OpenAPI documentation
registerEndpoint('/api/ai/chat', 'POST', {
  summary: 'Chat with AWS Assistant',
  description: 'Send a message to the AI assistant for AWS-related questions',
  tags: ['AI'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['userInput'],
          properties: {
            userInput: {
              type: 'string',
              description: 'The user message to send to the AI assistant',
              maxLength: 10000
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Successful chat response',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              responseBody: { type: 'string' },
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
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Parse request body
  const body = await readBody(event) as ChatRequest
  const { userInput } = body

  logger.info('[Chat API] Request received, message length:', userInput?.length)

  // Validate input
  if (!userInput || typeof userInput !== 'string' || userInput.trim().length === 0) {
    logger.error('[Chat API] Invalid message:', userInput)
    return errors.badRequest(event, 'userInput is required and must be a non-empty string')
  }

  if (userInput.length > 10000) {
    return errors.badRequest(event, 'Message exceeds maximum length of 10,000 characters')
  }

  // Simple system prompt for AWS assistance
  const systemPrompt = `You are an AI assistant integrated with the GHOST AWS dashboard. You help users with AWS-related questions, cost analysis, account management, and general cloud computing guidance.

Key capabilities:
- AWS cost optimization and analysis
- Account and resource management
- Security and compliance guidance
- Best practices for cloud architecture
- Troubleshooting AWS services
- AWS pricing information and comparisons

Always provide helpful, accurate, and actionable advice. If you don't know something specific about AWS, say so and suggest where to find more information.`

  // Call Bedrock with the message
  try {
    const bedrockResponse = await invokeBedrock({
      prompt: userInput,
      model: 'claude-sonnet',
      systemPrompt,
      maxTokens: 2048,
      temperature: 0.7
    })

    if (!bedrockResponse.success) {
      logger.error('[Chat API] Bedrock error:', bedrockResponse.error)
      throw new Error(bedrockResponse.error?.message || 'Failed to get response from AI model')
    }

    // Return response in format similar to temp.md pattern
    const response: ChatResponse = {
      responseBody: bedrockResponse.content || 'No response generated',
      references: [] // Empty references array for now
    }

    return response
  } catch (error: any) {
    logger.error('[Chat API] Unexpected error:', error)
    throw new Error(error.message || 'An unexpected error occurred while processing your request')
  }
}))
