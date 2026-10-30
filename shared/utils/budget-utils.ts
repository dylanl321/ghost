/**
 * Budget calculation utilities for migrating from estimatedMonthlyCharge to PEP budget fields.
 * Primary source: pepBudget{YEAR}Monthly (JSON with monthly values, e.g. pepBudget2027Monthly)
 * Carry-forward: when a year has no PEP data, the December value of the latest
 *   earlier PEP year is used for every month (flagged as 'pep-carryforward')
 * Fallback: estimatedMonthlyCharge when no PEP data applies
 */

export type PepMonthlyField = `pepBudget${number}Monthly`

// pepBudget{YEAR}Monthly fields beyond 2026 (e.g. pepBudget2027Monthly) are read
// dynamically, so any account record can be passed as-is.
export interface BudgetSource {
  pepBudget2026Monthly?: string
  pepBudget2027Monthly?: string
  estimatedMonthlyCharge?: string | number
}

export interface PeriodBudgetResult {
  periodBudget: number | null
  paceToDateBudget: number | null
  source: 'pep-monthly' | 'pep-carryforward' | 'estimated-monthly' | 'unavailable'
  /** Year whose December budget was carried forward, when source is 'pep-carryforward' */
  carriedForwardFrom?: number
}

const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Get the month's key for pepBudget{YEAR}Monthly JSON (e.g., "Jan", "Feb")
 */
function getMonthKey(date: Date): string {
  return MONTH_KEYS[date.getUTCMonth()] as string
}

export const pepMonthlyField = (year: number): PepMonthlyField => `pepBudget${year}Monthly`

/** Parse a year's PEP JSON into 12 values, or null when the year has no usable data. */
function parsePepYear(source: BudgetSource | undefined | null, year: number): number[] | null {
  const raw = (source as Record<string, unknown> | undefined | null)?.[pepMonthlyField(year)]
  if (typeof raw !== 'string' || !raw) return null
  try {
    const budgetData = JSON.parse(raw) as Record<string, number>
    const values = MONTH_KEYS.map(month => {
      const value = budgetData[month]
      return typeof value === 'number' && !isNaN(value) ? value : 0
    })
    return values.some(value => value > 0) ? values : null
  } catch {
    return null
  }
}

/** Years that have a pepBudget{YEAR}Monthly field with usable data, ascending. */
export function getPepBudgetYears(source: BudgetSource | undefined | null): number[] {
  if (!source) return []
  return Object.keys(source)
    .map(key => /^pepBudget(\d{4})Monthly$/.exec(key)?.[1])
    .filter((year): year is string => Boolean(year))
    .map(Number)
    .filter(year => parsePepYear(source, year) !== null)
    .sort((a, b) => a - b)
}

export interface YearBudget {
  monthlyArray: number[]
  /** 'pep' when the year has its own data, 'pep-carryforward' when an earlier December is reused */
  kind: 'pep' | 'pep-carryforward'
  carriedForwardFrom?: number
}

/**
 * The 12 monthly PEP budgets for a year. A year without its own data reuses
 * the December budget of the latest earlier PEP year; years before the first
 * PEP year return null (no backfill into history).
 */
export function getPepBudgetForYear(source: BudgetSource | undefined | null, year: number): YearBudget | null {
  const own = parsePepYear(source, year)
  if (own) return { monthlyArray: own, kind: 'pep' }
  const earlier = getPepBudgetYears(source).filter(y => y < year)
  const fromYear = earlier[earlier.length - 1]
  if (fromYear === undefined) return null
  const december = parsePepYear(source, fromYear)?.[11] || 0
  if (december <= 0) return null
  return { monthlyArray: Array(12).fill(december), kind: 'pep-carryforward', carriedForwardFrom: fromYear }
}

/** PEP budget for a 'YYYY-MM' month key (0 when no PEP budget applies), including carry-forward. */
export function pepBudgetForMonthKey(source: BudgetSource | undefined | null, monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month) return 0
  return getPepBudgetForYear(source, year)?.monthlyArray[month - 1] ?? 0
}

/**
 * Accounts whose budget for the given year is carried forward from an earlier
 * December because that year's PEP budget hasn't been supplied.
 */
export function isBudgetCarriedForward(source: BudgetSource | undefined | null, targetDate: Date = new Date()): boolean {
  return getPepBudgetForYear(source, targetDate.getUTCFullYear())?.kind === 'pep-carryforward'
}

/**
 * Extract monthly budget value from a single PEP JSON string (one year's data).
 * Returns null if parsing fails or value is not available.
 */
export function getPepMonthlyBudget(pepBudgetMonthly: string | undefined, targetDate?: Date): number | null {
  if (!pepBudgetMonthly) return null

  try {
    const budgetData = JSON.parse(pepBudgetMonthly) as Record<string, number>
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

/** The PEP budget for the month containing targetDate, including carry-forward. */
function getPepBudgetForMonth(source: BudgetSource | undefined | null, targetDate: Date): number | null {
  const yearBudget = getPepBudgetForYear(source, targetDate.getUTCFullYear())
  if (!yearBudget) return null
  return yearBudget.monthlyArray[targetDate.getUTCMonth()] ?? null
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
  return getPepBudgetForMonth(source, targetDate || new Date()) !== null
}

/**
 * Get budget source identifier for debugging purposes.
 * Returns 'pep' if using PEP data, 'estimated' if using estimatedMonthlyCharge, or 'none'.
 */
export function getBudgetSource(source: BudgetSource | undefined | null, targetDate?: Date): 'pep' | 'pep-carryforward' | 'estimated' | 'none' {
  if (!source) return 'none'

  const date = targetDate || new Date()
  const pepValue = getPepBudgetForMonth(source, date)
  if (pepValue !== null && pepValue > 0) return isBudgetCarriedForward(source, date) ? 'pep-carryforward' : 'pep'

  const estimatedValue = parseEstimatedMonthlyCharge(source.estimatedMonthlyCharge)
  if (estimatedValue > 0) return 'estimated'

  return 'none'
}

/**
 * Get the effective monthly budget for an account.
 *
 * Priority:
 * 1. pepBudget{YEAR}Monthly - The month's value from that year's PEP JSON data
 * 2. The latest earlier PEP year's December value, when the year has no PEP data
 * 3. estimatedMonthlyCharge - Legacy budget field (fallback)
 *
 * @param source Object containing pepBudget{YEAR}Monthly and/or estimatedMonthlyCharge
 * @param targetDate Optional date to determine which month to extract (defaults to current date)
 * @returns Monthly budget value, or 0 if neither source is available
 */
export function getMonthlyBudget(source: BudgetSource | undefined | null, targetDate?: Date): number {
  if (!source) return 0

  // Try PEP budget first
  const pepValue = getPepBudgetForMonth(source, targetDate || new Date())
  if (pepValue !== null && pepValue > 0) {
    return pepValue
  }

  // Fall back to estimatedMonthlyCharge
  return parseEstimatedMonthlyCharge(source.estimatedMonthlyCharge)
}

/**
 * Check if account has per-month PEP budget data available.
 * Returns true if any pepBudget{YEAR}Monthly has valid parseable JSON with at least one month value.
 */
export function hasPerMonthBudget(source: BudgetSource | undefined | null): boolean {
  return getPepBudgetYears(source).length > 0
}

/**
 * Get an array of 12 monthly budget values for a full year.
 * Uses that year's PEP data, else the latest earlier December carried forward,
 * else a flat estimatedMonthlyCharge.
 *
 * @param source Object containing pepBudget{YEAR}Monthly and/or estimatedMonthlyCharge
 * @param year Calendar year (defaults to the current UTC year)
 * @returns Array of 12 numbers representing budget for Jan-Dec, and whether PEP data was used
 */
export function getAnnualBudgetArray(
  source: BudgetSource | undefined | null,
  year: number = new Date().getUTCFullYear()
): { monthlyArray: number[], isPepData: boolean, carriedForwardFrom?: number } {
  if (!source) {
    return { monthlyArray: Array(12).fill(0), isPepData: false }
  }

  const yearBudget = getPepBudgetForYear(source, year)
  if (yearBudget) {
    return { monthlyArray: yearBudget.monthlyArray, isPepData: true, carriedForwardFrom: yearBudget.carriedForwardFrom }
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
 * PEP values are year-specific: each month uses its own year's PEP data, or
 * the latest earlier December carried forward. Neither PEP nor the legacy
 * monthly estimate is projected backward into a month that lacks budget data.
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
  const isPepData = hasPerMonthBudget(source)
  const yearBudgets = new Map<number, YearBudget | null>()
  const budgetForYear = (year: number) => {
    if (!yearBudgets.has(year)) yearBudgets.set(year, getPepBudgetForYear(source, year))
    return yearBudgets.get(year) ?? null
  }
  let carriedForwardFrom: number | undefined
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
      const yearBudget = isPepData ? budgetForYear(month.getUTCFullYear()) : null
      const pepApplies = yearBudget !== null
      const estimateApplies = !isPepData && isCurrent
      if (pepApplies || estimateApplies) {
        if (yearBudget?.carriedForwardFrom !== undefined) carriedForwardFrom = yearBudget.carriedForwardFrom
        const monthlyBudget = yearBudget
          ? yearBudget.monthlyArray[month.getUTCMonth()] || 0
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
  if (carriedForwardFrom !== undefined) {
    return { periodBudget, paceToDateBudget, source: 'pep-carryforward', carriedForwardFrom }
  }
  return {
    periodBudget,
    paceToDateBudget,
    source: isPepData ? 'pep-monthly' : 'estimated-monthly'
  }
}
