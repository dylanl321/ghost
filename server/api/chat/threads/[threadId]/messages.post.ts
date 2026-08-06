/**
 * POST /api/chat/threads/[threadId]/messages
 * Add a message to a thread
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../../utils/api-response'
import { requireUserSession } from '../../../../utils/entra/session'
import { addMessageToThread } from '../../../../utils/chat-threads'
import { registerEndpoint } from '../../../../plugins/swagger'
import { logger } from '../../../../utils/logger'
import type { AddMessageRequest } from '#shared/types/chat-threads'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/{threadId}/messages', 'POST', {
  summary: 'Add message to thread',
  description: 'Append a new message to an existing chat thread',
  tags: ['Chat', 'Threads', 'Messages'],
  parameters: [
    {
      name: 'threadId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Thread ID'
    }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['message'],
          properties: {
            message: {
              type: 'object',
              required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['user'] },
                content: { type: 'string' },
                metadata: {
                  type: 'object',
                  properties: {
                    accountId: { type: 'string' },
                    mcpUsed: { type: 'string' },
                    mcpType: { type: 'string', enum: ['permanent', 'temporary'] }
                  }
                },
                links: {
                  type: 'array',
                  items: { type: 'string' }
                },
                suggestedLinks: {
                  type: 'array',
                  items: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Message added successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              threadId: { type: 'string' },
              messageCount: { type: 'number' },
              lastMessageAt: { type: 'string' }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Authenticate user
  const session = await requireUserSession(event)
  const userId = session.user?.email || session.user?.id

  if (!userId) {
    logger.error('[Chat Threads API] User email not found in session')
    return errors.unauthorized(event, 'User email not found in session')
  }

  // Get threadId from path
  const threadId = event.context.params?.threadId

  if (!threadId) {
    return errors.badRequest(event, 'Thread ID is required')
  }

  // Parse request body
  const body = await readBody(event) as AddMessageRequest

  if (!body.message || !body.message.role || !body.message.content) {
    return errors.badRequest(event, 'Message with role and content is required')
  }

  if (body.message.role !== 'user') {
    return errors.badRequest(event, 'Only user messages may be submitted from the client')
  }

  logger.info(`[Chat Threads API] Adding message to thread ${threadId}`, {
    role: body.message.role,
    contentLength: body.message.content.length
  })

  try {
    // Add message
    const updated = await addMessageToThread(threadId, userId, body.message)

    if (!updated) {
      logger.warn(`[Chat Threads API] Thread ${threadId} not found or access denied`)
      return errors.notFound(event, 'Thread not found')
    }

    logger.info(`[Chat Threads API] Message added to thread ${threadId}`)

    return sendSuccess(event, updated)
  } catch (error: any) {
    logger.error(`[Chat Threads API] Error adding message to thread ${threadId}:`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
      role: body.message.role
    })
    throw error
  }
}))
