/**
 * GET /api/security-lake/queries-enhanced
 *
 * List available Security Lake queries with enhanced information
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { STORED_QUERIES, getStoredQuery, getQueriesByCategory } from '../../utils/security-lake'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/security-lake/queries-enhanced', 'GET', {
  summary: 'List enhanced Security Lake queries',
  description: 'Get available stored queries with additional metadata and quick query options',
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
      description: 'Enhanced list of available queries',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  queries: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        category: { type: 'string' },
                        parameters: {
                          type: 'array',
                          items: { type: 'object' }
                        },
                        quickOptions: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              timeRange: { type: 'string' },
                              label: { type: 'string' },
                              description: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  },
                  quickQueries: {
                    type: 'object',
                    properties: {
                      presets: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' },
                            category: { type: 'string' }
                          }
                        }
                      },
                      timeRanges: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            value: { type: 'string' },
                            label: { type: 'string' },
                            description: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  count: { type: 'number' },
                  category: { type: 'string' }
                }
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

  try {
    // Get specific query
    if (queryId) {
      const storedQuery = getStoredQuery(queryId)
      if (!storedQuery) {
        return errors.notFound(event, `Query '${queryId}' not found`)
      }

      const enhancedQuery = {
        ...storedQuery,
        quickOptions: [
          {
            timeRange: 'last_24_hours',
            label: 'Last 24 Hours',
            description: 'Security events from the past day'
          },
          {
            timeRange: 'last_7_days',
            label: 'Last 7 Days',
            description: 'Security events from the past week'
          },
          {
            timeRange: 'last_30_days',
            label: 'Last 30 Days',
            description: 'Security events from the past month'
          },
          {
            timeRange: 'today',
            label: 'Today',
            description: 'Security events from today'
          }
        ]
      }

      return sendSuccess(event, {
        queries: [enhancedQuery],
        quickQueries: {
          presets: [
            {
              id: 'failed_access',
              name: 'Failed Access Attempts',
              description: 'Find failed API calls and access denied events',
              category: 'cloudtrail'
            },
            {
              id: 'privileged_actions',
              name: 'Privileged Actions',
              description: 'Track high-risk administrative operations',
              category: 'cloudtrail'
            },
            {
              id: 'critical_findings',
              name: 'Critical Security Findings',
              description: 'High and critical severity findings',
              category: 'securityhub'
            },
            {
              id: 'resources_most_findings',
              name: 'Resources with Most Findings',
              description: 'Resources with highest number of security findings',
              category: 'securityhub'
            }
          ],
          timeRanges: [
            { value: 'last_hour', label: 'Last Hour', description: 'Past 60 minutes' },
            { value: 'last_24_hours', label: 'Last 24 Hours', description: 'Past day' },
            { value: 'last_7_days', label: 'Last 7 Days', description: 'Past week' },
            { value: 'last_30_days', label: 'Last 30 Days', description: 'Past month' },
            { value: 'today', label: 'Today', description: 'Today from midnight' },
            { value: 'yesterday', label: 'Yesterday', description: 'Previous day' }
          ]
        }
      }, {
        count: 1,
        category: storedQuery.category
      })
    }

    // Get by category or all
    const queries = category ? getQueriesByCategory(category) : STORED_QUERIES

    const enhancedQueries = queries.map(storedQuery => ({
      ...storedQuery,
      quickOptions: [
        {
          timeRange: 'last_24_hours',
          label: 'Last 24 Hours',
          description: 'Security events from the past day'
        },
        {
          timeRange: 'last_7_days',
          label: 'Last 7 Days',
          description: 'Security events from the past week'
        },
        {
          timeRange: 'last_30_days',
          label: 'Last 30 Days',
          description: 'Security events from the past month'
        },
        {
          timeRange: 'today',
          label: 'Today',
          description: 'Security events from today'
        }
      ]
    }))

    return sendSuccess(event, {
      queries: enhancedQueries,
      quickQueries: {
        presets: [
          {
            id: 'failed_access',
            name: 'Failed Access Attempts',
            description: 'Find failed API calls and access denied events',
            category: 'cloudtrail'
          },
          {
            id: 'privileged_actions',
            name: 'Privileged Actions',
            description: 'Track high-risk administrative operations',
            category: 'cloudtrail'
          },
          {
            id: 'critical_findings',
            name: 'Critical Security Findings',
            description: 'High and critical severity findings',
            category: 'securityhub'
          },
          {
            id: 'resources_most_findings',
            name: 'Resources with Most Findings',
            description: 'Resources with highest number of security findings',
            category: 'securityhub'
          }
        ],
        timeRanges: [
          { value: 'last_hour', label: 'Last Hour', description: 'Past 60 minutes' },
          { value: 'last_24_hours', label: 'Last 24 Hours', description: 'Past day' },
          { value: 'last_7_days', label: 'Last 7 Days', description: 'Past week' },
          { value: 'last_30_days', label: 'Last 30 Days', description: 'Past month' },
          { value: 'today', label: 'Today', description: 'Today from midnight' },
          { value: 'yesterday', label: 'Yesterday', description: 'Previous day' }
        ]
      }
    }, {
      count: queries.length,
      category: category || 'all'
    })

  } catch (error) {
    logger.error('[Security Lake] Enhanced queries failed:', error)
    return errors.serverError(event, error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Query listing failed')
  }
}))

