/**
 * POST /api/strands/chat/summary
 * Generate an AI summary of a chat conversation
 * Uses AWS Bedrock Claude for summarization
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { getBedrockRuntimeClient } from '../../../lib/aws-client-factory'

interface SummaryRequest {
  threadId: string
  conversationText: string
  messageCount: number
}

interface SummaryResponse {
  success: boolean
  summary?: string
  error?: string
}

// Register OpenAPI documentation
registerEndpoint('/api/strands/chat/summary', 'POST', {
  summary: 'Generate conversation summary',
  description: 'Generate an AI-powered summary of a chat conversation for sharing with stakeholders',
  tags: ['Strands', 'AI', 'Chat'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['threadId', 'conversationText', 'messageCount'],
          properties: {
            threadId: {
              type: 'string',
              description: 'Thread ID being summarized'
            },
            conversationText: {
              type: 'string',
              description: 'Full conversation text to summarize'
            },
            messageCount: {
              type: 'number',
              description: 'Number of messages in conversation'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Summary generated successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              summary: { type: 'string' },
              error: { type: 'string', nullable: true }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event) as SummaryRequest
  const { threadId, conversationText, messageCount } = body

  if (!threadId || !conversationText) {
    return errors.badRequest(event, 'threadId and conversationText are required')
  }

  logger.info('[Chat Summary API] Generating summary', {
    threadId,
    messageCount,
    textLength: conversationText.length
  })

  try {
    // Get Bedrock client
    const bedrock = await getBedrockRuntimeClient('commercial')

    // Truncate conversation if too long (max ~10k tokens)
    const maxLength = 30000
    const truncatedText = conversationText.length > maxLength
      ? conversationText.substring(0, maxLength) + '\n\n[... conversation truncated ...]'
      : conversationText

    const prompt = `You are summarizing a conversation between a user and GHOST, an AI assistant for AWS operations. Create a concise summary that would be useful for sharing with non-technical stakeholders (like project managers).

## Conversation
${truncatedText}

## Instructions
Create a summary with the following structure:

1. **Overview**: 1-2 sentences describing what was discussed
2. **Key Findings**: Bullet points of the most important discoveries or data points
3. **Actions/Recommendations**: Any suggested actions or next steps mentioned
4. **Additional Context**: Any relevant AWS accounts, services, or timeframes mentioned

Keep the summary:
- Professional and easy to understand
- Focused on business impact and actionable insights
- Free of technical jargon where possible
- Formatted in clean Markdown

Summary:`

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    }

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    })

    const response = await bedrock.send(command)
    const responseBody = JSON.parse(new TextDecoder().decode(response.body))

    // Extract the summary text
    const summary = responseBody.content?.[0]?.text || ''

    if (!summary) {
      throw new Error('No summary generated from Bedrock')
    }

    logger.info('[Chat Summary API] Summary generated', {
      threadId,
      summaryLength: summary.length
    })

    return sendSuccess<SummaryResponse>(event, {
      success: true,
      summary
    })

  } catch (error: any) {
    logger.error('[Chat Summary API] Error generating summary:', error)

    return sendSuccess<SummaryResponse>(event, {
      success: false,
      error: error.message || 'Failed to generate summary'
    })
  }
}))
