/**
 * Budget calculation utilities for migrating from estimatedMonthlyCharge to PEP budget fields.
 * Primary source: pepBudget2026Monthly (JSON with monthly values)
 * Fallback: estimatedMonthlyCharge when PEP data unavailable
 */

interface BudgetSource {
  pepBudget2026Monthly?: string
  estimatedMonthlyCharge?: string | number
}

/**
 * Get the current month's key for pepBudget2026Monthly JSON (e.g., "Jan", "Feb")
 */
function getMonthKey(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[date.getMonth()]
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
