/**
 * Admin API: Budget Alerts Overview
 * GET /api/admin/budget-alerts/overview
 *
 * Returns an organization-level view of all accounts with:
 * - Current cost (month-to-date)
 * - Budget
 * - Thresholds met (alert levels triggered)
 * - Alert history summary
 * - Forecasted amount
 */

import { getAlertsByMonth, getAllAlerts, type BudgetAlertQueryOptions } from '../../../utils/budget-alerts'
import { getAllAccountsUnified, type UnifiedAccount } from '../../../utils/accounts-consolidated'
import { getCostAndUsage } from '../../../utils/cost-explorer'
import { requireAdmin } from '../../../utils/user-roles'
import type { BudgetAlert, BudgetAlertLevel } from '#shared/types/budget-alerts'
import { getMonthlyBudget } from '../../../../shared/utils/budget-utils'

/**
 * Recent alert summary for tooltip display
 */
interface RecentAlertSummary {
  alertId: string
  level: BudgetAlertLevel
  type: string
  createdAt: string
  actualSpend: number
  budget: number
  deliveryStatus: string
}

/**
 * Account budget summary for the overview
 */
interface AccountBudgetSummary {
  accountId: string
  accountName: string
  requestId?: number
  linesOfBusiness?: string
  enclaveStatus?: string

  // Cost metrics
  currentSpend: number
  budget: number | null
  budgetUtilization: number | null // percentage of budget used

  // Forecast
  forecastedSpend: number | null
  projectedOverspend: number | null

  // Alert summary
  alertsThisMonth: number
  thresholdsTriggered: BudgetAlertLevel[]
  latestAlertLevel: BudgetAlertLevel | null
  latestAlertDate: string | null
  hasOverspend: boolean
  recentAlerts: RecentAlertSummary[]

  // Delivery status
  successfulDeliveries: number
  failedDeliveries: number

  // Status indicators
  status: 'healthy' | 'warning' | 'critical'
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  const query = getQuery(event)

  // Parse query parameters
  const month = (query.month as string) || getCurrentMonth()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw createError({ statusCode: 400, statusMessage: 'month must be YYYY-MM' })
  }
  const includeDecommissioned = query.includeDecommissioned === 'true'
  const includeForecasts = query.includeForecasts !== 'false' // Default true
  const includeCosts = query.includeCosts !== 'false' // Default true

  try {
    logger.info(`[Budget Alerts Overview] Fetching overview for month: ${month}`)

    const costWindow = getMonthCostWindow(month)

    // Fetch data in parallel
    const [accounts, alertsResult, costData] = await Promise.all([
      getAllAccountsUnified(includeDecommissioned),
      getAlertsByMonth(month, { limit: 1000, sortOrder: 'desc' }),
      includeCosts ? getMonthCosts(costWindow) : null,
    ])

    // Create lookup maps for efficient processing
    const alertsByAccount = groupAlertsByAccount(alertsResult.alerts)
    const costsByAccount = costData ? createCostLookup(costData) : new Map()

    // Run-rate projection: spend covers the days before today, so scale by the
    // days with data, not today's date. A finished month needs no projection.
    const forecastMultiplier = includeForecasts && costWindow.daysWithData > 0
      ? costWindow.daysInMonth / costWindow.daysWithData
      : 1

    // Build account summaries
    const accountSummaries: AccountBudgetSummary[] = []

    for (const account of accounts) {
      if (!account.accountId) continue

      const accountId = account.accountId
      const accountAlerts = alertsByAccount.get(accountId) || []
      const accountCost = costsByAccount.get(accountId) || 0
      const latestAlert = accountAlerts[0] // For alert-specific data only

      // Get budget from account metadata first, fall back to alert data
      // PEP budget is preferred, with fallback to estimatedMonthlyCharge
      const budgetFromAccount = getMonthlyBudget(account)
      const budget = budgetFromAccount > 0 ? budgetFromAccount : (latestAlert?.budget || null)

      // Calculate forecast based on current spend and days remaining
      // This gives us a forecast for ALL accounts, not just ones with alerts
      const calculatedForecast = accountCost > 0 ? accountCost * forecastMultiplier : null
      // Use alert forecast if available (more accurate), otherwise use calculated
      const forecastedSpend = latestAlert?.projected_spend || calculatedForecast

      // Calculate budget utilization
      const budgetUtilization = budget && budget > 0
        ? (accountCost / budget) * 100
        : null

      // Calculate projected overspend
      const projectedOverspend = forecastedSpend && budget && forecastedSpend > budget
        ? forecastedSpend - budget
        : null

      // Get unique thresholds triggered
      const thresholdsTriggered = getUniqueThresholds(accountAlerts)

      // Calculate delivery stats
      const successfulDeliveries = accountAlerts.filter(
        a => a.delivery_status === 'SUCCESS' || a.delivery_status === 'SENT'
      ).length
      const failedDeliveries = accountAlerts.filter(
        a => a.delivery_status === 'FAILED'
      ).length

      // Determine status
      const status = determineAccountStatus(
        accountCost,
        budget,
        thresholdsTriggered,
        forecastedSpend,
        accountAlerts.length
      )

      // Get recent alerts for tooltip display (limit to 5 most recent)
      const recentAlerts = accountAlerts.slice(0, 5).map(alert => ({
        alertId: alert.alert_id,
        level: alert.alert_level,
        type: alert.alert_type,
        createdAt: alert.created_at,
        actualSpend: alert.actual_spend,
        budget: alert.budget,
        deliveryStatus: alert.delivery_status,
      }))

      accountSummaries.push({
        accountId,
        accountName: account.name || account.projectName || 'Unknown',
        requestId: account.requestId || account.requestID,
        linesOfBusiness: account.linesOfBusiness,
        enclaveStatus: account.enclaveStatus,
        currentSpend: accountCost,
        budget,
        budgetUtilization,
        forecastedSpend,
        projectedOverspend,
        alertsThisMonth: accountAlerts.length,
        thresholdsTriggered,
        latestAlertLevel: latestAlert?.alert_level || null,
        latestAlertDate: latestAlert?.created_at || null,
        hasOverspend: !!latestAlert?.overspend_amount && latestAlert.overspend_amount > 0,
        successfulDeliveries,
        failedDeliveries,
        status,
        recentAlerts,
      })
    }

    // Sort by status severity, then by current spend
    accountSummaries.sort((a, b) => {
      const statusOrder: Record<string, number> = { critical: 0, warning: 1, healthy: 2 }
      const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
      if (statusDiff !== 0) return statusDiff
      return b.currentSpend - a.currentSpend
    })

    // Calculate org-level summary
    const summary = calculateOrgSummary(accountSummaries, alertsResult.alerts)

    logger.info(`[Budget Alerts Overview] Returning ${accountSummaries.length} accounts`)

    return {
      success: true,
      data: {
        month,
        accounts: accountSummaries,
        summary,
        metadata: {
          totalAccounts: accounts.length,
          accountsWithAlerts: alertsByAccount.size,
          totalAlerts: alertsResult.alerts.length,
          includesForecasts: includeForecasts,
          includesCosts: includeCosts,
          generatedAt: new Date().toISOString(),
        },
      },
    }
  } catch (error: any) {
    logger.error('[Budget Alerts Overview] Error:', error)
    throw createError({
      statusCode: 500,
      message: `Failed to fetch budget alerts overview: ${(error instanceof Error ? error.message : String(error))}`,
    })
  }
})

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Group alerts by account ID
 */
function groupAlertsByAccount(alerts: BudgetAlert[]): Map<string, BudgetAlert[]> {
  const grouped = new Map<string, BudgetAlert[]>()

  for (const alert of alerts) {
    if (!grouped.has(alert.account_id)) {
      grouped.set(alert.account_id, [])
    }
    grouped.get(alert.account_id)!.push(alert)
  }

  return grouped
}

/**
 * Get unique threshold levels triggered for an account
 */
function getUniqueThresholds(alerts: BudgetAlert[]): BudgetAlertLevel[] {
  const levels = new Set<BudgetAlertLevel>()
  for (const alert of alerts) {
    levels.add(alert.alert_level)
  }

  // Sort by severity
  const order: BudgetAlertLevel[] = ['ESCALATION', 'CRITICAL', 'WARNING', 'INFO']
  return order.filter(level => levels.has(level))
}

/**
 * Determine account status based on alerts and spend
 *
 * Logic:
 * - Critical/Escalation alerts → critical
 * - Warning alerts → warning
 * - Forecast exceeds budget → warning
 * - No alerts = healthy (even without budget info, no alerts means no issues detected)
 * - Has budget and under control → healthy
 */
function determineAccountStatus(
  currentSpend: number,
  budget: number | null,
  thresholdsTriggered: BudgetAlertLevel[],
  forecastedSpend: number | null,
  alertCount: number
): 'healthy' | 'warning' | 'critical' {
  // Critical if escalation or critical alerts
  if (thresholdsTriggered.includes('ESCALATION') || thresholdsTriggered.includes('CRITICAL')) {
    return 'critical'
  }

  // Warning if warning alerts
  if (thresholdsTriggered.includes('WARNING')) {
    return 'warning'
  }

  // Warning if forecast exceeds budget (and we have both values)
  if (budget && forecastedSpend && forecastedSpend > budget) {
    return 'warning'
  }

  // Warning if currently over budget
  if (budget && currentSpend > budget) {
    return 'warning'
  }

  // No alerts = healthy (the alert system monitors for issues, no alerts means no issues)
  // This applies even if we don't have budget info - the alert system would catch problems
  return 'healthy'
}

/**
 * Cost Explorer window for the selected month: the whole month once it has
 * ended, otherwise the first of the month up to today (exclusive). Months that
 * have not started, or today being the 1st, leave an empty window.
 */
function getMonthCostWindow(month: string) {
  const [year, monthIndex] = month.split('-').map(Number)
  const monthStart = new Date(Date.UTC(year, monthIndex - 1, 1))
  const nextMonthStart = new Date(Date.UTC(year, monthIndex, 1))
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = today < nextMonthStart ? today : nextMonthStart
  const dayMs = 24 * 60 * 60 * 1000
  return {
    startDate: monthStart.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    daysInMonth: Math.round((nextMonthStart.getTime() - monthStart.getTime()) / dayMs),
    daysWithData: Math.max(0, Math.round((end.getTime() - monthStart.getTime()) / dayMs))
  }
}

/**
 * Fetch costs by account for the selected month
 */
async function getMonthCosts(window: { startDate: string; endDate: string }): Promise<any> {
  if (window.startDate >= window.endDate) return null
  try {
    return await getCostAndUsage({
      startDate: window.startDate,
      endDate: window.endDate,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost'],
      groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }],
    }, 'commercial')
  } catch (error) {
    logger.error('[Budget Alerts Overview] Error fetching costs:', error)
    return null
  }
}

/**
 * Create cost lookup map from cost data
 */
function createCostLookup(costData: any): Map<string, number> {
  const lookup = new Map<string, number>()

  if (!costData?.resultsByTime) return lookup

  for (const period of costData.resultsByTime) {
    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      if (!accountId) continue

      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      const existing = lookup.get(accountId) || 0
      lookup.set(accountId, existing + cost)
    }
  }

  return lookup
}

/**
 * Calculate org-level summary statistics
 */
function calculateOrgSummary(
  accounts: AccountBudgetSummary[],
  alerts: BudgetAlert[]
) {
  const totalSpend = accounts.reduce((sum, a) => sum + a.currentSpend, 0)
  const totalBudget = accounts.reduce((sum, a) => sum + (a.budget || 0), 0)
  const totalForecast = accounts.reduce((sum, a) => sum + (a.forecastedSpend || 0), 0)

  const accountsOverBudget = accounts.filter(a => a.hasOverspend).length
  const accountsAtRisk = accounts.filter(a =>
    a.budgetUtilization && a.budgetUtilization > 80
  ).length

  const criticalAccounts = accounts.filter(a => a.status === 'critical').length
  const warningAccounts = accounts.filter(a => a.status === 'warning').length
  const healthyAccounts = accounts.filter(a => a.status === 'healthy').length

  const successfulAlerts = alerts.filter(
    a => a.delivery_status === 'SUCCESS' || a.delivery_status === 'SENT'
  ).length
  const failedAlerts = alerts.filter(a => a.delivery_status === 'FAILED').length
  const deliverySuccessRate = alerts.length > 0
    ? (successfulAlerts / alerts.length) * 100
    : 100

  // Count by level
  const alertsByLevel: Record<BudgetAlertLevel, number> = {
    INFO: alerts.filter(a => a.alert_level === 'INFO').length,
    WARNING: alerts.filter(a => a.alert_level === 'WARNING').length,
    CRITICAL: alerts.filter(a => a.alert_level === 'CRITICAL').length,
    ESCALATION: alerts.filter(a => a.alert_level === 'ESCALATION').length,
  }

  // Count by type
  const alertsByType = {
    FORECAST: alerts.filter(a => a.alert_type === 'FORECAST').length,
    ACTUAL: alerts.filter(a => a.alert_type === 'ACTUAL').length,
  }

  return {
    // Financial metrics
    totalSpend,
    totalBudget,
    totalForecast,
    budgetUtilization: totalBudget > 0 ? (totalSpend / totalBudget) * 100 : null,

    // Account status counts
    accountsOverBudget,
    accountsAtRisk,
    criticalAccounts,
    warningAccounts,
    healthyAccounts,

    // Alert metrics
    totalAlerts: alerts.length,
    successfulAlerts,
    failedAlerts,
    deliverySuccessRate,
    alertsByLevel,
    alertsByType,
  }
}
