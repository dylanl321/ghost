/**
 * GET /api/chat/threads/[threadId]/export
 * Export a thread as JSON or Markdown
 */

import { defineEventHandler, getQuery, setHeader } from 'h3'
import { errors, handleAsync } from '../../../../utils/api-response'
import { requireUserSession } from '../../../../utils/entra/session'
import { getThreadById } from '../../../../utils/chat-threads'
import { registerEndpoint } from '../../../../plugins/swagger'
import { logger } from '../../../../utils/logger'
import type { ChatThread, ChatExportFormat } from '~/shared/types/chat-threads'

// Register OpenAPI documentation
registerEndpoint('/api/chat/threads/{threadId}/export', 'GET', {
  summary: 'Export chat thread',
  description: 'Export a chat thread as JSON or Markdown file. Supports exporting all messages, selected messages, or just the last response.',
  tags: ['Chat', 'Threads', 'Export'],
  parameters: [
    {
      name: 'threadId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Thread ID to export'
    },
    {
      name: 'format',
      in: 'query',
      required: true,
      schema: { type: 'string', enum: ['json', 'markdown'] },
      description: 'Export format'
    },
    {
      name: 'messageIds',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of message IDs to include (for selective export)'
    },
    {
      name: 'lastResponseOnly',
      in: 'query',
      required: false,
      schema: { type: 'boolean' },
      description: 'Export only the last assistant response'
    }
  ],
  responses: {
    200: {
      description: 'Thread exported successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            description: 'Thread data in JSON format'
          }
        },
        'text/markdown': {
          schema: {
            type: 'string',
            description: 'Thread data in Markdown format'
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

/**
 * Generate Markdown export
 */
function generateMarkdownExport(thread: ChatThread): string {
  let markdown = `# ${thread.title}\n\n`
  markdown += `**Created:** ${new Date(thread.createdAt).toLocaleString()}\n`
  markdown += `**Last Updated:** ${new Date(thread.lastMessageAt).toLocaleString()}\n`
  markdown += `**Total Messages:** ${thread.messageCount}\n\n`
  markdown += `---\n\n`

  for (const message of thread.messages) {
    const role = message.role === 'user' ? '👤 You' : '🤖 GHOST Assistant'
    const timestamp = new Date(message.timestamp).toLocaleString()

    markdown += `## ${role}\n`
    markdown += `*${timestamp}*\n\n`
    markdown += `${message.content}\n\n`

    // Add metadata if present
    if (message.metadata?.accountId) {
      markdown += `**Account:** ${message.metadata.accountId}\n\n`
    }

    if (message.metadata?.mcpUsed) {
      markdown += `**MCP Tool:** ${message.metadata.mcpUsed} (${message.metadata.mcpType})\n\n`
    }

    // Add reference links if present
    if (message.links && message.links.length > 0) {
      markdown += `**References:**\n`
      message.links.forEach(link => {
        markdown += `- ${link}\n`
      })
      markdown += `\n`
    }

    // Add suggested links if present
    if (message.suggestedLinks && message.suggestedLinks.length > 0) {
      markdown += `**Suggested Links:**\n`
      message.suggestedLinks.forEach(link => {
        markdown += `- [${link.label}](${link.url}) - ${link.description}\n`
      })
      markdown += `\n`
    }

    markdown += `---\n\n`
  }

  markdown += `\n*Exported from GHOST Chat on ${new Date().toLocaleString()}*\n`

  return markdown
}

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

  // Get format and filtering options from query
  const query = getQuery(event)
  const format = (query.format as ChatExportFormat) || 'json'
  const messageIdsParam = query.messageIds as string | undefined
  const lastResponseOnly = query.lastResponseOnly === 'true'

  if (format !== 'json' && format !== 'markdown') {
    return errors.badRequest(event, 'Invalid format. Must be "json" or "markdown"')
  }

  logger.info(`[Chat Threads API] Exporting thread ${threadId} as ${format} for user ${userId}`, {
    messageIdsFilter: messageIdsParam ? 'yes' : 'no',
    lastResponseOnly
  })

  // Get thread
  const thread = await getThreadById(threadId, userId)

  if (!thread) {
    logger.warn(`[Chat Threads API] Thread ${threadId} not found or access denied`)
    return errors.notFound(event, 'Thread not found')
  }

  // Filter messages based on query parameters
  let filteredMessages = thread.messages

  if (lastResponseOnly) {
    // Get only the last assistant message
    const lastAssistant = [...thread.messages].reverse().find(m => m.role === 'assistant')
    filteredMessages = lastAssistant ? [lastAssistant] : []
  } else if (messageIdsParam) {
    // Filter to specific message IDs
    const messageIds = new Set(messageIdsParam.split(',').map(id => id.trim()))
    filteredMessages = thread.messages.filter(m => messageIds.has(m.messageId))
  }

  // Create a copy of thread with filtered messages for export
  const exportThread = {
    ...thread,
    messages: filteredMessages,
    messageCount: filteredMessages.length
  }

  // Generate export based on format
  if (format === 'json') {
    // JSON export
    const filename = `chat-${threadId}-${Date.now()}.json`
    const jsonContent = JSON.stringify(exportThread, null, 2)
    const buffer = Buffer.from(jsonContent, 'utf-8')

    setHeader(event, 'Content-Type', 'application/json')
    setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    setHeader(event, 'Content-Length', buffer.length.toString())

    logger.info(`[Chat Threads API] Thread ${threadId} exported as JSON (${exportThread.messageCount} messages)`)

    return buffer
  } else {
    // Markdown export
    const filename = `chat-${threadId}-${Date.now()}.md`
    const markdownContent = generateMarkdownExport(exportThread)
    const buffer = Buffer.from(markdownContent, 'utf-8')

    setHeader(event, 'Content-Type', 'text/markdown')
    setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    setHeader(event, 'Content-Length', buffer.length.toString())

    logger.info(`[Chat Threads API] Thread ${threadId} exported as Markdown (${exportThread.messageCount} messages)`)

    return buffer
  }
}))
