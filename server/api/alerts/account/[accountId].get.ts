/**
 * GET /api/alerts/account/:accountId
 * Get budget alerts for a specific AWS account
 */

import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { getAlertsByAccount, validateDateRange } from '../../../utils/budget-alerts'
import type { BudgetAlertLevel, BudgetAlertDeliveryStatus } from '#shared/types/budget-alerts'
import { logger } from '../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/alerts/account/[accountId]', 'GET', {
  summary: 'Get budget alerts for an account',
  description: 'Retrieve budget alert history for a specific AWS account with filtering and pagination',
  tags: ['Alerts'],
  parameters: [
    {
      name: 'accountId',
      in: 'path',
      required: true,
      schema: { type: 'string', pattern: '^\\d{12}$' },
      description: 'AWS account ID (12 digits)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      description: 'Maximum number of alerts to return'
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
      description: 'Sort order by created_at timestamp'
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
      name: 'type',
      in: 'query',
      required: false,
      schema: {
        oneOf: [
          { type: 'string', enum: ['FORECAST', 'ACTUAL'] },
          { type: 'array', items: { type: 'string', enum: ['FORECAST', 'ACTUAL'] } }
        ]
      },
      description: 'Filter by alert type(s)'
    },
    {
      name: 'deliveryStatus',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['SENT', 'FAILED', 'PENDING'] },
      description: 'Filter by delivery status'
    }
  ],
  responses: {
    200: {
      description: 'List of budget alerts for the account',
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
                  accountId: { type: 'string' }
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
  // Extract account ID from route params
  const accountId = getRouterParam(event, 'accountId')
  if (!accountId) {
    return errors.badRequest(event, 'Account ID is required')
  }

  // Validate account ID format (12-digit AWS account ID)
  if (!/^\d{12}$/.test(accountId)) {
    return errors.badRequest(event, 'Invalid account ID format. Must be a 12-digit AWS account ID.')
  }

  // Parse query parameters
  const query = getQuery(event)

  // Parse limit (default 50, max 100)
  let limit = parseInt(query.limit as string) || 50
  if (limit < 1) limit = 1
  if (limit > 100) limit = 100

  // Parse other parameters
  const nextToken = query.nextToken as string | undefined
  const sortOrder = (query.sortOrder as 'asc' | 'desc') || 'desc'
  const dateFrom = query.dateFrom as string | undefined
  const dateTo = query.dateTo as string | undefined
  const deliveryStatus = query.deliveryStatus as BudgetAlertDeliveryStatus | undefined

  // Validate date range
  const dateValidation = validateDateRange(dateFrom, dateTo)
  if (!dateValidation.valid) {
    return errors.badRequest(event, dateValidation.error!)
  }

  // Parse level filter (can be string or array)
  let levels: BudgetAlertLevel[] | undefined
  if (query.level) {
    const levelParam = query.level
    if (Array.isArray(levelParam)) {
      levels = levelParam as BudgetAlertLevel[]
    } else {
      levels = [levelParam as BudgetAlertLevel]
    }
    // Validate levels
    const validLevels = ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION']
    for (const level of levels) {
      if (!validLevels.includes(level)) {
        return errors.badRequest(event, `Invalid alert level: ${level}. Must be one of: ${validLevels.join(', ')}`)
      }
    }
  }

  // Parse type filter (can be string or array)
  let types: ('FORECAST' | 'ACTUAL')[] | undefined
  if (query.type) {
    const typeParam = query.type
    if (Array.isArray(typeParam)) {
      types = typeParam as ('FORECAST' | 'ACTUAL')[]
    } else {
      types = [typeParam as 'FORECAST' | 'ACTUAL']
    }
    // Validate types
    const validTypes = ['FORECAST', 'ACTUAL']
    for (const type of types) {
      if (!validTypes.includes(type)) {
        return errors.badRequest(event, `Invalid alert type: ${type}. Must be one of: ${validTypes.join(', ')}`)
      }
    }
  }

  // Validate delivery status
  if (deliveryStatus) {
    const validStatuses = ['SENT', 'FAILED', 'PENDING']
    if (!validStatuses.includes(deliveryStatus)) {
      return errors.badRequest(event, `Invalid delivery status: ${deliveryStatus}. Must be one of: ${validStatuses.join(', ')}`)
    }
  }

  try {
    logger.info('[Alerts API] Starting query for account:', { accountId, limit, sortOrder })

    // Query alerts by account
    const result = await getAlertsByAccount(accountId, {
      limit,
      nextToken,
      sortOrder,
      dateFrom,
      dateTo,
      levels,
      types,
      deliveryStatus
    })

    logger.info('[Alerts API] Query completed:', { accountId, count: result.count, hasMore: !!result.nextToken })

    // Return success response
    return sendSuccess(event, result.alerts, {
      count: result.count,
      nextToken: result.nextToken,
      accountId,
      hasMore: !!result.nextToken,
      filters: {
        limit,
        sortOrder,
        dateFrom,
        dateTo,
        levels,
        types,
        deliveryStatus
      }
    })
  } catch (error: any) {
    logger.error('[Alerts API] Error fetching alerts for account:', {
      accountId,
      error: error.message
    })

    // Check if it's an AWS error
    if (error.$metadata) {
      return errors.awsError(event, error)
    }

    return errors.serverError(event, 'Failed to retrieve budget alerts')
  }
}))
