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
import { extractFollowUpPrompts, type SuggestedPrompt } from '../../utils/bedrock-prompt-extractor'
import { buildUserContextForAI, formatUserContextForAI } from '../../utils/user-context-builder'

export interface StrandsChatRequest {
  message: string
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string | object | any[]
  }>
  sessionId?: string
  mcpId?: string // Optional: 'account-specific' to force local MCP spawn
  timezone?: string // Optional: IANA timezone (e.g., "America/New_York")
  region?: string // Optional: AWS region (e.g., "us-gov-west-1")
  accountIdentifier?: string // Optional: Explicit account identifier
  preferGovcloud?: boolean // Optional: Prefer GovCloud account ID
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
  suggestedPrompts?: SuggestedPrompt[]
  disambiguation?: import('../../types/strands').AccountDisambiguation
  error?: string | null
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
            },
            timezone: {
              type: 'string',
              description: 'Optional IANA timezone (e.g., "America/New_York", "America/Los_Angeles"). Used for interpreting "today", "this month", etc.',
              example: 'America/New_York'
            },
            region: {
              type: 'string',
              description: 'Optional AWS region (e.g., "us-gov-west-1")',
              example: 'us-gov-west-1'
            },
            accountIdentifier: {
              type: 'string',
              description: 'Optional explicit account identifier (account ID, alias, name)',
              example: '374673712317'
            },
            preferGovcloud: {
              type: 'boolean',
              description: 'Prefer GovCloud account ID over commercial (default: true)'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Response from Strands agent (may include error in data.error field)',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              responseBody: { type: 'string', description: 'The agent response text (null if error)' },
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
              },
              disambiguation: {
                type: 'object',
                description: 'Account disambiguation data if multiple accounts match',
                properties: {
                  search_term: { type: 'string', description: 'What user searched for' },
                  message: { type: 'string', description: 'Instructions for user' },
                  matches: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        request_id: { type: 'string' },
                        account_alias: { type: 'string' },
                        govcloud_account_id: { type: 'string' },
                        commercial_account_id: { type: 'string' },
                        display_name: { type: 'string' },
                        match_score: { type: 'number' },
                        match_reason: { type: 'string' }
                      }
                    }
                  }
                }
              },
              error: { type: 'string', description: 'Error message if query failed (null on success)', nullable: true }
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

/**
 * Extract AWS account ID from message text
 * Looks for 12-digit numbers which are AWS account IDs
 */
function extractAccountId(message: string): string | undefined {
  const accountRegex = /\b\d{12}\b/
  const match = message.match(accountRegex)
  return match ? match[0] : undefined
}

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
  const {
    message,
    conversationHistory = [],
    sessionId,
    mcpId,
    timezone,
    region,
    accountIdentifier,
    preferGovcloud
  } = body

  const requestStartTime = Date.now()
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`

  logger.info('[Strands Chat API] Request received', {
    requestId,
    messageLength: message?.length,
    historyLength: conversationHistory.length,
    sessionId,
    mcpId,
    timezone,
    region,
    accountIdentifier
  })

  // Log full request payload for admin debugging
  logger.info(`[Strands Chat Debug] ${requestId}`, {
    type: 'REQUEST',
    requestId,
    timestamp: new Date().toISOString(),
    userId: event.context.auth?.user?.email || 'unknown',
    payload: {
      message,
      conversationHistory: conversationHistory.length,
      sessionId,
      mcpId,
      timezone,
      region,
      accountIdentifier,
      preferGovcloud
    }
  })

  // Validate input
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    logger.error('[Strands Chat API] Invalid message:', message)
    return errors.badRequest(event, 'message is required and must be a non-empty string')
  }

  if (message.length > 10000) {
    return errors.badRequest(event, 'Message exceeds maximum length of 10,000 characters')
  }

  // Use explicit accountIdentifier if provided, otherwise try to extract from message
  // Strands recommends sending account_identifier explicitly rather than parsing enhanced queries
  const accountId = accountIdentifier || extractAccountId(message)

  logger.info('[Strands Chat API] Account identifier:', accountId || 'none (will be inferred by agent)')

  // Build user context for personalized responses
  const userContext = await buildUserContextForAI(event)
  const userContextText = formatUserContextForAI(userContext)

  // Build the full query with user context only
  // NOTE: GHOST context and navigation schema are now configured as system prompt on Strands server
  // This reduces payload size from ~11KB to ~1-2KB per request
  let fullQuery = message

  if (conversationHistory.length > 0) {
    // Include recent conversation history for context (last 3 exchanges)
    const recentHistory = conversationHistory.slice(-6) // Last 3 user + 3 assistant messages
    const contextParts = recentHistory.map(msg =>
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    )

    fullQuery = `${userContextText}\n\nPrevious conversation:\n${contextParts.join('\n')}\n\nCurrent query: ${message}`
  } else {
    fullQuery = `${userContextText}\n\nUser query: ${message}`
  }

  // Call Strands ALB endpoint
  try {
    const strandsResponse = await sendStrandsQuery(fullQuery, {
      accountIdentifier: accountId,
      conversationHistory,
      sessionId,
      timezone,
      region,
      mcpId,
      preferGovcloud
    })

    const responseTime = Date.now() - requestStartTime

    logger.info('[Strands Chat API] Response received', {
      requestId,
      accountId: strandsResponse.account_id || 'unknown',
      mcpUsed: strandsResponse.mcp_used || 'unknown',
      resultLength: strandsResponse.result?.length || 0,
      hasError: !!strandsResponse.error,
      hasDisambiguation: !!strandsResponse.disambiguation,
      responseTimeMs: responseTime
    })

    // Log full response payload for admin debugging
    logger.info(`[Strands Chat Debug] ${requestId}`, {
      type: 'RESPONSE',
      requestId,
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      userId: event.context.auth?.user?.email || 'unknown',
      metadata: {
        accountId: strandsResponse.account_id,
        mcpUsed: strandsResponse.mcp_used,
        mcpType: strandsResponse.mcp_type,
        sessionId: strandsResponse.sessionId
      },
      payload: {
        resultLength: strandsResponse.result?.length || 0,
        hasError: !!strandsResponse.error,
        hasDisambiguation: !!strandsResponse.disambiguation,
        error: strandsResponse.error || null
      }
    })

    // Check for disambiguation first (user needs to select account)
    if (strandsResponse.disambiguation) {
      logger.info('[Strands Chat API] Disambiguation required', {
        searchTerm: strandsResponse.disambiguation.search_term,
        matchCount: strandsResponse.disambiguation.matches.length
      })

      // CRITICAL: Extract sessionId from strandsResponse.sessionId (not from metadata or account_id)
      // Backend now generates sessionId if not provided
      const responseSessionId = strandsResponse.sessionId || sessionId

      // Return disambiguation response to frontend
      const response: StrandsChatResponse = {
        responseBody: '', // No response yet, waiting for account selection
        sessionId: responseSessionId,
        metadata: extractStrandsMetadata(strandsResponse),
        references: [],
        suggestedLinks: [],
        disambiguation: strandsResponse.disambiguation
      }

      return sendSuccess(event, response)
    }

    // Check for error field in response (Strands returns errors with HTTP 200)
    if (strandsResponse.error) {
      logger.error('[Strands Chat API] Query error from Strands:', strandsResponse.error)
      throw new StrandsClientError(
        strandsResponse.error,
        'STRANDS_QUERY_ERROR',
        200,
        { accountId: strandsResponse.account_id, mcpUsed: strandsResponse.mcp_used }
      )
    }

    // Check if response is missing required fields
    if (!strandsResponse.result && !strandsResponse.error) {
      logger.error('[Strands Chat API] Invalid response format:', strandsResponse)
      throw new StrandsClientError(
        'Invalid response from Strands: missing both result and error fields',
        'INVALID_RESPONSE',
        200
      )
    }

    // Extract metadata
    const metadata = extractStrandsMetadata(strandsResponse)

    // Generate smart links based on query and response
    // Pass the account ID from metadata to ensure we use commercial IDs in links
    const suggestedLinks = await generateSmartLinks(
      message,
      strandsResponse.result || '',
      { accountId: metadata.accountId }
    )

    logger.info('[Strands Chat API] Generated smart links', {
      linkCount: suggestedLinks.length,
      linkTypes: suggestedLinks.map(l => l.type),
      accountId: metadata.accountId
    })

    // Extract follow-up prompts using Bedrock (async, don't block response)
    const suggestedPrompts = await extractFollowUpPrompts(strandsResponse.result || '', 3)

    logger.info('[Strands Chat API] Extracted follow-up prompts', {
      promptCount: suggestedPrompts.length,
      prompts: suggestedPrompts.map(p => p.text)
    })

    // CRITICAL: Extract sessionId from strandsResponse.sessionId (not from metadata or account_id)
    // Backend now generates sessionId if not provided
    const responseSessionId = strandsResponse.sessionId || sessionId

    // Format response for frontend
    const response: StrandsChatResponse = {
      responseBody: strandsResponse.result || 'No response generated',
      sessionId: responseSessionId,
      metadata,
      references: [], // Strands doesn't provide document references in current implementation
      suggestedLinks,
      suggestedPrompts
    }

    return sendSuccess(event, response)

  } catch (error: any) {
    const responseTime = Date.now() - requestStartTime

    logger.error('[Strands Chat API] Error:', error)

    // Log error for admin debugging
    logger.error(`[Strands Chat Debug] ${requestId}`, {
      type: 'ERROR',
      requestId,
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      userId: event.context.auth?.user?.email || 'unknown',
      error: {
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
      }
    })

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

