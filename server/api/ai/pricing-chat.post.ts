/**
 * POST /api/ai/pricing-chat
 * Specialized Chat Endpoint for AWS Pricing with MCP Tools Integration
 */

import { defineEventHandler, readBody } from 'h3'
import { invokeBedrock, type BedrockModel } from '../../utils/bedrock-client'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { executePricingMCPTool, getMCPToolsDescription } from '../../utils/aws-pricing-mcp'

export interface PricingChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolCalls?: Array<{
    toolName: string
    parameters: any
    result?: any
  }>
}

export interface PricingChatRequest {
  message: string
  model?: BedrockModel
  conversationHistory?: PricingChatMessage[]
  useTools?: boolean
  environment?: 'commercial' | 'govcloud'
}

export interface PricingChatResponse {
  success: boolean
  message?: string
  model?: string
  processingTime?: number
  toolCalls?: Array<{
    toolName: string
    parameters: any
    result?: any
    error?: string
  }>
  error?: {
    code: string
    message: string
    details?: string
  }
}

// Register OpenAPI documentation
registerEndpoint('/api/ai/pricing-chat', 'POST', {
  summary: 'Chat with AWS pricing focus and MCP tools',
  description: 'Specialized chat endpoint for AWS pricing questions with automatic MCP tool usage',
  tags: ['AI', 'Pricing'],
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
              description: 'The user message about AWS pricing',
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
                  timestamp: { type: 'string', format: 'date-time' },
                  toolCalls: { type: 'array' }
                }
              }
            },
            useTools: {
              type: 'boolean',
              description: 'Whether to use MCP tools for pricing information',
              default: true
            },
            environment: {
              type: 'string',
              enum: ['commercial', 'govcloud'],
              description: 'AWS environment to query',
              default: 'commercial'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Pricing chat response with tool results',
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
                  processingTime: { type: 'number' },
                  toolCalls: { type: 'array' }
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
  const body = await readBody(event) as PricingChatRequest
  const { 
    message, 
    model = 'claude-sonnet', 
    conversationHistory = [], 
    useTools = true,
    environment = 'commercial'
  } = body

  // Validate input
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return errors.badRequest(event, 'Message is required and must be a non-empty string')
  }

  if (message.length > 10000) {
    return errors.badRequest(event, 'Message exceeds maximum length of 10,000 characters')
  }

  const startTime = Date.now()
  const toolCalls: Array<{ toolName: string; parameters: any; result?: any; error?: string }> = []

  // Build conversation context from history
  let conversationContext = ''
  if (conversationHistory.length > 0) {
    conversationContext = conversationHistory
      .slice(-10) // Keep last 10 messages for context
      .map(msg => {
        let context = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          context += `\n[Used tools: ${msg.toolCalls.map(tc => tc.toolName).join(', ')}]`
        }
        return context
      })
      .join('\n')
  }

  // Create enhanced prompt with conversation context
  let enhancedPrompt = message
  if (conversationContext) {
    enhancedPrompt = `Previous conversation:\n${conversationContext}\n\nCurrent message: ${message}`
  }

  // Specialized system prompt for pricing-focused assistance
  const pricingSystemPrompt = `You are an AWS pricing specialist integrated with the GHOST AWS dashboard. You help users with AWS pricing questions, cost analysis, and budget planning.

${getMCPToolsDescription()}

Key capabilities:
- Real-time AWS pricing information
- Service cost comparisons
- Budget planning and forecasting
- Cost optimization recommendations
- Pricing breakdowns and explanations

When users ask about AWS pricing, costs, or service comparisons, you should use the available MCP tools to get real-time pricing information. 

Tool Usage Instructions:
- Use get_services to list available AWS services when users ask "what services are available" or "list AWS services"
- Use get_pricing to get detailed pricing when users ask about specific service costs
- Use get_dimensions to understand pricing factors when users ask "what affects the cost of [service]"
- Use get_attribute_values to get possible values for pricing attributes

Always provide specific, actionable pricing information. If you use tools, explain what information you found and how it relates to the user's question.`

  // Check if we should use tools based on the message content
  const shouldUseTools = useTools && (
    message.toLowerCase().includes('price') ||
    message.toLowerCase().includes('cost') ||
    message.toLowerCase().includes('pricing') ||
    message.toLowerCase().includes('expensive') ||
    message.toLowerCase().includes('cheap') ||
    message.toLowerCase().includes('budget') ||
    message.toLowerCase().includes('compare') ||
    message.toLowerCase().includes('service') ||
    message.toLowerCase().includes('ec2') ||
    message.toLowerCase().includes('s3') ||
    message.toLowerCase().includes('lambda') ||
    message.toLowerCase().includes('rds')
  )

  let toolResults = ''
  if (shouldUseTools) {
    console.log('[Pricing Chat] Tool usage triggered by keywords in message:', message.substring(0, 100))
    
    try {
      // Try to get services list if user is asking about available services
      if (message.toLowerCase().includes('service') && 
          (message.toLowerCase().includes('list') || message.toLowerCase().includes('available'))) {
        console.log('[Pricing Chat] Executing get_services tool')
        const servicesResult = await executePricingMCPTool('get_services', {}, environment)
        toolCalls.push({
          toolName: 'get_services',
          parameters: {},
          result: servicesResult
        })
        toolResults += `\n\nAvailable AWS Services:\n${JSON.stringify(servicesResult, null, 2)}`
      }

      // Try to get pricing for specific services mentioned
      const serviceMatches = message.match(/\b(AmazonEC2|AmazonS3|AmazonRDS|AmazonLambda|AmazonDynamoDB|AmazonCloudWatch|AmazonSNS|AmazonSQS)\b/gi)
      if (serviceMatches && serviceMatches.length > 0) {
        for (const service of serviceMatches) {
          try {
            const pricingResult = await executePricingMCPTool('get_pricing', {
              serviceCode: service,
              maxResults: 5
            }, environment)
            toolCalls.push({
              toolName: 'get_pricing',
              parameters: { serviceCode: service, maxResults: 5 },
              result: pricingResult
            })
            toolResults += `\n\n${service} Pricing Information:\n${JSON.stringify(pricingResult, null, 2)}`
          } catch (error: any) {
            toolCalls.push({
              toolName: 'get_pricing',
              parameters: { serviceCode: service },
              error: error.message
            })
          }
        }
      }
    } catch (error: any) {
      console.error('[Pricing Chat] Error executing tools:', error)
      toolResults += `\n\nNote: Unable to fetch real-time pricing data: ${error.message}`
    }
  }

  // Add tool results to the prompt
  if (toolResults) {
    enhancedPrompt += `\n\nReal-time AWS Pricing Data:${toolResults}`
  }

  // Call Bedrock with the enhanced prompt
  const bedrockResponse = await invokeBedrock({
    prompt: enhancedPrompt,
    model,
    systemPrompt: pricingSystemPrompt,
    maxTokens: 2048,
    temperature: 0.7
  })

  if (!bedrockResponse.success) {
    return errors.serverError(
      event,
      bedrockResponse.error?.message || 'Failed to get response from AI model',
      bedrockResponse.error?.details
    )
  }

  // Return successful response
  const response: PricingChatResponse = {
    success: true,
    message: bedrockResponse.content || 'No response generated',
    model: bedrockResponse.model,
    processingTime: Date.now() - startTime,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  }

  return sendSuccess(event, response)
}))
