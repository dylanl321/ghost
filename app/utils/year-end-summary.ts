/**
 * Plain numbers behind the costs page's year chart: what each month is expected to
 * total, how far it is from budget, and the year's headline figures.
 *
 * Works on one year from the `yearEndForecast` extractor (`currentYear` or `nextYear`).
 * Kept free of app imports so it can be unit tested.
 */

export interface YearChartData {
  year: number
  months: string[]
  series: Array<{ name: string, data: Array<number | null> }>
  confidenceBands?: { upper: Array<number | null>, lower: Array<number | null> }
  budget?: {
    monthlyArray?: number[]
    monthly?: number
    annual?: number
    isPepData?: boolean
    carriedForwardAccounts?: number
    carriedForwardFrom?: number
  }
  metadata?: { currentMonth?: number, yearTotal?: number, projectedTotal?: number, monthsWithData?: number }
}

export type MonthKind = 'actual' | 'current' | 'forecast' | 'empty'

export interface YearMonth {
  label: string
  kind: MonthKind
  /** Actual spend (month to date for the current month) */
  actual: number | null
  /** Forecast spend still to come on top of `actual` (whole month for future months) */
  forecastPart: number | null
  /** Expected month total: actual for past months, projection otherwise */
  total: number | null
  lower: number | null
  upper: number | null
  budget: number
  /** total − budget, null when there is no total or no budget */
  gap: number | null
}

export interface YearSummary {
  year: number
  isNextYear: boolean
  months: YearMonth[]
  /** Index of the month in progress, or −1 */
  currentIndex: number
  actualToDate: number
  projectedTotal: number
  annualBudget: number
  /** projectedTotal − annualBudget (0 without a budget) */
  gap: number
  overMonths: number
  hasBudget: boolean
  hasConfidence: boolean
  budgetLabel: string
  /** e.g. "2027 PEP budget not supplied for 3 accounts; using the Dec 2026 amount" */
  budgetNote: string | null
}

const num = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

export function summarizeYear(data: YearChartData, isNextYear: boolean): YearSummary {
  const currentIndex = !isNextYear && data.metadata?.currentMonth ? data.metadata.currentMonth - 1 : -1
  const actualSeries = isNextYear ? [] : (data.series[0]?.data ?? [])
  const forecastSeries = isNextYear ? (data.series[0]?.data ?? []) : (data.series[1]?.data ?? [])
  const budgets = data.budget?.monthlyArray ?? Array(12).fill(data.budget?.monthly ?? 0)
  const hasBudget = (data.budget?.annual ?? 0) > 0

  const months: YearMonth[] = data.months.map((label, i) => {
    const actual = num(actualSeries[i])
    const forecast = num(forecastSeries[i])
    let kind: MonthKind
    let total: number | null
    let forecastPart: number | null = null
    if (!isNextYear && i < currentIndex) {
      kind = actual !== null ? 'actual' : 'empty'
      total = actual
    } else if (i === currentIndex) {
      kind = 'current'
      // The forecast for the current month is the projected month-end total
      total = forecast ?? actual
      forecastPart = forecast !== null ? Math.max(0, forecast - (actual ?? 0)) : null
    } else {
      kind = forecast !== null ? 'forecast' : 'empty'
      total = forecast
      forecastPart = forecast
    }
    const budget = budgets[i] ?? 0
    return {
      label,
      kind,
      actual: kind === 'forecast' ? null : actual,
      forecastPart,
      total,
      lower: num(data.confidenceBands?.lower?.[i]),
      upper: num(data.confidenceBands?.upper?.[i]),
      budget,
      gap: total !== null && hasBudget ? total - budget : null
    }
  })

  const actualToDate = months.reduce((sum, m) => sum + (m.actual ?? 0), 0)
  const projectedTotal = months.reduce((sum, m) => sum + (m.total ?? 0), 0)
  const annualBudget = hasBudget ? (data.budget?.annual ?? 0) : 0
  const carried = data.budget?.carriedForwardAccounts ?? 0

  return {
    year: data.year,
    isNextYear,
    months,
    currentIndex,
    actualToDate,
    projectedTotal,
    annualBudget,
    gap: hasBudget ? projectedTotal - annualBudget : 0,
    overMonths: months.filter(m => m.gap !== null && m.gap > 0).length,
    hasBudget,
    hasConfidence: months.some(m => m.lower !== null && m.upper !== null),
    budgetLabel: data.budget?.isPepData ? 'PEP budget' : 'GDMS forecasted costs',
    budgetNote: carried > 0 && data.budget?.carriedForwardFrom !== undefined
      ? `${data.year} PEP budget not supplied for ${carried} ${carried === 1 ? 'account' : 'accounts'}; using the December ${data.budget.carriedForwardFrom} amount`
      : null
  }
}
