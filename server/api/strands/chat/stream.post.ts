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

import http from 'http'
import https from 'https'
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
import type { StreamEvent } from '../../../../shared/types/streaming-metrics'

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

          logger.info('[Strands Streaming] Event enqueued to client', {
            requestId,
            eventType,
            messageLength: message.length
          })
        } catch (error: any) {
          logger.error('[Strands Streaming] Error sending event to client:', {
            requestId,
            eventType,
            error: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n')
          })
          // Re-throw to stop stream if client disconnected
          throw error
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
        const strandsRequestBody: any = {
          message: fullQuery,
          account_identifier: accountId,
          sessionId,
          timezone,
          region,
          mcp_id: mcpId,
          prefer_govcloud: preferGovcloud
        }

        // Remove undefined fields to keep request clean (Strands may reject undefined/null fields)
        Object.keys(strandsRequestBody).forEach(key => {
          if (strandsRequestBody[key] === undefined) {
            delete strandsRequestBody[key]
          }
        })

        logger.info('[Strands Streaming] Calling Strands API', {
          requestId,
          endpoint: `${config.serverUrl}/query/stream`,
          payloadKeys: Object.keys(strandsRequestBody),
          messageLength: strandsRequestBody.message?.length,
          messagePreview: strandsRequestBody.message?.substring(0, 200)
        })

        // Log config before making request
        logger.info('[Strands Streaming] Config values', {
          requestId,
          serverUrl: config.serverUrl,
          timeout: config.timeout,
          timeoutMinutes: Math.round(config.timeout / 60000)
        })

        // Call Strands streaming endpoint using native http/https module to avoid fetch buffering issues
        const fetchStartTime = Date.now()
        
        logger.info('[Strands Streaming] Making native http request', {
          requestId,
          url: `${config.serverUrl}/query/stream`,
          payloadSize: JSON.stringify(strandsRequestBody).length
        })

        const url = new URL(`${config.serverUrl}/query/stream`)
        const requestModule = url.protocol === 'https:' ? https : http
        
        // Create a custom agent to ensure keep-alive and proper socket handling
        const agent = new requestModule.Agent({
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: Infinity // Don't limit sockets for streaming
        })

        const options = {
            method: 'POST',
            agent, // Use custom agent
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'X-Accel-Buffering': 'no',
              'Accept-Encoding': 'identity' // CRITICAL: Disable compression
            },
            timeout: 60000 // Connection timeout
        }

        const req = requestModule.request(url, options, (res) => {
             // Clear connection timeout once headers are received
             // Note: req.setTimeout only handles socket inactivity, but we want to ensure we get a response start
        })

        // Force disable Nagle's algorithm (no buffering) on the socket
        req.on('socket', (socket) => {
            socket.setNoDelay(true)
            socket.setKeepAlive(true, 1000)
        })

        req.on('timeout', () => {
             logger.error('[Strands Streaming] Request connection timeout', { requestId })
             req.destroy(new Error('Connection timeout to Strands server'))
        })
        
        req.on('error', (error) => {
            logger.error('[Strands Streaming] Request error:', {
              requestId,
              error: error.message
            })
             // If we haven't started streaming to client yet, we can send an error event
             // But if we are inside the stream loop, we need to handle it there.
             // Since we use a promise wrapper below, the rejection handles it.
        })

        // Write body and start request
        req.write(JSON.stringify(strandsRequestBody))
        req.end()

        let buffer = ''
        let lastResponseContent = ''
        let lastMetadata: any = null
        
        // SSE parsing state
        let currentEvent: string | null = null
        let currentDataLines: string[] = []
        
        // Stream reading metrics
        let totalBytesRead = 0
        let lastReadTime = Date.now()
        let chunkCount = 0

        logger.info('[Strands Streaming] Starting to read stream', { requestId })

        try {
            await new Promise<void>((resolve, reject) => {
                req.on('response', (res) => {
                    logger.info('[Strands Streaming] Response headers received', {
                      requestId,
                      status: res.statusCode,
                      headers: res.headers,
                      fetchDuration: Date.now() - fetchStartTime
                    })

                    if (res.statusCode !== 200) {
                        reject(new Error(`Strands API returned ${res.statusCode}: ${res.statusMessage}`))
                        return
                    }

                    // Remove timeout on response start, but set a longer socket timeout for idle streams
                    req.setTimeout(0) // Disable default timeout
                    res.setTimeout(0) // Disable response timeout

                    res.on('data', async (chunk) => {
                        try {
                            const chunkStartTime = Date.now()
                            chunkCount++
                            const chunkBytes = chunk.length
                            totalBytesRead += chunkBytes
                            lastReadTime = chunkStartTime

                            const decodedChunk = chunk.toString('utf8')
                            buffer += decodedChunk

                            logger.info('[Strands Streaming] Processing chunk', {
                              requestId,
                              chunkCount,
                              chunkBytes,
                              bufferSize: buffer.length
                            })

            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEvent = line.substring(6).trim()
              } else if (line.startsWith('data:')) {
                currentDataLines.push(line.substring(5).trim())
              } else if (line === '' && currentEvent) {
                // Empty line with event/data present -> complete event
                try {
                  const data = JSON.parse(currentDataLines.join('\n'))
                  const eventType = currentEvent

                  logger.info('[Strands Streaming] Received event', {
                    requestId,
                    eventType,
                    willForward: true
                  })

                  if (eventType === 'response') {
                    lastResponseContent = data.accumulated || lastResponseContent
                  }

                  if (eventType === 'complete') {
                    lastMetadata = data.metadata
                    lastResponseContent = data.response || lastResponseContent
                    streamStatus = 'completed'
                    finalResponse = lastResponseContent
                    detectedAccountId = lastMetadata?.accountId || detectedAccountId

                    const suggestedLinks = await generateSmartLinks(
                      message,
                      lastResponseContent,
                      { accountId: lastMetadata?.accountId }
                    )
                    const suggestedPrompts = await extractFollowUpPrompts(lastResponseContent, 3)

                    sendEvent('complete', {
                      ...data,
                      suggestedLinks,
                      suggestedPrompts
                    })
                  } else {
                    sendEvent(eventType, data)
                  }
                } catch (parseError: any) {
                  logger.error('[Strands Streaming] Failed to parse SSE event:', {
                    eventType: currentEvent,
                    error: parseError.message
                  })
                } finally {
                  currentEvent = null
                  currentDataLines = []
                }
              } else if (line === '' && !currentEvent && currentDataLines.length === 0) {
                // Heartbeat (comment/empty frame) -> forward as heartbeat to keep connection alive
                sendEvent('heartbeat', { message: 'keep-alive' })
              }
            }
                        } catch (error: any) {
                            logger.error('[Strands Streaming] Chunk processing error:', error.message)
                            // Don't reject here, try to continue processing stream
                        }
                    })

                    res.on('end', () => {
                        resolve()
                    })

                    res.on('error', (err) => {
                        reject(err)
                    })
                })
                
                req.on('error', (err) => {
                    reject(err)
                })
            })
        } catch (error: any) {
            logger.error('[Strands Streaming] Stream error:', {
              requestId,
              error: error.message
            })
            throw error
        } finally {
             // Log completion metrics
            const streamDuration = Date.now() - fetchStartTime
            logger.info('[Strands Streaming] Stream ended by remote (Strands)', {
              requestId,
              totalChunks: chunkCount,
              totalBytesRead,
              streamDuration,
              streamDurationSeconds: Math.round(streamDuration / 1000),
              hasCurrentEvent: !!currentEvent,
              bufferLength: buffer.length
            })

            // Check if stream ended prematurely (before complete event)
            if ((streamStatus as string) !== 'completed') {
              logger.warn('[Strands Streaming] Stream closed without complete event', {
                requestId,
                streamStatus: streamStatus as string,
                eventCount: events.length
              })
            }
            
            // Process any remaining buffered data that didn't end with a newline
            if (buffer.trim()) {
                const lines = buffer.split('\n')
                for (const line of lines) {
                    if (line.startsWith('event:')) {
                         currentEvent = line.substring(6).trim()
                    } else if (line.startsWith('data:')) {
                         currentDataLines.push(line.substring(5).trim())
                    }
                }
            }
            
            // Handle any final buffered event (if any)
             if (currentEvent && currentDataLines.length > 0) {
                 try {
                     const data = JSON.parse(currentDataLines.join('\n'))
                     const eventType = currentEvent
                     
                     logger.info('[Strands Streaming] Processing FINAL buffered event', {
                        requestId,
                        eventType
                     })

                     if (eventType === 'complete') {
                          lastMetadata = data.metadata
                          lastResponseContent = data.response || lastResponseContent
                          streamStatus = 'completed'
                          finalResponse = lastResponseContent
                          detectedAccountId = lastMetadata?.accountId || detectedAccountId
                          
                          const suggestedLinks = await generateSmartLinks(
                             message,
                             lastResponseContent,
                             { accountId: lastMetadata?.accountId }
                          )
                          const suggestedPrompts = await extractFollowUpPrompts(lastResponseContent, 3)
                          
                          sendEvent('complete', {
                             ...data,
                             suggestedLinks,
                             suggestedPrompts
                          })
                     } else {
                         sendEvent(eventType, data)
                     }
                 } catch (e: any) {
                     logger.error('[Strands Streaming] Failed to parse FINAL SSE event', { error: e.message })
                 }
             }
        }

        logger.info('[Strands Streaming] Stream processing finished', { requestId })

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
