/** UTC date helpers for AWS Cost Explorer's exclusive-end date contract. */

export type RelativePeriod =
  | 'last7days'
  | 'last30days'
  | 'last90days'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'ytd'
  | 'last12months'
  | 'last24months'

export interface CostExplorerDateRange {
  startDate: string
  endDate: string
  description: string
  empty: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function todayUtc(referenceDate: Date): Date {
  return utcDate(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
}

function range(start: Date, end: Date, description: string): CostExplorerDateRange {
  return {
    startDate: formatUtcDate(start),
    endDate: formatUtcDate(end),
    description,
    empty: start.getTime() === end.getTime()
  }
}

/** Convert a relative period to an AWS range whose end date is exclusive. */
export function getRelativeDateRange(
  period: RelativePeriod,
  referenceDate: Date = new Date()
): CostExplorerDateRange {
  const today = todayUtc(referenceDate)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()

  switch (period) {
    case 'last7days':
      return range(addUtcDays(today, -7), today, 'Last 7 days')
    case 'last30days':
      return range(addUtcDays(today, -30), today, 'Last 30 days')
    case 'last90days':
      return range(addUtcDays(today, -90), today, 'Last 90 days')
    case 'thisMonth':
      return range(utcDate(year, month, 1), today, 'This month')
    case 'lastMonth':
      return range(utcDate(year, month - 1, 1), utcDate(year, month, 1), 'Last month')
    case 'thisQuarter': {
      const quarterMonth = Math.floor(month / 3) * 3
      return range(utcDate(year, quarterMonth, 1), today, 'This quarter')
    }
    case 'lastQuarter': {
      const quarterMonth = Math.floor(month / 3) * 3
      return range(utcDate(year, quarterMonth - 3, 1), utcDate(year, quarterMonth, 1), 'Last quarter')
    }
    case 'thisYear':
    case 'ytd':
      return range(utcDate(year, 0, 1), today, period === 'ytd' ? 'Year-to-date' : 'This year')
    case 'lastYear':
      return range(utcDate(year - 1, 0, 1), utcDate(year, 0, 1), 'Last year')
    case 'last12months':
      return range(utcDate(year, month - 12, 1), utcDate(year, month, 1), 'Last 12 months')
    case 'last24months':
      return range(utcDate(year, month - 24, 1), utcDate(year, month, 1), 'Last 24 months')
    default:
      throw new Error(`Unsupported relative period: ${period}`)
  }
}

function parseIsoDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || formatUtcDate(date) !== value ? null : date
}

export function validateDateParams(params: {
  startDate?: string
  endDate?: string
  period?: RelativePeriod
}): { startDate: string; endDate: string; description?: string; empty: boolean } {
  const hasExplicitDates = Boolean(params.startDate || params.endDate)
  const hasRelativePeriod = Boolean(params.period)
  if (hasExplicitDates && hasRelativePeriod) {
    throw new Error('Cannot specify both explicit dates (startDate/endDate) and relative period. Use one or the other.')
  }
  if (!hasExplicitDates && !hasRelativePeriod) {
    throw new Error('Must specify either explicit dates (startDate and endDate) or a relative period.')
  }
  if (params.period) {
    const value = getRelativeDateRange(params.period)
    return value
  }
  if (!params.startDate || !params.endDate) {
    throw new Error('Both startDate and endDate are required when using explicit dates.')
  }

  const start = parseIsoDate(params.startDate)
  const end = parseIsoDate(params.endDate)
  if (!start || !end) throw new Error('Invalid date format. Use YYYY-MM-DD format.')
  if (start >= end) throw new Error('startDate must be before endDate.')

  const days = Math.ceil((end.getTime() - start.getTime()) / DAY_MS)
  if (days > 365) throw new Error(`Date range cannot exceed 365 days. Current range: ${days} days.`)

  return { startDate: params.startDate, endDate: params.endDate, empty: false }
}

export function getRecommendedGranularity(startDate: string, endDate: string): 'DAILY' | 'MONTHLY' {
  const start = parseIsoDate(startDate)
  const end = parseIsoDate(endDate)
  if (!start || !end) return 'MONTHLY'
  return Math.ceil((end.getTime() - start.getTime()) / DAY_MS) <= 31 ? 'DAILY' : 'MONTHLY'
}
