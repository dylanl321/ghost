/**
 * POST /api/support/query-suggestions
 * Auto-suggest query completions based on partial input
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { invokeBedrock, parseModelJson } from '../../utils/bedrock-client'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'

interface SuggestionRequest {
  partialInput: string
  queryType: 'config' | 'cloudwatch' | 'cloudtrail' | 'discovery'
  context?: {
    environment?: 'commercial' | 'govcloud'
    resourceType?: string
    recentSearches?: string[]
  }
}

interface QuerySuggestion {
  suggestion: string
  description: string
  confidence: number
  category?: string
}

// Common suggestions by query type and context
const STATIC_SUGGESTIONS: Record<string, QuerySuggestion[]> = {
  // Config query suggestions
  'config:instance': [
    { suggestion: 'Find running instances', description: 'EC2 instances in running state', confidence: 95, category: 'inventory' },
    { suggestion: 'Find stopped instances', description: 'EC2 instances in stopped state (potential cost)', confidence: 90, category: 'cost' },
    { suggestion: 'Find large instances', description: 'EC2 instances larger than xlarge', confidence: 85, category: 'cost' }
  ],
  'config:security': [
    { suggestion: 'Find open security groups', description: 'Security groups with 0.0.0.0/0 ingress', confidence: 95, category: 'security' },
    { suggestion: 'Find public S3 buckets', description: 'S3 buckets without public access block', confidence: 90, category: 'security' },
    { suggestion: 'Find unencrypted volumes', description: 'EBS volumes without encryption', confidence: 88, category: 'compliance' }
  ],
  'config:resource': [
    { suggestion: 'List all EC2 instances', description: 'Complete inventory of EC2 instances', confidence: 90, category: 'inventory' },
    { suggestion: 'List all S3 buckets', description: 'Complete inventory of S3 buckets', confidence: 88, category: 'inventory' },
    { suggestion: 'List all RDS databases', description: 'Complete inventory of RDS instances', confidence: 85, category: 'inventory' }
  ],

  // CloudWatch suggestions
  'cloudwatch:error': [
    { suggestion: 'ERROR', description: 'Simple error log search', confidence: 95, category: 'troubleshooting' },
    { suggestion: '"ERROR" OR "Exception"', description: 'Errors and exceptions', confidence: 90, category: 'troubleshooting' },
    { suggestion: '{ $.level = "ERROR" }', description: 'JSON log error level', confidence: 85, category: 'troubleshooting' }
  ],
  'cloudwatch:lambda': [
    { suggestion: '"Task timed out"', description: 'Lambda timeout events', confidence: 95, category: 'performance' },
    { suggestion: '"REPORT"', description: 'Lambda execution reports', confidence: 88, category: 'monitoring' },
    { suggestion: '"cold start"', description: 'Lambda cold start events', confidence: 82, category: 'performance' }
  ],

  // CloudTrail suggestions
  'cloudtrail:login': [
    { suggestion: 'eventName = ConsoleLogin', description: 'AWS Console logins', confidence: 95, category: 'audit' },
    { suggestion: 'eventName = AssumeRole', description: 'Role assumption events', confidence: 90, category: 'audit' }
  ],
  'cloudtrail:security': [
    { suggestion: 'eventSource = iam.amazonaws.com', description: 'All IAM API calls', confidence: 92, category: 'security' },
    { suggestion: "eventName LIKE '%SecurityGroup%'", description: 'Security group modifications', confidence: 88, category: 'security' }
  ],

  // Discovery suggestions
  'discovery:account': [
    { suggestion: 'Find accounts in finance team', description: 'Search accounts by team name', confidence: 85, category: 'discovery' },
    { suggestion: 'Find production accounts', description: 'Search accounts with prod tag/name', confidence: 88, category: 'discovery' }
  ],
  'discovery:resource': [
    { suggestion: 'Find instance running web server', description: 'Search by application name', confidence: 82, category: 'discovery' },
    { suggestion: 'Which account has the database server', description: 'Find account by resource', confidence: 80, category: 'discovery' }
  ]
}

// AI system prompt for generating suggestions
const SUGGESTION_SYSTEM_PROMPT = `You are an AWS query suggestion assistant. Given a partial query input, suggest completions that would be useful for support agents.

Respond with a JSON array of suggestions:
[
  {
    "suggestion": "completed query text",
    "description": "brief description of what it finds",
    "confidence": 75-100,
    "category": "security|cost|compliance|inventory|troubleshooting|audit"
  }
]

Guidelines:
- Suggest practical, commonly needed queries
- For partial AWS Config queries, complete with proper SQL syntax
- For CloudWatch, suggest filter patterns
- For CloudTrail, suggest lookup attributes
- For discovery queries, suggest natural language completions
- Return 3-5 suggestions, ordered by relevance
- ONLY return the JSON array, no other text`

registerEndpoint('/api/support/query-suggestions', 'POST', {
  summary: 'Get query suggestions',
  description: 'Auto-suggest query completions based on partial input with AI assistance',
  tags: ['Support Tools', 'AI'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['partialInput', 'queryType'],
          properties: {
            partialInput: {
              type: 'string',
              description: 'Partial query text to complete',
              maxLength: 200
            },
            queryType: {
              type: 'string',
              enum: ['config', 'cloudwatch', 'cloudtrail', 'discovery'],
              description: 'Type of query being built'
            },
            context: {
              type: 'object',
              properties: {
                environment: { type: 'string', enum: ['commercial', 'govcloud'] },
                resourceType: { type: 'string' },
                recentSearches: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Query suggestions',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  suggestions: { type: 'array' },
                  source: { type: 'string', enum: ['static', 'ai', 'combined'] }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

/**
 * Get relevant static suggestions based on input and context
 */
function getStaticSuggestions(
  partialInput: string,
  queryType: string,
  resourceType?: string
): QuerySuggestion[] {
  const inputLower = partialInput.toLowerCase()
  const suggestions: QuerySuggestion[] = []

  // Determine which suggestion categories to use
  const categories: string[] = []

  // Add by query type
  if (queryType === 'config') {
    if (inputLower.includes('instance') || resourceType?.includes('Instance')) {
      categories.push('config:instance')
    }
    if (inputLower.includes('security') || inputLower.includes('sg') || inputLower.includes('public')) {
      categories.push('config:security')
    }
    if (inputLower.includes('list') || inputLower.includes('all') || inputLower.includes('find')) {
      categories.push('config:resource')
    }
  } else if (queryType === 'cloudwatch') {
    if (inputLower.includes('error') || inputLower.includes('exception')) {
      categories.push('cloudwatch:error')
    }
    if (inputLower.includes('lambda') || inputLower.includes('timeout')) {
      categories.push('cloudwatch:lambda')
    }
  } else if (queryType === 'cloudtrail') {
    if (inputLower.includes('login') || inputLower.includes('console')) {
      categories.push('cloudtrail:login')
    }
    if (inputLower.includes('security') || inputLower.includes('iam')) {
      categories.push('cloudtrail:security')
    }
  } else if (queryType === 'discovery') {
    if (inputLower.includes('account')) {
      categories.push('discovery:account')
    }
    categories.push('discovery:resource')
  }

  // Gather suggestions from relevant categories
  for (const category of categories) {
    const categorySuggestions = STATIC_SUGGESTIONS[category] || []
    suggestions.push(...categorySuggestions)
  }

  // Filter by partial input match
  const filtered = suggestions.filter(s =>
    s.suggestion.toLowerCase().includes(inputLower) ||
    s.description.toLowerCase().includes(inputLower) ||
    inputLower.split(' ').some(word => s.suggestion.toLowerCase().includes(word))
  )

  // Sort by confidence and remove duplicates
  const unique = [...new Map(filtered.map(s => [s.suggestion, s])).values()]
  unique.sort((a, b) => b.confidence - a.confidence)

  return unique.slice(0, 5)
}

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event) as SuggestionRequest

  // Validate request
  if (!body.partialInput || typeof body.partialInput !== 'string') {
    return errors.badRequest(event, 'partialInput is required')
  }

  const partialInput = body.partialInput.trim()
  if (partialInput.length < 2) {
    return errors.badRequest(event, 'partialInput must be at least 2 characters')
  }

  if (partialInput.length > 200) {
    return errors.badRequest(event, 'partialInput exceeds maximum length of 200 characters')
  }

  const validQueryTypes = ['config', 'cloudwatch', 'cloudtrail', 'discovery']
  if (!body.queryType || !validQueryTypes.includes(body.queryType)) {
    return errors.badRequest(event, `queryType must be one of: ${validQueryTypes.join(', ')}`)
  }

  logger.info(`[Query Suggestions] Type: ${body.queryType}, Input: "${partialInput}"`)

  // Get static suggestions first
  const staticSuggestions = getStaticSuggestions(
    partialInput,
    body.queryType,
    body.context?.resourceType
  )

  // If we have enough static suggestions, return them
  if (staticSuggestions.length >= 3) {
    logger.debug(`[Query Suggestions] Returning ${staticSuggestions.length} static suggestions`)
    return sendSuccess(event, {
      suggestions: staticSuggestions,
      source: 'static'
    })
  }

  // Try to get AI suggestions for more complex queries
  try {
    const prompt = `Generate query suggestions for this partial ${body.queryType} query: "${partialInput}"

Context:
- Environment: ${body.context?.environment || 'govcloud'}
- Resource type: ${body.context?.resourceType || 'any'}
- Recent searches: ${body.context?.recentSearches?.slice(0, 3).join(', ') || 'none'}

Generate 3-5 relevant query completions.`

    const aiResponse = await invokeBedrock({
      prompt,
      systemPrompt: SUGGESTION_SYSTEM_PROMPT,
      model: 'claude-sonnet',
      maxTokens: 512,
      temperature: 0.5
    })

    if (aiResponse.success && aiResponse.content) {
      // Parse AI suggestions
      let aiSuggestions: QuerySuggestion[] = []
      try {
        const parsed = parseModelJson<unknown>(aiResponse.content)
        // Drop anything that is not a well-formed suggestion so the sort and
        // de-duplication below cannot throw on model output
        aiSuggestions = Array.isArray(parsed)
          ? parsed.filter((s: any): s is QuerySuggestion => s && typeof s.suggestion === 'string' && typeof s.confidence === 'number')
          : []
      } catch (parseError) {
        logger.warn('[Query Suggestions] Failed to parse AI response')
      }

      // Combine static and AI suggestions
      const combined = [...staticSuggestions, ...aiSuggestions]
      const unique = [...new Map(combined.map(s => [s.suggestion, s])).values()]
      unique.sort((a, b) => b.confidence - a.confidence)

      logger.debug(`[Query Suggestions] Returning ${unique.length} combined suggestions`)
      return sendSuccess(event, {
        suggestions: unique.slice(0, 5),
        source: 'combined'
      })
    }
  } catch (error: any) {
    logger.warn(`[Query Suggestions] AI suggestion failed: ${error.message}`)
  }

  // Fall back to static suggestions
  logger.debug(`[Query Suggestions] Returning ${staticSuggestions.length} static suggestions (fallback)`)
  return sendSuccess(event, {
    suggestions: staticSuggestions,
    source: 'static'
  })
}))
