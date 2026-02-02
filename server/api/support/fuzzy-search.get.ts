/**
 * GET /api/support/fuzzy-search
 * Unified fuzzy search across accounts, instances, and resources
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { queryResources } from '../../utils/config-service'
import {
  fuzzySearchAccounts,
  fuzzySearchResources,
  calculateRelevanceScore,
  highlightMatches
} from '../../utils/fuzzy-search'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'

interface FuzzySearchResultItem {
  type: 'account' | 'instance' | 'resource'
  id: string
  name: string
  relevanceScore: number
  matchedField?: string
  matchedValue?: string
  highlights?: string[]
  metadata: Record<string, any>
}

registerEndpoint('/api/support/fuzzy-search', 'GET', {
  summary: 'Fuzzy search across accounts and resources',
  description: 'Search accounts, instances, and resources using fuzzy matching with typo tolerance and relevance ranking',
  tags: ['Support Tools'],
  parameters: [
    {
      name: 'query',
      in: 'query',
      required: true,
      schema: { type: 'string', minLength: 2, maxLength: 200 },
      description: 'Search query (supports partial matches and typos)'
    },
    {
      name: 'types',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of types to search: accounts, instances, resources (default: all)'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment for resource search (default: govcloud)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100 },
      description: 'Maximum results per type (default: 20)'
    }
  ],
  responses: {
    200: {
      description: 'Fuzzy search results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  results: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['account', 'instance', 'resource'] },
                        id: { type: 'string' },
                        name: { type: 'string' },
                        relevanceScore: { type: 'number' },
                        matchedField: { type: 'string' },
                        metadata: { type: 'object' }
                      }
                    }
                  },
                  totalResults: { type: 'number' },
                  searchTime: { type: 'number' }
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
  const queryParams = getQuery(event)
  const query = (queryParams.query as string)?.trim()
  const typesParam = (queryParams.types as string) || 'accounts,instances,resources'
  const environment = (queryParams.environment as AWSEnvironmentType) || 'govcloud'
  const limit = Math.min(parseInt(queryParams.limit as string) || 20, 100)

  // Validate query
  if (!query) {
    return errors.badRequest(event, 'Query parameter is required')
  }

  if (query.length < 2) {
    return errors.badRequest(event, 'Query must be at least 2 characters')
  }

  if (query.length > 200) {
    return errors.badRequest(event, 'Query exceeds maximum length of 200 characters')
  }

  // Validate environment
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  // Parse search types
  const validTypes = ['accounts', 'instances', 'resources']
  const searchTypes = typesParam
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => validTypes.includes(t))

  if (searchTypes.length === 0) {
    return errors.badRequest(event, 'At least one valid type must be specified (accounts, instances, resources)')
  }

  logger.info(`[Fuzzy Search] Query: "${query}", Types: ${searchTypes.join(',')}, Environment: ${environment}`)

  const startTime = Date.now()
  const results: FuzzySearchResultItem[] = []

  try {
    // Search accounts if requested
    if (searchTypes.includes('accounts')) {
      const accounts = await getAllAccountsUnified(false)
      const accountResults = await fuzzySearchAccounts(query, accounts, limit)

      for (const result of accountResults) {
        const account = result.item
        const matchInfo = result.matches?.[0]

        results.push({
          type: 'account',
          id: account.accountId || account.awsStandardAccountID || '',
          name: account.name || account.projectName || 'Unknown',
          relevanceScore: calculateRelevanceScore(result.score),
          matchedField: matchInfo?.key,
          matchedValue: matchInfo?.value,
          highlights: matchInfo ? [highlightMatches(matchInfo.value, matchInfo.indices)] : undefined,
          metadata: {
            email: account.email || account.awsAccountEmail,
            govCloudAccountId: account.govCloudAccountId || account.awsGovCloudAccountID,
            status: account.status || account.enclaveStatus,
            source: account.source
          }
        })
      }

      logger.debug(`[Fuzzy Search] Found ${accountResults.length} accounts`)
    }

    // Search instances if requested
    if (searchTypes.includes('instances')) {
      const aggregatorName = environment === 'commercial'
        ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'CommercialAggregator')
        : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')

      try {
        // Query EC2 instances from AWS Config
        const instanceQuery = `
          SELECT
            resourceId,
            resourceType,
            resourceName,
            accountId,
            awsRegion,
            configuration,
            tags
          WHERE resourceType = 'AWS::EC2::Instance'
        `.trim()

        const instanceResults = await queryResources(aggregatorName, instanceQuery, environment, undefined, 200)

        // Parse results into resource format
        const instances = instanceResults.results.map(result => {
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

          return {
            resourceId: parsed.resourceId,
            resourceType: parsed.resourceType,
            resourceName: tagsObj.Name || parsed.resourceName,
            accountId: parsed.accountId,
            region: parsed.awsRegion,
            tags: tagsObj,
            configuration: config
          }
        })

        // Fuzzy search instances
        const fuzzyInstanceResults = await fuzzySearchResources(query, instances, limit)

        for (const result of fuzzyInstanceResults) {
          const instance = result.item
          const matchInfo = result.matches?.[0]

          results.push({
            type: 'instance',
            id: instance.resourceId,
            name: instance.resourceName || instance.resourceId,
            relevanceScore: calculateRelevanceScore(result.score),
            matchedField: matchInfo?.key,
            matchedValue: matchInfo?.value,
            highlights: matchInfo ? [highlightMatches(matchInfo.value, matchInfo.indices)] : undefined,
            metadata: {
              accountId: instance.accountId,
              region: instance.region,
              instanceType: instance.configuration?.instanceType,
              state: instance.configuration?.state?.name || instance.configuration?.state,
              privateIp: instance.configuration?.privateIpAddress,
              publicIp: instance.configuration?.publicIpAddress,
              tags: instance.tags
            }
          })
        }

        logger.debug(`[Fuzzy Search] Found ${fuzzyInstanceResults.length} instances`)
      } catch (error: any) {
        logger.warn(`[Fuzzy Search] Instance search failed: ${error.message}`)
        // Continue with other searches
      }
    }

    // Search resources if requested (broader than just instances)
    if (searchTypes.includes('resources')) {
      const aggregatorName = environment === 'commercial'
        ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'CommercialAggregator')
        : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')

      try {
        // Query multiple resource types
        const resourceQuery = `
          SELECT
            resourceId,
            resourceType,
            resourceName,
            accountId,
            awsRegion,
            tags
          WHERE resourceType IN (
            'AWS::EC2::SecurityGroup',
            'AWS::S3::Bucket',
            'AWS::Lambda::Function',
            'AWS::EC2::NetworkInterface',
            'AWS::RDS::DBInstance',
            'AWS::IAM::Role'
          )
        `.trim()

        const resourceResults = await queryResources(aggregatorName, resourceQuery, environment, undefined, 200)

        const resources = resourceResults.results.map(result => {
          const parsed = JSON.parse(result)
          const tags = typeof parsed.tags === 'string'
            ? JSON.parse(parsed.tags)
            : parsed.tags

          const tagsObj: Record<string, string> = {}
          if (Array.isArray(tags)) {
            tags.forEach((tag: any) => {
              if (tag.key && tag.value !== undefined) {
                tagsObj[tag.key] = tag.value
              }
            })
          }

          return {
            resourceId: parsed.resourceId,
            resourceType: parsed.resourceType,
            resourceName: tagsObj.Name || parsed.resourceName,
            accountId: parsed.accountId,
            region: parsed.awsRegion,
            tags: tagsObj
          }
        })

        // Fuzzy search resources
        const fuzzyResourceResults = await fuzzySearchResources(query, resources, limit)

        for (const result of fuzzyResourceResults) {
          const resource = result.item
          const matchInfo = result.matches?.[0]

          // Don't add instances again if already searched
          if (searchTypes.includes('instances') && resource.resourceType === 'AWS::EC2::Instance') {
            continue
          }

          results.push({
            type: 'resource',
            id: resource.resourceId,
            name: resource.resourceName || resource.resourceId,
            relevanceScore: calculateRelevanceScore(result.score),
            matchedField: matchInfo?.key,
            matchedValue: matchInfo?.value,
            highlights: matchInfo ? [highlightMatches(matchInfo.value, matchInfo.indices)] : undefined,
            metadata: {
              resourceType: resource.resourceType?.split('::').pop(),
              accountId: resource.accountId,
              region: resource.region,
              tags: resource.tags
            }
          })
        }

        logger.debug(`[Fuzzy Search] Found ${fuzzyResourceResults.length} resources`)
      } catch (error: any) {
        logger.warn(`[Fuzzy Search] Resource search failed: ${error.message}`)
        // Continue with results from other searches
      }
    }

    // Sort all results by relevance score (highest first)
    results.sort((a, b) => b.relevanceScore - a.relevanceScore)

    // Limit total results
    const limitedResults = results.slice(0, limit * searchTypes.length)

    const searchTime = Date.now() - startTime

    logger.info(`[Fuzzy Search] Completed in ${searchTime}ms with ${limitedResults.length} results`)

    return sendSuccess(event, {
      query,
      results: limitedResults,
      totalResults: limitedResults.length,
      searchTime,
      searchTypes
    })

  } catch (error: any) {
    logger.error('[Fuzzy Search] Error:', error)
    return errors.serverError(event, error.message || 'Failed to perform fuzzy search')
  }
}))
