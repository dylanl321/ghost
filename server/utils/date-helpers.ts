/**
 * Date utility functions for cost APIs
 */

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
  | 'last24months';

export interface CostExplorerDateRange {
  startDate: string;
  endDate: string;
  description: string;
}

/**
 * Convert relative period to actual date range
 * Returns dates in YYYY-MM-DD format as required by Cost Explorer
 */
export function getRelativeDateRange(period: RelativePeriod): CostExplorerDateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (period) {
    case 'last7days': {
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      // end = today (exclusive), shows 7 days of data through yesterday
      const end = new Date(today);
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'Last 7 days'
      };
    }

    case 'last30days': {
      const start = new Date(today);
      start.setDate(today.getDate() - 30);
      // end = today (exclusive), shows 30 days of data through yesterday
      const end = new Date(today);
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'Last 30 days'
      };
    }

    case 'last90days': {
      const start = new Date(today);
      start.setDate(today.getDate() - 90);
      // end = today (exclusive), shows 90 days of data through yesterday
      const end = new Date(today);
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'Last 90 days'
      };
    }
    
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(today);

      // AWS Cost Explorer constraints:
      // 1. End date is exclusive
      // 2. End date cannot be in the future
      // 3. Start must be < end (not equal)

      if (start.getTime() === today.getTime()) {
        // First day of month: start == end is invalid
        // Push start back by 1 day to show yesterday's data
        start.setDate(start.getDate() - 1);
        // end stays as today (Oct 1), returns Sept 30 data only
      }
      // For all cases: end = today (exclusive)
      // This means we show data through yesterday, which matches AWS data lag

      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'This month'
      };
    }
    
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // End date is exclusive, so use first day of current month
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'Last month'
      };
    }
    
    case 'thisQuarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterStart, 1);
      const end = new Date(today);

      if (start.getTime() === today.getTime()) {
        // First day of quarter: push start back by 1 day
        start.setDate(start.getDate() - 1);
      }
      // end = today (exclusive), shows data through yesterday

      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'This quarter'
      };
    }
    
    case 'lastQuarter': {
      const currentQuarterStart = Math.floor(now.getMonth() / 3) * 3;
      const lastQuarterStart = currentQuarterStart - 3;
      const year = lastQuarterStart < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const month = lastQuarterStart < 0 ? lastQuarterStart + 12 : lastQuarterStart;
      
      const start = new Date(year, month, 1);
      // End date is exclusive, so use first day of next quarter
      const end = new Date(year, month + 3, 1);
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'Last quarter'
      };
    }
    
    case 'thisYear': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(today);

      if (start.getTime() === today.getTime()) {
        // First day of year (Jan 1): push start back by 1 day
        start.setDate(start.getDate() - 1);
      }
      // end = today (exclusive), shows data through yesterday

      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'This year'
      };
    }
    
    case 'lastYear': {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      // End date is exclusive, so use first day of current year
      const end = new Date(now.getFullYear(), 0, 1);
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'Last year'
      };
    }
    
    case 'ytd': {
      // Year-to-date: From January 1st to today
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(today);

      if (start.getTime() === today.getTime()) {
        // First day of year (Jan 1): push start back by 1 day
        start.setDate(start.getDate() - 1);
      }
      // end = today (exclusive), shows data through yesterday

      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'Year-to-date'
      };
    }
    
    case 'last12months': {
      // Last 12 months: From 12 months ago to end of last month
      // This gives us 12 complete months of data
      const start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
      // End date is exclusive, so use first day of current month
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'Last 12 months'
      };
    }
    
    case 'last24months': {
      // Last 24 months: From 24 months ago to end of last month
      // Note: This will need special handling in the API due to AWS 365-day limit
      const start = new Date(now.getFullYear(), now.getMonth() - 24, 1);
      // End date is exclusive, so use first day of current month
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: formatDate(start),
        endDate: formatDate(end),
        description: 'Last 24 months'
      };
    }
    
    default:
      throw new Error(`Unsupported relative period: ${period}`);
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate that only one date selection method is used
 */
export function validateDateParams(params: {
  startDate?: string;
  endDate?: string;
  period?: RelativePeriod;
}): { startDate: string; endDate: string; description?: string } {
  const hasExplicitDates = params.startDate && params.endDate;
  const hasRelativePeriod = !!params.period;
  
  if (hasExplicitDates && hasRelativePeriod) {
    throw new Error('Cannot specify both explicit dates (startDate/endDate) and relative period. Use one or the other.');
  }
  
  if (!hasExplicitDates && !hasRelativePeriod) {
    throw new Error('Must specify either explicit dates (startDate and endDate) or a relative period.');
  }
  
  if (hasRelativePeriod) {
    const dateRange = getRelativeDateRange(params.period!);
    return {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      description: dateRange.description
    };
  }
  
  // Validate explicit dates
  if (!params.startDate || !params.endDate) {
    throw new Error('Both startDate and endDate are required when using explicit dates.');
  }
  
  const startDate = new Date(params.startDate);
  const endDate = new Date(params.endDate);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD format.');
  }
  
  if (startDate >= endDate) {
    throw new Error('startDate must be before endDate.');
  }
  
  // AWS Cost Explorer limitation: cannot query more than 1 year
  // Exception: Allow last24months period which will be handled specially
  const maxDays = 365;
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Allow up to 730 days for last24months period
  const effectiveMaxDays = params.period === 'last24months' ? 730 : maxDays;
  
  if (daysDiff > effectiveMaxDays) {
    throw new Error(`Date range cannot exceed ${effectiveMaxDays} days. Current range: ${daysDiff} days.`);
  }
  
  return {
    startDate: params.startDate,
    endDate: params.endDate
  };
}

/**
 * Get appropriate granularity based on date range
 */
export function getRecommendedGranularity(startDate: string, endDate: string): 'DAILY' | 'MONTHLY' {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  
  // Use DAILY for periods <= 31 days, MONTHLY for longer periods
  return daysDiff <= 31 ? 'DAILY' : 'MONTHLY';
}