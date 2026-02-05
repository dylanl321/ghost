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

    const prompt = `You are creating a detailed document from a conversation between a user and GHOST, an AI assistant for AWS operations. This document will be shared with stakeholders.

## Conversation
${truncatedText}

## Instructions
Create a comprehensive, well-structured document using proper Markdown headers (##) for sections.

IMPORTANT: Preserve important details - do NOT over-summarize!
- If the conversation contains specific numbers, costs, percentages, or metrics - INCLUDE THEM
- If there are tables or data breakdowns - reproduce them or present the key data points
- If there are specific account names, service names, or dates - INCLUDE THEM
- For shorter conversations: include nearly all the substantive content
- For longer conversations: prioritize data, findings, and actionable insights but still be thorough

Use this structure (adapt sections based on content):

## Overview
Brief description of what was analyzed or discussed.

## Key Data & Findings
Present the important data points, metrics, and discoveries. Include:
- Specific numbers and percentages
- Cost figures with breakdowns if available
- Service/resource details
- Comparisons or trends mentioned

## Analysis
Deeper insights, patterns, or explanations from the conversation.

## Recommendations
Specific suggested actions or next steps, if any were discussed.

## Additional Context
- Relevant AWS accounts, services, regions, or timeframes
- Any caveats or limitations mentioned

Requirements:
- Use ## for section headers (not bold text like **Header**)
- Use bullet points (-) for lists
- Include specific data points and metrics - these are valuable
- Use tables (markdown format) if presenting comparative data
- Keep language professional but preserve technical details that matter
- Do NOT use emojis
- Omit sections that don't apply (e.g., skip Recommendations if none were discussed)

Document:`

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4000,
      temperature: 0.2,
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
