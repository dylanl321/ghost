export type AnalysisTimeframe = 'current-month' | 'previous-month' | 'current-quarter' | 'previous-quarter' | 'year-to-date'

export interface AnalysisDateRange {
  startDate: Date
  /** Exclusive UTC end date. */
  endDate: Date
  label: string
  description: string
  daysInPeriod: number
  isComplete: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

function utcToday(referenceDate: Date): Date {
  return utcDate(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function makeRange(
  startDate: Date,
  endDate: Date,
  label: string,
  description: string,
  completeEnd: Date,
  isComplete = endDate.getTime() >= completeEnd.getTime()
): AnalysisDateRange {
  return { startDate, endDate, label, description, daysInPeriod: daysBetween(startDate, endDate), isComplete }
}

export function getAnalysisDateRange(
  timeframe: AnalysisTimeframe,
  referenceDate: Date = new Date()
): AnalysisDateRange {
  const today = utcToday(referenceDate)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  const quarter = Math.floor(month / 3)

  switch (timeframe) {
    case 'current-month': {
      const start = utcDate(year, month, 1)
      const completeEnd = utcDate(year, month + 1, 1)
      return makeRange(start, today, 'Current Month', `${year}-${String(month + 1).padStart(2, '0')} month-to-date`, completeEnd)
    }
    case 'previous-month': {
      const start = utcDate(year, month - 1, 1)
      const end = utcDate(year, month, 1)
      return makeRange(start, end, 'Previous Month', 'Complete previous month', end, true)
    }
    case 'current-quarter': {
      const start = utcDate(year, quarter * 3, 1)
      const completeEnd = utcDate(year, quarter * 3 + 3, 1)
      return makeRange(start, today, `Current Quarter (${QUARTERS[quarter]})`, `${QUARTERS[quarter]} ${year} quarter-to-date`, completeEnd)
    }
    case 'previous-quarter': {
      const end = utcDate(year, quarter * 3, 1)
      const start = utcDate(year, quarter * 3 - 3, 1)
      const previousQuarter = (quarter + 3) % 4
      return makeRange(start, end, `Previous Quarter (${QUARTERS[previousQuarter]})`, 'Complete previous quarter', end, true)
    }
    case 'year-to-date': {
      const start = utcDate(year, 0, 1)
      const completeEnd = utcDate(year + 1, 0, 1)
      return makeRange(start, today, 'Year to Date', `${year} year-to-date`, completeEnd)
    }
    default:
      throw new Error(`Unsupported analysis timeframe: ${timeframe}`)
  }
}

export function getForecastPeriod(
  timeframe: AnalysisTimeframe,
  referenceDate: Date = new Date()
): AnalysisDateRange | null {
  if (timeframe === 'previous-month' || timeframe === 'previous-quarter') return null
  const today = utcToday(referenceDate)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  const quarter = Math.floor(month / 3)
  const end = timeframe === 'current-month'
    ? utcDate(year, month + 1, 1)
    : timeframe === 'current-quarter'
      ? utcDate(year, quarter * 3 + 3, 1)
      : utcDate(year + 1, 0, 1)
  if (today >= end) return null
  return makeRange(today, end, `Rest of ${timeframe}`, 'Forecast remainder', end, false)
}

export function getNextBudgetPeriod(
  timeframe: AnalysisTimeframe,
  referenceDate: Date = new Date()
): AnalysisDateRange {
  const today = utcToday(referenceDate)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  const quarter = Math.floor(month / 3)
  if (timeframe === 'current-month' || timeframe === 'previous-month') {
    const start = utcDate(year, month + 1, 1)
    const end = utcDate(year, month + 2, 1)
    return makeRange(start, end, 'Next Month', 'Complete next month', end, false)
  }
  if (timeframe === 'current-quarter' || timeframe === 'previous-quarter') {
    const start = utcDate(year, quarter * 3 + 3, 1)
    const end = utcDate(year, quarter * 3 + 6, 1)
    return makeRange(start, end, 'Next Quarter', 'Complete next quarter', end, false)
  }
  const start = utcDate(year + 1, 0, 1)
  const end = utcDate(year + 2, 0, 1)
  return makeRange(start, end, 'Next Year', `${year + 1}`, end, false)
}

export function formatDateRange(range: AnalysisDateRange): string {
  return `${range.startDate.toISOString().slice(0, 10)} - ${range.endDate.toISOString().slice(0, 10)} (exclusive)`
}

export function dateRangeToISO(range: AnalysisDateRange): { startDate: string; endDate: string } {
  return {
    startDate: range.startDate.toISOString().slice(0, 10),
    endDate: range.endDate.toISOString().slice(0, 10)
  }
}

export const dateRangeToISOForAWS = dateRangeToISO

/** Return a duration-aligned prior period for pace comparisons. */
export function getComparablePeriod(
  timeframe: AnalysisTimeframe,
  referenceDate: Date = new Date()
): AnalysisDateRange {
  const current = getAnalysisDateRange(timeframe, referenceDate)
  const today = utcToday(referenceDate)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()

  if (timeframe === 'current-month') {
    const start = utcDate(year, month - 1, 1)
    const fullEnd = utcDate(year, month, 1)
    const end = new Date(Math.min(addDays(start, current.daysInPeriod).getTime(), fullEnd.getTime()))
    return makeRange(start, end, 'Previous Month MTD', 'Prior-month duration aligned to observed AWS days', fullEnd, false)
  }
  if (timeframe === 'previous-month') {
    const start = utcDate(year, month - 2, 1)
    const end = utcDate(year, month - 1, 1)
    return makeRange(start, end, 'Two Months Ago', 'Complete month', end, true)
  }
  if (timeframe === 'current-quarter') {
    const quarterStartMonth = Math.floor(month / 3) * 3
    const start = utcDate(year, quarterStartMonth - 3, 1)
    const fullEnd = utcDate(year, quarterStartMonth, 1)
    const end = new Date(Math.min(addDays(start, current.daysInPeriod).getTime(), fullEnd.getTime()))
    return makeRange(start, end, 'Previous Quarter To Date', 'Prior-quarter duration aligned to observed AWS days', fullEnd, false)
  }
  if (timeframe === 'previous-quarter') {
    const quarterStartMonth = Math.floor(month / 3) * 3
    const start = utcDate(year, quarterStartMonth - 6, 1)
    const end = utcDate(year, quarterStartMonth - 3, 1)
    return makeRange(start, end, 'Two Quarters Ago', 'Complete quarter', end, true)
  }
  const start = utcDate(year - 1, 0, 1)
  const fullEnd = utcDate(year, 0, 1)
  const end = new Date(Math.min(addDays(start, current.daysInPeriod).getTime(), fullEnd.getTime()))
  return makeRange(start, end, 'Same Period Last Year', 'Prior-year duration aligned to observed AWS days', fullEnd, false)
}

export function isValidAnalysisTimeframe(timeframe: string): timeframe is AnalysisTimeframe {
  return ['current-month', 'previous-month', 'current-quarter', 'previous-quarter', 'year-to-date'].includes(timeframe)
}
