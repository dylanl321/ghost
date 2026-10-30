import { getMonthlyBudget, getPeriodBudget } from '#shared/utils/budget-utils'
import type { BudgetSource } from '#shared/utils/budget-utils'

/**
 * The budget window behind the dashboard's "current" timeframes.
 *
 * Cost Explorer reports through yesterday (UTC), so `observedDays` counts
 * days with data. The window ends at the first of next month because the
 * current month's budget is counted in full, as /api/costs/analysis does.
 */
export interface CurrentPeriodWindow {
  startDate: string
  endDate: string // exclusive
  observedDays: number
  totalDays: number
  label: string
}

const DAY_MS = 86_400_000
const iso = (date: Date) => date.toISOString().slice(0, 10)

export function getCurrentPeriodWindow(timeframe: string, referenceDate: Date = new Date()): CurrentPeriodWindow | null {
  const year = referenceDate.getUTCFullYear()
  const month = referenceDate.getUTCMonth()
  const today = Date.UTC(year, month, referenceDate.getUTCDate())

  let start: number
  let label: string
  switch (timeframe) {
    case 'thisMonth':
      start = Date.UTC(year, month, 1)
      label = 'month'
      break
    case 'thisQuarter':
      start = Date.UTC(year, Math.floor(month / 3) * 3, 1)
      label = 'quarter'
      break
    case 'ytd':
    case 'thisYear':
      start = Date.UTC(year, 0, 1)
      label = 'year to date'
      break
    default:
      return null
  }
  const end = Date.UTC(year, month + 1, 1)
  return {
    startDate: iso(new Date(start)),
    endDate: iso(new Date(end)),
    observedDays: Math.round((today - start) / DAY_MS),
    totalDays: Math.round((end - start) / DAY_MS),
    label
  }
}

/**
 * Budget to compare with an account's spend for the selected timeframe.
 * This Month uses the monthly budget; quarter and year-to-date sum each
 * month's budget so a multi-month spend is not compared with one month.
 * Historical timeframes have no budget (see getPeriodBudget).
 */
export function getTimeframeBudget(
  account: BudgetSource | null | undefined,
  timeframe: string,
  referenceDate: Date = new Date()
): number {
  if (timeframe === 'thisMonth') return getMonthlyBudget(account, referenceDate)
  const window = getCurrentPeriodWindow(timeframe, referenceDate)
  if (!window) return getMonthlyBudget(account, referenceDate)
  return getPeriodBudget(account, window.startDate, window.endDate, {
    referenceDate,
    includeFullCurrentMonth: true
  }).periodBudget ?? 0
}
