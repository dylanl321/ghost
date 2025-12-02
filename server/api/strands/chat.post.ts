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

  // Extract account ID from user message for better reliability
  // Strands recommends sending account_identifier explicitly rather than parsing enhanced queries
  const accountId = extractAccountId(message)

  logger.info('[Strands Chat API] Extracted account ID:', accountId || 'none')

  // Build the full query with conversation context + GHOST site schema
  // This helps the AI understand GHOST's structure and generate relevant guidance
  let fullQuery = message

  // Add GHOST application context to help AI understand what pages/features are available
  const ghostContext = `
You are an AI assistant for the GHOST application - the centralized AWS operations and analytics platform for GDMS.

## About GHOST

**GHOST** stands for:
- **G**overnance - Comprehensive policy management and compliance oversight
- **H**ealth - Real-time monitoring of resource health and security findings
- **O**perations - Streamlined account management and operational workflows
- **S**pend - Advanced cost analytics, forecasting, and budget tracking
- **T**asks - Automated workflows, scheduled reports, and intelligent task management

**Built by:** GDMS AWS Product Team (AWS Landing Zone Team)

**Purpose:** GHOST is the centralized platform for managing, monitoring, and optimizing AWS infrastructure across the entire GDMS organization. It provides unified access to AWS cost data, security findings, resource configurations, and operational insights across multiple AWS accounts in both commercial and GovCloud regions.

**Primary Users:**
- **IT Leadership** - Executive visibility into AWS spending, security posture, and resource utilization
- **Project Managers** - Track project costs, resource allocation, and budget forecasting
- **Engineering Groups** - Access to AWS resource configurations, deployment tracking, and operational data
- **Finance Teams** - Detailed cost breakdowns, billing analysis, and budget management
- **Security Teams** - Security Hub findings, compliance tracking, and vulnerability management
- **Cloud Administrators** - Multi-account management, resource inventory, and operational oversight

**Key Capabilities:**
- **Multi-Account Management** - Unified view across AWS Organizations (374+ accounts)
- **Cost Analytics** - Real-time cost tracking, forecasting, and optimization recommendations
- **Security Monitoring** - Centralized Security Hub findings and compliance status
- **Resource Inventory** - AWS Config aggregation for resource tracking across all accounts
- **User Access Management** - Entra ID integration with role-based access control
- **Reporting & Analytics** - Custom dataset reports from CloudTrail, Config, and Security Hub data
- **AI-Powered Assistance** - Natural language queries for AWS operations (this chat interface)

**AWS Integration:**
GHOST integrates with AWS Organizations, Cost Explorer, Security Hub, AWS Config, CloudTrail, EC2, S3, Lambda, RDS, and other AWS services across both commercial and GovCloud environments.

**Important Context:**
- All cost data is sourced from AWS Cost Explorer
- Security findings come from AWS Security Hub aggregation
- Configuration data comes from AWS Config Aggregator
- The system supports both GovCloud and Commercial AWS regions
- Account IDs should be 12-digit numbers (e.g., 374673712317)

## How to Help Users

When users ask questions:
1. **Answer their AWS questions directly** using your knowledge and MCP tools
2. **Reference specific account IDs** when discussing resources or costs
3. **Suggest relevant GHOST pages** where they can explore data visually
4. **Provide actionable insights** - not just data, but recommendations
5. **Be aware of GDMS context** - government agency with strict security/compliance requirements

When suggesting GHOST pages, explain what they'll find there and why it's useful.

${getSchemaForAI()}
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
    const strandsResponse = await sendStrandsQuery(
      fullQuery,
      mcpId,
      accountId,
      conversationHistory,
      sessionId
    )

    logger.info('[Strands Chat API] Response received', {
      accountId: strandsResponse.account_id || 'unknown',
      mcpUsed: strandsResponse.mcp_used || 'unknown',
      resultLength: strandsResponse.result?.length || 0,
      hasError: !!strandsResponse.error
    })

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

