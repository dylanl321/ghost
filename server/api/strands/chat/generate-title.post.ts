/**
 * POST /api/strands/chat/generate-title
 * Generate a professional document title from conversation content
 * Uses AWS Bedrock Claude for title generation
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { getBedrockRuntimeClient } from '../../../lib/aws-client-factory'

interface TitleRequest {
  conversationText: string
  existingTitle?: string
}

interface TitleResponse {
  success: boolean
  title?: string
  subtitle?: string
  error?: string
}

// Register OpenAPI documentation
registerEndpoint('/api/strands/chat/generate-title', 'POST', {
  summary: 'Generate document title',
  description: 'Generate a professional document title and subtitle from conversation content',
  tags: ['Strands', 'AI', 'Chat'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['conversationText'],
          properties: {
            conversationText: {
              type: 'string',
              description: 'Conversation text to generate title from'
            },
            existingTitle: {
              type: 'string',
              description: 'Existing thread title for context'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Title generated successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              title: { type: 'string' },
              subtitle: { type: 'string' },
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
  const body = await readBody(event) as TitleRequest
  const { conversationText, existingTitle } = body

  if (!conversationText) {
    return errors.badRequest(event, 'conversationText is required')
  }

  logger.info('[Generate Title API] Generating title', {
    textLength: conversationText.length,
    hasExistingTitle: !!existingTitle
  })

  try {
    const bedrock = await getBedrockRuntimeClient('commercial')

    // Use first ~5000 chars for title generation (enough context, fast response)
    const truncatedText = conversationText.substring(0, 5000)

    const prompt = `Based on this conversation, generate a professional document title and subtitle suitable for a business report or analysis document.

## Conversation
${truncatedText}

## Existing Title (for context)
${existingTitle || 'None provided'}

## Instructions
Generate a title and subtitle that:
- Sound professional and suitable for executive-level documents
- Clearly describe what the document is about
- Do NOT mention AI, chatbots, GHOST, or that this came from a conversation
- Focus on the actual subject matter (AWS costs, account analysis, etc.)

Respond in this exact JSON format only, no other text:
{"title": "Your Title Here", "subtitle": "Your subtitle here"}`

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 200,
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

    const responseText = responseBody.content?.[0]?.text || ''

    // Parse JSON response
    let title = 'Analysis Report'
    let subtitle = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    try {
      const parsed = JSON.parse(responseText)
      if (parsed.title) title = parsed.title
      if (parsed.subtitle) subtitle = parsed.subtitle
    } catch {
      // If JSON parsing fails, try to extract title from text
      const titleMatch = responseText.match(/"title":\s*"([^"]+)"/)
      const subtitleMatch = responseText.match(/"subtitle":\s*"([^"]+)"/)
      if (titleMatch) title = titleMatch[1]
      if (subtitleMatch) subtitle = subtitleMatch[1]
    }

    logger.info('[Generate Title API] Title generated', { title, subtitle })

    return sendSuccess<TitleResponse>(event, {
      success: true,
      title,
      subtitle
    })

  } catch (error: any) {
    logger.error('[Generate Title API] Error generating title:', error)

    return sendSuccess<TitleResponse>(event, {
      success: false,
      error: error.message || 'Failed to generate title'
    })
  }
}))
