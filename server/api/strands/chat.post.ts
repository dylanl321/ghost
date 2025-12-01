/**
 * POST /api/strands/chat
 * Strands Chat API Endpoint - Proxies to Strands ALB with MCP tool integration
 *
 * Architecture:
 * - Communicates with Strands ECS service via ALB
 * - Strands connects to AWS MCP servers (permanent + temporary)
 * - Supports conversational context with history
 * - Account ID is inferred from query text
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { sendStrandsQuery, extractStrandsMetadata, StrandsClientError } from '../../utils/strands-client'
import { generateSmartLinks, type SuggestedLink } from '../../utils/strands-link-generator'
import { getSchemaForAI } from '../../utils/ghost-site-schema'

export interface StrandsChatRequest {
  message: string
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  sessionId?: string
  mcpId?: string // Optional: 'account-specific' to force local MCP spawn
}

export interface StrandsChatResponse {
  responseBody: string
  sessionId?: string
  metadata?: {
    accountId?: string
    mcpUsed?: string
    mcpType?: 'permanent' | 'temporary'
  }
  references?: Array<{ document: string }>
  suggestedLinks?: SuggestedLink[]
}

// Register OpenAPI documentation
registerEndpoint('/api/strands/chat', 'POST', {
  summary: 'Chat with Strands Agent',
  description: 'Send a message to the Strands agent for AWS-related questions. Strands connects to AWS MCP servers for cost analysis, config lookups, security hub queries, and more. The agent infers AWS account ID from your query.',
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
              description: 'The user message/query to send to Strands agent. Be explicit about account IDs for best results.',
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
            },
            mcpId: {
              type: 'string',
              description: 'Optional MCP ID. Use "account-specific" to force local stdio MCP spawn.',
              enum: ['account-specific']
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Successful response from Strands agent',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              responseBody: { type: 'string', description: 'The agent response text' },
              sessionId: { type: 'string' },
              metadata: {
                type: 'object',
                properties: {
                  accountId: { type: 'string', description: 'AWS account ID inferred/used' },
                  mcpUsed: { type: 'string', description: 'MCP server used (e.g., "account-specific [stdio]")' },
                  mcpType: { type: 'string', enum: ['permanent', 'temporary'], description: 'Type of MCP server' }
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
              },
              suggestedLinks: {
                type: 'array',
                description: 'Smart links to GHOST pages related to the query',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'Display label for the link' },
                    url: { type: 'string', description: 'URL with pre-filled filters' },
                    description: { type: 'string', description: 'What the link does' },
                    icon: { type: 'string', description: 'Heroicon name' },
                    type: { type: 'string', enum: ['cost', 'explorer', 'users', 'org-chart', 'reports', 'security'] }
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
  // Check if Strands chat is enabled
  const { getConfigValue } = await import('../../utils/site-config')
  const strandsEnabled = await getConfigValue<boolean>('features.strandsChat.enabled', true)

  if (!strandsEnabled) {
    logger.warn('[Strands Chat API] Feature is disabled')
    return errors.badRequest(event, 'Strands chat is currently disabled. Please contact an administrator.')
  }

  // Parse request body
  const body = await readBody(event) as StrandsChatRequest
  const { message, conversationHistory = [], sessionId, mcpId } = body

  logger.info('[Strands Chat API] Request received', {
    messageLength: message?.length,
    historyLength: conversationHistory.length,
    sessionId,
    mcpId
  })

  // Validate input
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    logger.error('[Strands Chat API] Invalid message:', message)
    return errors.badRequest(event, 'message is required and must be a non-empty string')
  }

  if (message.length > 10000) {
    return errors.badRequest(event, 'Message exceeds maximum length of 10,000 characters')
  }

  // Build the full query with conversation context + GHOST site schema
  // This helps the AI understand GHOST's structure and generate relevant guidance
  let fullQuery = message

  // Add GHOST application context to help AI understand what pages/features are available
  const ghostContext = `
You are an AI assistant for the GHOST (GDMS AWS Operations & Support Hub) application.

${getSchemaForAI()}

When answering queries about AWS resources, you can suggest users navigate to relevant GHOST pages.
For example, if they ask about costs, mention they can view detailed cost analysis in the Cost Dashboard.
If they ask about users or permissions, mention the Users & Access page.
Always be helpful and guide them to the right tools within GHOST.
`

  if (conversationHistory.length > 0) {
    // Include recent conversation history for context (last 3 exchanges)
    const recentHistory = conversationHistory.slice(-6) // Last 3 user + 3 assistant messages
    const contextParts = recentHistory.map(msg =>
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    )

    fullQuery = `${ghostContext}\n\nPrevious conversation:\n${contextParts.join('\n')}\n\nCurrent query: ${message}`
  } else {
    fullQuery = `${ghostContext}\n\nUser query: ${message}`
  }

  // Call Strands ALB endpoint
  try {
    const strandsResponse = await sendStrandsQuery(fullQuery, mcpId)

    logger.info('[Strands Chat API] Response received', {
      accountId: strandsResponse.account_id,
      mcpUsed: strandsResponse.mcp_used,
      resultLength: strandsResponse.result?.length || 0
    })

    // Extract metadata
    const metadata = extractStrandsMetadata(strandsResponse)

    // Generate smart links based on query and response
    const suggestedLinks = generateSmartLinks(message, strandsResponse.result || '')

    logger.info('[Strands Chat API] Generated smart links', {
      linkCount: suggestedLinks.length,
      linkTypes: suggestedLinks.map(l => l.type)
    })

    // Format response for frontend
    const response: StrandsChatResponse = {
      responseBody: strandsResponse.result || 'No response generated',
      sessionId: sessionId || strandsResponse.account_id, // Use account ID as session if not provided
      metadata,
      references: [], // Strands doesn't provide document references in current implementation
      suggestedLinks
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
          error.statusCode === 408
            ? 'Request timed out. Strands MCP operations can take 2+ minutes for new accounts. Please try again.'
            : 'Strands server is temporarily unavailable. Please try again later.',
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

