/**
 * GET /api/alerts/list
 * List all budget alerts across accounts (admin use)
 *
 * Routing logic for efficient queries:
 * - If month provided -> use getAlertsByMonth() (GSI query, efficient)
 * - Else if alertType provided -> use getAlertsByType() (GSI query, efficient)
 * - Else if accountId provided -> use getAlertsByAccount() (primary key query, efficient)
 * - Else -> use getAllAlerts() (scan, log warning)
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import {
  getAlertsByAccount,
  getAlertsByMonth,
  getAlertsByType,
  getAllAlerts,
  parseBudgetAlertQuery
} from '../../utils/budget-alerts'
import type { BudgetAlertType } from '#shared/types/budget-alerts'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/alerts/list', 'GET', {
  summary: 'List all budget alerts',
  description: 'Query budget alerts across all accounts with filtering (admin). Supports query by month or alert type for efficient access.',
  tags: ['Alerts', 'Admin'],
  parameters: [
    {
      name: 'month',
      in: 'query',
      required: false,
      schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
      description: 'Filter by month (YYYY-MM) - uses GSI, efficient'
    },
    {
      name: 'alertType',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['FORECAST', 'ACTUAL'] },
      description: 'Filter by alert type (FORECAST or ACTUAL) - uses GSI, efficient'
    },
    {
      name: 'accountId',
      in: 'query',
      required: false,
      schema: { type: 'string', pattern: '^\\d{12}$' },
      description: 'Filter by specific AWS account ID'
    },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated account IDs (up to 100); combines with month or alertType'
    },
    {
      name: 'level',
      in: 'query',
      required: false,
      schema: {
        oneOf: [
          { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION'] },
          { type: 'array', items: { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION'] } }
        ]
      },
      description: 'Filter by alert level(s)'
    },
    {
      name: 'deliveryStatus',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['SENT', 'FAILED', 'PENDING'] },
      description: 'Filter by delivery status'
    },
    {
      name: 'dateFrom',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date-time' },
      description: 'Filter alerts from this date (ISO 8601)'
    },
    {
      name: 'dateTo',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date-time' },
      description: 'Filter alerts up to this date (ISO 8601)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      description: 'Maximum number of alerts to return (max 200 for admin queries)'
    },
    {
      name: 'nextToken',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Pagination token for next page'
    },
    {
      name: 'sortOrder',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
      description: 'Sort order by timestamp'
    }
  ],
  responses: {
    200: {
      description: 'List of budget alerts',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    account_id: { type: 'string' },
                    alert_id: { type: 'string' },
                    month: { type: 'string' },
                    created_at: { type: 'string' },
                    alert_level: { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION'] },
                    alert_type: { type: 'string', enum: ['FORECAST', 'ACTUAL'] },
                    actual_spend: { type: 'number' },
                    budget: { type: 'number' },
                    burn_rate: { type: 'number' },
                    projected_spend: { type: 'number' },
                    delivery_status: { type: 'string', enum: ['SENT', 'FAILED', 'PENDING'] },
                    recipients: { type: 'array', items: { type: 'string' } }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string' },
                  count: { type: 'number' },
                  nextToken: { type: 'string' },
                  queryStrategy: {
                    type: 'string',
                    enum: ['month-index', 'alert-type-index', 'account-query', 'full-scan']
                  },
                  filtersApplied: { type: 'object' }
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
  // Parse query parameters
  const query = getQuery(event)

  // Parse primary query parameters (determine query strategy)
  const month = query.month as string | undefined
  const alertType = query.alertType as BudgetAlertType | undefined
  const accountId = query.accountId as string | undefined
  const accountIds = [...new Set([
    ...(accountId ? [accountId] : []),
    ...String(query.accountIds || '').split(',').map(id => id.trim()).filter(Boolean)
  ])]

  // Validate parameters
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return errors.badRequest(event, 'Invalid month format. Use YYYY-MM format.')
  }

  if (alertType && !['FORECAST', 'ACTUAL'].includes(alertType)) {
    return errors.badRequest(event, 'Invalid alertType. Must be FORECAST or ACTUAL.')
  }

  if (accountIds.some(id => !/^\d{12}$/.test(id))) {
    return errors.badRequest(event, 'Invalid accountId format. Must be a 12-digit AWS account ID.')
  }
  if (accountIds.length > 100) {
    return errors.badRequest(event, 'At most 100 account IDs per request.')
  }

  const parsed = parseBudgetAlertQuery(query, 200)
  if ('error' in parsed) {
    return errors.badRequest(event, parsed.error)
  }
  const { limit, sortOrder, dateFrom, dateTo, levels, deliveryStatus } = parsed.options

  // Build common options for queries
  const queryOptions = {
    ...parsed.options,
    accountIds: accountIds.length > 0 ? accountIds : undefined
  }

  // Determine query strategy and execute
  let result
  let queryStrategy: 'month-index' | 'alert-type-index' | 'account-query' | 'full-scan'

  try {
    if (month) {
      // Most efficient: Query by month using GSI
      queryStrategy = 'month-index'
      logger.debug('[Alerts API] Using month-index GSI for query', { month })
      result = await getAlertsByMonth(month, {
        ...queryOptions,
        // Include alertType as filter if provided
        types: alertType ? [alertType] : undefined
      })
    } else if (alertType) {
      // Efficient: Query by alert type using GSI
      queryStrategy = 'alert-type-index'
      logger.debug('[Alerts API] Using alert-type-index GSI for query', { alertType })
      result = await getAlertsByType(alertType, queryOptions)
    } else if (accountIds.length === 1) {
      // Efficient: Query by account using primary key
      queryStrategy = 'account-query'
      logger.debug('[Alerts API] Using primary key query for account', { accountId: accountIds[0] })
      result = await getAlertsByAccount(accountIds[0]!, queryOptions)
    } else {
      // Least efficient: Full scan (log warning)
      queryStrategy = 'full-scan'
      logger.warn('[Alerts API] Using full table scan - consider adding query filters for better performance')
      result = await getAllAlerts(queryOptions)
    }

    // Build filters applied metadata
    const filtersApplied: Record<string, any> = {}
    if (month) filtersApplied.month = month
    if (alertType) filtersApplied.alertType = alertType
    if (accountIds.length > 0) filtersApplied.accountIds = accountIds
    if (levels) filtersApplied.levels = levels
    if (deliveryStatus) filtersApplied.deliveryStatus = deliveryStatus
    if (dateFrom) filtersApplied.dateFrom = dateFrom
    if (dateTo) filtersApplied.dateTo = dateTo

    // Return success response with full metadata
    return sendSuccess(event, result.alerts, {
      count: result.count,
      nextToken: result.nextToken,
      hasMore: !!result.nextToken,
      queryStrategy,
      filtersApplied,
      limit,
      sortOrder
    })
  } catch (error: any) {
    logger.error('[Alerts API] Error listing alerts:', {
      queryStrategy: queryStrategy!,
      error: error.message
    })

    // Check if it's an AWS error
    if (error.$metadata) {
      return errors.awsError(event, error)
    }

    return errors.serverError(event, 'Failed to retrieve budget alerts')
  }
}))
