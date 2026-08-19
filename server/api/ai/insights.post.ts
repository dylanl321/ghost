/**
 * POST /api/ai/insights
 * Generate AI-powered static insights for dashboard cards
 */

import { defineEventHandler, readBody } from 'h3'
import { invokeBedrock } from '../../utils/bedrock-client'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { insightPrompts } from '../../utils/ai-insight-prompts'
import { insightCache, CacheManager } from '../../utils/cache-manager'
import { logger } from '../../utils/logger'

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

  const promptConfig = insightPrompts[body.type]
  if (!promptConfig) {
    return errors.badRequest(event, `Unknown insight type: ${body.type}. Available: ${Object.keys(insightPrompts).join(', ')}`)
  }

  const context = body.context || {}
  const cacheKey = CacheManager.generateKey(`insight:${body.type}`, context)
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

  // Build prompt and call Bedrock
  const prompt = promptConfig.buildPrompt(context)

  logger.info(`[AI Insights] Generating "${body.type}" insight (${prompt.length} chars)`)

  const result = await invokeBedrock({
    prompt,
    systemPrompt: promptConfig.systemPrompt,
    model: 'claude-sonnet',
    temperature: 0.3,
    maxTokens: 120
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
