import { computed } from 'vue'
import type { Ref } from 'vue'
import type { NormalizedDataset } from '~/types/costs'
import type { Scenario } from '~/composables/useCostScenario'
import { getAnnualBudgetArray, hasPerMonthBudget } from '#shared/utils/budget-utils'
import { unwrapCostData, getResultsByTime, getAccountsFromAnalysis, unwrapByMode, buildAccountToGroupMap, extractForecastTotal } from '~/utils/cost-data-unwrap'
// import { calculateComprehensiveVariance, generateVarianceInsights } from '~/shared/utils/variance-calculator'

// ── Named constants for thresholds and limits ──
const MASTER_ACCOUNT_CHARGE_THRESHOLD = 100_000
const TOP_SERVICES_LIMIT = 8
const TOP_ACCOUNTS_LIMIT = 5
const MAX_ACCOUNTS_FOR_BUDGET = 20
const MAX_ACCOUNTS_FOR_HEATMAP = 20
const MAX_ACCOUNTS_FOR_PROFORMA = 20
const LOB_MIN_TOTAL_THRESHOLD = 1_000
const DEPT_MIN_TOTAL_THRESHOLD = 500
const TOP_LOBS_LIMIT = 6
const TOP_DEPTS_LIMIT = 6
const SIGNIFICANT_ACCOUNT_COST = 100
const MEANINGFUL_SPEND_THRESHOLD = 200
const MIN_SERVICE_COST = 1
const SMALL_AMOUNT_THRESHOLD = 50

export interface ChartDefinition {
  id: string
  title: string
  description?: string
  type?: 'line' | 'bar' | 'pie' | 'donut' | 'gauge' | 'heatmap' | 'treemap' | 'scatter'
  // extractor transforms dataset to the chart data shape
  extractor: (dataset: NormalizedDataset) => any
}

export const useChartRegistry = (args: {
  scenario: Ref<Scenario>
  timeframe?: Ref<string>
  mode?: Ref<'billable' | 'proforma'>
  showAdvanced?: Ref<boolean>
}) => {
  // NOTE: All reactive reads (.value) are done inside the computed() below.
  // Do NOT read .value here -- values captured here become stale closures.
  
  const baseCharts: Record<string, ChartDefinition> = {
    // Trend Charts
    totalSpendTrend: {
      id: 'totalSpendTrend',
      title: 'Spending Trend',
      description: 'Daily or monthly spending over time',
      type: 'line',
      extractor: (dataset) => {
        const summary: any = dataset.summary
        if (!summary) return null

        // Handle API response wrapper
        const actualData = unwrapCostData(dataset, 'summary')
        const resultsByTime = getResultsByTime(dataset, 'summary')

        // console.log('TotalSpendTrend: found', resultsByTime.length, 'time periods')

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        const dates: string[] = []
        const totals: number[] = []
        const weekendData: boolean[] = []
        const firstOfMonthData: boolean[] = []
        const masterAccountData: number[] = []
        const perAccountMap: Map<string, number[]> = new Map()

        // Dynamically detect master accounts by finding accounts with high costs on 1st of month
        const accountCostsByDate = new Map<string, Map<number, number>>()
        const masterAccountIds = new Set<string>()

        resultsByTime.forEach((bucket: any) => {
          const dateStr = bucket?.TimePeriod?.Start || ''
          dates.push(dateStr)

          // Parse date to check for weekends and first of month
          const date = new Date(dateStr)
          const isWeekend = date.getDay() === 0 || date.getDay() === 6 // Sunday or Saturday
          const isFirstOfMonth = date.getDate() === 1

          weekendData.push(isWeekend)
          firstOfMonthData.push(isFirstOfMonth)

          let totalForDate = 0
          let masterAccountCost = 0

          if (Array.isArray(bucket.Groups)) {
            bucket.Groups.forEach((g: any) => {
              const accountId = (g.Keys && g.Keys[0]) || 'unknown'
              const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
              
              // Skip this account if we're filtering and it's not selected
              if (filterBySelection && !selectedAccounts.includes(accountId)) {
                return
              }
              
              totalForDate += amount

              // Track costs by account and date for master account detection
              if (!accountCostsByDate.has(accountId)) {
                accountCostsByDate.set(accountId, new Map())
              }
              accountCostsByDate.get(accountId)!.set(date.getDate(), amount)

              // Detect master accounts: unusually high cost on 1st of month
              if (isFirstOfMonth && amount > MASTER_ACCOUNT_CHARGE_THRESHOLD) { // >$100k on 1st suggests master account
                masterAccountIds.add(accountId)
                // console.log(`Detected master account: ${accountId} with $${amount.toFixed(0)} on ${dateStr}`)
              }

              // Track master account costs
              if (masterAccountIds.has(accountId)) {
                masterAccountCost += amount
              }

              if (!perAccountMap.has(accountId)) {
                perAccountMap.set(accountId, Array(dates.length - 1).fill(0))
              }
              perAccountMap.get(accountId)!.push(amount)
            })
          }

          if (totalForDate === 0 && bucket.Total?.UnblendedCost?.Amount) {
            totalForDate = parseFloat(bucket.Total.UnblendedCost.Amount)
          }

          totals.push(totalForDate)
          masterAccountData.push(masterAccountCost)

          perAccountMap.forEach((arr, key) => {
            if (arr.length < dates.length) arr.push(0)
          })
        })

        const perAccount = Array.from(perAccountMap.entries())
          .map(([accountId, series]) => ({ accountId, series, sum: series.reduce((a, b) => a + b, 0) }))
          .sort((a, b) => b.sum - a.sum)
          .slice(0, TOP_ACCOUNTS_LIMIT)

        // console.log('TotalSpendTrend: processed data with', dates.length, 'dates,',
        //  weekendData.filter(Boolean).length, 'weekends,',
        //  firstOfMonthData.filter(Boolean).length, 'first-of-month entries,',
        //  masterAccountIds.size, 'master accounts detected')

        return {
          dates,
          totals,
          perAccount,
          weekendData,
          firstOfMonthData,
          masterAccountData
        }
      }
    },

    // Budget Utilization Chart (with color coding)
    budgetUtilization: {
      id: 'budgetUtilization',
      title: 'Budget Utilization',
      description: 'Current spending vs budget allocation',
      type: 'bar', // Will be changed to gauge for single account
      extractor: (dataset) => {
        const byAccount = getAccountsFromAnalysis(dataset)
        if (byAccount.length === 0) return []

        const selectedAccounts = dataset.accounts || []

        // Filter by selected accounts if any are selected
        let filteredAccounts = byAccount.filter((a: any) => a.budgetedCost > 0)

        if (selectedAccounts.length > 0) {
          filteredAccounts = filteredAccounts.filter((a: any) =>
            selectedAccounts.includes(a.accountId)
          )
          // console.log('BudgetUtilization: after filtering by selection:', filteredAccounts.length, 'accounts')
        }

        // Get accounts and calculate utilization percentage
        return filteredAccounts
          .map((a: any) => ({
            accountId: a.accountId,
            accountName: a.accountName || a.accountId,
            actualCost: a.actualCost,
            budgetedCost: a.budgetedCost,
            utilization: (a.actualCost / a.budgetedCost) * 100,
            status: a.status
          }))
          .sort((a: any, b: any) => b.utilization - a.utilization) // Sort by utilization % descending
          .slice(0, MAX_ACCOUNTS_FOR_BUDGET) // Allow more for single/few account scenarios
      }
    },

    // Service Breakdown Pie Chart
    serviceBreakdown: {
      id: 'serviceBreakdown',
      title: 'Cost by Service',
      description: 'Breakdown of costs across AWS services',
      type: 'pie',
      extractor: (dataset) => {
        const services = dataset.services as any
        if (!services) {
          // console.log('ServiceBreakdown: no services data in dataset')
          return []
        }

        const actualData = unwrapCostData(dataset, 'services')
        const selectedAccounts = dataset.accounts || []

        // console.log('ServiceBreakdown: analyzing services, selected accounts:', selectedAccounts, 'mode:', dataset.mode)
        // console.log('ServiceBreakdown: services data structure:', actualData ? Object.keys(actualData) : 'no data')

        // Extract service costs from the dedicated services API call
        const serviceMap = new Map<string, number>()

        // Get resultsByTime handling proforma/billable paths
        const resultsByTime = getResultsByTime(dataset, 'services')
        
        // console.log('ServiceBreakdown: found', resultsByTime.length, 'time periods')

        // Parse service data from resultsByTime (grouped by SERVICE)
        if (resultsByTime.length > 0) {
          // console.log('ServiceBreakdown: Processing', resultsByTime.length, 'time periods')
          resultsByTime.forEach((bucket: any) => {
            if (bucket.Groups) {
              // console.log('ServiceBreakdown: Processing bucket with', bucket.Groups.length, 'service groups')
              bucket.Groups.forEach((g: any) => {
                const serviceName = g.Keys?.[0] || 'Unknown Service'
                const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')

                if (amount > 0) {
                  serviceMap.set(serviceName, (serviceMap.get(serviceName) || 0) + amount)
                }
              })
            }
          })
        }

/*         // console.log('ServiceBreakdown: found', serviceMap.size, 'services')
        if (serviceMap.size > 0) {
          // console.log('ServiceBreakdown: Top services by cost:', 
            Array.from(serviceMap.entries())
              .sort(([,a], [,b]) => b - a)
              .slice(0, TOP_ACCOUNTS_LIMIT)
              .map(([name, cost]) => `${name}: $${cost.toFixed(0)}`)
          )
        } else {
          console.warn('ServiceBreakdown: No services found, checking data structure:', {
            hasServices: !!services,
            hasData: !!actualData,
            hasResultsByTime: resultsByTime.length > 0,
            resultsLength: resultsByTime.length,
            firstBucket: resultsByTime[0] || null,
            sampleGroups: resultsByTime[0]?.Groups?.length || 0
          })
        } */

        // Convert to array and sort by value
        const result = Array.from(serviceMap.entries())
          .map(([name, value]) => ({
            name: name.replace(/^AWS\s+/, ''), // Remove AWS prefix for cleaner display
            value
          }))
          .filter(item => item.value > MIN_SERVICE_COST) // Filter out very small costs
          .sort((a, b) => b.value - a.value)
          .slice(0, TOP_SERVICES_LIMIT) // Top 8 services for better pie chart readability

        // console.log('ServiceBreakdown: returning', result.length, 'services')

        return result
      }
    },

    // Department/LOB Comparison
    departmentComparison: {
      id: 'departmentComparison',
      title: 'Cost by Department',
      description: 'Spending breakdown by department',
      type: 'treemap',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        if (!summary) return []

        const actualData = summary?.data || summary

        // Group by department
        const deptMap = new Map<string, number>()

        if (actualData?.accounts) {
          actualData.accounts.forEach((account: any) => {
            const dept = account.departmentNumber || 'Unknown'
            const cost = account.totalCost || 0
            deptMap.set(dept, (deptMap.get(dept) || 0) + cost)
          })
        }

        return Array.from(deptMap.entries())
          .map(([name, value]) => ({ name, value }))
          .filter(d => d.value > 0)
      }
    },

    // Top Spenders Bar Chart
    topSpenders: {
      id: 'topSpenders',
      title: 'Top Spending Accounts',
      description: 'Accounts with highest costs this period',
      type: 'bar',
      extractor: (dataset) => {
        const byAccount = getAccountsFromAnalysis(dataset)
        if (byAccount.length === 0) return []

        const selectedAccounts = dataset.accounts || []

        // console.log('TopSpenders: filtering', byAccount.length, 'accounts, selected:', selectedAccounts)

        // Filter by selected accounts if any are selected
        let filteredAccounts = byAccount

        if (selectedAccounts.length > 0) {
          filteredAccounts = filteredAccounts.filter((a: any) =>
            selectedAccounts.includes(a.accountId)
          )
          // console.log('TopSpenders: after filtering by selection:', filteredAccounts.length, 'accounts')
        }

        return filteredAccounts
          .sort((a: any, b: any) => b.actualCost - a.actualCost)
          .slice(0, Math.max(10, selectedAccounts.length > 20 ? 20 : selectedAccounts.length)) // Show at least selected accounts unless >20
          .map((a: any) => ({
            accountId: a.accountId,
            accountName: a.accountName || a.accountId,
            cost: a.actualCost
          }))
      }
    },

    // Cost Efficiency Score
    efficiencyScore: {
      id: 'efficiencyScore',
      title: 'Cost Efficiency',
      description: 'Accounts under budget vs over budget',
      type: 'donut',
      extractor: (dataset) => {
        const byAccount = getAccountsFromAnalysis(dataset)
        if (byAccount.length === 0) return []

        const stats = {
          underBudget: 0,
          onTarget: 0,
          overBudget: 0,
          noBudget: 0
        }

        byAccount.forEach((a: any) => {
          if (a.budgetedCost === 0) {
            stats.noBudget++
          } else if (a.status === 'under') {
            stats.underBudget++
          } else if (a.status === 'over') {
            stats.overBudget++
          } else {
            stats.onTarget++
          }
        })

        return [
          { name: 'Under GDMS Forecast', value: stats.underBudget, color: '#10b981' },
          { name: 'On Target', value: stats.onTarget, color: '#3b82f6' },
          { name: 'Over GDMS Forecast', value: stats.overBudget, color: '#ef4444' },
          { name: 'No GDMS Forecast', value: stats.noBudget, color: '#6b7280' }
        ].filter(s => s.value > 0)
      }
    },

    // LOB vs LOB Comparison (Horizontal Bar Chart)
    lobComparison: {
      id: 'lobComparison',
      title: 'Lines of Business Comparison',
      description: 'Compare total spending across LOBs',
      type: 'bar',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        if (!summary) return []

        const actualData = summary?.data || summary
        const accounts = actualData?.accounts || []

        // Group by LOB and sum costs
        const lobMap = new Map<string, { totalCost: number, accountCount: number, budget: number }>()

        accounts.forEach((account: any) => {
          const lob = account.linesOfBusiness || account.lineOfBusiness || 'Unknown LOB'
          const cost = account.totalCost || 0
          const budget = account.budget || 0

          if (!lobMap.has(lob)) {
            lobMap.set(lob, { totalCost: 0, accountCount: 0, budget: 0 })
          }

          const lobData = lobMap.get(lob)!
          lobData.totalCost += cost
          lobData.accountCount += 1
          lobData.budget += budget
        })

        // console.log('LOB Comparison: found', lobMap.size, 'LOBs')

        return Array.from(lobMap.entries())
          .map(([name, data]) => ({
            name,
            cost: data.totalCost,
            budget: data.budget,
            accounts: data.accountCount,
            utilization: data.budget > 0 ? (data.totalCost / data.budget) * 100 : 0
          }))
          .filter(lob => lob.cost > 0)
          .sort((a, b) => b.cost - a.cost)
      }
    },

    // LOB Trend Comparison (Multi-line chart) - Enhanced for organizational view
    lobTrendComparison: {
      id: 'lobTrendComparison',
      title: 'LOB Spending Trends Over Time',
      description: 'Compare spending trends across different Lines of Business',
      type: 'line',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        const historical = dataset.historical as any
        
        // Prefer historical data for better trend analysis
        const dataSource = historical?.data || summary?.data || historical || summary
        if (!dataSource) return null

        // Use historical monthly breakdown if available
        if (dataSource.monthlyBreakdown && Array.isArray(dataSource.monthlyBreakdown)) {
          
          // For historical data, we need to map accounts to LOBs
          // This requires the accounts list to be available
          const accounts = (dataset as any).accountsList || []
          if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
            console.warn('LOBTrendComparison: no accounts data available for LOB mapping')
            return null
          }

          // Create account-to-LOB mapping with all possible ID formats
          const accountLOBMap = buildAccountToGroupMap(accounts, 'linesOfBusiness', 'lineOfBusiness')

          // For monthly breakdown, we need to get per-account data from resultsByTime
          const resultsByTime = dataSource?.resultsByTime || []
          const lobSeriesMap = new Map<string, number[]>()
          const dates: string[] = []

          resultsByTime.forEach((bucket: any) => {
            const dateStr = bucket?.TimePeriod?.Start || ''
            dates.push(dateStr)

            const lobTotals = new Map<string, number>()

            if (bucket.Groups) {
              bucket.Groups.forEach((g: any, idx: number) => {
                const accountId = g.Keys?.[0] || 'unknown'
                const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
                
                // Log first account ID format for debugging
                if (idx === 0 && dates.length === 1) {
                }
                
                // Map account to LOB
                const lob = accountLOBMap.get(accountId) || 'Unknown LOB'
                lobTotals.set(lob, (lobTotals.get(lob) || 0) + amount)
              })
            }

            // Update series for each LOB
            lobTotals.forEach((amount, lob) => {
              if (!lobSeriesMap.has(lob)) {
                lobSeriesMap.set(lob, new Array(dates.length - 1).fill(0))
              }
              lobSeriesMap.get(lob)!.push(amount)
            })

            // Fill zeros for LOBs that didn't have activity this period
            lobSeriesMap.forEach((series) => {
              if (series.length < dates.length) {
                series.push(0)
              }
            })
          })

          const lobSeries = Array.from(lobSeriesMap.entries())
            .map(([name, values]) => ({
              name,
              dates,
              values,
              total: values.reduce((sum, val) => sum + val, 0)
            }))
            .filter(series => series.total > LOB_MIN_TOTAL_THRESHOLD) // Filter out very small LOBs
            .sort((a, b) => b.total - a.total)
            .slice(0, TOP_LOBS_LIMIT) // Top 6 LOBs for better visibility

          return { dates, series: lobSeries }
        }

        // Fallback to original implementation for non-historical data
        const resultsByTime = dataSource?.resultsByTime || []
        const lobSeriesMap = new Map<string, { dates: string[], values: number[] }>()
        const dates: string[] = []

        // Build account-to-LOB map once, outside the loop
        const fallbackAccountsList = (dataset as any).accountsList || []
        const fallbackLOBMap = fallbackAccountsList.length > 0
          ? buildAccountToGroupMap(fallbackAccountsList, 'linesOfBusiness', 'lineOfBusiness')
          : new Map<string, string>()

        resultsByTime.forEach((bucket: any) => {
          const dateStr = bucket?.TimePeriod?.Start || ''
          dates.push(dateStr)

          const lobTotals = new Map<string, number>()

          if (bucket.Groups) {
            bucket.Groups.forEach((g: any) => {
              const accountId = g.Keys?.[0] || 'unknown'
              const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')

              // Look up LOB from pre-built map
              const lob = fallbackLOBMap.get(accountId)
                || (fallbackLOBMap.size === 0 ? 'Account-' + (accountId.substring(0, 4) || 'Unknown') : 'Unknown LOB')
              
              lobTotals.set(lob, (lobTotals.get(lob) || 0) + amount)
            })
          }

          // Update series for each LOB
          lobTotals.forEach((amount, lob) => {
            if (!lobSeriesMap.has(lob)) {
              lobSeriesMap.set(lob, { dates: [...dates], values: new Array(dates.length - 1).fill(0) })
            }
            lobSeriesMap.get(lob)!.values.push(amount)
          })

          // Fill zeros for LOBs that didn't have activity this period
          lobSeriesMap.forEach((series) => {
            if (series.values.length < dates.length) {
              series.values.push(0)
            }
          })
        })

        const lobSeries = Array.from(lobSeriesMap.entries())
          .map(([name, series]) => ({
            name,
            dates: series.dates,
            values: series.values,
            total: series.values.reduce((sum, val) => sum + val, 0)
          }))
          .filter(series => series.total > LOB_MIN_TOTAL_THRESHOLD) // Filter out very small LOBs
          .sort((a, b) => b.total - a.total)
          .slice(0, TOP_LOBS_LIMIT) // Top 6 LOBs for better visibility

        return { dates, series: lobSeries }
      }
    },

    // Department Trend Comparison (Multi-line chart) - New organizational view
    departmentTrendComparison: {
      id: 'departmentTrendComparison',
      title: 'Department Spending Trends Over Time',
      description: 'Compare spending trends across different Departments',
      type: 'line',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        const historical = dataset.historical as any
        
        // Prefer historical data for better trend analysis
        const dataSource = historical?.data || summary?.data || historical || summary
        if (!dataSource) return null

        // Use historical monthly breakdown if available
        if (dataSource.monthlyBreakdown && Array.isArray(dataSource.monthlyBreakdown)) {
          
          // For historical data, we need to map accounts to departments
          const accounts = (dataset as any).accountsList || []
          if (!accounts || accounts.length === 0) {
            console.warn('DepartmentTrendComparison: no accounts data available for department mapping')
            return null
          }

          // Create account-to-department mapping with all possible ID formats
          const accountDeptMap = buildAccountToGroupMap(accounts, 'departmentNumber', 'department')

          // Get per-account data from resultsByTime
          const resultsByTime = dataSource?.resultsByTime || []
          const deptSeriesMap = new Map<string, number[]>()
          const dates: string[] = []

          resultsByTime.forEach((bucket: any) => {
            const dateStr = bucket?.TimePeriod?.Start || ''
            dates.push(dateStr)

            const deptTotals = new Map<string, number>()

            if (bucket.Groups) {
              bucket.Groups.forEach((g: any, idx: number) => {
                const accountId = g.Keys?.[0] || 'unknown'
                const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
                
                // Log first account ID format for debugging
                if (idx === 0 && dates.length === 1) {
                }
                
                // Map account to department
                const dept = accountDeptMap.get(accountId) || 'Unknown Department'
                deptTotals.set(dept, (deptTotals.get(dept) || 0) + amount)
              })
            }

            // Update series for each department
            deptTotals.forEach((amount, dept) => {
              if (!deptSeriesMap.has(dept)) {
                deptSeriesMap.set(dept, new Array(dates.length - 1).fill(0))
              }
              deptSeriesMap.get(dept)!.push(amount)
            })

            // Fill zeros for departments that didn't have activity this period
            deptSeriesMap.forEach((series) => {
              if (series.length < dates.length) {
                series.push(0)
              }
            })
          })

          const deptSeries = Array.from(deptSeriesMap.entries())
            .map(([name, values]) => ({
              name,
              dates,
              values,
              total: values.reduce((sum, val) => sum + val, 0)
            }))
            .filter(series => series.total > 500) // Filter out very small departments
            .sort((a, b) => b.total - a.total)
            .slice(0, 8) // Top 8 departments for better visibility

          return { dates, series: deptSeries }
        }

        // Fallback to original implementation for non-historical data
        const resultsByTime = dataSource?.resultsByTime || []
        const deptSeriesMap = new Map<string, { dates: string[], values: number[] }>()
        const dates: string[] = []

        // Build account-to-department map once, outside the loop
        const fallbackDeptAccountsList = (dataset as any).accountsList || []
        const fallbackDeptMap = fallbackDeptAccountsList.length > 0
          ? buildAccountToGroupMap(fallbackDeptAccountsList, 'departmentNumber', 'department')
          : new Map<string, string>()

        resultsByTime.forEach((bucket: any) => {
          const dateStr = bucket?.TimePeriod?.Start || ''
          dates.push(dateStr)

          const deptTotals = new Map<string, number>()

          if (bucket.Groups) {
            bucket.Groups.forEach((g: any) => {
              const accountId = g.Keys?.[0] || 'unknown'
              const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')

              // Look up department from pre-built map
              const dept = fallbackDeptMap.get(accountId)
                || (fallbackDeptMap.size === 0 ? 'Account-' + (accountId.substring(0, 4) || 'Unknown') : 'Unknown Department')
              
              deptTotals.set(dept, (deptTotals.get(dept) || 0) + amount)
            })
          }

          // Update series for each department
          deptTotals.forEach((amount, dept) => {
            if (!deptSeriesMap.has(dept)) {
              deptSeriesMap.set(dept, { dates: [...dates], values: new Array(dates.length - 1).fill(0) })
            }
            deptSeriesMap.get(dept)!.values.push(amount)
          })

          // Fill zeros for departments that didn't have activity this period
          deptSeriesMap.forEach((series) => {
            if (series.values.length < dates.length) {
              series.values.push(0)
            }
          })
        })

        const deptSeries = Array.from(deptSeriesMap.entries())
          .map(([name, series]) => ({
            name,
            dates: series.dates,
            values: series.values,
            total: series.values.reduce((sum, val) => sum + val, 0)
          }))
          .filter(series => series.total > DEPT_MIN_TOTAL_THRESHOLD) // Filter out very small departments
          .sort((a, b) => b.total - a.total)
          .slice(0, TOP_SERVICES_LIMIT) // Top 8 departments for better visibility

        return { dates, series: deptSeries }
      }
    },

    // Department Budget Performance (Gauge Chart Collection)
    departmentBudgetPerformance: {
      id: 'departmentBudgetPerformance',
      title: 'Department Budget Performance',
      description: 'Budget utilization by department',
      type: 'gauge',
      extractor: (dataset) => {
        const byAccount = getAccountsFromAnalysis(dataset)
        if (byAccount.length === 0) return []

        // Group by department
        const deptMap = new Map<string, { totalCost: number, totalBudget: number, accounts: number }>()

        byAccount.forEach((account: any) => {
          const dept = account.departmentNumber || account.department || 'Unknown Dept'
          const cost = account.actualCost || 0
          const budget = account.budgetedCost || 0

          if (!deptMap.has(dept)) {
            deptMap.set(dept, { totalCost: 0, totalBudget: 0, accounts: 0 })
          }

          const deptData = deptMap.get(dept)!
          deptData.totalCost += cost
          deptData.totalBudget += budget
          deptData.accounts += 1
        })

        return Array.from(deptMap.entries())
          .map(([name, data]) => ({
            name,
            utilization: data.totalBudget > 0 ? (data.totalCost / data.totalBudget) * 100 : 0,
            actualCost: data.totalCost,
            budgetedCost: data.totalBudget,
            accounts: data.accounts
          }))
          .filter(dept => dept.budgetedCost > 0)
          .sort((a, b) => b.actualCost - a.actualCost)
      }
    },

    // Billable vs Proforma Comparison (Bar Chart)
    billableVsProforma: {
      id: 'billableVsProforma',
      title: 'Billable vs Proforma Comparison',
      description: 'Compare billable and proforma costs by account',
      type: 'bar',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        if (!summary) {
          return []
        }

        const actualData = summary?.data || summary
        
        // Check if we have both billable and proforma data
        if (!actualData?.billable || !actualData?.proforma) {
          return []
        }

        // Extract account costs from both datasets
        const billableAccounts = actualData.billable?.accounts || []
        const proformaAccounts = actualData.proforma?.accounts || []
        

        // Create a map for quick lookup
        const proformaMap = new Map<string, number>()
        proformaAccounts.forEach((account: any) => {
          if (account.accountId && account.totalCost) {
            proformaMap.set(account.accountId, account.totalCost)
          }
        })

        // Debug: Check data structure

        // Build comparison data
        const comparison = billableAccounts
          .filter((account: any) => account.totalCost > 0)
          .map((account: any) => {
            const billableCost = account.totalCost || 0
            const proformaCost = proformaMap.get(account.accountId) || 0
            const difference = proformaCost - billableCost
            const percentChange = billableCost > 0 ? (difference / billableCost) * 100 : 0

            // Debug first few accounts
            if (billableAccounts.indexOf(account) < 3) {
            }

            return {
              accountId: account.accountId,
              accountName: account.accountName || account.accountId,
              billableCost,
              proformaCost,
              difference,
              percentChange,
              status: difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'unchanged'
            }
          })
          .filter((item: any) => Math.abs(item.difference) > 10) // Filter out minimal differences
          .sort((a: any, b: any) => Math.abs(b.difference) - Math.abs(a.difference))
          .slice(0, MAX_ACCOUNTS_FOR_PROFORMA) // Top 20 accounts with biggest differences

        return comparison
      }
    },

    // Cost Optimization Opportunities (Bar chart with recommendations)
    costOptimizationOpportunities: {
      id: 'costOptimizationOpportunities',
      title: 'Cost Optimization Opportunities',
      description: 'Accounts with potential savings based on utilization patterns',
      type: 'bar',
      extractor: (dataset) => {
        const byAccount = getAccountsFromAnalysis(dataset)
        if (byAccount.length === 0) return []

        // Identify optimization opportunities
        const opportunities = byAccount
          .map((account: any) => {
            const utilization = account.budgetedCost > 0
              ? (account.actualCost / account.budgetedCost) * 100
              : 0

            let opportunity = 'None'
            let potentialSavings = 0
            let priority = 'Low'

            if (utilization < 30 && account.budgetedCost > 5000) {
              opportunity = 'Severe Underutilization'
              potentialSavings = (account.budgetedCost - account.actualCost) * 0.7
              priority = 'High'
            } else if (utilization < 50 && account.budgetedCost > 2000) {
              opportunity = 'Moderate Underutilization'
              potentialSavings = (account.budgetedCost - account.actualCost) * 0.5
              priority = 'Medium'
            } else if (utilization > 120) {
              opportunity = 'Budget Increase Needed'
              potentialSavings = 0
              priority = 'High'
            }

            return {
              accountName: account.accountName || account.accountId,
              actualCost: account.actualCost,
              budgetedCost: account.budgetedCost,
              utilization,
              opportunity,
              potentialSavings,
              priority
            }
          })
          .filter((item: any) => item.opportunity !== 'None')
          .sort((a: any, b: any) => b.potentialSavings - a.potentialSavings)
          .slice(0, 12)

        return opportunities
      }
    },

    // Account Risk Assessment (Donut with risk levels)
    accountRiskAssessment: {
      id: 'accountRiskAssessment',
      title: 'Account Risk Assessment',
      description: 'Risk distribution based on budget variance and growth',
      type: 'donut',
      extractor: (dataset) => {
        const analysis = dataset.analysis as any
        if (!analysis) return []

        const actualData = analysis?.data || analysis
        const byAccount = actualData?.budgetAnalysis?.byAccount || []

        const riskLevels = {
          high: 0,      // Over budget by >20% or very high growth
          medium: 0,    // Over budget by 10-20% or moderate issues
          low: 0,       // Within budget or minor variance
          minimal: 0    // Well under budget
        }

        byAccount.forEach((account: any) => {
          const utilization = account.budgetedCost > 0
            ? (account.actualCost / account.budgetedCost) * 100
            : 0

          if (utilization > 120 || account.actualCost > 50000) {
            riskLevels.high++
          } else if (utilization > 110 || (utilization > 90 && account.actualCost > 20000)) {
            riskLevels.medium++
          } else if (utilization > 70) {
            riskLevels.low++
          } else {
            riskLevels.minimal++
          }
        })

        return [
          { name: 'High Risk', value: riskLevels.high, color: '#ef4444' },
          { name: 'Medium Risk', value: riskLevels.medium, color: '#f59e0b' },
          { name: 'Low Risk', value: riskLevels.low, color: '#3b82f6' },
          { name: 'Minimal Risk', value: riskLevels.minimal, color: '#10b981' }
        ].filter(level => level.value > 0)
      }
    },

    // Historical Monthly Trend Chart
    historicalMonthlyTrend: {
      id: 'historicalMonthlyTrend',
      title: 'Historical Monthly Costs',
      description: 'Month-by-month cost breakdown for the selected period',
      type: 'bar',
      extractor: (dataset) => {
        const historical = dataset.historical as any
        if (!historical) return []

        const actualData = historical?.data || historical
        const monthlyBreakdown = actualData?.monthlyBreakdown || []


        // Require at least 4 months of data to show this chart
        if (monthlyBreakdown.length < 4) {
          return []
        }

        // Format the data for bar chart
        return monthlyBreakdown.map((month: any) => ({
          name: month.month, // YYYY-MM format
          value: month.cost,
          formattedValue: month.costFormatted
        }))
      }
    },

    // Historical Cost Comparison (Year-over-Year)
    historicalComparison: {
      id: 'historicalComparison',
      title: 'Monthly Trend Comparison',
      description: 'Monthly cost trends over the selected period',
      type: 'line',
      extractor: (dataset) => {
        const historical = dataset.historical as any
        if (!historical) return null

        const actualData = historical?.data || historical
        const monthlyBreakdown = actualData?.monthlyBreakdown || []
        
        // For year-over-year comparison, we need at least 2 full years of data
        // For now, let's just show the monthly trend as a single line
        
        if (monthlyBreakdown.length === 0) return null
        
        // Extract dates and values for a simple line chart
        const dates: string[] = []
        const values: number[] = []
        
        monthlyBreakdown.forEach((month: any) => {
          // Format as "MMM YY" for display
          const [year, monthNum] = month.month.split('-')
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          const monthName = monthNames[parseInt(monthNum) - 1]
          const shortYear = year.substring(2)
          
          dates.push(`${monthName} '${shortYear}`)
          values.push(month.cost)
        })

        // Return as a single series for now
        return {
          dates,
          series: [{
            name: 'Monthly Costs',
            dates,
            values,
            total: values.reduce((sum, val) => sum + val, 0)
          }]
        }
      }
    },

    // Last Month vs This Month vs AWS Projection (Multi-bar Chart)
    monthlyTrendWithForecast: {
      id: 'monthlyTrendWithForecast',
      title: 'Monthly Trend with AWS Projection',
      description: 'Compare last month, current month, and next month AWS projection',
      type: 'bar',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        const historical = dataset.historical as any
        const forecast = dataset.forecast as any

        if (!summary) {
          return []
        }

        const mode = dataset.mode || 'billable'
        const summaryData = unwrapByMode(summary, mode)
        const historicalData = unwrapByMode(historical, mode)
        const forecastData = unwrapByMode(forecast, mode)

        // Get current month data
        const currentAccounts = summaryData?.accounts || []
        const accountMap = new Map<string, { 
          name: string, 
          current: number, 
          lastMonth: number, 
          forecast: number 
        }>()

        // Populate current month data
        currentAccounts.forEach((account: any) => {
          if (account.accountId && account.totalCost) {
            accountMap.set(account.accountId, {
              name: account.accountName || account.accountId,
              current: account.totalCost,
              lastMonth: 0,
              forecast: 0
            })
          }
        })

        // Get last month data from historical if available
        if (historicalData?.monthlyBreakdown) {
          const lastMonthData = historicalData.monthlyBreakdown[historicalData.monthlyBreakdown.length - 2] // Second to last month
          if (lastMonthData?.accountBreakdown) {
            lastMonthData.accountBreakdown.forEach((account: any) => {
              if (accountMap.has(account.accountId)) {
                accountMap.get(account.accountId)!.lastMonth = account.cost || 0
              }
            })
          }
        }

        // Get forecast data
        const totalForecast = extractForecastTotal(forecastData)

        // Distribute forecast proportionally based on current spending
        const totalCurrent = Array.from(accountMap.values()).reduce((sum, acc) => sum + acc.current, 0)
        
        accountMap.forEach((data, accountId) => {
          if (totalCurrent > 0 && totalForecast > 0) {
            data.forecast = totalForecast * (data.current / totalCurrent)
          } else {
            data.forecast = 0
          }
        })

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        return Array.from(accountMap.entries())
          .filter(([accountId]) => !filterBySelection || selectedAccounts.includes(accountId))
          .map(([accountId, data]) => ({
            accountId,
            accountName: data.name,
            lastMonth: data.lastMonth,
            currentMonth: data.current,
            forecast: data.forecast,
            monthOverMonth: data.lastMonth > 0 ? ((data.current - data.lastMonth) / data.lastMonth) * 100 : 0,
            forecastChange: data.current > 0 ? ((data.forecast - data.current) / data.current) * 100 : 0
          }))
          .filter(item => item.currentMonth > SIGNIFICANT_ACCOUNT_COST) // Focus on significant accounts
          .sort((a, b) => b.currentMonth - a.currentMonth)
          .slice(0, 12)
      }
    },

    // REMOVED: forecastAccuracyAnalysis - Was using fake/mock data
    // This chart requires historical forecast tracking data that we don't have
    // DO NOT USE FAKE DATA

    // Account Forecast Comparison (Horizontal Bar Chart)
    accountForecastComparison: {
      id: 'accountForecastComparison',
      title: 'Account AWS Projection Comparison',
      description: 'Side-by-side AWS projection comparison across accounts',
      type: 'bar',
      extractor: (dataset) => {
        const forecast = dataset.forecast as any
        const summary = dataset.summary as any

        if (!forecast || !summary) {
          return []
        }

        const mode = dataset.mode || 'billable'
        const forecastData = unwrapByMode(forecast, mode)
        const summaryData = unwrapByMode(summary, mode)

        const currentAccounts = summaryData?.accounts || []

        // Get total forecast
        const totalForecast = extractForecastTotal(forecastData)

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        
        // Calculate total current spending for distribution calculation
        const totalCurrentSpending = currentAccounts
          .filter((account: any) => !filterBySelection || selectedAccounts.includes(account.accountId))
          .reduce((sum: number, acc: any) => sum + (acc.totalCost || 0), 0)
        

        // Build forecast comparison by account
        return currentAccounts
          .filter((account: any) => !filterBySelection || selectedAccounts.includes(account.accountId))
          .filter((account: any) => account.totalCost > MEANINGFUL_SPEND_THRESHOLD) // Focus on accounts with meaningful spend
          .map((account: any) => {
            const currentCost = account.totalCost || 0
            const budget = account.budget || 0
            
            // Distribute forecast proportionally based on current spending
            let forecastCost = 0
            if (totalCurrentSpending > 0 && totalForecast > 0) {
              forecastCost = totalForecast * (currentCost / totalCurrentSpending)
            } else if (totalForecast > 0) {
              // If no current spending data, distribute equally among accounts
              const accountCount = currentAccounts.filter((account: any) => !filterBySelection || selectedAccounts.includes(account.accountId)).length
              forecastCost = accountCount > 0 ? totalForecast / accountCount : 0
            }
            
            
            return {
              accountId: account.accountId,
              accountName: account.accountName || account.accountId,
              currentCost,
              forecastCost,
              budget,
              forecastToBudgetRatio: budget > 0 ? (forecastCost / budget) * 100 : 0,
              growthProjection: currentCost > 0 ? ((forecastCost - currentCost) / currentCost) * 100 : 0,
              riskLevel: forecastCost > budget ? 'high' : forecastCost > budget * 0.9 ? 'medium' : 'low'
            }
          })
          .sort((a, b) => b.forecastCost - a.forecastCost)
          .slice(0, 15)
      }
    },

    // Cumulative Burn-up Chart (Budget Progress Tracking)
    cumulativeBurnUp: {
      id: 'cumulativeBurnUp',
      title: 'Cumulative Cost Burn-up',
      description: 'Shows if accounts are on track to meet budget over time',
      type: 'line',
      extractor: (dataset) => {
        const historical = dataset.historical as any
        const summary = dataset.summary as any
        const analysis = dataset.analysis as any
        
        
        if (!summary) {
          return []
        }

        const summaryData = unwrapCostData(dataset, 'summary')
        const analysisData = unwrapCostData(dataset, 'analysis')

        // Get current accounts and budget data
        const currentAccounts = summaryData?.accounts || []
        const budgetData = analysisData?.budgetAnalysis?.byAccount || []
        
        // console.log('CumulativeBurnUp: Found', currentAccounts.length, 'accounts,', budgetData.length, 'budget entries')

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        // For cumulative burn-up, we need time-series data
        // Use resultsByTime from summary for the current period
        const resultsByTime = getResultsByTime(dataset, 'summary')
        
        // console.log('CumulativeBurnUp: Found', resultsByTime.length, 'time periods')
        
        if (resultsByTime.length === 0) {
          return []
        }

        // Build cumulative data for each account
        const accountMap = new Map<string, {
          name: string,
          monthlyBudget: number,
          annualBudget: number,
          cumulative: number[],
          dates: string[]
        }>()

        // Initialize accounts with budget info
        currentAccounts
          .filter((account: any) => !filterBySelection || selectedAccounts.includes(account.accountId))
          .filter((account: any) => account.totalCost > SIGNIFICANT_ACCOUNT_COST) // Focus on significant accounts
          .forEach((account: any) => {
            const budgetInfo = budgetData.find((b: any) => b.accountId === account.accountId)
            const monthlyBudget = budgetInfo?.budgetedCost || 0
            
            accountMap.set(account.accountId, {
              name: account.accountName || account.accountId,
              monthlyBudget: monthlyBudget,
              annualBudget: monthlyBudget * 12, // Annualize for proper comparison
              cumulative: [],
              dates: []
            })
          })
        
        // console.log('CumulativeBurnUp: Tracking', accountMap.size, 'accounts')

        // Process time periods to build cumulative data
        const dates: string[] = []
        const cumulativeByAccount = new Map<string, number>()
        
        
        resultsByTime.forEach((bucket: any, timeIndex: number) => {
          const dateStr = bucket?.TimePeriod?.Start || ''
          dates.push(dateStr)
          
          if (bucket.Groups) {
            bucket.Groups.forEach((g: any) => {
              const accountId = g.Keys?.[0] || 'unknown'
              const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
              
              if (accountMap.has(accountId)) {
                const currentCumulative = cumulativeByAccount.get(accountId) || 0
                const newCumulative = currentCumulative + amount
                cumulativeByAccount.set(accountId, newCumulative)
                
                const accountData = accountMap.get(accountId)!
                accountData.cumulative.push(newCumulative)
                accountData.dates.push(dateStr)
                
                // Debug first few and last period
                if (timeIndex <= 2 || timeIndex === resultsByTime.length - 1) {
                }
              }
            })
          }
          
          // Fill in zeros for accounts with no activity this period
          accountMap.forEach((data, accountId) => {
            if (data.cumulative.length <= timeIndex) {
              const currentCumulative = cumulativeByAccount.get(accountId) || 0
              data.cumulative.push(currentCumulative)
              data.dates.push(dateStr)
            }
          })
        })

        // Convert to array format for chart
        const result = Array.from(accountMap.entries())
          .map(([accountId, data]) => {
            const periods = data.dates.length
            const budgetLine = []
            
            // Determine the time span of the data
            let periodsInYear = 12 // Default to 12 months
            
            if (periods > 0 && data.dates.length > 1) {
              // Calculate actual time span from first to last date
              const firstDateStr = data.dates[0]
              const lastDateStr = data.dates[data.dates.length - 1]
              if (firstDateStr && lastDateStr) {
                const firstDate = new Date(firstDateStr)
                const lastDate = new Date(lastDateStr)
                const daysDiff = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
                
                
                // Determine if this is daily or monthly data
                // If we have roughly one period per day (within tolerance), it's daily data
                const periodsPerDay = periods / daysDiff
                
                if (periodsPerDay > 0.8 && periodsPerDay <= 1.2 && daysDiff < 40) {
                  // Daily data - approximately one period per day
                  periodsInYear = 365
                } else if (periods <= 12 && daysDiff > 20) {
                  // Monthly data - few periods over many days
                  periodsInYear = 12
                } else {
                  // Default to daily for short time spans with multiple periods
                  if (daysDiff <= 31 && periods >= daysDiff * 0.8) {
                    periodsInYear = 365
                  } else {
                    periodsInYear = 12
                  }
                }
              }
            }
            
            // Create budget progression line
            if (data.monthlyBudget > 0) {
              // For daily data: use monthly budget spread across the days
              // For monthly data: use annual budget spread across months
              
              
              for (let i = 1; i <= periods; i++) {
                if (periodsInYear === 365) {
                  // Daily data - show monthly budget prorated for days in current month
                  const daysInMonth = 30 // Approximate days in a month
                  const dayOfMonth = Math.min(i, daysInMonth) // Cap at days in month
                  const budgetProgress = dayOfMonth / daysInMonth
                  const budgetValue = data.monthlyBudget * budgetProgress
                  // Show linear progression up to the monthly budget
                  budgetLine.push(budgetValue)
                  
                  if (i <= 3 || i === periods) {
                  }
                } else {
                  // Monthly data - use annual budget
                  const progress = i / 12
                  const budgetValue = data.annualBudget * Math.min(progress, 1)
                  budgetLine.push(budgetValue)
                  
                  if (i <= 3 || i === periods) {
                  }
                }
              }
              
            }
            
            const lastCumulative = data.cumulative[data.cumulative.length - 1] || 0
            const lastBudgetValue = budgetLine[budgetLine.length - 1] || data.monthlyBudget
            
            
            return {
              accountId,
              accountName: data.name,
              months: data.dates.map(d => {
                // Format date for display
                const date = new Date(d)
                return `${date.getMonth() + 1}/${date.getDate()}`
              }),
              actualSpend: data.cumulative,
              budgetTrack: budgetLine,
              totalBudget: data.annualBudget,
              monthlyBudget: data.monthlyBudget,
              isOverBudget: lastCumulative > lastBudgetValue,
              burnRate: periods > 0 ? lastCumulative / periods : 0,
              utilizationPercent: lastBudgetValue > 0 ? (lastCumulative / lastBudgetValue) * 100 : 0
            }
          })
          .filter(item => item.actualSpend.length > 0)
          .sort((a, b) => {
            // Sort by last cumulative value
            const aLast = a.actualSpend[a.actualSpend.length - 1] || 0
            const bLast = b.actualSpend[b.actualSpend.length - 1] || 0
            return bLast - aLast
          })
          .slice(0, 8) // Limit for readability
        
        return result
      }
    },

    // Historical vs Forecast Comparison
    historicalVsForecastComparison: {
      id: 'historicalVsForecastComparison',
      title: 'Historical Average vs AWS Projection',
      description: 'Compare AWS projection to historical spending patterns',
      type: 'bar',
      extractor: (dataset) => {
        const historical = dataset.historical as any
        const forecast = dataset.forecast as any
        const summary = dataset.summary as any

        if (!historical || !forecast) {
          return []
        }

        const mode = dataset.mode || 'billable'
        const historicalData = unwrapByMode(historical, mode)
        const forecastData = unwrapByMode(forecast, mode)
        const summaryData = unwrapByMode(summary, mode)

        const monthlyData = historicalData?.monthlyBreakdown || []
        const forecastTotal = forecastData?.forecast?.total?.Amount ? parseFloat(forecastData.forecast.total.Amount) : 0
        const currentAccounts = summaryData?.accounts || []

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        return currentAccounts
          .filter((account: any) => !filterBySelection || selectedAccounts.includes(account.accountId))
          .filter((account: any) => account.totalCost > DEPT_MIN_TOTAL_THRESHOLD)
          .map((account: any) => {
            // Calculate historical average
            const historicalSpends = monthlyData
              .map((month: any) => month.accountBreakdown?.find((a: any) => a.accountId === account.accountId)?.cost || 0)
              .filter((cost: number) => cost > 0)
            
            const historicalAvg = historicalSpends.length > 0 
              ? historicalSpends.reduce((sum: number, cost: number) => sum + cost, 0) / historicalSpends.length 
              : 0

            // Proportional forecast for this account
            const totalCurrent = currentAccounts.reduce((sum: number, acc: any) => sum + (acc.totalCost || 0), 0)
            const accountForecast = totalCurrent > 0 ? forecastTotal * (account.totalCost / totalCurrent) : 0

            return {
              accountName: account.accountName || account.accountId,
              historicalAverage: historicalAvg,
              forecastValue: accountForecast,
              variance: accountForecast - historicalAvg,
              variancePercent: historicalAvg > 0 ? ((accountForecast - historicalAvg) / historicalAvg) * 100 : 0,
              trend: accountForecast > historicalAvg ? 'increasing' : accountForecast < historicalAvg ? 'decreasing' : 'stable'
            }
          })
          .sort((a: any, b: any) => Math.abs(b.variance) - Math.abs(a.variance))
          .slice(0, 10)
      }
    },

    // Daily Spend + Forecast for Current Month (Actual to Date + Forecast for Remaining Days)
    organizationForecastComparison: {
      id: 'organizationForecastComparison',
      title: 'Current Month: Actual & AWS Projected Daily Spend',
      description: 'Daily spending with actual data to date and AWS projection for remaining days',
      type: 'line', // Combined bar + line chart
      extractor: (dataset) => {
        const summary = dataset.summary as any
        const forecast = dataset.forecast as any
        const analysis = dataset.analysis as any
        
        if (!summary) {
          return null
        }

        const summaryData = unwrapCostData(dataset, 'summary')
        const analysisData = unwrapCostData(dataset, 'analysis')
        
        // Get time-series data for daily spending
        const resultsByTime = getResultsByTime(dataset, 'summary')
        
        if (resultsByTime.length === 0) {
          return null
        }

        // Handle account filtering first
        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0
        
        // Build daily spend data (filtered if accounts are selected)
        const dailySpends: number[] = []
        const dates: string[] = []
        const cumulative: number[] = []
        let runningTotal = 0
        
        resultsByTime.forEach((bucket: any) => {
          const dateStr = bucket?.TimePeriod?.Start || ''
          const date = new Date(dateStr)
          const dayLabel = `${date.getMonth() + 1}/${date.getDate()}`
          dates.push(dayLabel)
          
          let dayTotal = 0
          if (bucket.Groups) {
            bucket.Groups.forEach((g: any) => {
              const accountId = g.Keys?.[0] || 'unknown'
              // Filter by selected accounts if applicable
              if (!filterBySelection || selectedAccounts.includes(accountId)) {
                const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
                dayTotal += amount
              }
            })
          } else if (bucket.Total?.UnblendedCost?.Amount && !filterBySelection) {
            // Only use total if no filtering is applied (no accounts selected)
            dayTotal = parseFloat(bucket.Total.UnblendedCost.Amount)
          }
          
          dailySpends.push(dayTotal)
          runningTotal += dayTotal
          cumulative.push(runningTotal)
        })

        // Get forecast data from API
        const forecastResponse = forecast?.data || forecast
        
        // Handle the nested structure from the API response
        // The API returns: { data: { period: {...}, forecast: { total, forecastResultsByTime }, note: "..." } }
        let forecastResults: any[] = []
        let forecastTotal = 0
        
        // Try multiple paths to find the forecast data
        if (forecastResponse?.forecast?.forecastResultsByTime) {
          forecastResults = forecastResponse.forecast.forecastResultsByTime
          if (forecastResponse.forecast.total?.Amount) {
            forecastTotal = parseFloat(forecastResponse.forecast.total.Amount)
          }
        } else if (forecastResponse?.data?.forecast?.forecastResultsByTime) {
          forecastResults = forecastResponse.data.forecast.forecastResultsByTime
          if (forecastResponse.data.forecast.total?.Amount) {
            forecastTotal = parseFloat(forecastResponse.data.forecast.total.Amount)
          }
        } else if (forecastResponse?.forecastResultsByTime) {
          forecastResults = forecastResponse.forecastResultsByTime
          if (forecastResponse.total?.Amount) {
            forecastTotal = parseFloat(forecastResponse.total.Amount)
          }
        }
        
        
        // Build a map of forecast values by date
        const forecastByDate = new Map<string, number>()
        let totalForecastAmount = 0
        
        if (forecastResults && forecastResults.length > 0) {
          forecastResults.forEach((period: any) => {
            const dateStr = period?.TimePeriod?.Start || ''
            const date = new Date(dateStr)
            const dayLabel = `${date.getMonth() + 1}/${date.getDate()}`
            
            // Get the forecast value for this day - try multiple possible fields
            let forecastValue = 0
            
            // AWS forecast API typically returns MeanValue
            if (period.MeanValue !== undefined && period.MeanValue !== null) {
              forecastValue = parseFloat(period.MeanValue)
            } 
            // Some responses might have Amount
            else if (period.Amount !== undefined && period.Amount !== null) {
              forecastValue = parseFloat(period.Amount)
            }
            // Try nested structures
            else if (period.Total?.Amount !== undefined && period.Total?.Amount !== null) {
              forecastValue = parseFloat(period.Total.Amount)
            }
            // Look for prediction values
            else if (period.PredictionMean !== undefined && period.PredictionMean !== null) {
              forecastValue = parseFloat(period.PredictionMean)
            }
            
            // Debug first few forecast values
            if (forecastByDate.size < 3) {
            }
            
            // Account filtering is now done at the API level, so we get the correct forecast values
            
            forecastByDate.set(dayLabel, forecastValue)
            totalForecastAmount += forecastValue
          })
        }
        
        
        // Calculate forecast for remaining days
        const currentDate = new Date()
        const currentDay = currentDate.getDate()
        const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
        const totalDaysInMonth = lastDayOfMonth.getDate()
        const remainingDays = totalDaysInMonth - currentDay
        
        // Add forecast for remaining days
        const forecastDailySpends: (number | null)[] = [...dailySpends.map(() => null)]
        const forecastCumulative: (number | null)[] = []
        
        // Start forecast cumulative from last actual value to create continuous line
        let forecastRunningTotal = runningTotal
        
        // Fill in nulls for actual days in forecast cumulative, except the last one
        for (let i = 0; i < cumulative.length - 1; i++) {
          forecastCumulative.push(null)
        }
        
        // Add connection point - last actual value is first forecast value
        // This creates a seamless line from actual to forecast
        forecastCumulative.push(runningTotal)
        
        // Add forecast values for remaining days using real API data
        for (let day = currentDay + 1; day <= totalDaysInMonth; day++) {
          const dayLabel = `${currentDate.getMonth() + 1}/${day}`
          dates.push(dayLabel)
          
          // Get the forecast value for this day from API data
          const forecastDayValue = forecastByDate.get(dayLabel) || 0
          
          
          dailySpends.push(0) // No actual data for future days
          forecastDailySpends.push(forecastDayValue)
          forecastRunningTotal += forecastDayValue
          cumulative.push(null as any) // Null for forecast days in actual line
          forecastCumulative.push(forecastRunningTotal)
        }

        // Get budget information - sum budgets for selected accounts
        let monthlyBudget = 0
        
        if (filterBySelection && analysisData?.budgetAnalysis?.byAccount) {
          // Sum budgets for selected accounts only
          monthlyBudget = analysisData.budgetAnalysis.byAccount
            .filter((account: any) => selectedAccounts.includes(account.accountId))
            .reduce((sum: number, account: any) => sum + (account.budgetedCost || 0), 0)
        } else if (analysisData?.summary?.totalBudget) {
          // Use total budget when no accounts selected
          monthlyBudget = analysisData.summary.totalBudget
        } else if (analysisData?.budgetAnalysis?.summary?.totalBudget) {
          monthlyBudget = analysisData.budgetAnalysis.summary.totalBudget
        }

        // Create budget line (daily progression)
        const budgetLine = dates.map((_, index) => {
          const progress = (index + 1) / totalDaysInMonth
          return monthlyBudget * progress
        })

        // Budget is already filtered by account selection above
        // No need to scale values again since we filtered at the source


        return {
          dates,
          series: [
            {
              name: 'Actual Daily Spend',
              data: dailySpends,
              type: 'bar'
            },
            {
              name: 'AWS Projection Daily Spend',
              data: forecastDailySpends,
              type: 'bar'
            },
            {
              name: 'Cumulative Actual',
              data: cumulative,
              type: 'line'
            },
            {
              name: 'Cumulative AWS Projection',
              data: forecastCumulative,
              type: 'line'
            },
            {
              name: 'GDMS Forecasted Costs',
              data: budgetLine,
              type: 'line'
            }
          ],
          metadata: {
            currentDay,
            totalDaysInMonth,
            remainingDays,
            avgDailyActual: dailySpends.length > 0 ? runningTotal / dailySpends.length : 0,
            avgDailyForecast: remainingDays > 0 ? (forecastRunningTotal - runningTotal) / remainingDays : 0,
            currentTotal: runningTotal,
            projectedTotal: forecastRunningTotal,
            monthlyBudget,
            projectedOverage: forecastRunningTotal - monthlyBudget,
            percentThroughMonth: (currentDay / totalDaysInMonth) * 100,
            forecastDataPoints: forecastByDate.size
          }
        }
      }
    },

    // REMOVED: scenarioOverlay - Was using FAKE/SIMULATED data with Math.random()
    // This chart was creating fake scenarios that don't exist
    // DO NOT USE FAKE DATA - only use real data from APIs

    // REMOVED: budgetSCurve - never referenced in chartIdsByScenario or advancedChartIds

    // REMOVED: serviceTimeHeatmap - Was using FAKE anomaly intensity data with Math.random()
    // This chart was simulating anomalies that don't exist in the data
    // DO NOT USE FAKE DATA - we don't have real anomaly detection data from the API

    // Year-End Forecast with Actuals (Contextual Chart - always shows full year)
    yearEndForecast: {
      id: 'yearEndForecast',
      title: 'Year-End Projection',
      description: 'Actual costs YTD + forecast through December with 80% confidence bands',
      type: 'line',
      extractor: (dataset) => {

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        // Use filtered data when accounts are selected, org-wide data otherwise
        const historical = filterBySelection
          ? (dataset.historical || dataset.orgWideHistorical)
          : (dataset.orgWideHistorical || dataset.historical) as any
        const yearEndForecast = dataset.yearEndForecast as any
        const currentMonthForecast = dataset.forecast as any // Current month remainder forecast
        const summary = dataset.summary as any
        const mode = dataset.mode || 'proforma'


        if (!historical && !yearEndForecast) {
          return null
        }

        // Handle historical data structure difference between modes
        const rawHistoricalData = historical?.data || historical
        let historicalData: any

        if (mode === 'proforma' && rawHistoricalData?.proforma) {
          // Proforma mode: use proforma historical data
          historicalData = rawHistoricalData.proforma
        } else if (mode === 'billable' && rawHistoricalData?.billable) {
          // Billable mode when proforma structure exists: use billable historical data
          historicalData = rawHistoricalData.billable
        } else if (rawHistoricalData?.billable || rawHistoricalData?.proforma) {
          // Fallback: if only one exists, use it
          historicalData = rawHistoricalData.billable || rawHistoricalData.proforma
        } else {
          // Old format: data directly without billable/proforma wrapper
          historicalData = rawHistoricalData
        }

        // Handle summary data structure difference between modes
        const rawSummaryData = summary?.data || summary
        let summaryData: any

        if (mode === 'proforma' && rawSummaryData?.proforma) {
          // Proforma mode: use proforma.accounts and proforma.summary
          summaryData = rawSummaryData.proforma
        } else if (mode === 'billable' || !rawSummaryData?.proforma) {
          // Standard mode: use accounts and summary directly
          summaryData = rawSummaryData
        } else {
          // Fallback
          summaryData = rawSummaryData
        }

        // API now always returns forecast in consistent structure for both modes
        const forecastData = yearEndForecast?.data || yearEndForecast
        const currentForecastData = currentMonthForecast?.data || currentMonthForecast


        // Build arrays for chart
        const months: string[] = []
        const actualValues: (number | null)[] = []
        const forecastValues: (number | null)[] = []
        const upperBound: (number | null)[] = []
        const lowerBound: (number | null)[] = []

        // Get current month (0-indexed)
        const today = new Date()
        const currentMonth = today.getMonth() // 0-11
        const currentYear = today.getFullYear()

        // Process historical data (Jan - last complete month)
        const monthlyBreakdown = historicalData?.monthlyBreakdown || []


        // Create a map of YYYY-MM to cost for easier lookup
        // Check if we're using filtered historical data or need to filter org-wide data
        const usingFilteredHistorical = filterBySelection && !!dataset.historical

        const historicalCostMap = new Map<string, number>()
        monthlyBreakdown.forEach((month: any) => {
          const monthKey = month.month // Format: YYYY-MM

          let cost = 0

          if (usingFilteredHistorical) {
            // Using filtered historical data from API - month.cost is already filtered
            cost = month.cost || 0
          } else if (filterBySelection && month.accountBreakdown && Array.isArray(month.accountBreakdown)) {
            // Using org-wide data but need client-side filtering by accountBreakdown
            cost = month.accountBreakdown
              .filter((acc: any) => selectedAccounts.includes(acc.accountId))
              .reduce((sum: number, acc: any) => sum + (acc.cost || 0), 0)
          } else {
            // Use total cost (org-wide, no filtering needed)
            cost = month.cost || 0
          }

          historicalCostMap.set(monthKey, cost)
        })

        // Get current month's actual spending from dedicated current month org-wide API
        // This is fetched separately to ensure we always have current month actuals
        // Filter by selected accounts if applicable
        const currentMonthSummary = dataset.currentMonthOrgWide as any
        const currentMonthData = currentMonthSummary?.data || currentMonthSummary

        let currentMonthActual = 0
        if (mode === 'proforma' && currentMonthData?.proforma?.accounts) {
          const accounts = currentMonthData.proforma.accounts
          if (filterBySelection) {
            currentMonthActual = accounts
              .filter((acc: any) => selectedAccounts.includes(acc.accountId))
              .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
          } else {
            currentMonthActual = accounts
              .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
          }
        } else if (currentMonthData?.accounts) {
          const accounts = currentMonthData.accounts
          if (filterBySelection) {
            currentMonthActual = accounts
              .filter((acc: any) => selectedAccounts.includes(acc.accountId))
              .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
          } else {
            currentMonthActual = accounts
              .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
          }
        }


        // Get current month's end-of-month forecast (actual + remainder)
        let currentMonthEndForecast = currentMonthActual // Default to actual if no forecast
        const remainderForecast = extractForecastTotal(currentForecastData)
        if (remainderForecast > 0) {
          currentMonthEndForecast = currentMonthActual + remainderForecast
        } else {
        }

        // Build full year view (Jan-Dec)
        for (let m = 0; m < 12; m++) {
          const date = new Date(currentYear, m, 1)
          const monthKey = `${currentYear}-${String(m + 1).padStart(2, '0')}`
          const monthLabel = date.toLocaleDateString('en-US', { month: 'short' })

          months.push(monthLabel)

          if (m < currentMonth) {
            // Past months - use historical data
            const actualCost = historicalCostMap.get(monthKey) || 0
            actualValues.push(actualCost)
            forecastValues.push(null)
            upperBound.push(null)
            lowerBound.push(null)
          } else if (m === currentMonth) {
            // Current month - use summary data (actual) and forecast (end-of-month projection)
            actualValues.push(currentMonthActual)
            forecastValues.push(currentMonthEndForecast) // End-of-month projection
            upperBound.push(null) // No confidence bands for current month
            lowerBound.push(null)
          } else {
            // Future months - will be filled with forecast data
            actualValues.push(null)
            forecastValues.push(null)
            upperBound.push(null)
            lowerBound.push(null)
          }
        }

        // Process forecast data (next month - December)
        if (forecastData?.forecast?.forecastResultsByTime) {
          const forecastByTime = forecastData.forecast.forecastResultsByTime


          forecastByTime.forEach((period: any, idx: number) => {
            const dateStr = period?.TimePeriod?.Start || ''
            if (!dateStr) {
              return
            }

            // Parse date using UTC to avoid timezone issues
            // AWS returns dates as "YYYY-MM-DD" which we need to parse consistently
            const date = new Date(dateStr + 'T00:00:00Z') // Force UTC interpretation
            const monthIndex = date.getUTCMonth() // 0-11, use UTC to avoid timezone shift
            const year = date.getUTCFullYear()
            const meanValue = parseFloat(period?.MeanValue || '0')


            // Process all future months in current year (including December)
            // Current month handled separately with currentMonthEndForecast
            if (year === currentYear && monthIndex > currentMonth) {
              // Get confidence intervals if available (80% = p10 to p90)
              let upper = null
              let lower = null

              if (period?.PredictionIntervalUpperBound && period?.PredictionIntervalLowerBound) {
                upper = parseFloat(period.PredictionIntervalUpperBound)
                lower = parseFloat(period.PredictionIntervalLowerBound)
              } else {
              }


              forecastValues[monthIndex] = meanValue
              upperBound[monthIndex] = upper
              lowerBound[monthIndex] = lower
            } else if (year === currentYear) {
            }
          })

          // Specifically check for December
          const decemberHasForecast = forecastValues[11] !== null
          if (decemberHasForecast) {
          }
        } else {
        }

        // Calculate budget data for the budget line using per-month PEP data when available
        // Falls back to flat estimatedMonthlyCharge, then to analysisData.budgetAnalysis
        const accountsList = (dataset as any).accountsList || []
        const analysis = dataset.analysis as any
        const analysisData = analysis?.data || analysis
        const byAccount = analysisData?.budgetAnalysis?.byAccount || []


        let aggregatedMonthlyBudgets: number[] = Array(12).fill(0)
        let totalAnnualBudget = 0
        let monthlyBudget = 0
        let anyAccountHasPepData = false

        // Try to use accountsList first (has PEP data)
        if (accountsList.length > 0) {
          const relevantAccounts = filterBySelection
            ? accountsList.filter((acc: any) => selectedAccounts.includes(acc.accountId))
            : accountsList

          // Aggregate monthly budgets across all relevant accounts
          relevantAccounts.forEach((account: any) => {
            const { monthlyArray, isPepData } = getAnnualBudgetArray(account)
            if (isPepData) anyAccountHasPepData = true

            for (let i = 0; i < 12; i++) {
              aggregatedMonthlyBudgets[i] += monthlyArray[i]
            }
          })

          totalAnnualBudget = aggregatedMonthlyBudgets.reduce((sum, val) => sum + val, 0)
          monthlyBudget = totalAnnualBudget / 12

        }

        // Fallback to analysis API budget data if accountsList didn't yield results
        if (totalAnnualBudget === 0 && byAccount.length > 0) {
          if (filterBySelection) {
            // Sum budgets for selected accounts
            totalAnnualBudget = byAccount
              .filter((a: any) => selectedAccounts.includes(a.accountId))
              .reduce((sum: number, a: any) => sum + (a.budgetedCost || 0), 0) * 12
          } else {
            // Sum all account budgets for org-wide view
            totalAnnualBudget = byAccount
              .reduce((sum: number, a: any) => sum + (a.budgetedCost || 0), 0) * 12
          }
          monthlyBudget = totalAnnualBudget / 12
          aggregatedMonthlyBudgets = Array(12).fill(monthlyBudget)
          anyAccountHasPepData = false

        }

        // Generate next year projection data using actual AWS forecasts
        // AWS provides up to 12 months of forecasts from today, which may span into next year
        const nextYear = currentYear + 1
        const nextYearMonths: string[] = []
        const nextYearForecasts: (number | null)[] = []

        // Build next year month labels
        for (let m = 0; m < 12; m++) {
          const date = new Date(nextYear, m, 1)
          const monthLabel = date.toLocaleDateString('en-US', { month: 'short' })
          nextYearMonths.push(monthLabel)
          nextYearForecasts.push(null) // Initialize with null
        }

        // Parse AWS forecast data that falls into next year
        if (forecastData?.forecast?.forecastResultsByTime) {
          const forecastByTime = forecastData.forecast.forecastResultsByTime


          forecastByTime.forEach((period: any, idx: number) => {
            const dateStr = period?.TimePeriod?.Start || ''
            if (!dateStr) return

            // Parse date using UTC to avoid timezone issues
            const date = new Date(dateStr + 'T00:00:00Z')
            const monthIndex = date.getUTCMonth() // 0-11
            const year = date.getUTCFullYear()
            const meanValue = parseFloat(period?.MeanValue || '0')


            // Only include forecasts for next year
            if (year === nextYear && meanValue > 0) {
              nextYearForecasts[monthIndex] = meanValue
            } else if (year === nextYear) {
            }
          })
        } else {
        }

        const hasNextYearData = nextYearForecasts.some(v => v !== null)


        return {
          currentYear: {
            year: currentYear,
            months,
            series: [
              {
                name: 'Actual',
                data: actualValues,
                type: 'bar'
              },
              {
                name: 'AWS Projection',
                data: forecastValues,
                type: 'bar'
              }
            ],
            confidenceBands: {
              upper: upperBound,
              lower: lowerBound
            },
            budget: {
              monthlyArray: aggregatedMonthlyBudgets,
              monthly: monthlyBudget,
              annual: totalAnnualBudget,
              isPepData: anyAccountHasPepData
            },
            metadata: {
              currentMonth: currentMonth + 1,
              filterBySelection,
              selectedAccountsCount: filterBySelection ? selectedAccounts.length : null,
              scope: filterBySelection ? 'Selected Accounts' : 'Organization-Wide',
              // Year total: sum of actuals for past months + projected total for current and future months
              yearTotal: (() => {
                let total = 0
                for (let i = 0; i < 12; i++) {
                  if (i < currentMonth) {
                    // Past months: use actual
                    total += actualValues[i] || 0
                  } else {
                    // Current and future months: use forecast (which includes current month projection)
                    total += forecastValues[i] || 0
                  }
                }
                return total
              })()
            }
          },
          nextYear: {
            year: nextYear,
            months: nextYearMonths,
            series: [
              {
                name: 'AWS Projection',
                data: nextYearForecasts,
                type: 'bar'
              }
            ],
            budget: {
              monthlyArray: aggregatedMonthlyBudgets,
              monthly: monthlyBudget,
              annual: totalAnnualBudget,
              isPepData: anyAccountHasPepData
            },
            metadata: {
              filterBySelection,
              selectedAccountsCount: filterBySelection ? selectedAccounts.length : null,
              scope: filterBySelection ? 'Selected Accounts' : 'Organization-Wide',
              projectedTotal: nextYearForecasts.reduce((sum: number, val: number | null) => sum + (val || 0), 0),
              monthsWithData: nextYearForecasts.filter(v => v !== null).length,
              disclaimer: hasNextYearData
                ? `Showing AWS forecasts for next ${nextYearForecasts.filter(v => v !== null).length} months. AWS forecasts extend up to 12 months from today.`
                : 'AWS forecast data for next year not yet available. Forecasts extend up to 12 months from today.'
            }
          }
        }
      }
    }
  }

  // Dynamic chart selection based on scenario
  // Default charts shown by scenario (Tier 1 + Tier 2: Essential + Context-specific)
  const chartIdsByScenario: Record<Scenario, string[]> = {
    // No accounts selected - strategic organizational overview (5 default charts)
    'all-accounts': [
      'yearEndForecast',                  // Year-end projection (org-wide)
      'totalSpendTrend',                  // Overall spending trends
      'serviceBreakdown',                 // Service distribution
      'budgetUtilization',                // Budget status (current periods)
      'topSpenders',                      // Top cost accounts
      'historicalMonthlyTrend'            // Monthly history (historical periods)
    ],

    // Single account selected - focused account deep dive (4 default charts)
    'single-account': [
      'yearEndForecast',                  // Year-end projection for selected account
      'totalSpendTrend',                  // Account spending trend
      'serviceBreakdown',                 // Account service usage
      'budgetUtilization',                // Account budget status (current periods)
      'organizationForecastComparison',   // Daily actual + forecast (current month)
      'historicalMonthlyTrend'            // Monthly history (historical periods)
    ],

    // Few accounts selected (2-10) - comparative analysis (5 default charts)
    'few-accounts': [
      'yearEndForecast',                  // Year-end projection for selected accounts
      'accountForecastComparison',        // Compare forecasts across accounts
      'topSpenders',                      // Rank selected accounts
      'serviceBreakdown',                 // Combined service usage
      'budgetUtilization',                // Budget comparison
      'totalSpendTrend',                  // Combined spending trend
      'historicalMonthlyTrend'            // Monthly history (historical periods)
    ],

    // LOB tab active - line of business analysis (4 default charts)
    'lob-group': [
      'yearEndForecast',                  // Year-end projection for selected LOB
      'lobTrendComparison',               // Multi-line LOB trends
      'lobComparison',                    // LOB comparison bars
      'budgetUtilization',                // LOB budget status
      'topSpenders',                      // Top accounts in LOB
      'historicalMonthlyTrend'            // Monthly history (historical periods)
    ],

    // Department tab active - department analysis (4 default charts)
    'department-group': [
      'yearEndForecast',                  // Year-end projection for selected department
      'departmentTrendComparison',        // Department trend comparison
      'departmentBudgetPerformance',      // Department budget performance
      'budgetUtilization',                // Department budget usage
      'serviceBreakdown',                 // Department service mix
      'historicalMonthlyTrend'            // Monthly history (historical periods)
    ]
  }

  // Advanced charts available via "Show More" toggle (Tier 3: Power user features)
  const advancedChartIds: Record<Scenario, string[]> = {
    'all-accounts': [
      'costOptimizationOpportunities',    // Optimization recommendations
      'accountRiskAssessment',            // Risk assessment
      'billableVsProforma'                // Cost mode comparison (proforma mode)
    ],

    'single-account': [
      'cumulativeBurnUp',                 // Cumulative burn-up tracking
      'monthlyTrendWithForecast'          // Monthly trend with forecast
    ],

    'few-accounts': [
      'historicalVsForecastComparison',   // Historical patterns vs forecasts
      'monthlyTrendWithForecast'          // Monthly comparison with forecast
    ],

    'lob-group': [
      'departmentComparison',             // Departments within LOB
      'efficiencyScore'                   // LOB budget efficiency
    ],

    'department-group': [
      'totalSpendTrend',                  // Department overall trend
      'topSpenders'                       // Top accounts in department
    ]
  }

  const charts = computed<ChartDefinition[]>(() => {
    const currentScenario = args.scenario.value
    const currentTimeframe = args.timeframe?.value || 'thisMonth'
    const currentMode = args.mode?.value || 'billable'
    const showAdvancedCharts = args.showAdvanced?.value || false


    // Determine if we're looking at historical data vs current/future
    const isHistoricalPeriod = ['last7days', 'last30days', 'last90days', 'lastMonth', 'lastQuarter', 'lastYear', 'last12months', 'last24months'].includes(currentTimeframe)
    const isCurrentPeriod = ['thisMonth', 'thisQuarter', 'thisYear'].includes(currentTimeframe)


    // Charts that require current budget data (should be excluded for historical periods)
    const budgetDependentCharts = [
      'budgetUtilization',
      'efficiencyScore',
      'departmentBudgetPerformance',
      'costOptimizationOpportunities',
      'accountRiskAssessment'
    ]

    // Forecast charts that only make sense for current/future periods
    const forecastCharts = [
      'yearEndForecast',
      'organizationForecastComparison',
      'accountForecastComparison',
      'monthlyTrendWithForecast',
      'cumulativeBurnUp',
      'historicalVsForecastComparison'
    ]

    // Start with default charts for scenario
    let ids = [...chartIdsByScenario[currentScenario]]

    // Add advanced charts if toggle is enabled
    if (showAdvancedCharts) {
      ids = [...ids, ...advancedChartIds[currentScenario]]
    }


    // yearEndForecast is now available for all scenarios
    // It will show org-wide data when no accounts are selected, or filtered data when accounts are selected

    // Filter charts based on whether we're in historical or current period
    if (isHistoricalPeriod) {
      // Remove all forecast charts and budget-dependent charts for historical periods
      ids = ids.filter(id => !budgetDependentCharts.includes(id) && !forecastCharts.includes(id))

      // Ensure we have historical charts
      if (!ids.includes('historicalMonthlyTrend')) {
        const trendIndex = ids.indexOf('totalSpendTrend')
        if (trendIndex >= 0) {
          ids.splice(trendIndex + 1, 0, 'historicalMonthlyTrend')
        } else {
          ids.unshift('historicalMonthlyTrend')
        }
      }

      // Add historical comparison if appropriate
      if (!ids.includes('historicalComparison')) {
        ids.push('historicalComparison')
      }
    } else if (isCurrentPeriod) {
      // For current periods, remove historical-only charts
      ids = ids.filter(id => id !== 'historicalMonthlyTrend' && id !== 'historicalComparison')
    }
    
    // Add billable vs proforma comparison when in proforma mode
    if (currentMode === 'proforma' && !ids.includes('billableVsProforma')) {
      // Insert after totalSpendTrend if present, otherwise at beginning
      const trendIndex = ids.indexOf('totalSpendTrend')
      if (trendIndex >= 0) {
        ids.splice(trendIndex + 1, 0, 'billableVsProforma')
      } else {
        ids.unshift('billableVsProforma')
      }
    }
    
    const selectedCharts = ids.map(id => baseCharts[id]).filter(Boolean) as ChartDefinition[]

    // Adjust chart titles based on context
    const contextualCharts = selectedCharts.map(chart => {
      let contextualTitle = chart.title
      let contextualDescription = chart.description

      if (currentScenario === 'single-account') {
        if (chart.id === 'yearEndForecast') {
          contextualTitle = 'Year-End Projection: Selected Account'
          contextualDescription = 'Annual spending forecast for the selected account'
        } else if (chart.id === 'budgetUtilization') {
          contextualTitle = 'Account Budget Status'
          contextualDescription = 'Budget utilization for selected account'
        } else if (chart.id === 'serviceBreakdown') {
          contextualTitle = 'Account Services'
          contextualDescription = 'Service costs for selected account'
        }
      } else if (currentScenario === 'few-accounts') {
        if (chart.id === 'yearEndForecast') {
          contextualTitle = 'Year-End Projection: Selected Accounts'
          contextualDescription = 'Annual spending forecast for the selected accounts'
        } else if (chart.id === 'budgetUtilization') {
          contextualTitle = 'Selected Accounts Budget'
          contextualDescription = 'Budget comparison for selected accounts'
        } else if (chart.id === 'topSpenders') {
          contextualTitle = 'Selected Accounts Ranking'
          contextualDescription = 'Cost ranking of selected accounts'
        } else if (chart.id === 'serviceBreakdown') {
          contextualTitle = 'Combined Services'
          contextualDescription = 'Service costs across selected accounts'
        }
      } else if (currentScenario === 'lob-group') {
        if (chart.id === 'yearEndForecast') {
          contextualTitle = 'Year-End Projection: Line of Business'
          contextualDescription = 'Annual spending forecast for the selected line of business'
        }
      } else if (currentScenario === 'department-group') {
        if (chart.id === 'yearEndForecast') {
          contextualTitle = 'Year-End Projection: Department'
          contextualDescription = 'Annual spending forecast for the selected department'
        }
      }

      return {
        ...chart,
        title: contextualTitle,
        description: contextualDescription
      }
    })

    return contextualCharts
  })

  return { charts }
}