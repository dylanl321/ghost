/**
 * GET /api/security-lake/queries
 * 
 * List available Security Lake stored queries
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { 
  STORED_QUERIES, 
  getStoredQuery, 
  getQueriesByCategory 
} from '../../utils/security-lake'

// Register OpenAPI documentation
registerEndpoint('/api/security-lake/queries', 'GET', {
  summary: 'List Security Lake queries',
  description: 'Get available stored queries for Security Lake data',
  tags: ['Security Lake'],
  parameters: [
    {
      name: 'category',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['cloudtrail', 'securityhub', 'vpcflow', 'dns', 's3']
      },
      description: 'Filter by data source category'
    },
    {
      name: 'id',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Get specific query by ID'
    }
  ],
  responses: {
    200: {
      description: 'List of available queries',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                oneOf: [
                  { type: 'object', description: 'Single query' },
                  { type: 'array', items: { type: 'object' }, description: 'List of queries' }
                ]
              }
            }
          }
        }
      }
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const category = query.category as string
  const queryId = query.id as string
  
  // Get specific query
  if (queryId) {
    const storedQuery = getStoredQuery(queryId)
    if (!storedQuery) {
      return errors.notFound(event, `Query '${queryId}' not found`)
    }
    return sendSuccess(event, storedQuery)
  }
  
  // Get by category or all
  const queries = category ? getQueriesByCategory(category) : STORED_QUERIES
  
  return sendSuccess(event, queries, {
    count: queries.length,
    category: category || 'all'
  })
}))