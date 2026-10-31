/**
 * GET /api/accounts/attribute-names
 * Get all available attribute names from the accounts DynamoDB table
 *
 * This endpoint analyzes the DynamoDB table structure and returns
 * all attribute names that exist across all account records.
 * Useful for discovering available attributes for filtering and reporting.
 */

import { defineEventHandler, getQuery } from 'h3'
import { getAllAccountMetadataFromDynamoDB } from '../../utils/accounts-consolidated'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/attribute-names', 'GET', {
  summary: 'Get account attribute names',
  description: 'Retrieve all available attribute names from the accounts DynamoDB table',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'includeStats',
      in: 'query',
      required: false,
      schema: {
        type: 'boolean',
        default: false
      },
      description: 'Include statistics about each attribute (default: false)'
    },
    {
      name: 'minCoverage',
      in: 'query',
      required: false,
      schema: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        default: 0
      },
      description: 'Minimum coverage percentage (0-100) to include attribute (default: 0 - include all)'
    },
    {
      name: 'sortBy',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['name', 'coverage', 'populated'],
        default: 'name'
      },
      description: 'Sort by: name, coverage percentage, or populated count (default: name)'
    },
    {
      name: 'order',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'asc'
      },
      description: 'Sort order: ascending or descending (default: asc)'
    }
  ],
  responses: {
    200: {
      description: 'Available attribute names from accounts table',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                oneOf: [
                  {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Simple array of attribute names when includeStats=false'
                  },
                  {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        populatedCount: { type: 'integer' },
                        coveragePercentage: { type: 'number' },
                        dataTypes: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    description: 'Detailed statistics when includeStats=true'
                  }
                ]
              },
              metadata: {
                type: 'object',
                properties: {
                  totalAttributes: { type: 'integer' },
                  totalAccounts: { type: 'integer' },
                  minCoverage: { type: 'number' },
                  includeStats: { type: 'boolean' },
                  sortBy: { type: 'string' },
                  order: { type: 'string' },
                  processingTimeMs: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    500: {
      description: 'Server error'
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const startTime = Date.now()

  const includeStats = query.includeStats === 'true' || query.includeStats === true
  const minCoverage = Math.min(Math.max(parseFloat(query.minCoverage as string) || 0, 0), 100)
  const sortBy = (query.sortBy as string) || 'name'
  const order = (query.order as string) || 'asc'

  try {
    // Fetch all account metadata from DynamoDB
    const accounts = await getAllAccountMetadataFromDynamoDB()

    if (!accounts || accounts.length === 0) {
      return errors.notFound(event, 'No account data found in DynamoDB')
    }

    const totalAccounts = accounts.length
    const attributeStats = new Map<string, {
      populatedCount: number
      dataTypes: Set<string>
    }>()

    // Analyze all attributes across all accounts
    accounts.forEach(account => {
      Object.keys(account).forEach(key => {
        const value = account[key]
        const existing = attributeStats.get(key) || { populatedCount: 0, dataTypes: new Set() }

        // Count populated values (not null, undefined, or empty string)
        if (value !== null && value !== undefined && value !== '') {
          existing.populatedCount++
        }

        // Track data types
        const dataType = value === null || value === undefined ? 'null' : typeof value
        existing.dataTypes.add(dataType)

        attributeStats.set(key, existing)
      })
    })

    // Convert to array and calculate coverage
    let attributeList = Array.from(attributeStats.entries())
      .map(([name, stats]) => ({
        name,
        populatedCount: stats.populatedCount,
        coveragePercentage: Math.round((stats.populatedCount / totalAccounts) * 100 * 100) / 100,
        dataTypes: Array.from(stats.dataTypes).sort()
      }))

    // Apply minimum coverage filter
    if (minCoverage > 0) {
      attributeList = attributeList.filter(attr => attr.coveragePercentage >= minCoverage)
    }

    // Each comparison is ascending; order=desc reverses it.
    attributeList.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'coverage':
          comparison = a.coveragePercentage - b.coveragePercentage
          break
        case 'populated':
          comparison = a.populatedCount - b.populatedCount
          break
        case 'name':
        default:
          comparison = a.name.localeCompare(b.name)
          break
      }

      return order === 'asc' ? comparison : -comparison
    })

    const processingTimeMs = Date.now() - startTime

    const metadata = {
      totalAttributes: attributeList.length,
      totalAccounts,
      minCoverage,
      includeStats,
      sortBy,
      order,
      processingTimeMs
    }

    // Return appropriate format based on includeStats parameter
    const data = includeStats
      ? attributeList
      : attributeList.map(attr => attr.name)

    return sendSuccess(event, data, metadata)
  } catch (error) {
    logger.error('Error retrieving account attribute names:', error)
    return errors.serverError(event, 'Failed to retrieve account attribute names')
  }
}))
