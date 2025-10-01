/**
 * GET /api/accounts/attributes
 * Get unique attribute values from the accounts DynamoDB table
 *
 * This endpoint analyzes all account records in DynamoDB and returns
 * the unique values for specified attributes, useful for:
 * - Building filter dropdowns/options
 * - Understanding data distribution
 * - Validating input values
 * - Generating reports on account attributes
 */

import { defineEventHandler, getQuery } from 'h3'
import { getAllAccountMetadataFromDynamoDB } from '../../utils/accounts-consolidated'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/attributes', 'GET', {
  summary: 'Get account attribute values',
  description: 'Retrieve unique values for specified attributes from the accounts DynamoDB table',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'attributes',
      in: 'query',
      required: true,
      schema: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 10
      },
      description: 'Comma-separated list of attribute names to get values for (max 10 attributes)'
    },
    {
      name: 'includeNull',
      in: 'query',
      required: false,
      schema: {
        type: 'boolean',
        default: false
      },
      description: 'Include null/undefined values in results (default: false)'
    },
    {
      name: 'sortBy',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['attribute', 'count', 'value'],
        default: 'count'
      },
      description: 'Sort results by: attribute name, value count, or value (default: count)'
    },
    {
      name: 'order',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'desc'
      },
      description: 'Sort order: ascending or descending (default: desc)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: {
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        default: 100
      },
      description: 'Maximum number of values to return per attribute (default: 100)'
    }
  ],
  responses: {
    200: {
      description: 'Unique attribute values from accounts table',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    attribute: { type: 'string' },
                    uniqueValues: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          value: { type: 'string' },
                          count: { type: 'integer' },
                          percentage: { type: 'number' }
                        }
                      }
                    },
                    totalCount: { type: 'integer' },
                    uniqueCount: { type: 'integer' },
                    nullCount: { type: 'integer' }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  requestedAttributes: { type: 'array', items: { type: 'string' } },
                  includeNull: { type: 'boolean' },
                  sortBy: { type: 'string' },
                  order: { type: 'string' },
                  limit: { type: 'integer' },
                  totalAccounts: { type: 'integer' },
                  processingTimeMs: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid request parameters'
    },
    500: {
      description: 'Server error'
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const startTime = Date.now()

  // Parse and validate query parameters
  const attributesParam = query.attributes
  if (!attributesParam) {
    return errors.badRequest(event, 'attributes parameter is required')
  }

  // Handle both single string (comma-separated) and array (multiple parameters)
  let attributes: string[]
  if (Array.isArray(attributesParam)) {
    attributes = attributesParam.map(attr => String(attr).trim()).filter(attr => attr.length > 0)
  } else {
    attributes = String(attributesParam).split(',').map(attr => attr.trim()).filter(attr => attr.length > 0)
  }
  if (attributes.length === 0) {
    return errors.badRequest(event, 'At least one valid attribute name is required')
  }

  if (attributes.length > 10) {
    return errors.badRequest(event, 'Maximum 10 attributes allowed per request')
  }

  const includeNull = query.includeNull === 'true' || query.includeNull === true
  const sortBy = (query.sortBy as string) || 'count'
  const order = (query.order as string) || 'desc'
  const limit = Math.min(parseInt(query.limit as string) || 100, 1000)

  try {
    // Fetch all account metadata from DynamoDB
    const accounts = await getAllAccountMetadataFromDynamoDB()

    if (!accounts || accounts.length === 0) {
      return errors.notFound(event, 'No account data found in DynamoDB')
    }

    const result: Record<string, any> = {}
    const totalAccounts = accounts.length

    // Process each requested attribute
    for (const attribute of attributes) {
      const valueMap = new Map<string | null, number>()

      // Count occurrences of each value for this attribute
      accounts.forEach(account => {
        let value = account[attribute]

        // Handle different data types and null/undefined values
        if (value === null || value === undefined || value === '') {
          if (includeNull) {
            const nullKey = null
            valueMap.set(nullKey, (valueMap.get(nullKey) || 0) + 1)
          }
          return
        }

        // Convert to string for consistent grouping
        const stringValue = String(value)
        valueMap.set(stringValue, (valueMap.get(stringValue) || 0) + 1)
      })

      // Convert to array format
      const uniqueValues = Array.from(valueMap.entries())
        .map(([value, count]) => ({
          value: value === null ? null : value,
          count,
          percentage: Math.round((count / totalAccounts) * 100 * 100) / 100 // Round to 2 decimal places
        }))

      // Sort results based on sortBy parameter
      uniqueValues.sort((a, b) => {
        let comparison = 0

        switch (sortBy) {
          case 'value':
            const aVal = a.value === null ? '' : String(a.value)
            const bVal = b.value === null ? '' : String(b.value)
            comparison = aVal.localeCompare(bVal)
            break
          case 'attribute':
            // For single attribute, this is always the same
            comparison = 0
            break
          case 'count':
          default:
            comparison = b.count - a.count // Default: sort by count descending
            break
        }

        return order === 'asc' ? comparison : -comparison
      })

      // Apply limit
      const limitedValues = uniqueValues.slice(0, limit)
      const nullCount = valueMap.get(null) || 0

      result[attribute] = {
        attribute,
        uniqueValues: limitedValues,
        totalCount: uniqueValues.reduce((sum, item) => sum + item.count, 0),
        uniqueCount: uniqueValues.length,
        nullCount
      }
    }

    const processingTimeMs = Date.now() - startTime

    const metadata = {
      requestedAttributes: attributes,
      includeNull,
      sortBy,
      order,
      limit,
      totalAccounts,
      processingTimeMs
    }

    return sendSuccess(event, result, metadata)
  } catch (error) {
    console.error('Error retrieving account attributes:', error)
    return errors.serverError(event, 'Failed to retrieve account attributes')
  }
}))
