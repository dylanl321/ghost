/**
 * POST /api/ai/chat
 * Chat API Endpoint - Integrates with existing AWS Bedrock infrastructure and authentication
 */

import { defineEventHandler, readBody } from 'h3'
import { invokeBedrock, type BedrockModel } from '../../utils/bedrock-client'
import { sendSuccess, sendApiError, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { executePricingMCPTool, getMCPToolsDescription, awsPricingMCPTools } from '../../utils/aws-pricing-mcp'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ChatRequest {
  message: string
  model?: BedrockModel
  conversationHistory?: ChatMessage[]
  systemPrompt?: string
}

export interface ChatResponse {
  success: boolean
  message?: string
  model?: string
  processingTime?: number
  error?: {
    code: string
    message: string
    details?: string
  }
}

// Register OpenAPI documentation
registerEndpoint('/api/ai/chat', 'POST', {
  summary: 'Chat with AWS Assistant',
  description: 'Send a message to the AI assistant for AWS-related questions and guidance',
  tags: ['AI'],
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
              description: 'The user message to send to the AI assistant',
              maxLength: 10000
            },
            model: {
              type: 'string',
              enum: ['claude-sonnet', 'nova-pro'],
              description: 'AI model to use for the response',
              default: 'claude-sonnet'
            },
            conversationHistory: {
              type: 'array',
              description: 'Previous conversation messages for context',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' }
                }
              }
            },
            systemPrompt: {
              type: 'string',
              description: 'Custom system prompt to override the default AWS-focused prompt'
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
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  model: { type: 'string' },
                  processingTime: { type: 'number' }
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
  // Authentication is handled at the application level via Nuxt OIDC
  // AWS credentials are configured at the server level via environment variables
  // No additional authentication check needed here

  // Parse request body
  const body = await readBody(event) as ChatRequest
  const { message, model = 'claude-sonnet', conversationHistory = [], systemPrompt } = body

  console.log('[Chat API] Request received with model:', model, 'message length:', message?.length)

  // Validate input
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    console.error('[Chat API] Invalid message:', message)
    return errors.badRequest(event, 'Message is required and must be a non-empty string')
  }

  if (message.length > 10000) {
    return errors.badRequest(event, 'Message exceeds maximum length of 10,000 characters')
  }

  // Build conversation context from history
  let conversationContext = ''
  if (conversationHistory.length > 0) {
    conversationContext = conversationHistory
      .slice(-10) // Keep last 10 messages for context
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n')
  }

  // Create enhanced prompt with conversation context
  let enhancedPrompt = message
  if (conversationContext) {
    enhancedPrompt = `Previous conversation:\n${conversationContext}\n\nCurrent message: ${message}`
  }

  // Default system prompt for AWS-focused assistance with MCP tools
  const defaultSystemPrompt = `You are an AI assistant integrated with the GHOST AWS dashboard. You help users with AWS-related questions, cost analysis, account management, and general cloud computing guidance.

Key capabilities:
- AWS cost optimization and analysis
- Account and resource management
- Security and compliance guidance
- Best practices for cloud architecture
- Troubleshooting AWS services
- AWS pricing information and comparisons

${getMCPToolsDescription()}

When users ask about AWS pricing, costs, or service comparisons, you can use the available MCP tools to get real-time pricing information. 

Tool Usage Instructions:
- Use get_services to list available AWS services
- Use get_pricing to get detailed pricing for specific services
- Use get_dimensions to understand pricing factors for a service
- Use get_attribute_values to get possible values for pricing attributes

Always provide helpful, accurate, and actionable advice. If you don't know something specific about AWS, say so and suggest where to find more information.`

  // Call Bedrock with the message
  try {
    const bedrockResponse = await invokeBedrock({
      prompt: enhancedPrompt,
      model,
      systemPrompt: systemPrompt || defaultSystemPrompt,
      maxTokens: 2048,
      temperature: 0.7
    })

    if (!bedrockResponse.success) {
      console.error('[Chat API] Bedrock error:', bedrockResponse.error)
      return errors.serverError(
        event,
        bedrockResponse.error?.message || 'Failed to get response from AI model',
        {
          code: bedrockResponse.error?.code,
          details: bedrockResponse.error?.details,
          resolution: bedrockResponse.error?.resolution
        }
      )
    }

    // Return successful response
    const response: ChatResponse = {
      success: true,
      message: bedrockResponse.content || 'No response generated',
      model: bedrockResponse.model,
      processingTime: bedrockResponse.processingTime
    }

    return sendSuccess(event, response)
  } catch (error: any) {
    console.error('[Chat API] Unexpected error:', error)
    return errors.serverError(
      event,
      error.message || 'An unexpected error occurred while processing your request',
      {
        error: error.toString(),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    )
  }
}))
