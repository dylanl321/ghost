/**
 * POST /api/chat/threads/[threadId]/share
 * Share a thread and generate a public link
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../../utils/api-response'
import { requireUserSession } from '../../../../utils/entra/session'
import { shareThread, updateThread, getThreadById } from '../../../../utils/chat-threads'
import { createShortLink } from '../../../../lib/shortlinks'
import { registerEndpoint } from '../../../../plugins/swagger'
import { logger } from '../../../../utils/logger'
import type { ShareThreadRequest, ShareThreadResponse } from '~/shared/types/chat-threads'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/{threadId}/share', 'POST', {
  summary: 'Share a chat thread',
  description: 'Generate a public shareable link for a chat thread',
  tags: ['Chat', 'Threads', 'Sharing'],
  parameters: [
    {
      name: 'threadId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Thread ID to share'
    }
  ],
  requestBody: {
    required: false,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            expiresInDays: {
              type: 'number',
              default: 90,
              description: 'Number of days until the share link expires'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Thread shared successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              shareId: { type: 'string', description: 'Unique share identifier' },
              shortCode: { type: 'string', description: 'Short URL code' },
              shortUrl: { type: 'string', description: 'Full shareable URL' },
              expiresAt: { type: 'string', format: 'date-time' }
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

  // Parse request body (optional)
  const body = (await readBody(event).catch(() => ({}))) as ShareThreadRequest
  const expiresInDays = body.expiresInDays || 90

  logger.info(`[Chat Threads API] Sharing thread ${threadId} for user ${userId}`, { expiresInDays })

  // Get thread first to validate and get title
  const thread = await getThreadById(threadId, userId)

  if (!thread) {
    logger.warn(`[Chat Threads API] Thread ${threadId} not found or access denied`)
    return errors.notFound(event, 'Thread not found')
  }

  // Share the thread (marks as shared and generates shareId)
  const shareResult = await shareThread(threadId, userId, expiresInDays)

  if (!shareResult) {
    return errors.serverError(event, 'Failed to share thread')
  }

  // Create shortlink for easy sharing
  const shortlink = await createShortLink({
    originalUrl: `/api/chat/threads/shared/${shareResult.shareId}`,
    pagePath: `/chat/shared/${shareResult.shareId}`,
    configData: {
      shareId: shareResult.shareId,
      threadId,
      type: 'chat-thread'
    },
    expiresInDays,
    createdBy: userId,
    description: `Shared chat: ${thread.title}`
  })

  // Get base URL from environment or request
  const baseUrl = process.env.NUXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://ghost.gdms.cloud'
  const shortUrl = `${baseUrl}/s/${shortlink.shortCode}`

  // Update thread with shortlink info
  await updateThread(threadId, userId, {
    shortCode: shortlink.shortCode,
    shortUrl
  })

  logger.info(`[Chat Threads API] Thread ${threadId} shared successfully`, {
    shareId: shareResult.shareId,
    shortCode: shortlink.shortCode
  })

  const response: ShareThreadResponse = {
    shareId: shareResult.shareId,
    shortCode: shortlink.shortCode,
    shortUrl,
    expiresAt: shareResult.expiresAt
  }

  return sendSuccess(event, response)
}))
