/**
 * Date Period Utilities
 * 
 * Provides functions for calculating calendar-based date ranges for budget analysis.
 * This separates budget analysis periods (calendar-aligned) from time series display periods (rolling days).
 */

export type AnalysisTimeframe = 'current-month' | 'previous-month' | 'current-quarter' | 'previous-quarter' | 'year-to-date'

export interface AnalysisDateRange {
  startDate: Date
  endDate: Date
  label: string
  description: string
  daysInPeriod: number
  isComplete: boolean // Whether the period is fully elapsed
}

/**
 * Calculate calendar-based date range for budget analysis
 */
export function getAnalysisDateRange(timeframe: AnalysisTimeframe, referenceDate: Date = new Date()): AnalysisDateRange {
  const now = referenceDate
  
  switch (timeframe) {
    case 'current-month':
      return getCurrentMonthRange(now)
    
    case 'previous-month':
      return getPreviousMonthRange(now)
    
    case 'current-quarter':
      return getCurrentQuarterRange(now)
    
    case 'previous-quarter':
      return getPreviousQuarterRange(now)
    
    case 'year-to-date':
      return getYearToDateRange(now)
    
    default:
      throw new Error(`Unsupported analysis timeframe: ${timeframe}`)
  }
}

/**
 * Get current month date range
 */
function getCurrentMonthRange(now: Date): AnalysisDateRange {
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0) // Last day of current month
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  // For current month, end date should be today if we're still in the month
  const actualEndDate = today < endDate ? today : endDate
  
  return {
    startDate,
    endDate: actualEndDate,
    label: 'Current Month',
    description: `${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (month-to-date)`,
    daysInPeriod: Math.ceil((actualEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    isComplete: actualEndDate.getTime() === endDate.getTime()
  }
}

/**
 * Get previous month date range
 */
function getPreviousMonthRange(now: Date): AnalysisDateRange {
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0) // Last day of previous month
  
  return {
    startDate,
    endDate,
    label: 'Previous Month',
    description: `${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (complete month)`,
    daysInPeriod: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    isComplete: true
  }
}

/**
 * Get current quarter date range
 */
function getCurrentQuarterRange(now: Date): AnalysisDateRange {
  const quarter = Math.floor(now.getMonth() / 3)
  const startDate = new Date(now.getFullYear(), quarter * 3, 1)
  const quarterEndMonth = (quarter + 1) * 3 - 1
  const quarterEndDate = new Date(now.getFullYear(), quarterEndMonth + 1, 0)
  
  // For current quarter, end date should be today if we're still in the quarter
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const actualEndDate = today < quarterEndDate ? today : quarterEndDate
  
  const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4']
  
  return {
    startDate,
    endDate: actualEndDate,
    label: `Current Quarter (${quarterNames[quarter]})`,
    description: `${quarterNames[quarter]} ${now.getFullYear()} (quarter-to-date)`,
    daysInPeriod: Math.ceil((actualEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    isComplete: actualEndDate.getTime() === quarterEndDate.getTime()
  }
}

/**
 * Get previous quarter date range
 */
function getPreviousQuarterRange(now: Date): AnalysisDateRange {
  const currentQuarter = Math.floor(now.getMonth() / 3)
  let previousQuarter = currentQuarter - 1
  let year = now.getFullYear()
  
  // Handle year rollover
  if (previousQuarter < 0) {
    previousQuarter = 3
    year -= 1
  }
  
  const startDate = new Date(year, previousQuarter * 3, 1)
  const endMonth = (previousQuarter + 1) * 3 - 1
  const endDate = new Date(year, endMonth + 1, 0)
  
  const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4']
  
  return {
    startDate,
    endDate,
    label: `Previous Quarter (${quarterNames[previousQuarter]})`,
    description: `${quarterNames[previousQuarter]} ${year} (complete quarter)`,
    daysInPeriod: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    isComplete: true
  }
}

/**
 * Get year-to-date range
 */
function getYearToDateRange(now: Date): AnalysisDateRange {
  const startDate = new Date(now.getFullYear(), 0, 1) // January 1st
  const yearEndDate = new Date(now.getFullYear(), 11, 31) // December 31st
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  // For YTD, end date should be today if we're still in the year
  const actualEndDate = today < yearEndDate ? today : yearEndDate
  
  return {
    startDate,
    endDate: actualEndDate,
    label: 'Year to Date',
    description: `${now.getFullYear()} year-to-date`,
    daysInPeriod: Math.ceil((actualEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    isComplete: actualEndDate.getTime() === yearEndDate.getTime()
  }
}

/**
 * Calculate budget period for forecasting based on analysis timeframe
 * Returns the remaining period that needs to be forecasted
 */
export function getForecastPeriod(timeframe: AnalysisTimeframe, referenceDate: Date = new Date()): AnalysisDateRange | null {
  const now = referenceDate
  
  switch (timeframe) {
    case 'current-month': {
      const currentMonth = getCurrentMonthRange(now)
      if (currentMonth.isComplete) return null // Month is complete, no forecast needed
      
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      
      return {
        startDate: tomorrow,
        endDate: monthEnd,
        label: 'Rest of Current Month',
        description: `Remaining days in ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        daysInPeriod: Math.ceil((monthEnd.getTime() - tomorrow.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        isComplete: false
      }
    }
    
    case 'current-quarter': {
      const currentQuarter = getCurrentQuarterRange(now)
      if (currentQuarter.isComplete) return null // Quarter is complete, no forecast needed
      
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const quarter = Math.floor(now.getMonth() / 3)
      const quarterEndMonth = (quarter + 1) * 3 - 1
      const quarterEnd = new Date(now.getFullYear(), quarterEndMonth + 1, 0)
      
      return {
        startDate: tomorrow,
        endDate: quarterEnd,
        label: 'Rest of Current Quarter',
        description: `Remaining days in Q${quarter + 1} ${now.getFullYear()}`,
        daysInPeriod: Math.ceil((quarterEnd.getTime() - tomorrow.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        isComplete: false
      }
    }
    
    case 'year-to-date': {
      const ytd = getYearToDateRange(now)
      if (ytd.isComplete) return null // Year is complete, no forecast needed
      
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const yearEnd = new Date(now.getFullYear(), 11, 31)
      
      return {
        startDate: tomorrow,
        endDate: yearEnd,
        label: 'Rest of Current Year',
        description: `Remaining days in ${now.getFullYear()}`,
        daysInPeriod: Math.ceil((yearEnd.getTime() - tomorrow.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        isComplete: false
      }
    }
    
    case 'previous-month':
    case 'previous-quarter':
      // Previous periods are complete, no forecast needed
      return null
    
    default:
      return null
  }
}

/**
 * Get next budget period for forecasting
 */
export function getNextBudgetPeriod(timeframe: AnalysisTimeframe, referenceDate: Date = new Date()): AnalysisDateRange {
  const now = referenceDate
  
  switch (timeframe) {
    case 'current-month':
    case 'previous-month': {
      // Next month
      const startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0)
      
      return {
        startDate,
        endDate,
        label: 'Next Month',
        description: `${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (full month)`,
        daysInPeriod: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        isComplete: false
      }
    }
    
    case 'current-quarter':
    case 'previous-quarter': {
      // Next quarter
      const currentQuarter = Math.floor(now.getMonth() / 3)
      let nextQuarter = currentQuarter + 1
      let year = now.getFullYear()
      
      // Handle year rollover
      if (nextQuarter > 3) {
        nextQuarter = 0
        year += 1
      }
      
      const startDate = new Date(year, nextQuarter * 3, 1)
      const endMonth = (nextQuarter + 1) * 3 - 1
      const endDate = new Date(year, endMonth + 1, 0)
      
      const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4']
      
      return {
        startDate,
        endDate,
        label: `Next Quarter (${quarterNames[nextQuarter]})`,
        description: `${quarterNames[nextQuarter]} ${year} (full quarter)`,
        daysInPeriod: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        isComplete: false
      }
    }
    
    case 'year-to-date': {
      // Next year
      const startDate = new Date(now.getFullYear() + 1, 0, 1)
      const endDate = new Date(now.getFullYear() + 1, 11, 31)
      
      return {
        startDate,
        endDate,
        label: 'Next Year',
        description: `${now.getFullYear() + 1} (full year)`,
        daysInPeriod: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        isComplete: false
      }
    }
    
    default:
      throw new Error(`Unsupported analysis timeframe: ${timeframe}`)
  }
}

/**
 * Format date range for display
 */
export function formatDateRange(range: AnalysisDateRange): string {
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  }
  
  return `${range.startDate.toLocaleDateString('en-US', options)} - ${range.endDate.toLocaleDateString('en-US', options)}`
}

/**
 * Convert date range to ISO string format for API calls
 */
export function dateRangeToISO(range: AnalysisDateRange): { startDate: string, endDate: string } {
  return {
    startDate: range.startDate.toISOString().split('T')[0],
    endDate: range.endDate.toISOString().split('T')[0]
  }
}

/**
 * Convert date range to ISO string format for AWS Cost Explorer API
 * AWS Cost Explorer uses EXCLUSIVE end dates, so we add 1 day to the end date
 */
export function dateRangeToISOForAWS(range: AnalysisDateRange): { startDate: string, endDate: string } {
  const endDatePlusOne = new Date(range.endDate)
  endDatePlusOne.setDate(endDatePlusOne.getDate() + 1)
  
  return {
    startDate: range.startDate.toISOString().split('T')[0],
    endDate: endDatePlusOne.toISOString().split('T')[0]
  }
}

/**
 * Calculate the comparable period for the same timeframe in the previous cycle
 * Used for period-over-period comparisons
 */
export function getComparablePeriod(timeframe: AnalysisTimeframe, referenceDate: Date = new Date()): AnalysisDateRange {
  const now = referenceDate
  
  switch (timeframe) {
    case 'current-month': {
      // Previous month
      return getPreviousMonthRange(now)
    }
    
    case 'previous-month': {
      // Two months ago
      const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      const endDate = new Date(now.getFullYear(), now.getMonth() - 1, 0)
      
      return {
        startDate,
        endDate,
        label: 'Two Months Ago',
        description: `${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        daysInPeriod: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        isComplete: true
      }
    }
    
    case 'current-quarter': {
      // Previous quarter
      return getPreviousQuarterRange(now)
    }
    
    case 'previous-quarter': {
      // Two quarters ago
      const currentQuarter = Math.floor(now.getMonth() / 3)
      let twoQuartersAgo = currentQuarter - 2
      let year = now.getFullYear()
      
      // Handle year rollover
      if (twoQuartersAgo < 0) {
        twoQuartersAgo += 4
        year -= 1
      }
      
      const startDate = new Date(year, twoQuartersAgo * 3, 1)
      const endMonth = (twoQuartersAgo + 1) * 3 - 1
      const endDate = new Date(year, endMonth + 1, 0)
      
      const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4']
      
      return {
        startDate,
        endDate,
        label: `Two Quarters Ago (${quarterNames[twoQuartersAgo]})`,
        description: `${quarterNames[twoQuartersAgo]} ${year}`,
        daysInPeriod: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        isComplete: true
      }
    }
    
    case 'year-to-date': {
      // Same period last year
      const startDate = new Date(now.getFullYear() - 1, 0, 1)
      const lastYearSameDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      
      return {
        startDate,
        endDate: lastYearSameDate,
        label: 'Same Period Last Year',
        description: `${now.getFullYear() - 1} year-to-date (same period)`,
        daysInPeriod: Math.ceil((lastYearSameDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        isComplete: true
      }
    }
    
    default:
      throw new Error(`Unsupported analysis timeframe: ${timeframe}`)
  }
}

/**
 * Validate that an analysis timeframe string is valid
 */
export function isValidAnalysisTimeframe(timeframe: string): timeframe is AnalysisTimeframe {
  return ['current-month', 'previous-month', 'current-quarter', 'previous-quarter', 'year-to-date'].includes(timeframe)
}