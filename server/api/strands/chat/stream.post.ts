/**
 * POST /api/strands/chat/stream
 * Strands Chat API Endpoint with Server-Sent Events (SSE) streaming
 *
 * Architecture:
 * - Forwards SSE stream from Strands ALB (/query/stream)
 * - Provides real-time progress updates (status, tool calls, response chunks)
 * - Enables background query processing (user can navigate away)
 * - Generates smart links and follow-up prompts on completion
 */

import { defineEventHandler, readBody, setResponseHeaders, createError } from 'h3'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import { getStrandsConfig } from '../../../utils/strands-client'
import { generateSmartLinks } from '../../../utils/strands-link-generator'
import { getSchemaForAI } from '../../../utils/ghost-site-schema'
import { extractFollowUpPrompts } from '../../../utils/bedrock-prompt-extractor'
import { collectStreamMetrics, createStreamSession } from '../../../utils/streaming-metrics-collector'
import { buildUserContextForAI, formatUserContextForAI } from '../../../utils/user-context-builder'
import type { StrandsChatRequest } from '../chat.post'
import type { StreamEvent } from '#shared/types/streaming-metrics'

// Register OpenAPI documentation
registerEndpoint('/api/strands/chat/stream', 'POST', {
  summary: 'Chat with Strands Agent (Streaming)',
  description: 'Send a message to the Strands agent with real-time SSE streaming updates. Get progress updates, tool calls, and response chunks as they happen.',
  tags: ['Strands', 'AI', 'Streaming'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', description: 'The user message/query', maxLength: 10000 },
            conversationHistory: {
              type: 'array',
              description: 'Previous conversation messages',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string' }
                }
              }
            },
            sessionId: { type: 'string', description: 'Optional session ID for context' },
            mcpId: { type: 'string', description: 'Optional MCP ID' },
            timezone: { type: 'string', description: 'Optional IANA timezone' },
            region: { type: 'string', description: 'Optional AWS region' },
            accountIdentifier: { type: 'string', description: 'Optional account identifier' },
            preferGovcloud: { type: 'boolean', description: 'Prefer GovCloud account ID' }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'SSE stream of events',
      content: {
        'text/event-stream': {
          schema: {
            type: 'string',
            description: 'Server-Sent Events stream with event types: status, tool_call, response, complete, error, disambiguation'
          }
        }
      }
    }
  }
})

/**
 * Extract AWS account ID from message text
 */
function extractAccountId(message: string): string | undefined {
  const accountRegex = /\b\d{12}\b/
  const match = message.match(accountRegex)
  return match ? match[0] : undefined
}

export default defineEventHandler(async (event) => {
  // Check if Strands chat is enabled
  const { getConfigValue } = await import('../../../utils/site-config')
  const strandsEnabled = await getConfigValue<boolean>('features.strandsChat.enabled', true)

  if (!strandsEnabled) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Strands chat is currently disabled'
    })
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

  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`
  const streamId = `stream-${Date.now()}-${Math.random().toString(36).substring(7)}`
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`

  logger.info('[Strands Streaming] Request received', {
    requestId,
    streamId,
    messageLength: message?.length,
    historyLength: conversationHistory.length,
    sessionId,
    accountIdentifier
  })

  // Validate input
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'message is required and must be a non-empty string'
    })
  }

  if (message.length > 10000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Message exceeds maximum length of 10,000 characters'
    })
  }

  // Use explicit accountIdentifier if provided, otherwise try to extract from message
  const accountId = accountIdentifier || extractAccountId(message)

  // Build user context for personalized responses
  const userContext = await buildUserContextForAI(event)
  const userContextText = formatUserContextForAI(userContext)

  // Build the full query with GHOST context
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

${getSchemaForAI()}
`

  let fullQuery = message

  if (conversationHistory.length > 0) {
    // Include recent conversation history for context (last 3 exchanges)
    const recentHistory = conversationHistory.slice(-6)
    const contextParts = recentHistory.map(msg =>
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    )

    fullQuery = `${ghostContext}\n\n${userContextText}\n\nPrevious conversation:\n${contextParts.join('\n')}\n\nCurrent query: ${message}`
  } else {
    fullQuery = `${ghostContext}\n\n${userContextText}\n\nUser query: ${message}`
  }

  // Set SSE headers
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
  })

  // Get Strands config
  const config = await getStrandsConfig()

  // Create SSE stream
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Metrics tracking
      const startTime = Date.now()
      const events: StreamEvent[] = []
      const toolsCalled: string[] = []
      let streamStatus: 'active' | 'completed' | 'errored' | 'timeout' = 'active'
      let streamError: string | undefined
      let finalResponse: string | undefined
      let detectedAccountId: string | undefined

      // Helper to track event
      const trackEvent = (eventType: StreamEvent['eventType'], eventData: any) => {
        events.push({
          streamId,
          eventType,
          eventData,
          timestamp: Date.now(),
          timeFromStart: Date.now() - startTime
        })

        // Track tools
        if (eventType === 'tool_call' && eventData.tool_name) {
          toolsCalled.push(eventData.tool_name)
        }

        // Track account ID
        if (eventData.metadata?.accountId) {
          detectedAccountId = eventData.metadata.accountId
        }
      }

      // Helper to send SSE event
      const sendEvent = (eventType: string, data: any) => {
        try {
          // Track metrics
          trackEvent(eventType as StreamEvent['eventType'], data)

          const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch (error) {
          logger.error('[Strands Streaming] Error encoding event:', error)
        }
      }

      // Helper to collect metrics (async, non-blocking)
      const collectMetrics = async () => {
        try {
          const endTime = Date.now()
          const metricDate = new Date().toISOString().split('T')[0]

          // Get user from event context (if available)
          const user = event.context.auth?.user
          const userId = user?.email || user?.claims?.email || 'anonymous'

          const streamSession = createStreamSession({
            streamId,
            userId,
            sessionId: sessionId || 'unknown',
            threadId: undefined, // Would come from chat threads if available
            messageId,
            query: message,
            accountId: detectedAccountId || accountId,
            startTime,
            endTime,
            status: streamStatus,
            events,
            toolsCalled,
            reconnectAttempts: 0, // Frontend tracks this
            reconnectSuccess: false,
            error: streamError,
            finalResponse
          })

          // Collect metrics asynchronously (fire and forget)
          await collectStreamMetrics({
            streamSession,
            metricDate
          })

          logger.info('[Strands Streaming] Metrics collected', {
            streamId,
            duration: endTime - startTime,
            eventCount: events.length,
            toolCount: toolsCalled.length
          })
        } catch (error: any) {
          // Don't let metrics collection errors affect the stream
          logger.error('[Strands Streaming] Metrics collection failed (non-blocking):', error.message)
        }
      }

      try {
        // Send initial status
        sendEvent('status', {
          message: 'Connecting to Strands...',
          step: 'initializing'
        })

        // Build request body for Strands
        const strandsRequestBody = {
          message: fullQuery,
          account_identifier: accountId,
          sessionId,
          timezone,
          region,
          mcp_id: mcpId,
          prefer_govcloud: preferGovcloud
        }

        logger.info('[Strands Streaming] Calling Strands API', {
          requestId,
          endpoint: `${config.serverUrl}/query/stream`
        })

        // Call Strands streaming endpoint
        const strandsResponse = await fetch(`${config.serverUrl}/query/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
          },
          body: JSON.stringify(strandsRequestBody),
          // @ts-ignore - Node fetch supports signal
          signal: AbortSignal.timeout(config.timeout)
        })

        if (!strandsResponse.ok) {
          throw new Error(`Strands API returned ${strandsResponse.status}: ${strandsResponse.statusText}`)
        }

        if (!strandsResponse.body) {
          throw new Error('Strands API returned empty response body')
        }

        // Read Strands SSE stream
        const reader = strandsResponse.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let lastResponseContent = ''
        let lastMetadata: any = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue

            const [eventLine, dataLine] = line.split('\n')
            if (!eventLine?.startsWith('event:') || !dataLine?.startsWith('data:')) {
              continue
            }

            const eventType = eventLine.substring(7).trim()
            const data = JSON.parse(dataLine.substring(6))

            // Forward most events directly
            if (eventType === 'status' || eventType === 'tool_call' || eventType === 'response' || eventType === 'error' || eventType === 'disambiguation') {
              sendEvent(eventType, data)
            }

            // Store data for post-processing
            if (eventType === 'response') {
              lastResponseContent = data.accumulated || lastResponseContent
            }

            if (eventType === 'complete') {
              lastMetadata = data.metadata
              lastResponseContent = data.response || lastResponseContent

              // Mark stream as completed
              streamStatus = 'completed'
              finalResponse = lastResponseContent
              detectedAccountId = lastMetadata?.accountId || detectedAccountId

              // Generate smart links based on query and response
              const suggestedLinks = await generateSmartLinks(
                message,
                lastResponseContent,
                { accountId: lastMetadata?.accountId }
              )

              logger.info('[Strands Streaming] Generated smart links', {
                requestId,
                linkCount: suggestedLinks.length
              })

              // Extract follow-up prompts
              const suggestedPrompts = await extractFollowUpPrompts(lastResponseContent, 3)

              logger.info('[Strands Streaming] Extracted follow-up prompts', {
                requestId,
                promptCount: suggestedPrompts.length
              })

              // Send enhanced complete event with suggestions
              sendEvent('complete', {
                ...data,
                suggestedLinks,
                suggestedPrompts
              })
            }
          }
        }

        logger.info('[Strands Streaming] Stream completed successfully', { requestId })

        // Collect metrics asynchronously (non-blocking)
        collectMetrics().catch(err => {
          logger.error('[Strands Streaming] Metrics collection error (ignored):', err.message)
        })

        controller.close()

      } catch (error: any) {
        logger.error('[Strands Streaming] Error:', {
          requestId,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n')
        })

        // Mark stream as errored
        streamStatus = 'errored'
        streamError = error.message || 'Unknown error'

        // Send error event
        sendEvent('error', {
          message: error.message || 'An error occurred while processing your query',
          step: 'execution'
        })

        // Collect metrics even for errors (non-blocking)
        collectMetrics().catch(err => {
          logger.error('[Strands Streaming] Metrics collection error (ignored):', err.message)
        })

        controller.close()
      }
    }
  })

  return stream
})
