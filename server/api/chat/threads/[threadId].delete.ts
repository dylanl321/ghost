/**
 * DELETE /api/chat/threads/[threadId]
 * Delete a thread
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { requireUserSession } from '../../../utils/entra/session'
import { deleteThread } from '../../../utils/chat-threads'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/{threadId}', 'DELETE', {
  summary: 'Delete chat thread',
  description: 'Permanently delete a chat thread and all its messages',
  tags: ['Chat', 'Threads'],
  parameters: [
    {
      name: 'threadId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Thread ID to delete'
    }
  ],
  responses: {
    200: {
      description: 'Thread deleted successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
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

  logger.info(`[Chat Threads API] Deleting thread ${threadId} for user ${userId}`)

  // Delete thread
  const deleted = await deleteThread(threadId, userId)

  if (!deleted) {
    logger.warn(`[Chat Threads API] Thread ${threadId} not found or access denied`)
    return errors.notFound(event, 'Thread not found')
  }

  logger.info(`[Chat Threads API] Thread ${threadId} deleted successfully`)

  return sendSuccess(event, {
    success: true,
    message: 'Thread deleted successfully'
  })
}))
