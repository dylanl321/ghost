/**
 * GET /api/chat/threads/[threadId]
 * Get a specific thread by ID
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { requireUserSession } from '../../../utils/entra/session'
import { getThreadById } from '../../../utils/chat-threads'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import { listThreadMessages } from '../../../utils/chat-messages'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/{threadId}', 'GET', {
  summary: 'Get a chat thread',
  description: 'Retrieve a specific chat thread by ID',
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
      description: 'Thread details',
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
              lastMessageAt: { type: 'string' }
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

  logger.info(`[Chat Threads API] Getting thread ${threadId} for user ${userId}`)

  // Get thread
  const thread = await getThreadById(threadId, userId)

  if (!thread) {
    logger.warn(`[Chat Threads API] Thread ${threadId} not found or access denied`)
    return errors.notFound(event, 'Thread not found')
  }

  const query = getQuery(event)
  const page = await listThreadMessages(thread, {
    limit: query.limit ? parseInt(String(query.limit), 10) : 100,
    nextToken: query.nextToken ? String(query.nextToken) : undefined
  })

  return sendSuccess(event, {
    ...thread,
    messages: page.messages,
    hasMoreMessages: page.hasMore,
    messagesNextToken: page.nextToken
  })
}))
