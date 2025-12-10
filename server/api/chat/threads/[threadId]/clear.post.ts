/**
 * POST /api/chat/threads/[threadId]/clear
 * Clear all messages from a thread (reset to welcome)
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../../utils/api-response'
import { requireUserSession } from '../../../../utils/entra/session'
import { clearThreadMessages } from '../../../../utils/chat-threads'
import { registerEndpoint } from '../../../../plugins/swagger'
import { logger } from '../../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/{threadId}/clear', 'POST', {
  summary: 'Clear thread messages',
  description: 'Remove all messages from a thread and reset to empty state',
  tags: ['Chat', 'Threads'],
  parameters: [
    {
      name: 'threadId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Thread ID'
    }
  ],
  responses: {
    200: {
      description: 'Thread cleared successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              threadId: { type: 'string' },
              messageCount: { type: 'number', example: 0 },
              messages: { type: 'array', items: {} }
            }
          }
        }
      }
    },
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

  logger.info(`[Chat Threads API] Clearing messages from thread ${threadId} for user ${userId}`)

  // Clear messages
  const cleared = await clearThreadMessages(threadId, userId)

  if (!cleared) {
    logger.warn(`[Chat Threads API] Thread ${threadId} not found or access denied`)
    return errors.notFound(event, 'Thread not found')
  }

  logger.info(`[Chat Threads API] Thread ${threadId} messages cleared successfully`)

  return sendSuccess(event, cleared)
}))
