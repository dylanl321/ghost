/**
 * POST /api/ai/insights
 * Generate AI-powered static insights for dashboard cards
 */

import { createHash } from 'node:crypto'
import { defineEventHandler, readBody } from 'h3'
import { invokeBedrock } from '../../utils/bedrock-client'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { insightPrompts } from '../../utils/ai-insight-prompts'
import { insightCache } from '../../utils/cache-manager'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'

registerEndpoint('/api/ai/insights', 'POST', {
  summary: 'Generate a bounded AI insight',
  description: 'Generate dashboard insights or cost-report-analysis for PDF exports.',
  tags: ['AI'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: Object.keys(insightPrompts) },
            context: { type: 'object', additionalProperties: true },
            refresh: { type: 'boolean' }
          }
        }
      }
    }
  },
  responses: {
    200: { description: 'Insight returned in data.insight' },
    400: { description: 'Missing or unknown insight type' },
    500: { description: 'Insight generation failed' }
  }
})

// The cards send a few summary numbers; anything far larger is not a real request.
const MAX_CONTEXT_BYTES = 16 * 1024

interface InsightRequest {
  type: string
  context: Record<string, any>
  refresh?: boolean
}

export default handleAsync(defineEventHandler(async (event) => {
  const body = await readBody<InsightRequest>(event)

  if (!body?.type) {
    return errors.badRequest(event, 'Missing required field: type')
  }

  const promptConfig = Object.hasOwn(insightPrompts, body.type) ? insightPrompts[body.type] : undefined
  if (!promptConfig) {
    return errors.badRequest(event, `Unknown insight type: ${body.type}. Available: ${Object.keys(insightPrompts).join(', ')}`)
  }

  const context = body.context ?? {}
  if (typeof context !== 'object' || Array.isArray(context)) {
    return errors.badRequest(event, 'context must be an object')
  }
  const contextJson = JSON.stringify(context)
  if (Buffer.byteLength(contextJson) > MAX_CONTEXT_BYTES) {
    return errors.badRequest(event, `context must be under ${MAX_CONTEXT_BYTES} bytes`)
  }

  // Build the prompt first: the builders format numbers, so a malformed context fails here as a 400
  let prompt: string
  try {
    prompt = promptConfig.buildPrompt(context)
  } catch (error) {
    logger.warn(`[AI Insights] Invalid context for "${body.type}": ${error instanceof Error ? error.message : String(error)}`)
    return errors.badRequest(event, `Invalid context for insight type ${body.type}`)
  }

  const cacheKey = `insight:${body.type}:${createHash('sha256').update(contextJson).digest('hex')}`
  const ttl = promptConfig.ttl || 1800

  // Check cache unless refresh requested
  if (!body.refresh) {
    const cached = await insightCache.get<{ insight: string; generatedAt: string }>(cacheKey)
    if (cached) {
      return sendSuccess(event, {
        insight: cached.insight,
        cached: true,
        generatedAt: cached.generatedAt
      })
    }
  }

  logger.info(`[AI Insights] Generating "${body.type}" insight (${prompt.length} chars)`)

  const result = await invokeBedrock({
    prompt,
    systemPrompt: promptConfig.systemPrompt,
    model: 'claude-sonnet',
    temperature: 0.3,
    maxTokens: promptConfig.maxTokens ?? 120
  })

  if (!result.success || !result.content) {
    logger.error(`[AI Insights] Bedrock failed for "${body.type}":`, result.error)
    return errors.serverError(event, 'AI insight generation failed. Please try again later.')
  }

  const generatedAt = new Date().toISOString()

  // Cache the result
  await insightCache.set(cacheKey, { insight: result.content, generatedAt }, { ttl })

  return sendSuccess(event, {
    insight: result.content,
    cached: false,
    generatedAt
  }, {
    model: result.model,
    tokens: { input: result.inputTokens, output: result.outputTokens },
    processingTime: result.processingTime
  })
}))
