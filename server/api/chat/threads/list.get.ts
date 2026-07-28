/**
 * GET /api/chat/threads/list
 * List user's chat threads with filters and pagination
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { requireUserSession } from '../../../utils/entra/session'
import { getUserThreads } from '../../../utils/chat-threads'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import type { ChatThreadFilters } from '#shared/types/chat-threads'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/list', 'GET', {
  summary: 'List user chat threads',
  description: 'Retrieve all chat threads for the authenticated user with optional filters',
  tags: ['Chat', 'Threads'],
  parameters: [
    {
      name: 'isPinned',
      in: 'query',
      schema: { type: 'boolean' },
      description: 'Filter by pinned status'
    },
    {
      name: 'isArchived',
      in: 'query',
      schema: { type: 'boolean' },
      description: 'Filter by archived status'
    },
    {
      name: 'isShared',
      in: 'query',
      schema: { type: 'boolean' },
      description: 'Filter by shared status'
    },
    {
      name: 'searchQuery',
      in: 'query',
      schema: { type: 'string' },
      description: 'Search in thread titles and messages'
    },
    {
      name: 'limit',
      in: 'query',
      schema: { type: 'number', default: 50 },
      description: 'Maximum number of threads to return'
    },
    {
      name: 'startDate',
      in: 'query',
      schema: { type: 'string', format: 'date-time' },
      description: 'Filter threads with last message after this date'
    },
    {
      name: 'endDate',
      in: 'query',
      schema: { type: 'string', format: 'date-time' },
      description: 'Filter threads with last message before this date'
    }
  ],
  responses: {
    200: {
      description: 'List of threads',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              threads: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    threadId: { type: 'string' },
                    title: { type: 'string' },
                    messageCount: { type: 'number' },
                    lastMessageAt: { type: 'string', format: 'date-time' },
                    isPinned: { type: 'boolean' },
                    isArchived: { type: 'boolean' },
                    isShared: { type: 'boolean' }
                  }
                }
              },
              hasMore: { type: 'boolean' }
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

  // Parse query parameters
  const query = getQuery(event)

  const filters: ChatThreadFilters = {
    isPinned: query.isPinned === 'true' ? true : query.isPinned === 'false' ? false : undefined,
    isArchived: query.isArchived === 'true' ? true : query.isArchived === 'false' ? false : undefined,
    isShared: query.isShared === 'true' ? true : query.isShared === 'false' ? false : undefined,
    searchQuery: query.searchQuery as string | undefined,
    limit: query.limit ? parseInt(query.limit as string, 10) : 50,
    startDate: query.startDate as string | undefined,
    endDate: query.endDate as string | undefined,
    lastKey: query.lastKey ? JSON.parse(String(query.lastKey)) : undefined
  }

  logger.info(`[Chat Threads API] Listing threads for user ${userId}`, filters)

  // Get threads
  const result = await getUserThreads(userId, filters)

  logger.info(`[Chat Threads API] Found ${result.threads.length} threads`)

  return sendSuccess(event, result)
}))
