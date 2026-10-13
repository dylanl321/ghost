/**
 * Budget calculation utilities for migrating from estimatedMonthlyCharge to PEP budget fields.
 * Primary source: pepBudget2026Monthly (JSON with monthly values)
 * Fallback: estimatedMonthlyCharge when PEP data unavailable
 */

export interface BudgetSource {
  pepBudget2026Monthly?: string
  estimatedMonthlyCharge?: string | number
}

export interface PeriodBudgetResult {
  periodBudget: number | null
  paceToDateBudget: number | null
  source: 'pep-monthly' | 'estimated-monthly' | 'unavailable'
}

/**
 * Get the current month's key for pepBudget2026Monthly JSON (e.g., "Jan", "Feb")
 */
function getMonthKey(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[date.getMonth()] as string
}

/**
 * Extract monthly budget value from pepBudget2026Monthly JSON string.
 * Returns null if parsing fails or value is not available.
 */
export function getPepMonthlyBudget(pepBudget2026Monthly: string | undefined, targetDate?: Date): number | null {
  if (!pepBudget2026Monthly) return null

  try {
    const budgetData = JSON.parse(pepBudget2026Monthly) as Record<string, number>
    const monthKey = getMonthKey(targetDate || new Date())
    const value = budgetData[monthKey]

    if (typeof value === 'number' && !isNaN(value)) {
      return value
    }
    return null
  } catch {
    return null
  }
}

/**
 * Parse estimatedMonthlyCharge value (string or number) to a numeric value.
 * Handles currency formatting (e.g., "$1,234.56").
 */
export function parseEstimatedMonthlyCharge(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0

  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value
  }

  // Remove currency symbols and formatting
  const cleaned = value.toString().replace(/[^0-9.-]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Check if PEP budget data exists and is valid for the given source.
 */
export function hasPepBudget(source: BudgetSource | undefined | null, targetDate?: Date): boolean {
  if (!source?.pepBudget2026Monthly) return false
  return getPepMonthlyBudget(source.pepBudget2026Monthly, targetDate) !== null
}

/**
 * Get budget source identifier for debugging purposes.
 * Returns 'pep' if using PEP data, 'estimated' if using estimatedMonthlyCharge, or 'none'.
 */
export function getBudgetSource(source: BudgetSource | undefined | null, targetDate?: Date): 'pep' | 'estimated' | 'none' {
  if (!source) return 'none'

  const pepValue = getPepMonthlyBudget(source.pepBudget2026Monthly, targetDate)
  if (pepValue !== null && pepValue > 0) return 'pep'

  const estimatedValue = parseEstimatedMonthlyCharge(source.estimatedMonthlyCharge)
  if (estimatedValue > 0) return 'estimated'

  return 'none'
}

/**
 * Get the effective monthly budget for an account.
 *
 * Priority:
 * 1. pepBudget2026Monthly - Current month's value from PEP JSON data
 * 2. estimatedMonthlyCharge - Legacy budget field (fallback)
 *
 * @param source Object containing pepBudget2026Monthly and/or estimatedMonthlyCharge
 * @param targetDate Optional date to determine which month to extract (defaults to current date)
 * @returns Monthly budget value, or 0 if neither source is available
 */
export function getMonthlyBudget(source: BudgetSource | undefined | null, targetDate?: Date): number {
  if (!source) return 0

  // Try PEP budget first
  const pepValue = getPepMonthlyBudget(source.pepBudget2026Monthly, targetDate)
  if (pepValue !== null && pepValue > 0) {
    return pepValue
  }

  // Fall back to estimatedMonthlyCharge
  return parseEstimatedMonthlyCharge(source.estimatedMonthlyCharge)
}

/**
 * Check if account has per-month PEP budget data available.
 * Returns true if pepBudget2026Monthly has valid parseable JSON with at least one month value.
 */
export function hasPerMonthBudget(source: BudgetSource | undefined | null): boolean {
  if (!source?.pepBudget2026Monthly) return false

  try {
    const budgetData = JSON.parse(source.pepBudget2026Monthly) as Record<string, number>
    // Check if at least one month has a valid value
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return months.some(month => typeof budgetData[month] === 'number' && budgetData[month] > 0)
  } catch {
    return false
  }
}

/**
 * Get an array of 12 monthly budget values for a full year.
 * Uses PEP per-month data if available, otherwise falls back to flat estimatedMonthlyCharge.
 *
 * @param source Object containing pepBudget2026Monthly and/or estimatedMonthlyCharge
 * @returns Array of 12 numbers representing budget for Jan-Dec, and whether PEP data was used
 */
export function getAnnualBudgetArray(source: BudgetSource | undefined | null): { monthlyArray: number[], isPepData: boolean } {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  if (!source) {
    return { monthlyArray: Array(12).fill(0), isPepData: false }
  }

  // Try PEP budget first
  if (source.pepBudget2026Monthly) {
    try {
      const budgetData = JSON.parse(source.pepBudget2026Monthly) as Record<string, number>
      // Check if we have any valid month values
      const hasValidData = months.some(month => typeof budgetData[month] === 'number' && budgetData[month] > 0)

      if (hasValidData) {
        const monthlyArray = months.map(month => {
          const value = budgetData[month]
          return typeof value === 'number' && !isNaN(value) ? value : 0
        })
        return { monthlyArray, isPepData: true }
      }
    } catch {
      // Fall through to estimatedMonthlyCharge
    }
  }

  // Fall back to estimatedMonthlyCharge (flat value for all months)
  const flatValue = parseEstimatedMonthlyCharge(source.estimatedMonthlyCharge)
  return { monthlyArray: Array(12).fill(flatValue), isPepData: false }
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Calculate a budget aligned to an exclusive-end AWS cost range.
 * PEP values are year-specific, so the legacy monthly estimate is never
 * projected backward into a historical month that lacks PEP data.
 */
export function getPeriodBudget(
  source: BudgetSource | undefined | null,
  startDate: string,
  endDate: string,
  options: { referenceDate?: Date; includeFullCurrentMonth?: boolean } = {}
): PeriodBudgetResult {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  if (!source || !start || !end || start >= end) {
    return { periodBudget: null, paceToDateBudget: null, source: 'unavailable' }
  }

  const reference = options.referenceDate || new Date()
  const currentMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1))
  const currentMonthEnd = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1))
  const { monthlyArray, isPepData } = getAnnualBudgetArray(source)
  let periodBudget = 0
  let paceToDateBudget = 0
  let hasApplicableBudget = false
  let month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))

  while (month < end) {
    const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))
    const overlapStart = new Date(Math.max(start.getTime(), month.getTime()))
    const overlapEnd = new Date(Math.min(end.getTime(), monthEnd.getTime()))
    if (overlapStart < overlapEnd) {
      const isCurrent = month.getTime() === currentMonth.getTime()
      const pepApplies = isPepData && month.getUTCFullYear() === 2026
      const estimateApplies = !isPepData && isCurrent
      if (pepApplies || estimateApplies) {
        const monthlyBudget = pepApplies
          ? monthlyArray[month.getUTCMonth()] || 0
          : parseEstimatedMonthlyCharge(source.estimatedMonthlyCharge)
        const monthDays = Math.round((monthEnd.getTime() - month.getTime()) / 86400000)
        const observedDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000)
        const prorated = monthlyBudget * (observedDays / monthDays)
        hasApplicableBudget = true
        periodBudget += options.includeFullCurrentMonth && isCurrent ? monthlyBudget : prorated
        paceToDateBudget += prorated
      }
    }
    month = monthEnd
  }

  // A current-month estimate is a present planning input, never a historical budget.
  if (!hasApplicableBudget || (!isPepData && (end <= currentMonth || start >= currentMonthEnd))) {
    return { periodBudget: null, paceToDateBudget: null, source: 'unavailable' }
  }
  return {
    periodBudget,
    paceToDateBudget,
    source: isPepData ? 'pep-monthly' : 'estimated-monthly'
  }
}
