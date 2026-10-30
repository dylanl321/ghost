/**
 * Budget Alerts Utility Module
 *
 * DynamoDB operations for querying budget alert history from the Commercial AWS
 * proforma/monitoring account. Provides functions for account-specific queries,
 * GSI-based queries (by month, by type), and full scans for admin views.
 */

import { queryItems, scanItems } from './dynamodb'
import {
  BUDGET_ALERTS_TABLE,
  BUDGET_ALERTS_INDEXES,
  PROFORMA_ACCOUNT_ID
} from '../lib/dynamodb-config'

import type {
  BudgetAlert,
  BudgetAlertLevel,
  BudgetAlertType,
  BudgetAlertDeliveryStatus
} from '#shared/types/budget-alerts'
import { logger } from './logger'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Options for budget alert queries
 */
export interface BudgetAlertQueryOptions {
  limit?: number
  nextToken?: string
  sortOrder?: 'asc' | 'desc'
  dateFrom?: string
  dateTo?: string
  levels?: BudgetAlertLevel[]
  types?: BudgetAlertType[]
  deliveryStatus?: BudgetAlertDeliveryStatus
  /** Only alerts for these accounts (filter, not a key condition) */
  accountIds?: string[]
  /** Only alerts for this YYYY-MM month (filter, not a key condition) */
  month?: string
}

/**
 * Result from budget alert query functions
 */
export interface BudgetAlertQueryResult {
  alerts: BudgetAlert[]
  nextToken?: string
  count: number
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Validate ISO date string format
 */
function isValidISODate(dateStr: string): boolean {
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

/**
 * Validate date range (dateFrom must be before dateTo)
 */
export function validateDateRange(dateFrom?: string, dateTo?: string): { valid: boolean; error?: string } {
  if (!dateFrom && !dateTo) {
    return { valid: true }
  }

  if (dateFrom && !isValidISODate(dateFrom)) {
    return { valid: false, error: 'Invalid dateFrom format. Use ISO 8601 date string.' }
  }

  if (dateTo && !isValidISODate(dateTo)) {
    return { valid: false, error: 'Invalid dateTo format. Use ISO 8601 date string.' }
  }

  if (dateFrom && dateTo) {
    const from = new Date(dateFrom)
    const to = new Date(dateTo)
    if (from > to) {
      return { valid: false, error: 'dateFrom must be before dateTo' }
    }
  }

  return { valid: true }
}

const VALID_LEVELS: BudgetAlertLevel[] = ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION']
const VALID_TYPES: BudgetAlertType[] = ['FORECAST', 'ACTUAL']
const VALID_DELIVERY_STATUSES: BudgetAlertDeliveryStatus[] = ['SENT', 'FAILED', 'PENDING']

function toList(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return []
  return (Array.isArray(value) ? value : [value]).map(String)
}

/**
 * Parse and validate the query filters the alert list routes share:
 * limit, nextToken, sortOrder, dateFrom/dateTo, level, type and
 * deliveryStatus. Returns an error message for the first invalid value.
 */
export function parseBudgetAlertQuery(
  query: Record<string, unknown>,
  maxLimit: number
): { error: string } | { options: BudgetAlertQueryOptions & { limit: number; sortOrder: 'asc' | 'desc' } } {
  const limit = Math.min(Math.max(parseInt(String(query.limit)) || 50, 1), maxLimit)
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc'
  const dateFrom = query.dateFrom ? String(query.dateFrom) : undefined
  const dateTo = query.dateTo ? String(query.dateTo) : undefined

  const dateValidation = validateDateRange(dateFrom, dateTo)
  if (!dateValidation.valid) return { error: dateValidation.error! }

  const levels = toList(query.level)
  const invalidLevel = levels.find(level => !VALID_LEVELS.includes(level as BudgetAlertLevel))
  if (invalidLevel) return { error: `Invalid alert level: ${invalidLevel}. Must be one of: ${VALID_LEVELS.join(', ')}` }

  const types = toList(query.type)
  const invalidType = types.find(type => !VALID_TYPES.includes(type as BudgetAlertType))
  if (invalidType) return { error: `Invalid alert type: ${invalidType}. Must be one of: ${VALID_TYPES.join(', ')}` }

  const deliveryStatus = query.deliveryStatus ? String(query.deliveryStatus) : undefined
  if (deliveryStatus && !VALID_DELIVERY_STATUSES.includes(deliveryStatus as BudgetAlertDeliveryStatus)) {
    return { error: `Invalid delivery status: ${deliveryStatus}. Must be one of: ${VALID_DELIVERY_STATUSES.join(', ')}` }
  }

  return {
    options: {
      limit,
      sortOrder,
      nextToken: query.nextToken ? String(query.nextToken) : undefined,
      dateFrom,
      dateTo,
      levels: levels.length > 0 ? levels as BudgetAlertLevel[] : undefined,
      types: types.length > 0 ? types as BudgetAlertType[] : undefined,
      deliveryStatus: deliveryStatus as BudgetAlertDeliveryStatus | undefined
    }
  }
}

/**
 * Build DynamoDB filter expression from options
 * Returns filter expression, attribute names, and attribute values
 */
export function buildFilterExpression(options: BudgetAlertQueryOptions): {
  filterExpression?: string
  expressionAttributeNames?: Record<string, string>
  expressionAttributeValues?: Record<string, any>
} {
  const conditions: string[] = []
  const attributeNames: Record<string, string> = {}
  const attributeValues: Record<string, any> = {}

  // Filter by alert levels
  if (options.levels && options.levels.length > 0) {
    const levelConditions = options.levels.map((level, i) => {
      attributeValues[`:level${i}`] = level
      return `#alert_level = :level${i}`
    })
    attributeNames['#alert_level'] = 'alert_level'
    conditions.push(`(${levelConditions.join(' OR ')})`)
  }

  // Filter by alert types
  if (options.types && options.types.length > 0) {
    const typeConditions = options.types.map((type, i) => {
      attributeValues[`:type${i}`] = type
      return `#alert_type = :type${i}`
    })
    attributeNames['#alert_type'] = 'alert_type'
    conditions.push(`(${typeConditions.join(' OR ')})`)
  }

  // Filter by delivery status
  if (options.deliveryStatus) {
    attributeNames['#delivery_status'] = 'delivery_status'
    attributeValues[':delivery_status'] = options.deliveryStatus
    conditions.push('#delivery_status = :delivery_status')
  }

  // Filter by date range on created_at
  if (options.dateFrom) {
    attributeNames['#created_at'] = 'created_at'
    attributeValues[':date_from'] = options.dateFrom
    conditions.push('#created_at >= :date_from')
  }

  if (options.dateTo) {
    attributeNames['#created_at'] = 'created_at'
    attributeValues[':date_to'] = options.dateTo
    conditions.push('#created_at <= :date_to')
  }

  if (options.accountIds && options.accountIds.length > 0) {
    const accountConditions = options.accountIds.map((id, i) => {
      attributeValues[`:account${i}`] = id
      return `#account_id = :account${i}`
    })
    attributeNames['#account_id'] = 'account_id'
    conditions.push(`(${accountConditions.join(' OR ')})`)
  }

  if (options.month) {
    attributeNames['#month'] = 'month'
    attributeValues[':filter_month'] = options.month
    conditions.push('#month = :filter_month')
  }

  if (conditions.length === 0) {
    return {}
  }

  return {
    filterExpression: conditions.join(' AND '),
    expressionAttributeNames: attributeNames,
    expressionAttributeValues: attributeValues
  }
}

// -----------------------------------------------------------------------------
// Query Functions
// -----------------------------------------------------------------------------

const MAX_PAGES_PER_REQUEST = 20

/**
 * DynamoDB applies Limit before the filter, so one page of a filtered query
 * can hold far fewer than `limit` matches (often none) while more exist.
 * Keep reading pages until `limit` matches or the end. Each page asks only
 * for the remaining count, so the returned token never skips a match.
 */
async function collectPages(
  limit: number,
  nextToken: string | undefined,
  fetchPage: (pageLimit: number, token?: string) => Promise<{ items: any[]; nextToken?: string }>
): Promise<BudgetAlertQueryResult> {
  const alerts: BudgetAlert[] = []
  let token = nextToken
  let pages = 0
  do {
    const page = await fetchPage(limit - alerts.length, token)
    alerts.push(...(page.items as BudgetAlert[]))
    token = page.nextToken
    pages++
  } while (token && alerts.length < limit && pages < MAX_PAGES_PER_REQUEST)
  return { alerts, nextToken: token, count: alerts.length }
}

/**
 * Get alerts for a specific AWS account
 * Uses the primary key (account_id) for efficient querying
 */
export async function getAlertsByAccount(
  accountId: string,
  options: BudgetAlertQueryOptions = {}
): Promise<BudgetAlertQueryResult> {
  const { limit = 50, nextToken, sortOrder = 'desc' } = options

  // Build filter expression from options
  const { filterExpression, expressionAttributeNames = {}, expressionAttributeValues = {} } =
    buildFilterExpression({ ...options, accountIds: undefined })

  // Add account_id to expression values
  expressionAttributeValues[':accountId'] = accountId

  try {
    return await collectPages(limit, nextToken, (pageLimit, token) => queryItems(
      {
        tableName: BUDGET_ALERTS_TABLE,
        queryExpression: 'account_id = :accountId',
        filterExpression,
        expressionAttributeNames: Object.keys(expressionAttributeNames).length > 0
          ? expressionAttributeNames
          : undefined,
        expressionAttributeValues,
        limit: pageLimit,
        nextToken: token,
        scanIndexForward: sortOrder === 'asc'
      },
      'commercial',
      PROFORMA_ACCOUNT_ID
    ))
  } catch (error: any) {
    logger.error('[Budget Alerts] Error querying alerts by account:', {
      accountId,
      error: error.message
    })
    throw error
  }
}

/**
 * Get alerts for a specific month using the month-index GSI
 * Efficient for admin views showing alerts across accounts by time period
 */
export async function getAlertsByMonth(
  month: string,
  options: BudgetAlertQueryOptions = {}
): Promise<BudgetAlertQueryResult> {
  const { limit = 50, nextToken, sortOrder = 'desc' } = options

  // Validate month format (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Invalid month format. Use YYYY-MM format.')
  }

  // Build filter expression from options — but exclude dateFrom/dateTo since
  // created_at is the sort key of the month-index GSI and must be in KeyConditionExpression
  const optionsWithoutDates = { ...options, dateFrom: undefined, dateTo: undefined, month: undefined }
  const { filterExpression, expressionAttributeNames = {}, expressionAttributeValues = {} } =
    buildFilterExpression(optionsWithoutDates)

  // Add month to expression values
  expressionAttributeValues[':month'] = month

  // Build key condition — created_at is the sort key of month-index GSI
  let keyCondition = '#month = :month'
  if (options.dateFrom && options.dateTo) {
    keyCondition += ' AND #created_at BETWEEN :date_from AND :date_to'
    expressionAttributeNames['#created_at'] = 'created_at'
    expressionAttributeValues[':date_from'] = options.dateFrom
    expressionAttributeValues[':date_to'] = options.dateTo
  } else if (options.dateFrom) {
    keyCondition += ' AND #created_at >= :date_from'
    expressionAttributeNames['#created_at'] = 'created_at'
    expressionAttributeValues[':date_from'] = options.dateFrom
  } else if (options.dateTo) {
    keyCondition += ' AND #created_at <= :date_to'
    expressionAttributeNames['#created_at'] = 'created_at'
    expressionAttributeValues[':date_to'] = options.dateTo
  }

  try {
    return await collectPages(limit, nextToken, (pageLimit, token) => queryItems(
      {
        tableName: BUDGET_ALERTS_TABLE,
        indexName: BUDGET_ALERTS_INDEXES.MONTH_INDEX,
        queryExpression: keyCondition,
        filterExpression: filterExpression || undefined,
        expressionAttributeNames: {
          '#month': 'month',
          ...expressionAttributeNames
        },
        expressionAttributeValues,
        limit: pageLimit,
        nextToken: token,
        scanIndexForward: sortOrder === 'asc'
      },
      'commercial',
      PROFORMA_ACCOUNT_ID
    ))
  } catch (error: any) {
    logger.error('[Budget Alerts] Error querying alerts by month:', {
      month,
      error: error.message
    })
    throw error
  }
}

/**
 * Get alerts by alert type using the alert-type-index GSI
 * Useful for analytics (e.g., all CRITICAL alerts, all FORECAST alerts)
 */
export async function getAlertsByType(
  alertType: BudgetAlertType,
  options: BudgetAlertQueryOptions = {}
): Promise<BudgetAlertQueryResult> {
  const { limit = 50, nextToken, sortOrder = 'desc', dateFrom, dateTo } = options

  // Build filter expression from options (excluding types since we're querying by type)
  // Dates go in the key condition below, so they must not also be filters
  const optionsWithoutTypes = { ...options, types: undefined, dateFrom: undefined, dateTo: undefined }
  const { filterExpression, expressionAttributeNames = {}, expressionAttributeValues = {} } =
    buildFilterExpression(optionsWithoutTypes)

  // Add alert_type to expression values
  expressionAttributeValues[':alertType'] = alertType

  // Build key condition expression with optional time range
  let keyCondition = '#alert_type = :alertType'
  expressionAttributeNames['#alert_type'] = 'alert_type'

  // Add timestamp range to key condition if both dateFrom and dateTo provided
  if (dateFrom && dateTo) {
    keyCondition += ' AND #timestamp BETWEEN :dateFrom AND :dateTo'
    expressionAttributeNames['#timestamp'] = 'timestamp'
    expressionAttributeValues[':dateFrom'] = dateFrom
    expressionAttributeValues[':dateTo'] = dateTo

  } else if (dateFrom) {
    keyCondition += ' AND #timestamp >= :dateFrom'
    expressionAttributeNames['#timestamp'] = 'timestamp'
    expressionAttributeValues[':dateFrom'] = dateFrom
  } else if (dateTo) {
    keyCondition += ' AND #timestamp <= :dateTo'
    expressionAttributeNames['#timestamp'] = 'timestamp'
    expressionAttributeValues[':dateTo'] = dateTo
  }

  try {
    return await collectPages(limit, nextToken, (pageLimit, token) => queryItems(
      {
        tableName: BUDGET_ALERTS_TABLE,
        indexName: BUDGET_ALERTS_INDEXES.ALERT_TYPE_INDEX,
        queryExpression: keyCondition,
        filterExpression: filterExpression || undefined,
        expressionAttributeNames,
        expressionAttributeValues,
        limit: pageLimit,
        nextToken: token,
        scanIndexForward: sortOrder === 'asc'
      },
      'commercial',
      PROFORMA_ACCOUNT_ID
    ))
  } catch (error: any) {
    logger.error('[Budget Alerts] Error querying alerts by type:', {
      alertType,
      error: error.message
    })
    throw error
  }
}

/**
 * Get all alerts with optional filters (uses scan - use sparingly)
 * For admin views when no specific query key is available
 */
export async function getAllAlerts(
  options: BudgetAlertQueryOptions = {}
): Promise<BudgetAlertQueryResult> {
  const { limit = 50, nextToken } = options

  // Log warning about scan usage
  logger.warn('[Budget Alerts] Using full table scan - consider using more specific query if possible')

  // Build filter expression from options
  const { filterExpression, expressionAttributeNames, expressionAttributeValues } =
    buildFilterExpression(options)

  try {
    return await collectPages(limit, nextToken, (pageLimit, token) => scanItems(
      BUDGET_ALERTS_TABLE,
      filterExpression,
      pageLimit,
      token,
      'commercial',
      expressionAttributeNames,
      expressionAttributeValues,
      PROFORMA_ACCOUNT_ID
    ))
  } catch (error: any) {
    logger.error('[Budget Alerts] Error scanning all alerts:', {
      error: error.message
    })
    throw error
  }
}
