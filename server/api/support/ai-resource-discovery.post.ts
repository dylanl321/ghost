/**
 * POST /api/support/ai-resource-discovery
 * AI-powered resource discovery from natural language queries
 *
 * Accepts queries like:
 * - "find the instance running payment service"
 * - "show me prod instances in finance team's account"
 * - "which account has the webapp server"
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { queryResources } from '../../utils/config-service'
import { fuzzySearchAccounts, calculateRelevanceScore } from '../../utils/fuzzy-search'
import { invokeBedrock } from '../../utils/bedrock-client'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'

interface DiscoveryRequest {
  query: string
  environment: AWSEnvironmentType
  searchTypes?: ('accounts' | 'instances' | 'resources')[]
  limit?: number
}

interface DiscoveryResult {
  type: 'account' | 'instance' | 'resource'
  id: string
  name: string
  confidence: number
  matchReason: string
  details: Record<string, any>
}

interface DiscoveryResponse {
  results: DiscoveryResult[]
  confidence: number
  searchStrategy: string
  suggestions: string[]
  originalQuery: string
  parsedIntent: {
    action: string
    targets: string[]
    filters: Record<string, string>
  }
}

// System prompt for resource discovery
const DISCOVERY_SYSTEM_PROMPT = `You are an AWS resource discovery assistant. Your job is to parse natural language queries and extract search parameters.

Given a user query, extract:
1. The type of resource they're looking for (account, instance, resource)
2. Key search terms (names, IDs, partial matches)
3. Any filters (environment tags, account names, regions)

Common patterns:
- "find the instance running X" → looking for instance with name/tag containing X
- "show me Y instances in Z account" → instances filtered by account name Z, with tag Y
- "which account has X" → account search with name containing X
- "find resources tagged as X" → resources with specific tag value

Respond with a JSON object:
{
  "intent": {
    "action": "find|list|describe",
    "primaryTarget": "account|instance|resource",
    "searchTerms": ["term1", "term2"],
    "filters": {
      "accountName": "optional account name filter",
      "environment": "prod|dev|test if mentioned",
      "region": "region if mentioned",
      "resourceType": "specific resource type if mentioned"
    }
  },
  "configQuery": "AWS Config SQL query if resource/instance search needed",
  "explanation": "Brief explanation of how you interpreted the query"
}

Important:
- Always try to extract useful search terms even from vague queries
- If the query mentions production/prod, development/dev, or test, note it as environment filter
- Return ONLY valid JSON, no additional text`

registerEndpoint('/api/support/ai-resource-discovery', 'POST', {
  summary: 'AI-powered resource discovery',
  description: 'Use natural language to find AWS accounts, instances, and resources',
  tags: ['Support Tools', 'AI'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['query'],
          properties: {
            query: {
              type: 'string',
              description: 'Natural language query describing what to find',
              maxLength: 500
            },
            environment: {
              type: 'string',
              enum: ['commercial', 'govcloud'],
              description: 'AWS environment to search (default: govcloud)'
            },
            searchTypes: {
              type: 'array',
              items: { type: 'string', enum: ['accounts', 'instances', 'resources'] },
              description: 'Types of resources to search'
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'Maximum results to return (default: 10)'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Discovery results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  results: { type: 'array' },
                  confidence: { type: 'number' },
                  searchStrategy: { type: 'string' },
                  suggestions: { type: 'array', items: { type: 'string' } }
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

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event) as DiscoveryRequest

  // Validate request
  if (!body.query || typeof body.query !== 'string') {
    return errors.badRequest(event, 'Query is required')
  }

  const query = body.query.trim()
  if (query.length < 3) {
    return errors.badRequest(event, 'Query must be at least 3 characters')
  }

  if (query.length > 500) {
    return errors.badRequest(event, 'Query exceeds maximum length of 500 characters')
  }

  const environment = body.environment || 'govcloud'
  const searchTypes = body.searchTypes || ['accounts', 'instances', 'resources']
  const limit = Math.min(body.limit || 10, 50)

  logger.info(`[AI Discovery] Query: "${query}", Environment: ${environment}`)

  try {
    // Step 1: Use AI to parse the query
    const aiResponse = await invokeBedrock({
      prompt: `Parse this resource discovery query: "${query}"`,
      systemPrompt: DISCOVERY_SYSTEM_PROMPT,
      model: 'claude-sonnet',
      maxTokens: 1024,
      temperature: 0.3
    })

    if (!aiResponse.success || !aiResponse.content) {
      logger.error('[AI Discovery] AI parsing failed:', aiResponse.error)
      throw new Error(aiResponse.error?.message || 'Failed to parse query')
    }

    // Parse AI response
    let parsedIntent: any
    try {
      let content = aiResponse.content.trim()
      // Remove markdown code blocks if present
      if (content.startsWith('```json')) content = content.slice(7)
      if (content.startsWith('```')) content = content.slice(3)
      if (content.endsWith('```')) content = content.slice(0, -3)
      content = content.trim()

      parsedIntent = JSON.parse(content)
    } catch (parseError) {
      logger.error('[AI Discovery] Failed to parse AI response:', aiResponse.content)
      // Fall back to basic keyword extraction
      parsedIntent = {
        intent: {
          action: 'find',
          primaryTarget: 'resource',
          searchTerms: query.split(/\s+/).filter(t => t.length > 2),
          filters: {}
        },
        explanation: 'Fallback to keyword extraction'
      }
    }

    logger.debug('[AI Discovery] Parsed intent:', parsedIntent)

    const results: DiscoveryResult[] = []
    const suggestions: string[] = []

    // Step 2: Execute searches based on parsed intent
    const intent = parsedIntent.intent || parsedIntent
    const searchTerms = intent.searchTerms || [query]
    const primarySearchTerm = searchTerms.join(' ')

    // Search accounts if relevant
    if (searchTypes.includes('accounts') &&
        (intent.primaryTarget === 'account' || intent.filters?.accountName)) {
      const accounts = await getAllAccountsUnified(false)

      // Use fuzzy search for accounts
      const accountSearchTerm = intent.filters?.accountName || primarySearchTerm
      const fuzzyResults = await fuzzySearchAccounts(accountSearchTerm, accounts, limit)

      for (const result of fuzzyResults) {
        const account = result.item
        const relevance = calculateRelevanceScore(result.score)

        results.push({
          type: 'account',
          id: account.accountId || account.awsStandardAccountID || '',
          name: account.name || account.projectName || 'Unknown',
          confidence: relevance,
          matchReason: `Matched "${result.matches?.[0]?.key}": "${result.matches?.[0]?.value}"`,
          details: {
            email: account.email || account.awsAccountEmail,
            govCloudAccountId: account.govCloudAccountId || account.awsGovCloudAccountID,
            status: account.status || account.enclaveStatus
          }
        })
      }
    }

    // Search instances/resources if relevant
    if (searchTypes.includes('instances') || searchTypes.includes('resources')) {
      const aggregatorName = environment === 'commercial'
        ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'CommercialAggregator')
        : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')

      // Build Config query based on parsed intent
      let configQuery = parsedIntent.configQuery

      if (!configQuery) {
        // Generate a Config query based on search terms
        const resourceType = intent.filters?.resourceType || 'AWS::EC2::Instance'
        const tagConditions = searchTerms.map((term: string) =>
          `tags.value LIKE '%${term}%'`
        ).join(' OR ')

        configQuery = `
          SELECT
            resourceId,
            resourceType,
            resourceName,
            accountId,
            awsRegion,
            configuration,
            tags
          WHERE resourceType = '${resourceType}'
            AND (${tagConditions} OR resourceName LIKE '%${primarySearchTerm}%')
        `.trim()
      }

      try {
        logger.debug('[AI Discovery] Executing Config query:', configQuery)
        const configResults = await queryResources(aggregatorName, configQuery, environment, undefined, limit * 2)

        for (const result of configResults.results) {
          const parsed = JSON.parse(result)
          const config = typeof parsed.configuration === 'string'
            ? JSON.parse(parsed.configuration)
            : parsed.configuration
          const tags = typeof parsed.tags === 'string'
            ? JSON.parse(parsed.tags)
            : parsed.tags

          // Convert tags array to object
          const tagsObj: Record<string, string> = {}
          if (Array.isArray(tags)) {
            tags.forEach((tag: any) => {
              if (tag.key && tag.value !== undefined) {
                tagsObj[tag.key] = tag.value
              }
            })
          }

          // Calculate confidence based on how well it matches search terms
          let confidence = 50 // Base confidence
          const nameLower = (tagsObj.Name || parsed.resourceName || '').toLowerCase()
          for (const term of searchTerms) {
            const termLower = term.toLowerCase()
            if (nameLower.includes(termLower)) {
              confidence += 25
            }
            // Check tags for matches
            for (const [, value] of Object.entries(tagsObj)) {
              if (value.toLowerCase().includes(termLower)) {
                confidence += 15
              }
            }
          }
          confidence = Math.min(confidence, 100)

          const isInstance = parsed.resourceType === 'AWS::EC2::Instance'
          results.push({
            type: isInstance ? 'instance' : 'resource',
            id: parsed.resourceId,
            name: tagsObj.Name || parsed.resourceName || parsed.resourceId,
            confidence,
            matchReason: `Found via Config query matching "${primarySearchTerm}"`,
            details: {
              resourceType: parsed.resourceType?.split('::').pop(),
              accountId: parsed.accountId,
              region: parsed.awsRegion,
              ...(isInstance && {
                instanceType: config?.instanceType,
                state: config?.state?.name || config?.state,
                privateIp: config?.privateIpAddress,
                publicIp: config?.publicIpAddress
              }),
              tags: tagsObj
            }
          })
        }
      } catch (queryError: any) {
        logger.warn('[AI Discovery] Config query failed:', queryError.message)
        suggestions.push('Try a more specific search term or different resource type')
      }
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence)

    // Limit results
    const limitedResults = results.slice(0, limit)

    // Calculate overall confidence
    const overallConfidence = limitedResults.length > 0
      ? Math.round(limitedResults.reduce((sum, r) => sum + r.confidence, 0) / limitedResults.length)
      : 0

    // Generate suggestions if few results
    if (limitedResults.length < 3) {
      suggestions.push(`Try searching for "${searchTerms[0]}" in a different category`)
      if (!query.includes('prod') && !query.includes('dev')) {
        suggestions.push('Add environment hints like "production" or "development"')
      }
    }

    const response: DiscoveryResponse = {
      results: limitedResults,
      confidence: overallConfidence,
      searchStrategy: parsedIntent.explanation || 'AI-assisted fuzzy matching',
      suggestions,
      originalQuery: query,
      parsedIntent: {
        action: intent.action || 'find',
        targets: searchTerms,
        filters: intent.filters || {}
      }
    }

    logger.info(`[AI Discovery] Found ${limitedResults.length} results with ${overallConfidence}% confidence`)

    return sendSuccess(event, response)

  } catch (error: any) {
    logger.error('[AI Discovery] Error:', error)

    if (error.message?.includes('Failed to parse')) {
      return errors.serverError(event, 'AI could not understand the query. Please try rephrasing.')
    }

    return errors.serverError(event, error.message || 'Failed to execute resource discovery')
  }
}))
