/**
 * GET /api/security-lake/dashboard
 *
 * Get Security Lake dashboard data with key metrics and insights
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { executeStoredQuery } from '../../utils/security-lake'
import type { QueryExecutionRequest } from '../../utils/security-lake'

// Register OpenAPI documentation
registerEndpoint('/api/security-lake/dashboard', 'GET', {
  summary: 'Get Security Lake dashboard data',
  description: 'Retrieve key security metrics and insights from Security Lake. Combines data from CloudTrail (failed access attempts) and Security Hub (critical findings and resource analysis) to provide comprehensive security overview.',
  tags: ['Security Lake'],
  parameters: [
    {
      name: 'timeRange',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_24_hours'],
        default: 'last_24_hours',
        description: 'Time range for metrics'
      }
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['commercial', 'govcloud'],
        default: 'commercial',
        description: 'AWS environment'
      }
    },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: {
        type: 'array',
        items: { type: 'string' },
        description: 'Account IDs to filter (comma-separated)'
      }
    },

  ],
  responses: {
    200: {
      description: 'Dashboard data with security metrics from CloudTrail and Security Hub',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  timeRange: { type: 'string' },
                  summary: {
                    type: 'object',
                    properties: {
                      totalEvents: { type: 'number' },
                      criticalFindings: { type: 'number' },
                      failedAccessAttempts: { type: 'number' },
                      privilegedActions: { type: 'number' }
                    }
                  },
                  recentActivity: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Recent security events'
                  },
                  topResources: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Resources with most findings'
                  },
                  severityBreakdown: {
                    type: 'object',
                    properties: {
                      informational: { type: 'number' },
                      low: { type: 'number' },
                      medium: { type: 'number' },
                      high: { type: 'number' },
                      critical: { type: 'number' }
                    }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  executionTimeMs: { type: 'number' },
                  generatedAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    },
    500: {
      description: 'Dashboard generation failed'
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const timeRange = (query.timeRange as string) || 'last_24_hours'
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'
  const accountIds = query.accountIds ? (query.accountIds as string).split(',') : undefined


  try {
    // Calculate time range
    const now = new Date()
    let startTime: Date
    let endTime: Date = now

    switch (timeRange) {
      case 'today':
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'yesterday':
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
        endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'last_24_hours':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case 'last_7_days':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'last_30_days':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        return errors.badRequest(event, 'Invalid timeRange')
    }

    const timeParams = {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      limit: 100
    }

    if (accountIds) {
      timeParams.accountIds = accountIds
    }

    const startTimeMs = Date.now()

    // Execute multiple queries in parallel from different data sources:
    // 1. CloudTrail (cloud_trail_mgmt table) - Failed API access attempts
    // 2. Security Hub (sh_findings table) - Critical/high severity findings
    // 3. Security Hub (sh_findings table) - Resources with most security findings
    const queries = [
      // Data Source: Security Hub (sh_findings table)
      executeStoredQuery({
        queryId: 'critical_findings',
        parameters: { ...timeParams, limit: 20 },
        environment
      }),
      // Data Source: CloudTrail (cloud_trail_mgmt table)
      executeStoredQuery({
        queryId: 'failed_access',
        parameters: { ...timeParams, limit: 10 },
        environment
      }),
      // Data Source: Security Hub (sh_findings table)
      executeStoredQuery({
        queryId: 'resources_most_findings',
        parameters: { ...timeParams, limit: 10 },
        environment
      })
    ]

    const [criticalResults, failedAccessResults, topResourcesResults] = await Promise.all(queries)

    // Build dashboard data
    const dashboard = {
      timeRange,
      summary: {
        // Combines CloudTrail + Security Hub event counts
        totalEvents: (failedAccessResults.data?.length || 0) + (criticalResults.data?.length || 0),
        // From Security Hub findings
        criticalFindings: criticalResults.data?.filter(item => item.severity === 'Critical').length || 0,
        // From CloudTrail failed access events
        failedAccessAttempts: failedAccessResults.data?.length || 0,
        privilegedActions: 0 // Would need a separate CloudTrail query for privileged actions
      },
      recentActivity: [
        ...(failedAccessResults.data || []).slice(0, 5).map(item => ({
          type: 'Failed Access',
          time: item.event_time || item.time_dt,
          region: item.region,
          accountId: item.account_id,
          severity: 'High'
        })),
        ...(criticalResults.data || []).slice(0, 5).map(item => ({
          type: 'Critical Finding',
          time: item.finding_time || item.time_dt,
          region: item.region,
          accountId: item.account_id,
          severity: item.severity
        }))
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
      topResources: (topResourcesResults.data || []).slice(0, 5).map(item => ({
        resourceId: item.resource_id,
        resourceType: item.resource_type,
        region: item.region,
        totalFindings: item.total_findings,
        criticalFindings: item.high_critical_findings
      })),
      severityBreakdown: {
        informational: criticalResults.data?.filter(item => item.severity === 'Informational').length || 0,
        low: criticalResults.data?.filter(item => item.severity === 'Low').length || 0,
        medium: criticalResults.data?.filter(item => item.severity === 'Medium').length || 0,
        high: criticalResults.data?.filter(item => item.severity === 'High').length || 0,
        critical: criticalResults.data?.filter(item => item.severity === 'Critical').length || 0
      }
    }

    const executionTimeMs = Date.now() - startTimeMs

    return sendSuccess(event, dashboard, {
      executionTimeMs,
      generatedAt: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Security Lake] Dashboard failed:', error)
    return errors.serverError(event, error instanceof Error ? error.message : 'Dashboard generation failed')
  }
}))
