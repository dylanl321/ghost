/**
 * POST /api/support/ai-account-summary
 * AI-powered account health summary
 *
 * Aggregates data from multiple sources and generates an AI summary
 * of account health, security posture, cost trends, and recommendations.
 */

import { defineEventHandler, readBody } from 'h3'
import { invokeBedrock, parseModelJson } from '../../utils/bedrock-client'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'

interface AccountSummaryRequest {
  accountId: string
  accountName?: string
  environment: 'commercial' | 'govcloud'
  includeCategories?: ('security' | 'cost' | 'compliance' | 'resources' | 'recommendations')[]
}

registerEndpoint('/api/support/ai-account-summary', 'POST', {
  summary: 'AI-powered account health summary',
  description: 'Generate a comprehensive AI summary of account health across security, cost, compliance, and resources',
  tags: ['Support Tools', 'AI'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['accountId', 'environment'],
          properties: {
            accountId: { type: 'string' },
            accountName: { type: 'string' },
            environment: { type: 'string', enum: ['commercial', 'govcloud'] },
            includeCategories: {
              type: 'array',
              items: { type: 'string', enum: ['security', 'cost', 'compliance', 'resources', 'recommendations'] }
            }
          }
        }
      }
    }
  },
  responses: {
    200: { description: 'Account summary' },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

const SUMMARY_SYSTEM_PROMPT = `You are an AWS account health analyst. Given raw data about an AWS account, generate a clear, actionable health summary.

Structure your response as JSON:
{
  "overallHealth": "healthy|warning|critical",
  "healthScore": 0-100,
  "executiveSummary": "2-3 sentence overview",
  "categories": {
    "security": {
      "status": "good|warning|critical",
      "summary": "brief assessment",
      "keyFindings": ["finding 1", "finding 2"],
      "riskLevel": "low|medium|high|critical"
    },
    "cost": {
      "status": "good|warning|critical",
      "summary": "brief assessment",
      "keyFindings": ["finding 1"],
      "trend": "stable|increasing|decreasing|anomalous"
    },
    "compliance": {
      "status": "good|warning|critical",
      "summary": "brief assessment",
      "keyFindings": ["finding 1"],
      "complianceRate": 0-100
    },
    "resources": {
      "status": "good|warning|critical",
      "summary": "brief assessment",
      "keyFindings": ["finding 1"],
      "resourceCount": 0
    }
  },
  "topRecommendations": [
    {
      "priority": "critical|high|medium|low",
      "category": "security|cost|compliance|resources",
      "action": "what to do",
      "impact": "expected benefit",
      "tool": "dashboard tool to use (ip-lookup, instance-health, security-posture, etc.)"
    }
  ],
  "nextSteps": ["step 1", "step 2"]
}

IMPORTANT: Return ONLY valid JSON. Be specific and actionable.`

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event) as AccountSummaryRequest

  if (!body?.accountId || !/^\d{12}$/.test(String(body.accountId))) {
    return errors.badRequest(event, 'accountId must be a 12-digit AWS account ID')
  }

  if (!body.environment || !['commercial', 'govcloud'].includes(body.environment)) {
    return errors.badRequest(event, 'environment must be commercial or govcloud')
  }

  const categories = body.includeCategories || ['security', 'cost', 'compliance', 'resources', 'recommendations']

  logger.info(`[AI Account Summary] Account: ${body.accountId}, Categories: ${categories.join(', ')}`)

  // Gather data from multiple internal endpoints in parallel. event.$fetch
  // forwards the caller's cookies; the global $fetch sent these internal
  // requests without a session, so every one came back 401 and the model only
  // ever saw error objects.
  const dataPromises: Record<string, Promise<any>> = {}

  if (categories.includes('security')) {
    dataPromises.security = event.$fetch('/api/support/security-posture', {
      params: { accountId: body.accountId, environment: body.environment }
    }).catch((err: any) => ({ error: err.message }))
  }

  if (categories.includes('compliance')) {
    dataPromises.compliance = event.$fetch('/api/support/patch-compliance', {
      params: { accountId: body.accountId, environment: body.environment }
    }).catch((err: any) => ({ error: err.message }))
  }

  if (categories.includes('cost') && body.environment === 'commercial') {
    dataPromises.cost = event.$fetch('/api/support/cost-anomalies', {
      params: { accountId: body.accountId, daysBack: 30, environment: 'commercial' }
    }).catch((err: any) => ({ error: err.message }))
  }

  try {
    // Await all data
    const keys = Object.keys(dataPromises)
    const values = await Promise.all(Object.values(dataPromises))
    const gatheredData: Record<string, any> = {}
    keys.forEach((key, i) => { gatheredData[key] = values[i] })

    // Build context for AI
    const dataContext = JSON.stringify(gatheredData, null, 2)

    const prompt = `Analyze this AWS account health data and generate a comprehensive summary:

Account: ${body.accountName || body.accountId}
Account ID: ${body.accountId}
Environment: ${body.environment}

Gathered Data:
${dataContext}

Generate a health summary covering: ${categories.join(', ')}.
Focus on actionable insights and prioritized recommendations.`

    const response = await invokeBedrock({
      prompt,
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      model: 'claude-sonnet',
      maxTokens: 2048,
      temperature: 0.3
    })

    if (!response.success || !response.content) {
      throw new Error(response.error?.message || 'Failed to generate account summary')
    }

    const parsed = parseModelJson(response.content)

    logger.info(`[AI Account Summary] Generated summary: health=${parsed.overallHealth}, score=${parsed.healthScore}`)

    return sendSuccess(event, {
      ...parsed,
      accountId: body.accountId,
      accountName: body.accountName,
      environment: body.environment,
      generatedAt: new Date().toISOString()
    })
  } catch (error: any) {
    logger.error('[AI Account Summary] Error:', error)
    return errors.serverError(event, error.message || 'Failed to generate account summary')
  }
}))
