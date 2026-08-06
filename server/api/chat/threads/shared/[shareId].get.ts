/**
 * GET /api/chat/threads/shared/[shareId]
 * View a publicly shared thread (no authentication required)
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../../utils/api-response'
import { getThreadByShareId } from '../../../../utils/chat-threads'
import { registerEndpoint } from '../../../../plugins/swagger'
import { logger } from '../../../../utils/logger'
import { serializePublicChatMessage } from '../../../../utils/public-chat'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/shared/{shareId}', 'GET', {
  summary: 'View shared chat thread',
  description: 'Access a publicly shared chat thread using its share ID (no authentication required)',
  tags: ['Chat', 'Threads', 'Sharing'],
  parameters: [
    {
      name: 'shareId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Share ID from the shared link'
    }
  ],
  responses: {
    200: {
      description: 'Shared thread details',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              threadId: { type: 'string' },
              title: { type: 'string' },
              messages: { type: 'array' },
              messageCount: { type: 'number' },
              createdAt: { type: 'string' },
              sharedAt: { type: 'string' },
              isShared: { type: 'boolean', example: true }
            }
          }
        }
      }
    },
    404: { $ref: '#/components/schemas/Error' },
    410: {
      description: 'Link expired',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Get shareId from path
  const shareId = event.context.params?.shareId

  if (!shareId) {
    return errors.badRequest(event, 'Share ID is required')
  }

  logger.info(`[Chat Threads API] Accessing shared thread ${shareId}`)

  // Get thread by share ID (no authentication required)
  const query = getQuery(event)
  const thread = await getThreadByShareId(shareId, {
    limit: query.limit ? parseInt(String(query.limit), 10) : 100,
    nextToken: query.nextToken ? String(query.nextToken) : undefined
  })

  if (!thread) {
    logger.warn(`[Chat Threads API] Shared thread ${shareId} not found or expired`)
    return errors.notFound(event, 'Shared thread not found or has expired')
  }

  logger.info(`[Chat Threads API] Shared thread ${shareId} accessed successfully`)

  // Return thread data (excluding sensitive fields like userId)
  const publicThread = {
    threadId: thread.threadId,
    title: thread.title,
    description: thread.description,
    messages: thread.messages.map(serializePublicChatMessage),
    messageCount: thread.messageCount,
    createdAt: thread.createdAt,
    sharedAt: thread.sharedAt,
    shareExpiresAt: thread.shareExpiresAt,
    isShared: true,
    hasMoreMessages: thread.hasMoreMessages,
    messagesNextToken: thread.messagesNextToken
  }

  return sendSuccess(event, publicThread)
}))
