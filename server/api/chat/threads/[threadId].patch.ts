/**
 * PATCH /api/chat/threads/[threadId]
 * Update thread metadata (title, pin, archive)
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { requireUserSession } from '../../../utils/entra/session'
import { updateThread } from '../../../utils/chat-threads'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import type { UpdateThreadRequest } from '~/shared/types/chat-threads'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/{threadId}', 'PATCH', {
  summary: 'Update chat thread',
  description: 'Update thread metadata such as title, pin status, or archive status',
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
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'New thread title' },
            description: { type: 'string', description: 'Thread description' },
            isPinned: { type: 'boolean', description: 'Pin thread to top of list' },
            isArchived: { type: 'boolean', description: 'Archive thread' }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Thread updated successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              threadId: { type: 'string' },
              title: { type: 'string' },
              isPinned: { type: 'boolean' },
              isArchived: { type: 'boolean' },
              lastModifiedAt: { type: 'string' }
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
  const body = await readBody(event) as UpdateThreadRequest

  if (!body.title && body.description === undefined && body.isPinned === undefined && body.isArchived === undefined) {
    return errors.badRequest(event, 'At least one field must be provided for update')
  }

  logger.info(`[Chat Threads API] Updating thread ${threadId} for user ${userId}`, body)

  // Update thread
  const updated = await updateThread(threadId, userId, body)

  if (!updated) {
    logger.warn(`[Chat Threads API] Thread ${threadId} not found or access denied`)
    return errors.notFound(event, 'Thread not found')
  }

  logger.info(`[Chat Threads API] Thread ${threadId} updated successfully`)

  return sendSuccess(event, updated)
}))
