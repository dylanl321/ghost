/**
 * POST /api/chat/threads/create
 * Create a new chat thread
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { requireUserSession } from '../../../utils/entra/session'
import { createThread } from '../../../utils/chat-threads'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import type { CreateThreadRequest } from '~/shared/types/chat-threads'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/create', 'POST', {
  summary: 'Create a new chat thread',
  description: 'Creates a new chat conversation thread for the authenticated user',
  tags: ['Chat', 'Threads'],
  requestBody: {
    required: false,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Optional custom title for the thread. If not provided, a default title with timestamp will be generated.'
            },
            initialMessage: {
              type: 'string',
              description: 'Optional first user message to add to the thread'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Thread created successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              threadId: { type: 'string', description: 'Unique thread identifier' },
              title: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              messageCount: { type: 'number' },
              messages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    messageId: { type: 'string' },
                    role: { type: 'string', enum: ['user', 'assistant'] },
                    content: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      }
    },
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

  // Parse request body (optional)
  const body = (await readBody(event).catch(() => ({}))) as CreateThreadRequest

  logger.info(`[Chat Threads API] Creating thread for user ${userId}`, {
    hasTitle: !!body.title,
    hasInitialMessage: !!body.initialMessage
  })

  // Create the thread
  const thread = await createThread(userId, {
    title: body.title,
    initialMessage: body.initialMessage ? {
      role: 'user',
      content: body.initialMessage,
      timestamp: new Date().toISOString()
    } : undefined
  })

  logger.info(`[Chat Threads API] Thread created: ${thread.threadId}`)

  return sendSuccess(event, thread)
}))
