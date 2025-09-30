import { computed } from 'vue'
import type { Ref } from 'vue'
import type { NormalizedDataset } from '~/types/costs'
import type { Scenario } from '~/composables/useCostScenario'

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
}) => {
  const currentScenario = args.scenario.value
  const currentTimeframe = args.timeframe?.value || 'thisMonth'
  const currentMode = args.mode?.value || 'billable'
  
  // Determine if we're looking at historical data (no current budget data available)
  const isHistoricalPeriod = ['last7days', 'last30days', 'last90days', 'lastMonth', 'lastQuarter', 'lastYear'].includes(currentTimeframe)
  const isCurrentPeriod = ['thisMonth', 'thisQuarter', 'thisYear'].includes(currentTimeframe)
  
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
        const actualData = summary?.data || summary
        const isProformaMode = dataset.mode === 'proforma'

        // In proforma mode, data is structured differently
        let resultsByTime: any[] = []
        
        if (isProformaMode && actualData?.proforma?.rawData?.resultsByTime) {
          // Proforma mode - use proforma data
          resultsByTime = actualData.proforma.rawData.resultsByTime
        } else if (actualData?.rawData?.resultsByTime) {
          // Standard billable mode
          resultsByTime = actualData.rawData.resultsByTime
        } else if (actualData?.resultsByTime) {
          // Fallback to direct resultsByTime
          resultsByTime = actualData.resultsByTime
        }

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
              if (isFirstOfMonth && amount > 100000) { // >$100k on 1st suggests master account
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
          .slice(0, 5)

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
        const analysis = dataset.analysis as any
        if (!analysis) return []

        const actualData = analysis?.data || analysis
        const byAccount = actualData?.budgetAnalysis?.byAccount || []
        const selectedAccounts = dataset.accounts || []

        // console.log('BudgetUtilization: filtering', byAccount.length, 'accounts, selected:', selectedAccounts)

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
          .sort((a: any, b: any) => b.actualCost - a.actualCost)
          .slice(0, 20) // Allow more for single/few account scenarios
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

        const actualData = services?.data || services
        const selectedAccounts = dataset.accounts || []
        const isProformaMode = dataset.mode === 'proforma'

        // console.log('ServiceBreakdown: analyzing services, selected accounts:', selectedAccounts, 'mode:', dataset.mode)
        // console.log('ServiceBreakdown: services data structure:', actualData ? Object.keys(actualData) : 'no data')

        // Extract service costs from the dedicated services API call
        const serviceMap = new Map<string, number>()

        // Try multiple paths to find service data
        let resultsByTime: any[] = []
        
        if (isProformaMode && actualData?.proforma?.resultsByTime) {
          // Proforma mode - use proforma service data
          resultsByTime = actualData.proforma.resultsByTime
        } else if (actualData?.resultsByTime) {
          // Standard billable mode
          resultsByTime = actualData.resultsByTime
        } else if (actualData?.rawData?.resultsByTime) {
          // Fallback to rawData path
          resultsByTime = actualData.rawData.resultsByTime
        }
        
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
              .slice(0, 5)
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
          .filter(item => item.value > 1) // Filter out very small costs
          .sort((a, b) => b.value - a.value)
          .slice(0, 8) // Top 8 services for better pie chart readability

        // console.log('ServiceBreakdown: returning', result.length, 'services')

        return result
      }
    },

    // Next Month Forecast (Gauge)
    forecastGauge: {
      id: 'forecastGauge',
      title: 'Next Month Forecast',
      description: 'Predicted spending for next month',
      type: 'gauge',
      extractor: (dataset) => {
        const forecast = dataset.forecast as any
        if (!forecast) return null

        const actualData = forecast?.data || forecast
        const analysis = dataset.analysis as any
        const analysisData = analysis?.data || analysis

        // Get current month's budget total
        const totalBudget = analysisData?.summary?.totalBudget || 0

        // Extract forecast value
        let forecastValue = 0
        if (actualData?.forecast?.total?.Amount) {
          forecastValue = parseFloat(actualData.forecast.total.Amount)
        } else if (actualData?.forecast?.total) {
          forecastValue = parseFloat(actualData.forecast.total)
        } else if (actualData?.forecastResultsByTime?.length > 0) {
          // Sum all forecast periods
          forecastValue = actualData.forecastResultsByTime.reduce((sum: number, r: any) => {
            return sum + parseFloat(r.MeanValue || r.Total?.UnblendedCost?.Amount || '0')
          }, 0)
        }

        return {
          value: forecastValue,
          budget: totalBudget,
          percentage: totalBudget > 0 ? (forecastValue / totalBudget) * 100 : 0
        }
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

    // Cost Anomalies
    costAnomalies: {
      id: 'costAnomalies',
      title: 'Cost Anomalies',
      description: 'Unusual spending patterns detected',
      type: 'scatter',
      extractor: (dataset) => {
        const analysis = dataset.analysis as any
        if (!analysis) return []

        const actualData = analysis?.data || analysis
        const anomalies = actualData?.anomalies?.detected || []

        return anomalies.map((a: any) => ({
          date: a.date,
          accountName: a.accountName || a.accountId,
          actual: a.cost,
          expected: a.expectedCost,
          deviation: a.deviationPercent
        }))
      }
    },

    // Top Spenders Bar Chart
    topSpenders: {
      id: 'topSpenders',
      title: 'Top Spending Accounts',
      description: 'Accounts with highest costs this period',
      type: 'bar',
      extractor: (dataset) => {
        const analysis = dataset.analysis as any
        if (!analysis) return []

        const actualData = analysis?.data || analysis
        const byAccount = actualData?.budgetAnalysis?.byAccount || []
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
        const analysis = dataset.analysis as any
        if (!analysis) return []

        const actualData = analysis?.data || analysis
        const byAccount = actualData?.budgetAnalysis?.byAccount || []

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
          { name: 'Under Budget', value: stats.underBudget, color: '#10b981' },
          { name: 'On Target', value: stats.onTarget, color: '#3b82f6' },
          { name: 'Over Budget', value: stats.overBudget, color: '#ef4444' },
          { name: 'No Budget', value: stats.noBudget, color: '#6b7280' }
        ].filter(s => s.value > 0)
      }
    },

    // Monthly comparison heatmap
    monthlyHeatmap: {
      id: 'monthlyHeatmap',
      title: 'Monthly Spending Patterns',
      description: 'Cost intensity across accounts and time',
      type: 'heatmap',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        if (!summary) return null

        const actualData = summary?.data || summary
        const isProformaMode = dataset.mode === 'proforma'
        
        let resultsByTime: any[] = []
        if (isProformaMode && actualData?.proforma?.rawData?.resultsByTime) {
          resultsByTime = actualData.proforma.rawData.resultsByTime
        } else if (actualData?.rawData?.resultsByTime) {
          resultsByTime = actualData.rawData.resultsByTime
        } else if (actualData?.resultsByTime) {
          resultsByTime = actualData.resultsByTime
        }

        // Build heatmap data
        const accountsSet = new Set<string>()
        const dates: string[] = []
        const dataMap = new Map<string, Map<string, number>>()

        resultsByTime.forEach((bucket: any) => {
          const date = bucket?.TimePeriod?.Start || ''
          dates.push(date)

          if (bucket.Groups) {
            bucket.Groups.forEach((g: any) => {
              const accountId = g.Keys?.[0] || 'unknown'
              accountsSet.add(accountId)

              if (!dataMap.has(accountId)) {
                dataMap.set(accountId, new Map())
              }

              const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
              dataMap.get(accountId)!.set(date, amount)
            })
          }
        })

        // Convert to heatmap format
        const accounts = Array.from(accountsSet).slice(0, 20) // Limit to 20 accounts
        const heatmapData: any[] = []

        accounts.forEach((account, y) => {
          dates.forEach((date, x) => {
            const value = dataMap.get(account)?.get(date) || 0
            if (value > 0) {
              heatmapData.push([x, y, value])
            }
          })
        })

        return { accounts, dates, data: heatmapData }
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
          console.log('LOBTrendComparison: using historical monthly breakdown with', dataSource.monthlyBreakdown.length, 'months')
          
          // For historical data, we need to map accounts to LOBs
          // This requires the accounts list to be available
          const accounts = (dataset as any).accountsList || []
          console.log('LOBTrendComparison: dataset.accountsList type:', typeof accounts, 'isArray:', Array.isArray(accounts), 'length:', accounts?.length)
          if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
            console.warn('LOBTrendComparison: no accounts data available for LOB mapping')
            return null
          }

          // Create account-to-LOB mapping with all possible ID formats
          const accountLOBMap = new Map<string, string>()
          console.log('LOBTrendComparison: Sample account structure:', accounts[0])
          accounts.forEach((account: any) => {
            // Get all possible account ID formats
            const ids = [
              account.accountId,
              account.awsStandardAccountID, 
              account.awsCommercialAccountID,
              account.awsGovCloudAccountID,
              account.id
            ].filter(Boolean)
            
            const lob = account.linesOfBusiness || account.lineOfBusiness || 'Unknown LOB'
            
            // Map all ID variants to the same LOB
            ids.forEach(id => {
              if (id) {
                accountLOBMap.set(String(id), lob)
              }
            })
          })
          console.log('LOBTrendComparison: LOB map size:', accountLOBMap.size, 'Sample entries:', Array.from(accountLOBMap.entries()).slice(0, 5))

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
                  console.log('LOBTrendComparison: Sample cost account ID:', accountId)
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
            .filter(series => series.total > 1000) // Filter out very small LOBs
            .sort((a, b) => b.total - a.total)
            .slice(0, 6) // Top 6 LOBs for better visibility

          console.log('LOBTrendComparison: returning', lobSeries.length, 'LOB series')
          return { dates, series: lobSeries }
        }

        // Fallback to original implementation for non-historical data
        const resultsByTime = dataSource?.resultsByTime || []
        const lobSeriesMap = new Map<string, { dates: string[], values: number[] }>()
        const dates: string[] = []

        resultsByTime.forEach((bucket: any) => {
          const dateStr = bucket?.TimePeriod?.Start || ''
          dates.push(dateStr)

          const lobTotals = new Map<string, number>()

          if (bucket.Groups) {
            bucket.Groups.forEach((g: any) => {
              const accountId = g.Keys?.[0] || 'unknown'
              const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')

              // Try to get actual LOB from account data if available
              const accountsList = (dataset as any).accountsList || []
              let lob = 'Unknown LOB'
              // Only search if accountsList is available
              if (accountsList.length > 0) {
                const account = accountsList.find((acc: any) => 
                  acc.accountId === accountId || acc.awsStandardAccountID === accountId
                )
                if (account) {
                  lob = account.linesOfBusiness || account.lineOfBusiness || 'Unknown LOB'
                }
              } else {
                // Fallback to simplified approach when only IDs available
                lob = 'Account-' + (accountId.substring(0, 4) || 'Unknown')
              }
              
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
          .filter(series => series.total > 1000) // Filter out very small LOBs
          .sort((a, b) => b.total - a.total)
          .slice(0, 6) // Top 6 LOBs for better visibility

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
          console.log('DepartmentTrendComparison: using historical monthly breakdown with', dataSource.monthlyBreakdown.length, 'months')
          
          // For historical data, we need to map accounts to departments
          const accounts = (dataset as any).accountsList || []
          if (!accounts || accounts.length === 0) {
            console.warn('DepartmentTrendComparison: no accounts data available for department mapping')
            return null
          }

          // Create account-to-department mapping with all possible ID formats
          const accountDeptMap = new Map<string, string>()
          console.log('DepartmentTrendComparison: Sample account structure:', accounts[0])
          accounts.forEach((account: any) => {
            // Get all possible account ID formats
            const ids = [
              account.accountId,
              account.awsStandardAccountID,
              account.awsCommercialAccountID,
              account.awsGovCloudAccountID,
              account.id
            ].filter(Boolean)
            
            const dept = account.departmentNumber || account.department || 'Unknown Department'
            
            // Map all ID variants to the same department
            ids.forEach(id => {
              if (id) {
                accountDeptMap.set(String(id), dept)
              }
            })
          })
          console.log('DepartmentTrendComparison: Department map size:', accountDeptMap.size, 'Sample entries:', Array.from(accountDeptMap.entries()).slice(0, 5))

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
                  console.log('DepartmentTrendComparison: Sample cost account ID:', accountId)
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

          console.log('DepartmentTrendComparison: returning', deptSeries.length, 'department series')
          return { dates, series: deptSeries }
        }

        // Fallback to original implementation for non-historical data
        const resultsByTime = dataSource?.resultsByTime || []
        const deptSeriesMap = new Map<string, { dates: string[], values: number[] }>()
        const dates: string[] = []

        resultsByTime.forEach((bucket: any) => {
          const dateStr = bucket?.TimePeriod?.Start || ''
          dates.push(dateStr)

          const deptTotals = new Map<string, number>()

          if (bucket.Groups) {
            bucket.Groups.forEach((g: any) => {
              const accountId = g.Keys?.[0] || 'unknown'
              const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')

              // Try to get actual department from account data if available
              const accountsList = (dataset as any).accountsList || []
              let dept = 'Unknown Department'
              // Only search if accountsList is available
              if (accountsList.length > 0) {
                const account = accountsList.find((acc: any) => 
                  acc.accountId === accountId || acc.awsStandardAccountID === accountId
                )
                if (account) {
                  dept = account.departmentNumber || account.department || 'Unknown Department'
                }
              } else {
                // Fallback to simplified approach when only IDs available
                dept = 'Account-' + (accountId.substring(0, 4) || 'Unknown')
              }
              
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
          .filter(series => series.total > 500) // Filter out very small departments
          .sort((a, b) => b.total - a.total)
          .slice(0, 8) // Top 8 departments for better visibility

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
        const analysis = dataset.analysis as any
        if (!analysis) return []

        const actualData = analysis?.data || analysis
        const byAccount = actualData?.budgetAnalysis?.byAccount || []

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
          console.log('BillableVsProforma: no summary data')
          return []
        }

        const actualData = summary?.data || summary
        
        // Check if we have both billable and proforma data
        if (!actualData?.billable || !actualData?.proforma) {
          console.log('BillableVsProforma: missing billable or proforma data')
          return []
        }

        // Extract account costs from both datasets
        const billableAccounts = actualData.billable?.accounts || []
        const proformaAccounts = actualData.proforma?.accounts || []
        
        console.log('BillableVsProforma: found', billableAccounts.length, 'billable accounts,', proformaAccounts.length, 'proforma accounts')

        // Create a map for quick lookup
        const proformaMap = new Map<string, number>()
        proformaAccounts.forEach((account: any) => {
          if (account.accountId && account.totalCost) {
            proformaMap.set(account.accountId, account.totalCost)
          }
        })

        // Debug: Check data structure
        console.log('BillableVsProforma: Sample billable account:', billableAccounts[0])
        console.log('BillableVsProforma: Sample proforma account:', proformaAccounts[0])
        console.log('BillableVsProforma: Proforma map size:', proformaMap.size)

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
              console.log(`Account ${account.accountId}: billable=${billableCost}, proforma=${proformaCost}, diff=${difference}`)
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
          .slice(0, 20) // Top 20 accounts with biggest differences

        console.log('BillableVsProforma: returning', comparison.length, 'accounts with differences')
        console.log('BillableVsProforma: First result:', comparison[0])
        return comparison
      }
    },

    // Cost Growth Rate (Bar Chart)
    costGrowthRate: {
      id: 'costGrowthRate',
      title: 'Cost Growth Analysis',
      description: 'Month-over-month cost growth by account',
      type: 'bar',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        if (!summary) {
          console.log('CostGrowthRate: no summary data')
          return []
        }

        const actualData = summary?.data || summary
        const isProformaMode = dataset.mode === 'proforma'
        
        // Try multiple paths to find resultsByTime
        let resultsByTime: any[] = []
        
        if (isProformaMode && actualData?.proforma?.rawData?.resultsByTime) {
          resultsByTime = actualData.proforma.rawData.resultsByTime
        } else if (actualData?.rawData?.resultsByTime) {
          resultsByTime = actualData.rawData.resultsByTime
        } else if (actualData?.resultsByTime) {
          resultsByTime = actualData.resultsByTime
        }

        console.log('CostGrowthRate: found', resultsByTime.length, 'time periods')
        
        if (resultsByTime.length < 2) {
          console.log('CostGrowthRate: insufficient data, need at least 2 periods')
          return []
        }

        // Calculate growth rates between periods
        const accountGrowth = new Map<string, { current: number, previous: number, name: string }>()

        // Get last two periods
        const currentPeriod = resultsByTime[resultsByTime.length - 1]
        const previousPeriod = resultsByTime[resultsByTime.length - 2]

        // Current period costs
        if (currentPeriod?.Groups) {
          currentPeriod.Groups.forEach((g: any) => {
            const accountId = g.Keys?.[0] || 'unknown'
            const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')

            if (!accountGrowth.has(accountId)) {
              accountGrowth.set(accountId, { current: 0, previous: 0, name: accountId })
            }
            accountGrowth.get(accountId)!.current = amount
          })
        }

        // Previous period costs
        if (previousPeriod?.Groups) {
          previousPeriod.Groups.forEach((g: any) => {
            const accountId = g.Keys?.[0] || 'unknown'
            const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')

            if (accountGrowth.has(accountId)) {
              accountGrowth.get(accountId)!.previous = amount
            }
          })
        }

        return Array.from(accountGrowth.entries())
          .map(([accountId, data]) => {
            const growthRate = data.previous > 0
              ? ((data.current - data.previous) / data.previous) * 100
              : data.current > 0 ? 100 : 0

            return {
              accountId,
              accountName: data.name,
              currentCost: data.current,
              previousCost: data.previous,
              growthRate,
              growthAmount: data.current - data.previous
            }
          })
          .filter(item => item.currentCost > 100) // Filter very small accounts
          .sort((a, b) => Math.abs(b.growthRate) - Math.abs(a.growthRate))
          .slice(0, 15)
      }
    },

    // Service Cost Distribution (Treemap)
    serviceCostDistribution: {
      id: 'serviceCostDistribution',
      title: 'Service Cost Distribution',
      description: 'Hierarchical view of service costs',
      type: 'treemap',
      extractor: (dataset) => {
        const services = dataset.services as any
        if (!services) return []

        const actualData = services?.data || services
        const isProformaMode = dataset.mode === 'proforma'
        const serviceCategories = new Map<string, { services: any[], totalCost: number }>()

        // Parse service data and categorize - aggregate across all time periods
        const serviceAggregation = new Map<string, number>() // service name -> total cost

        // Get the correct resultsByTime based on mode
        let resultsByTime: any[] = []
        if (isProformaMode && actualData?.proforma?.resultsByTime) {
          resultsByTime = actualData.proforma.resultsByTime
        } else if (actualData?.resultsByTime) {
          resultsByTime = actualData.resultsByTime
        }

        if (resultsByTime.length > 0) {
          console.log('Processing resultsByTime with', resultsByTime.length, 'time periods')

          resultsByTime.forEach((bucket: any) => {
            if (bucket.Groups) {
              console.log('Processing bucket with', bucket.Groups.length, 'service groups')

              bucket.Groups.forEach((g: any) => {
                const serviceName = g.Keys?.[0] || 'Unknown Service'
                const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')

                if (amount > 0) {
                  // Aggregate service costs across all time periods
                  const currentTotal = serviceAggregation.get(serviceName) || 0
                  serviceAggregation.set(serviceName, currentTotal + amount)
                }
              })
            }
          })

          console.log('Aggregated services:', Array.from(serviceAggregation.keys()).length)
          console.log('Top services by cost:', Array.from(serviceAggregation.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, cost]) => `${name}: $${cost.toFixed(0)}`))

          // Now categorize the aggregated services
          serviceAggregation.forEach((totalAmount, serviceName) => {
            // Categorize services with enhanced logic
            let category = 'Other Services'
            const serviceLower = serviceName.toLowerCase()

            if (serviceLower.includes('ec2') || serviceLower.includes('instance') || serviceLower.includes('compute')) {
              category = 'Compute'
            } else if (serviceLower.includes('s3') || serviceLower.includes('storage') || serviceLower.includes('glacier')) {
              category = 'Storage'
            } else if (serviceLower.includes('rds') || serviceLower.includes('database') || serviceLower.includes('dynamo')) {
              category = 'Database'
            } else if (serviceLower.includes('network') || serviceLower.includes('cloudfront') || serviceLower.includes('route 53') || serviceLower.includes('elb')) {
              category = 'Networking'
            } else if (serviceLower.includes('lambda') || serviceLower.includes('api gateway') || serviceLower.includes('step functions')) {
              category = 'Serverless'
            } else if (serviceLower.includes('enterprise') || serviceLower.includes('support')) {
              category = 'Support'
            } else if (serviceLower.includes('vpc') || serviceLower.includes('direct connect') || serviceLower.includes('transit gateway') || serviceLower.includes('Virtual Private Cloud')) {
              category = 'VPC'
            } else if (serviceLower.includes('savings plans') || serviceLower.includes('reserved instances') || serviceLower.includes('ri ')) {
              category = 'Cost Optimization'
            } else if (serviceLower.includes('iam') || serviceLower.includes('security') || serviceLower.includes('guardduty') || serviceLower.includes('inspector')) {
              category = 'Security'
            } else if (serviceLower.includes('cloudwatch') || serviceLower.includes('config') || serviceLower.includes('cloudtrail')) {
              category = 'Management'
            }
            else if (serviceLower.includes('tax')) {
              category = 'Tax'
            }

            if (!serviceCategories.has(category)) {
              serviceCategories.set(category, { services: [], totalCost: 0 })
            }

            const categoryData = serviceCategories.get(category)!
            categoryData.services.push({ name: serviceName, value: totalAmount })
            categoryData.totalCost += totalAmount
          })
        } else {
          console.log('No resultsByTime data found in:', actualData)
        }

        console.log('Final service categories:', Array.from(serviceCategories.keys()))
        // Convert to treemap format
        return Array.from(serviceCategories.entries())
          .map(([category, data]) => ({
            name: category,
            value: data.totalCost,
            children: data.services
              .sort((a, b) => b.value - a.value)
              .slice(0, 10) // Top 10 services per category
          }))
          .filter(category => category.value > 100)
          .sort((a, b) => b.value - a.value)
      }
    },

    // Budget Variance Analysis (Scatter plot)
    budgetVarianceAnalysis: {
      id: 'budgetVarianceAnalysis',
      title: 'Budget vs Actual Variance',
      description: 'Scatter plot showing budget variance by account size',
      type: 'scatter',
      extractor: (dataset) => {
        const analysis = dataset.analysis as any
        if (!analysis) return []

        const actualData = analysis?.data || analysis
        const byAccount = actualData?.budgetAnalysis?.byAccount || []

        return byAccount
          .filter((account: any) => account.budgetedCost > 0)
          .map((account: any) => ({
            accountName: account.accountName || account.accountId,
            budgetedCost: account.budgetedCost,
            actualCost: account.actualCost,
            variance: account.actualCost - account.budgetedCost,
            variancePercent: ((account.actualCost - account.budgetedCost) / account.budgetedCost) * 100,
            size: account.budgetedCost // For bubble size
          }))
          .filter((item: any) => item.budgetedCost > 1000) // Focus on significant accounts
      }
    },

    // Cost Optimization Opportunities (Bar chart with recommendations)
    costOptimizationOpportunities: {
      id: 'costOptimizationOpportunities',
      title: 'Cost Optimization Opportunities',
      description: 'Accounts with potential savings based on utilization patterns',
      type: 'bar',
      extractor: (dataset) => {
        const analysis = dataset.analysis as any
        if (!analysis) return []

        const actualData = analysis?.data || analysis
        const byAccount = actualData?.budgetAnalysis?.byAccount || []

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

        console.log('HistoricalMonthlyTrend: processing', monthlyBreakdown.length, 'months')

        // Require at least 4 months of data to show this chart
        if (monthlyBreakdown.length < 4) {
          console.log('HistoricalMonthlyTrend: insufficient data, need at least 4 months')
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

    // Year-over-Year Comparison (Always shows last 2 calendar years)
    yearOverYearComparison: {
      id: 'yearOverYearComparison',
      title: 'Year-over-Year Comparison',
      description: 'Compare last 2 calendar years month by month',
      type: 'line',
      extractor: (dataset) => {
        // This chart will fetch its own data via a separate API call
        // For now, we'll use a placeholder that can be enhanced later
        return { contextualChart: true, dataSource: 'lastYear,thisYear' }
      }
    },

    // Month-over-Month Comparison (Current vs Previous month)
    monthOverMonthComparison: {
      id: 'monthOverMonthComparison', 
      title: 'Month-over-Month Comparison',
      description: 'Compare current month to previous month',
      type: 'bar',
      extractor: (dataset) => {
        // This chart will fetch its own data via a separate API call
        return { contextualChart: true, dataSource: 'thisMonth,lastMonth' }
      }
    },

    // Last 24 Months Trend (Always shows 2 years regardless of selection)
    last24MonthsTrend: {
      id: 'last24MonthsTrend',
      title: 'Last 24 Months Trend',
      description: 'Full 2-year monthly cost trend',
      type: 'line', 
      extractor: (dataset) => {
        // This chart will fetch its own data
        return { contextualChart: true, dataSource: 'last24months' }
      }
    },

    // Current vs Forecast Comparison (Bar Chart)
    currentVsForecastComparison: {
      id: 'currentVsForecastComparison',
      title: 'Current vs Forecast Comparison',
      description: 'Compare current month spending to next month forecast',
      type: 'bar',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        const forecast = dataset.forecast as any
        
        console.log('CurrentVsForecast: Debug data availability:', {
          hasSummary: !!summary,
          hasForecast: !!forecast,
          summaryData: summary?.data ? Object.keys(summary.data) : 'no data',
          forecastData: forecast?.data ? Object.keys(forecast.data) : 'no data',
          forecastTotal: forecast?.data?.forecast?.total?.Amount || 'no total',
          forecastStructure: forecast?.data?.forecast ? Object.keys(forecast.data.forecast) : 'no forecast object',
          fullForecastResponse: forecast
        })
        
        if (!summary || !forecast) {
          console.log('CurrentVsForecast: Missing summary or forecast data')
          return []
        }

        const summaryData = summary?.data || summary
        const forecastData = forecast?.data || forecast
        
        // Extract current month data from summary
        const currentAccounts = summaryData?.accounts || []
        const currentAccountMap = new Map<string, { cost: number, name: string }>()
        
        currentAccounts.forEach((account: any) => {
          if (account.accountId && account.totalCost) {
            currentAccountMap.set(account.accountId, {
              cost: account.totalCost,
              name: account.accountName || account.accountId
            })
          }
        })

        // Extract forecast data
        let forecastTotal = 0
        
        // Handle different forecast response structures
        console.log('CurrentVsForecast: Raw forecast data structure:', {
          forecastData: forecastData,
          hasForecastKey: !!forecastData?.forecast,
          forecastKeys: forecastData?.forecast ? Object.keys(forecastData.forecast) : 'no forecast',
          totalAmount: forecastData?.forecast?.total?.Amount,
          totalStructure: forecastData?.forecast?.total
        })
        
        if (forecastData?.forecast) {
          if (forecastData.forecast.total?.Amount) {
            forecastTotal = parseFloat(forecastData.forecast.total.Amount)
          } else if (forecastData.forecast.total) {
            forecastTotal = parseFloat(forecastData.forecast.total)
          }
        }
        
        console.log('CurrentVsForecast: Extracted forecast total:', forecastTotal)

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        // Calculate total current spending for selected/all accounts
        let totalCurrentSpending = 0
        const accountsToProcess = []

        for (const [accountId, currentData] of currentAccountMap) {
          if (filterBySelection && !selectedAccounts.includes(accountId)) continue
          accountsToProcess.push({ accountId, ...currentData })
          totalCurrentSpending += currentData.cost
        }

        console.log('CurrentVsForecast: Processing', accountsToProcess.length, 'accounts with total current:', totalCurrentSpending, 'forecast total:', forecastTotal)

        // Build comparison data by proportionally distributing forecast
        const comparison = accountsToProcess.map(account => {
          // Distribute forecast proportionally based on current spending
          let forecastCost = 0
          if (totalCurrentSpending > 0 && forecastTotal > 0) {
            forecastCost = forecastTotal * (account.cost / totalCurrentSpending)
          } else if (forecastTotal > 0 && accountsToProcess.length > 0) {
            // If no current spending, distribute equally
            forecastCost = forecastTotal / accountsToProcess.length
          }
          
          console.log(`CurrentVsForecast: Account ${account.name} - Current: ${account.cost}, Forecast: ${forecastCost}`)
          
          return {
            accountId: account.accountId,
            accountName: account.name,
            currentCost: account.cost,
            forecastCost,
            difference: forecastCost - account.cost,
            percentChange: account.cost > 0 ? ((forecastCost - account.cost) / account.cost) * 100 : 0,
            status: forecastCost > account.cost ? 'increase' : forecastCost < account.cost ? 'decrease' : 'stable'
          }
        })

        return comparison
          .filter(item => item.currentCost > 50 || item.forecastCost > 50) // Filter small amounts
          .sort((a, b) => Math.max(b.currentCost, b.forecastCost) - Math.max(a.currentCost, a.forecastCost))
          .slice(0, 15) // Top 15 accounts
      }
    },

    // Last Month vs This Month vs Forecast (Multi-bar Chart)
    monthlyTrendWithForecast: {
      id: 'monthlyTrendWithForecast',
      title: 'Monthly Trend with Forecast',
      description: 'Compare last month, current month, and next month forecast',
      type: 'bar',
      extractor: (dataset) => {
        const summary = dataset.summary as any
        const historical = dataset.historical as any
        const forecast = dataset.forecast as any
        
        if (!summary) {
          console.log('MonthlyTrendWithForecast: Missing summary data')
          return []
        }

        const summaryData = summary?.data || summary
        const historicalData = historical?.data || historical
        const forecastData = forecast?.data || forecast

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
        let totalForecast = 0
        if (forecastData?.forecast?.total?.Amount) {
          totalForecast = parseFloat(forecastData.forecast.total.Amount)
        } else if (forecastData?.forecast?.total) {
          totalForecast = parseFloat(forecastData.forecast.total)
        }

        // Distribute forecast proportionally based on current spending
        const totalCurrent = Array.from(accountMap.values()).reduce((sum, acc) => sum + acc.current, 0)
        console.log('MonthlyTrendWithForecast: Total current spending:', totalCurrent, 'Total forecast:', totalForecast)
        
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
          .filter(item => item.currentMonth > 100) // Focus on significant accounts
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
      title: 'Account Forecast Comparison',
      description: 'Side-by-side forecast comparison across accounts',
      type: 'bar',
      extractor: (dataset) => {
        const forecast = dataset.forecast as any
        const summary = dataset.summary as any
        
        if (!forecast || !summary) {
          console.log('AccountForecastComparison: Missing forecast or summary data')
          return []
        }

        const forecastData = forecast?.data || forecast
        const summaryData = summary?.data || summary
        const currentAccounts = summaryData?.accounts || []
        
        // Get total forecast
        let totalForecast = 0
        if (forecastData?.forecast?.total?.Amount) {
          totalForecast = parseFloat(forecastData.forecast.total.Amount)
        } else if (forecastData?.forecast?.total) {
          totalForecast = parseFloat(forecastData.forecast.total)
        }

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        console.log('AccountForecastComparison: Total forecast available:', totalForecast)
        
        // Calculate total current spending for distribution calculation
        const totalCurrentSpending = currentAccounts
          .filter((account: any) => !filterBySelection || selectedAccounts.includes(account.accountId))
          .reduce((sum: number, acc: any) => sum + (acc.totalCost || 0), 0)
        
        console.log('AccountForecastComparison: Total current spending for selected accounts:', totalCurrentSpending)

        // Build forecast comparison by account
        return currentAccounts
          .filter((account: any) => !filterBySelection || selectedAccounts.includes(account.accountId))
          .filter((account: any) => account.totalCost > 200) // Focus on accounts with meaningful spend
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
            
            console.log(`AccountForecastComparison: Account ${account.accountName || account.accountId} - Current: ${currentCost}, Forecast: ${forecastCost}`)
            
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

    // 3-Month Forecast Trend (Line Chart)
    extendedForecastTrend: {
      id: 'extendedForecastTrend',
      title: '3-Month Forecast Trend',
      description: 'Extended forecast projection over 3 months',
      type: 'line',
      extractor: (dataset) => {
        console.log('ExtendedForecastTrend: Dataset keys:', Object.keys(dataset))
        console.log('ExtendedForecastTrend: Extended forecast available:', !!dataset.extendedForecast)
        
        const extendedForecast = dataset.extendedForecast as any
        
        if (!extendedForecast) {
          console.log('ExtendedForecastTrend: No extended forecast data available, falling back to regular forecast')
          // Fallback to regular forecast if extended forecast is not available
          const regularForecast = dataset.forecast as any
          if (!regularForecast) {
            console.log('ExtendedForecastTrend: No forecast data available at all')
            return null
          }
          
          const forecastData = regularForecast?.data || regularForecast
          console.log('ExtendedForecastTrend: Using regular forecast data:', forecastData)
          
          // Use regular forecast total as a single point
          if (forecastData?.forecast?.total?.Amount) {
            const forecastAmount = parseFloat(forecastData.forecast.total.Amount)
            const currentDate = new Date()
            const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
            
            return {
              dates: [nextMonth.toISOString().split('T')[0]],
              series: [{
                name: 'Forecast',
                dates: [nextMonth.toISOString().split('T')[0]],
                values: [forecastAmount],
                total: forecastAmount
              }]
            }
          }
          return null
        }

        const forecastData = extendedForecast?.data || extendedForecast
        console.log('ExtendedForecastTrend: Extended forecast data structure:', forecastData)
        
        // Handle different forecast response structures
        let forecastByTime: any[] = []
        if (forecastData?.forecast?.forecastResultsByTime) {
          forecastByTime = forecastData.forecast.forecastResultsByTime
        } else if (forecastData?.forecastResultsByTime) {
          forecastByTime = forecastData.forecastResultsByTime
        }

        console.log('ExtendedForecastTrend: Forecast by time periods found:', forecastByTime.length)

        if (forecastByTime.length === 0) {
          console.log('ExtendedForecastTrend: No forecast results by time found')
          return null
        }

        const dates: string[] = []
        const values: number[] = []
        const upperBound: number[] = []
        const lowerBound: number[] = []

        forecastByTime.forEach((period: any) => {
          const date = period?.TimePeriod?.Start || ''
          const meanValue = parseFloat(period?.MeanValue || '0')
          const prediction = period?.PredictionIntervalUpperBound || period?.PredictionIntervalLowerBound
          
          console.log('ExtendedForecastTrend: Processing period:', date, 'value:', meanValue)
          
          dates.push(date)
          values.push(meanValue)
          
          // Only add confidence intervals if available from API
          if (period?.PredictionIntervalUpperBound && period?.PredictionIntervalLowerBound) {
            upperBound.push(parseFloat(period.PredictionIntervalUpperBound))
            lowerBound.push(parseFloat(period.PredictionIntervalLowerBound))
          }
        })

        console.log('ExtendedForecastTrend: Final data:', { dates, values })

        return {
          dates,
          series: [{
            name: 'Forecast',
            dates,
            values,
            total: values.reduce((sum, val) => sum + val, 0)
          }],
          confidenceInterval: upperBound.length > 0 ? {
            upper: upperBound,
            lower: lowerBound
          } : null
        }
      }
    },

    // Forecast Projection Line with Actual (Current + Future Overlay)
    forecastProjectionLine: {
      id: 'forecastProjectionLine',
      title: 'Actual + Forecast Projection',
      description: 'Actual costs to date with forecast overlay for rest of period',
      type: 'line',
      extractor: (dataset) => {
        const forecast = dataset.forecast as any
        const summary = dataset.summary as any
        const analysis = dataset.analysis as any
        
        console.log('ForecastProjectionLine: Starting extraction with dataset:', {
          hasForecast: !!forecast,
          hasSummary: !!summary,
          hasAnalysis: !!analysis
        })
        
        if (!forecast || !summary) {
          console.log('ForecastProjectionLine: Missing required data')
          return null
        }

        const summaryData = summary?.data || summary
        const analysisData = analysis?.data || analysis
        
        // Get time-series data from summary
        const isProformaMode = dataset.mode === 'proforma'
        let resultsByTime: any[] = []
        
        if (isProformaMode && summaryData?.proforma?.rawData?.resultsByTime) {
          resultsByTime = summaryData.proforma.rawData.resultsByTime
        } else if (summaryData?.rawData?.resultsByTime) {
          resultsByTime = summaryData.rawData.resultsByTime
        } else if (summaryData?.resultsByTime) {
          resultsByTime = summaryData.resultsByTime
        }
        
        console.log('ForecastProjectionLine: Found', resultsByTime.length, 'time periods')
        
        if (resultsByTime.length === 0) {
          console.log('ForecastProjectionLine: No time-series data available')
          return null
        }

        // Build cumulative actual spending
        const actualDates: string[] = []
        const actualValues: number[] = []
        let cumulative = 0
        
        resultsByTime.forEach((bucket: any) => {
          const dateStr = bucket?.TimePeriod?.Start || ''
          actualDates.push(dateStr)
          
          let periodTotal = 0
          if (bucket.Groups) {
            bucket.Groups.forEach((g: any) => {
              const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
              periodTotal += amount
            })
          } else if (bucket.Total?.UnblendedCost?.Amount) {
            periodTotal = parseFloat(bucket.Total.UnblendedCost.Amount)
          }
          
          cumulative += periodTotal
          actualValues.push(cumulative)
        })

        // Create forecast projection for remaining days in CURRENT month
        // Note: The forecast API returns NEXT month's forecast, not current month
        // So we use the current burn rate to project the rest of this month
        const currentDate = new Date()
        const forecastDates: string[] = []
        const forecastValues: number[] = []
        
        // Get the last day of the current month
        const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
        const currentDay = currentDate.getDate()
        const totalDaysInMonth = lastDayOfMonth.getDate()
        const remainingDaysInMonth = totalDaysInMonth - currentDay
        
        // For the current month, we need to estimate based on burn rate, not next month's forecast
        // Calculate average daily burn rate from actual data
        const avgDailyBurn = actualValues.length > 0 ? cumulative / actualValues.length : 0
        
        console.log('ForecastProjectionLine: Current day:', currentDay, 'Total days:', totalDaysInMonth, 'Remaining:', remainingDaysInMonth)
        
        let projectedTotal = cumulative
        for (let i = 1; i <= remainingDaysInMonth; i++) {
          const futureDate = new Date(currentDate)
          futureDate.setDate(futureDate.getDate() + i)
          const dateStr = futureDate.toISOString().split('T')[0]
          
          // Use average daily burn rate for projection within current month
          projectedTotal += avgDailyBurn
          if (dateStr) {
            forecastDates.push(dateStr)
            forecastValues.push(projectedTotal)
          }
        }
        
        // Get budget information - sum budgets for selected accounts
        let monthlyBudget = 0
        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0
        
        if (filterBySelection && analysisData?.budgetAnalysis?.byAccount) {
          // Sum budgets for selected accounts only
          monthlyBudget = analysisData.budgetAnalysis.byAccount
            .filter((account: any) => selectedAccounts.includes(account.accountId))
            .reduce((sum: number, account: any) => sum + (account.budgetedCost || 0), 0)
          console.log('ForecastProjectionLine: Calculated budget for', selectedAccounts.length, 'selected accounts:', monthlyBudget)
        } else if (analysisData?.summary?.totalBudget) {
          // Use total budget when no accounts selected
          monthlyBudget = analysisData.summary.totalBudget
          console.log('ForecastProjectionLine: Using org-wide budget:', monthlyBudget)
        } else if (analysisData?.budgetAnalysis?.summary?.totalBudget) {
          monthlyBudget = analysisData.budgetAnalysis.summary.totalBudget
        }
        
        // For projection, we'll use the monthly budget as-is since we're showing current month + forecast
        const budgetLine = monthlyBudget
        
        console.log('ForecastProjectionLine: Returning data with', actualDates.length, 'actual periods,', 
                    forecastDates.length, 'forecast periods, budget:', budgetLine)

        return {
          dates: [...actualDates, ...forecastDates],
          actualSeries: {
            name: 'Actual Spend',
            dates: actualDates,
            values: actualValues
          },
          forecastSeries: {
            name: 'Projected Spend',
            dates: forecastDates,
            values: forecastValues
          },
          totalBudget: budgetLine
        }
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
        
        console.log('CumulativeBurnUp: Starting extraction with dataset:', {
          hasHistorical: !!historical,
          hasSummary: !!summary,
          hasAnalysis: !!analysis
        })
        
        if (!summary) {
          console.log('CumulativeBurnUp: Missing summary data')
          return []
        }

        const summaryData = summary?.data || summary
        const analysisData = analysis?.data || analysis

        // Get current accounts and budget data
        const currentAccounts = summaryData?.accounts || []
        const budgetData = analysisData?.budgetAnalysis?.byAccount || []
        
        // console.log('CumulativeBurnUp: Found', currentAccounts.length, 'accounts,', budgetData.length, 'budget entries')

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        // For cumulative burn-up, we need time-series data
        // Use resultsByTime from summary for the current period
        const isProformaMode = dataset.mode === 'proforma'
        let resultsByTime: any[] = []
        
        if (isProformaMode && summaryData?.proforma?.rawData?.resultsByTime) {
          resultsByTime = summaryData.proforma.rawData.resultsByTime
        } else if (summaryData?.rawData?.resultsByTime) {
          resultsByTime = summaryData.rawData.resultsByTime
        } else if (summaryData?.resultsByTime) {
          resultsByTime = summaryData.resultsByTime
        }
        
        // console.log('CumulativeBurnUp: Found', resultsByTime.length, 'time periods')
        
        if (resultsByTime.length === 0) {
          console.log('CumulativeBurnUp: No time-series data available')
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
          .filter((account: any) => account.totalCost > 100) // Focus on significant accounts
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
        
        console.log('CumulativeBurnUp DEBUG: Processing time periods to build cumulative data')
        
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
                  console.log(`  Period ${timeIndex + 1} [${dateStr}] Account ${accountData.name}: +$${amount.toLocaleString()} = $${newCumulative.toLocaleString()} cumulative`)
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
                
                console.log(`CumulativeBurnUp DEBUG [${data.name}]: Date Analysis`)
                console.log(`  - First Date: ${firstDateStr}`)
                console.log(`  - Last Date: ${lastDateStr}`)
                console.log(`  - Days Difference: ${daysDiff}`)
                console.log(`  - Number of Periods: ${periods}`)
                
                // Determine if this is daily or monthly data
                // If we have roughly one period per day (within tolerance), it's daily data
                const periodsPerDay = periods / daysDiff
                
                if (periodsPerDay > 0.8 && periodsPerDay <= 1.2 && daysDiff < 40) {
                  // Daily data - approximately one period per day
                  periodsInYear = 365
                  console.log(`  - Detected: DAILY DATA (${periods} periods in ${daysDiff} days, ratio: ${periodsPerDay.toFixed(2)})`)
                } else if (periods <= 12 && daysDiff > 20) {
                  // Monthly data - few periods over many days
                  periodsInYear = 12
                  console.log(`  - Detected: MONTHLY DATA (${periods} periods over ${daysDiff} days)`)
                } else {
                  // Default to daily for short time spans with multiple periods
                  if (daysDiff <= 31 && periods >= daysDiff * 0.8) {
                    periodsInYear = 365
                    console.log(`  - Detected: DAILY DATA (default) (${periods} periods in ${daysDiff} days)`)
                  } else {
                    periodsInYear = 12
                    console.log(`  - Detected: MONTHLY DATA (default) (${periods} periods in ${daysDiff} days)`)
                  }
                }
              }
            }
            
            // Create budget progression line
            if (data.monthlyBudget > 0) {
              // For daily data: use monthly budget spread across the days
              // For monthly data: use annual budget spread across months
              
              console.log(`CumulativeBurnUp DEBUG [${data.name}]: Starting budget calculation`)
              console.log(`  - Monthly Budget: $${data.monthlyBudget.toLocaleString()}`)
              console.log(`  - Annual Budget: $${data.annualBudget.toLocaleString()}`)
              console.log(`  - Periods: ${periods}`)
              console.log(`  - Periods in Year: ${periodsInYear}`)
              console.log(`  - Is Daily Data: ${periodsInYear === 365}`)
              
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
                    console.log(`  Day ${i}: dayOfMonth=${dayOfMonth}, progress=${(budgetProgress * 100).toFixed(1)}%, budget=$${budgetValue.toLocaleString()}`)
                  }
                } else {
                  // Monthly data - use annual budget
                  const progress = i / 12
                  const budgetValue = data.annualBudget * Math.min(progress, 1)
                  budgetLine.push(budgetValue)
                  
                  if (i <= 3 || i === periods) {
                    console.log(`  Month ${i}: progress=${(progress * 100).toFixed(1)}%, budget=$${budgetValue.toLocaleString()}`)
                  }
                }
              }
              
              console.log(`  Final Budget Line Length: ${budgetLine.length}`)
              console.log(`  Final Budget Value: $${budgetLine[budgetLine.length - 1]?.toLocaleString()}`)
            }
            
            const lastCumulative = data.cumulative[data.cumulative.length - 1] || 0
            const lastBudgetValue = budgetLine[budgetLine.length - 1] || data.monthlyBudget
            
            console.log(`CumulativeBurnUp DEBUG [${data.name}]: Final Values`)
            console.log(`  - Actual Cumulative Values: [${data.cumulative.slice(0, 3).map(v => '$' + v.toLocaleString()).join(', ')}...${data.cumulative.length > 3 ? ', $' + (data.cumulative[data.cumulative.length - 1]?.toLocaleString() || '0') : ''}]`)
            console.log(`  - Budget Line Values: [${budgetLine.slice(0, 3).map(v => '$' + v.toLocaleString()).join(', ')}...${budgetLine.length > 3 ? ', $' + (budgetLine[budgetLine.length - 1]?.toLocaleString() || '0') : ''}]`)
            console.log(`  - Last Cumulative: $${lastCumulative.toLocaleString()}`)
            console.log(`  - Last Budget Value: $${lastBudgetValue.toLocaleString()}`)
            console.log(`  - Is Over Budget: ${lastCumulative > lastBudgetValue}`)
            
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
        
        console.log('CumulativeBurnUp: Returning', result.length, 'accounts with burn-up data')
        return result
      }
    },

    // Forecast with Confidence Bands
    forecastConfidenceBands: {
      id: 'forecastConfidenceBands',
      title: 'Forecast with Confidence Bands',
      description: 'Future projections with uncertainty ranges',
      type: 'line',
      extractor: (dataset) => {
        const forecast = dataset.forecast as any
        const extendedForecast = dataset.extendedForecast as any
        
        const forecastSource = extendedForecast || forecast
        if (!forecastSource) {
          console.log('ForecastConfidenceBands: No forecast data available')
          return null
        }

        const forecastData = forecastSource?.data || forecastSource
        let forecastByTime = []
        
        if (forecastData?.forecast?.forecastResultsByTime) {
          forecastByTime = forecastData.forecast.forecastResultsByTime
        }

        if (forecastByTime.length === 0) {
          console.log('ForecastConfidenceBands: No time-series forecast data')
          return null
        }

        const dates: string[] = []
        const meanValues: number[] = []
        const upperBand: number[] = []
        const lowerBand: number[] = []

        let hasRealConfidenceIntervals = false
        
        forecastByTime.forEach((period: any) => {
          const date = period?.TimePeriod?.Start || ''
          const mean = parseFloat(period?.MeanValue || '0')
          
          dates.push(date)
          meanValues.push(mean)
          
          // ONLY use actual confidence intervals from API, never make up fake ones
          if (period?.PredictionIntervalUpperBound && period?.PredictionIntervalLowerBound) {
            upperBand.push(parseFloat(period.PredictionIntervalUpperBound))
            lowerBand.push(parseFloat(period.PredictionIntervalLowerBound))
            hasRealConfidenceIntervals = true
          }
        })

        // Only return confidence bands if we have real data from the API
        if (hasRealConfidenceIntervals) {
          return {
            dates,
            forecastLine: meanValues,
            upperConfidence: upperBand,
            lowerConfidence: lowerBand,
            confidenceLevel: 'API-provided'
          }
        } else {
          // Return just the forecast line without fake confidence bands
          return {
            dates,
            forecastLine: meanValues,
            upperConfidence: null,
            lowerConfidence: null,
            confidenceLevel: null
          }
        }
      }
    },

    // Historical vs Forecast Comparison
    historicalVsForecastComparison: {
      id: 'historicalVsForecastComparison',
      title: 'Historical Average vs Forecast',
      description: 'Compare forecast to historical spending patterns',
      type: 'bar',
      extractor: (dataset) => {
        const historical = dataset.historical as any
        const forecast = dataset.forecast as any
        const summary = dataset.summary as any
        
        if (!historical || !forecast) {
          console.log('HistoricalVsForecast: Missing historical or forecast data')
          return []
        }

        const historicalData = historical?.data || historical
        const forecastData = forecast?.data || forecast
        const summaryData = summary?.data || summary

        const monthlyData = historicalData?.monthlyBreakdown || []
        const forecastTotal = forecastData?.forecast?.total?.Amount ? parseFloat(forecastData.forecast.total.Amount) : 0
        const currentAccounts = summaryData?.accounts || []

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        return currentAccounts
          .filter((account: any) => !filterBySelection || selectedAccounts.includes(account.accountId))
          .filter((account: any) => account.totalCost > 500)
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
      title: 'Current Month: Actual & Forecasted Daily Spend',
      description: 'Daily spending with actual data to date and forecast for remaining days',
      type: 'line', // Combined bar + line chart
      extractor: (dataset) => {
        const summary = dataset.summary as any
        const forecast = dataset.forecast as any
        const analysis = dataset.analysis as any
        
        if (!summary) {
          console.log('OrgForecastComparison: Missing summary data')
          return null
        }

        const summaryData = summary?.data || summary
        const analysisData = analysis?.data || analysis
        
        // Get time-series data for daily spending
        const isProformaMode = dataset.mode === 'proforma'
        let resultsByTime: any[] = []
        
        if (isProformaMode && summaryData?.proforma?.rawData?.resultsByTime) {
          resultsByTime = summaryData.proforma.rawData.resultsByTime
        } else if (summaryData?.rawData?.resultsByTime) {
          resultsByTime = summaryData.rawData.resultsByTime
        } else if (summaryData?.resultsByTime) {
          resultsByTime = summaryData.resultsByTime
        }
        
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
        
        console.log('OrgForecastComparison: Forecast data structure:', {
          hasForecast: !!forecast,
          selectedAccounts: selectedAccounts.length > 0 ? selectedAccounts : 'All accounts',
          accountsCount: selectedAccounts.length,
          responseKeys: forecastResponse ? Object.keys(forecastResponse).slice(0, 5) : [],
          forecastResultsLength: forecastResults.length,
          forecastTotal,
          firstResult: forecastResults[0] ? Object.keys(forecastResults[0]) : [],
          apiNote: forecastResponse?.note || 'No note',
          period: forecastResponse?.period || 'No period info'
        })
        
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
              console.log(`  Forecast day ${dayLabel}:`, {
                dateStr,
                period,
                forecastValue,
                hasTimePeriod: !!period.TimePeriod,
                hasMeanValue: period.MeanValue !== undefined
              })
            }
            
            // Account filtering is now done at the API level, so we get the correct forecast values
            
            forecastByDate.set(dayLabel, forecastValue)
            totalForecastAmount += forecastValue
          })
        }
        
        console.log(`OrgForecastComparison: Found ${forecastByDate.size} forecast data points from API`)
        console.log(`  Total forecast amount from API: $${totalForecastAmount.toFixed(2)}`)
        console.log(`  Forecast total from header: $${forecastTotal.toFixed(2)}`)
        
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
          
          console.log(`  Adding forecast for ${dayLabel}: $${forecastDayValue.toFixed(2)}`)
          
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
          console.log('OrgForecastComparison: Calculated budget for', selectedAccounts.length, 'selected accounts:', monthlyBudget)
        } else if (analysisData?.summary?.totalBudget) {
          // Use total budget when no accounts selected
          monthlyBudget = analysisData.summary.totalBudget
          console.log('OrgForecastComparison: Using org-wide budget:', monthlyBudget)
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

        console.log(`OrgForecastComparison: Current day ${currentDay}, Total days ${totalDaysInMonth}`)
        console.log(`  Selected accounts: ${selectedAccounts.length > 0 ? selectedAccounts.join(', ') : 'All'}`)
        console.log(`  Actual days: ${dailySpends.filter(d => d > 0).length}`)
        console.log(`  Forecast days: ${remainingDays}`)
        console.log(`  Forecast data points: ${forecastByDate.size}`)
        console.log(`  Current total: $${runningTotal.toLocaleString()}`)
        console.log(`  Projected month total: $${forecastRunningTotal.toLocaleString()}`)
        console.log(`  Monthly budget: $${monthlyBudget.toLocaleString()}`)

        return {
          dates,
          series: [
            {
              name: 'Actual Daily Spend',
              data: dailySpends,
              type: 'bar'
            },
            {
              name: 'Forecast Daily Spend',
              data: forecastDailySpends,
              type: 'bar'
            },
            {
              name: 'Cumulative Actual',
              data: cumulative,
              type: 'line'
            },
            {
              name: 'Cumulative Forecast',
              data: forecastCumulative,
              type: 'line'
            },
            {
              name: 'Budget',
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

    // S-Curve Budget Envelope 
    budgetSCurve: {
      id: 'budgetSCurve',
      title: 'Budget S-Curve Tracking',
      description: 'Accumulated forecasted costs vs budget envelope',
      type: 'line',
      extractor: (dataset) => {
        console.log('BudgetSCurve: Starting extraction with dataset:', Object.keys(dataset))
        
        const historical = dataset.historical as any
        const forecast = dataset.forecast as any
        const analysis = dataset.analysis as any
        const summary = dataset.summary as any
        
        if (!historical && !summary) {
          console.log('BudgetSCurve: Missing historical and summary data')
          return null
        }

        const historicalData = historical?.data || historical
        const forecastData = forecast?.data || forecast
        const analysisData = analysis?.data || analysis
        const summaryData = summary?.data || summary

        console.log('BudgetSCurve: Data structures:', {
          hasHistorical: !!historicalData,
          historicalKeys: historicalData ? Object.keys(historicalData) : [],
          hasAnalysis: !!analysisData,
          analysisKeys: analysisData ? Object.keys(analysisData) : [],
          hasSummary: !!summaryData,
          summaryKeys: summaryData ? Object.keys(summaryData) : []
        })

        // Try to get monthly data from historical
        const monthlyData = historicalData?.monthlyBreakdown || 
                           historicalData?.monthlyCosts || 
                           []

        // Try to get total budget from various sources
        let monthlyBudget = 0
        if (analysisData?.summary?.totalBudget) {
          monthlyBudget = analysisData.summary.totalBudget
        } else if (analysisData?.budgetAnalysis?.summary?.totalBudget) {
          monthlyBudget = analysisData.budgetAnalysis.summary.totalBudget
        } else if (summaryData?.totals?.budget) {
          monthlyBudget = summaryData.totals.budget
        } else if (analysisData?.totalBudget) {
          monthlyBudget = analysisData.totalBudget
        }

        // Assume the budget we get is monthly, so annualize it for the S-curve
        // This is a reasonable assumption since we're comparing against 12 months of data
        const annualBudget = monthlyBudget * 12
        
        console.log('BudgetSCurve: Extracted data:', {
          monthlyDataLength: monthlyData.length,
          monthlyBudget,
          annualBudget,
          hasForecast: !!forecastData
        })

        if (monthlyData.length === 0 && !summaryData) {
          console.log('BudgetSCurve: No monthly data available')
          return null
        }

        const forecastTotal = forecastData?.forecast?.total?.Amount ? parseFloat(forecastData.forecast.total.Amount) : 0

        const months = []
        const actualCumulative = []
        const budgetEnvelope = []
        const forecastProjection = []
        
        let actualRunning = 0

        // If we have monthly historical data, use it
        if (monthlyData.length > 0) {
          monthlyData.forEach((month: any, index: number) => {
            const monthTotal = month.cost || month.total || month.totalCost || 0
            actualRunning += monthTotal
            
            const monthLabel = month.month || month.date || `Month ${index + 1}`
            months.push(monthLabel)
            actualCumulative.push(actualRunning)
            
            // Budget envelope (planned S-curve)
            if (annualBudget > 0) {
              const progress = (index + 1) / 12
              // S-curve function: slower start, accelerated middle, slower end
              const sCurveProgress = 3 * Math.pow(progress, 2) - 2 * Math.pow(progress, 3)
              const cumulativeBudgetTarget = annualBudget * sCurveProgress
              budgetEnvelope.push(cumulativeBudgetTarget)
              
              console.log(`BudgetSCurve: Month ${index + 1} - Progress: ${progress}, S-curve: ${sCurveProgress}, Budget target: ${cumulativeBudgetTarget}, Actual cumulative: ${actualRunning}`)
            }
          })
        } else if (summaryData) {
          // Fallback: Use current month summary data when historical unavailable
          // This creates estimated monthly progression based on current total
          const currentTotal = summaryData?.totals?.spend || 0
          const currentDate = new Date()
          const currentMonthNum = currentDate.getMonth() + 1
          
          // Create estimated monthly progression up to current month
          // This is not fake data - it's a linear distribution of actual current total
          for (let i = 1; i <= currentMonthNum; i++) {
            const monthProgress = i / currentMonthNum
            const estimatedMonthly = currentTotal * monthProgress
            
            months.push(`Month ${i}`)
            actualCumulative.push(estimatedMonthly)
            
            if (annualBudget > 0) {
              const progress = i / 12
              const sCurveProgress = 3 * Math.pow(progress, 2) - 2 * Math.pow(progress, 3)
              budgetEnvelope.push(annualBudget * sCurveProgress)
            }
          }
          actualRunning = currentTotal
        }

        // Project remaining months with forecast
        const currentMonth = months.length
        const remainingMonths = Math.max(0, 12 - currentMonth)
        
        if (remainingMonths > 0 && forecastTotal > 0) {
          const monthlyForecastRate = forecastTotal / Math.max(1, remainingMonths)
          
          for (let i = 1; i <= remainingMonths; i++) {
            const futureMonth = currentMonth + i
            months.push(`Month ${futureMonth}`)
            
            actualRunning += monthlyForecastRate
            actualCumulative.push(actualRunning)
            forecastProjection.push(actualRunning)
            
            // Continue budget envelope
            if (annualBudget > 0) {
              const progress = futureMonth / 12
              const sCurveProgress = 3 * Math.pow(progress, 2) - 2 * Math.pow(progress, 3)
              budgetEnvelope.push(annualBudget * sCurveProgress)
            }
          }
        }

        const result = {
          months,
          actualSpend: actualCumulative,
          budgetEnvelope: budgetEnvelope.length > 0 ? budgetEnvelope : null,
          forecastProjection: forecastProjection.length > 0 ? forecastProjection : null,
          totalBudget: annualBudget,
          monthlyBudget,
          isOverBudget: actualRunning > annualBudget
        }

        console.log('BudgetSCurve: Returning result:', {
          monthsCount: result.months.length,
          actualSpendCount: result.actualSpend.length,
          hasBudgetEnvelope: !!result.budgetEnvelope,
          hasForecastProjection: !!result.forecastProjection,
          totalBudget: result.totalBudget
        })

        return result
      }
    },

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
        console.log('YearEndForecast: Starting extraction')

        const historical = dataset.historical as any
        const yearEndForecast = dataset.yearEndForecast as any
        const currentMonthForecast = dataset.forecast as any // Current month remainder forecast
        const summary = dataset.summary as any
        const mode = dataset.mode || 'billable'

        if (!historical && !yearEndForecast) {
          console.log('YearEndForecast: Missing historical or yearEndForecast data')
          return null
        }

        const historicalData = historical?.data || historical

        // Handle summary data structure difference between modes
        const rawSummaryData = summary?.data || summary
        let summaryData: any

        if (mode === 'proforma' && rawSummaryData?.proforma) {
          // Proforma mode: use proforma.accounts and proforma.summary
          summaryData = rawSummaryData.proforma
          console.log('YearEndForecast: Using proforma summary data')
        } else if (mode === 'billable' || !rawSummaryData?.proforma) {
          // Standard mode: use accounts and summary directly
          summaryData = rawSummaryData
          console.log('YearEndForecast: Using standard summary data')
        } else {
          // Fallback
          summaryData = rawSummaryData
        }

        // API now always returns forecast in consistent structure for both modes
        const forecastData = yearEndForecast?.data || yearEndForecast
        const currentForecastData = currentMonthForecast?.data || currentMonthForecast

        console.log('YearEndForecast: Data structures:', {
          mode,
          hasHistorical: !!historicalData,
          hasForecast: !!forecastData?.forecast,
          hasCurrentForecast: !!currentForecastData?.forecast,
          hasSummary: !!summaryData,
          forecastPeriodsCount: forecastData?.forecast?.forecastResultsByTime?.length || 0,
          currentForecastTotal: currentForecastData?.forecast?.total?.Amount || 'N/A'
        })

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

        const selectedAccounts = dataset.accounts || []
        const filterBySelection = selectedAccounts.length > 0

        // Process historical data (Jan - last complete month)
        const monthlyBreakdown = historicalData?.monthlyBreakdown || []

        // Create a map of YYYY-MM to cost for easier lookup
        const historicalCostMap = new Map<string, number>()
        monthlyBreakdown.forEach((month: any) => {
          const monthKey = month.month // Format: YYYY-MM
          const cost = month.cost || 0
          historicalCostMap.set(monthKey, cost)
        })

        // Get current month's actual spending from summary
        let currentMonthActual = 0
        if (summaryData?.accounts) {
          currentMonthActual = summaryData.accounts
            .filter((account: any) => !filterBySelection || selectedAccounts.includes(account.accountId))
            .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)

          console.log('YearEndForecast: Current month actual from summary:', {
            mode,
            currentMonthActual,
            accountCount: summaryData.accounts?.length || 0,
            filteredAccountCount: summaryData.accounts?.filter((account: any) =>
              !filterBySelection || selectedAccounts.includes(account.accountId)
            ).length || 0,
            sampleAccountId: summaryData.accounts?.[0]?.accountId,
            sampleTotalCost: summaryData.accounts?.[0]?.totalCost,
            dataSource: mode === 'proforma' ? 'proforma.accounts' : 'accounts'
          })
        } else {
          console.log('YearEndForecast: No summary data available for current month')
        }

        // Get current month's end-of-month forecast (actual + remainder)
        let currentMonthEndForecast = currentMonthActual // Default to actual if no forecast
        if (currentForecastData?.forecast?.total?.Amount) {
          const remainderForecast = parseFloat(currentForecastData.forecast.total.Amount)
          currentMonthEndForecast = currentMonthActual + remainderForecast
          console.log('YearEndForecast: Current month - Actual:', currentMonthActual, 'Remainder:', remainderForecast, 'End-of-month projection:', currentMonthEndForecast)
        } else {
          console.log('YearEndForecast: No current month forecast available, using actual only')
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

          console.log('YearEndForecast: Processing', forecastByTime.length, 'forecast periods')
          console.log('YearEndForecast: Current month is', currentMonth, '(', months[currentMonth], ')')
          console.log('YearEndForecast: Current year is', currentYear)

          forecastByTime.forEach((period: any, idx: number) => {
            const dateStr = period?.TimePeriod?.Start || ''
            if (!dateStr) {
              console.log(`YearEndForecast: Forecast period ${idx + 1}: NO DATE`)
              return
            }

            // Parse date using UTC to avoid timezone issues
            // AWS returns dates as "YYYY-MM-DD" which we need to parse consistently
            const date = new Date(dateStr + 'T00:00:00Z') // Force UTC interpretation
            const monthIndex = date.getUTCMonth() // 0-11, use UTC to avoid timezone shift
            const year = date.getUTCFullYear()
            const meanValue = parseFloat(period?.MeanValue || '0')

            console.log(`YearEndForecast: Forecast period ${idx + 1}:`, {
              date: dateStr,
              month: monthIndex,
              monthName: months[monthIndex],
              year,
              meanValue,
              isCurrentYear: year === currentYear,
              isAfterCurrentMonth: monthIndex > currentMonth,
              willInclude: year === currentYear && monthIndex > currentMonth
            })

            // Process all future months including December
            if (year === currentYear && monthIndex > currentMonth) {
              // Get confidence intervals if available (80% = p10 to p90)
              let upper = null
              let lower = null

              if (period?.PredictionIntervalUpperBound && period?.PredictionIntervalLowerBound) {
                upper = parseFloat(period.PredictionIntervalUpperBound)
                lower = parseFloat(period.PredictionIntervalLowerBound)
                console.log(`  ✓ Confidence bands: Lower=$${lower.toFixed(2)}, Upper=$${upper.toFixed(2)}`)
              } else {
                console.log(`  ⚠ No confidence bands available`)
              }

              console.log(`  ✓ Setting forecast for month ${monthIndex} (${months[monthIndex]}): $${meanValue.toFixed(2)}`)

              forecastValues[monthIndex] = meanValue
              upperBound[monthIndex] = upper
              lowerBound[monthIndex] = lower
            } else {
              console.log(`  ✗ Skipping (year mismatch or not future month)`)
            }
          })

          // Specifically check for December
          const decemberHasForecast = forecastValues[11] !== null
          console.log('YearEndForecast: December (month 11) has forecast?', decemberHasForecast)
          if (decemberHasForecast) {
            console.log('  December forecast value:', forecastValues[11])
          }
        } else {
          console.log('YearEndForecast: NO FORECAST DATA in API response')
        }

        console.log('YearEndForecast: Final data:', {
          months: months,
          actualValues: actualValues.map((v, i) => `${months[i]}: ${v !== null ? '$' + v.toFixed(0) : 'null'}`),
          forecastValues: forecastValues.map((v, i) => `${months[i]}: ${v !== null ? '$' + v.toFixed(0) : 'null'}`),
          hasConfidenceBands: upperBound.some(v => v !== null)
        })

        return {
          months,
          series: [
            {
              name: 'Actual Costs',
              data: actualValues,
              type: 'bar'
            },
            {
              name: 'Forecast',
              data: forecastValues,
              type: 'bar'
            }
          ],
          confidenceBands: {
            upper: upperBound,
            lower: lowerBound
          },
          metadata: {
            currentMonth: currentMonth + 1,
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
        }
      }
    }
  }

  // Dynamic chart selection based on scenario
  const chartIdsByScenario: Record<Scenario, string[]> = {
    // No accounts selected - show strategic organizational overview
    'all-accounts': [
      'yearEndForecast',                  // Year-end projection with actuals + forecast (contextual - always full year)
      'organizationForecastComparison',   // Simple org forecast vs current (current periods only)
      'budgetSCurve',                     // S-curve budget envelope tracking (current periods only)
      'forecastConfidenceBands',          // Forecast with uncertainty bands (current periods only)
      'totalSpendTrend',                  // Overall spending trends (always shown)
      'serviceBreakdown',                 // Service distribution pie (always shown)
      'costOptimizationOpportunities',    // Optimization recommendations (current periods only)
      'accountRiskAssessment',            // Risk assessment donut (current periods only)
      'efficiencyScore',                  // Budget efficiency (current periods only)
      'forecastGauge',                    // Next month forecast gauge (current periods only)
      'historicalMonthlyTrend',           // Monthly history (historical periods)
      'costGrowthRate'                    // Growth analysis (always useful)
    ],

    // Single account selected - deep dive analytics for the account
    'single-account': [
      'yearEndForecast',               // Year-end projection (contextual - always full year)
      'organizationForecastComparison', // Daily actual + forecast for current month
      'cumulativeBurnUp',              // Cumulative burn-up (current periods only)
      'monthlyTrendWithForecast',      // Monthly trend with forecast (current periods only)
      'budgetUtilization',             // Budget status (current periods only)
      'extendedForecastTrend',         // 3-month forecast (current periods only)
      'serviceBreakdown',              // Service usage (always shown)
      'totalSpendTrend',               // Spending trend (always shown)
      'forecastGauge',                 // Forecast gauge (current periods only)
      'historicalMonthlyTrend',        // Monthly history (historical periods)
      'costGrowthRate'                 // Growth rate (always useful)
    ],

    // Few accounts selected (2-10) - comparative analysis focus
    'few-accounts': [
      'yearEndForecast',               // Year-end projection (contextual - always full year)
      'organizationForecastComparison', // Daily actual + forecast comparison
      'currentVsForecastComparison',   // Current vs forecast for selected accounts
      'accountForecastComparison',     // Compare forecasts across selected accounts
      'cumulativeBurnUp',              // Burn-up comparison for selected accounts
      'monthlyTrendWithForecast',      // Monthly comparison with forecast
      'historicalVsForecastComparison', // Historical patterns vs forecasts
      'budgetUtilization',             // Compare selected accounts' budget usage
      'topSpenders',                   // Rank the selected accounts
      'serviceBreakdown',              // Combined service usage
      'costGrowthRate'                 // Growth comparison between accounts
    ],

    // LOB tab active - line of business analysis
    'lob-group': [
      'budgetSCurve',                 // LOB S-curve budget tracking
      'lobTrendComparison',           // Multi-line LOB trends
      'accountForecastComparison',    // LOB forecast comparison
      'monthlyTrendWithForecast',     // LOB monthly trend with forecast
      'lobComparison',                // LOB comparison bars
      'departmentComparison',         // Departments within LOB
      'efficiencyScore',              // LOB budget efficiency
      'topSpenders',                  // Top accounts in LOB
      'costGrowthRate'                // LOB growth analysis
    ],

    // Department tab active - department analysis  
    'department-group': [
      'cumulativeBurnUp',             // Department cumulative burn tracking
      'currentVsForecastComparison',  // Department current vs forecast
      'departmentBudgetPerformance',  // Department budget performance
      'monthlyTrendWithForecast',     // Department monthly trend with forecast
      'historicalVsForecastComparison', // Department historical patterns
      'totalSpendTrend',              // Department spending trends
      'budgetUtilization',            // Department budget usage
      'serviceBreakdown',             // Department's service mix
      'topSpenders',                  // Top accounts in department
      'costGrowthRate'                // Department growth analysis
    ]
  }

  const charts = computed<ChartDefinition[]>(() => {
    const currentScenario = args.scenario.value
    const currentTimeframe = args.timeframe?.value || 'thisMonth'
    const currentMode = args.mode?.value || 'billable'
    
    console.log('ChartRegistry: Computing charts for scenario:', currentScenario, 'timeframe:', currentTimeframe, 'mode:', currentMode)
    
    // Determine if we're looking at historical data vs current/future
    const isHistoricalPeriod = ['last7days', 'last30days', 'last90days', 'lastMonth', 'lastQuarter', 'lastYear', 'last12months', 'last24months'].includes(currentTimeframe)
    const isCurrentPeriod = ['thisMonth', 'thisQuarter', 'thisYear'].includes(currentTimeframe)
    
    console.log('ChartRegistry: Is historical period?', isHistoricalPeriod, 'Is current period?', isCurrentPeriod)
    
    // Charts that require current budget data (should be excluded for historical periods)
    const budgetDependentCharts = [
      'budgetUtilization',
      'budgetVarianceAnalysis',
      'efficiencyScore',
      'departmentBudgetPerformance',
      'costOptimizationOpportunities',
      'accountRiskAssessment'
    ]
    
    // Forecast charts that only make sense for current/future periods
    // These should be excluded from historical views
    const forecastCharts = [
      'forecastGauge',
      'currentVsForecastComparison',
      'monthlyTrendWithForecast',
      'accountForecastComparison',
      'extendedForecastTrend',
      'organizationForecastComparison',
      'forecastProjectionLine',
      'forecastConfidenceBands',
      'budgetSCurve', // S-curve includes forecast projection
      'cumulativeBurnUp' // Burn-up shows future budget tracking
    ]
    
    // Historical comparison charts that make sense for any timeframe
    // const comparisonCharts = [
    //   'historicalVsForecastComparison', // This could compare last month to this month's forecast
    //   'billableVsProforma' // Mode comparison works for any timeframe
    // ]
    
    let ids = chartIdsByScenario[currentScenario]
    console.log('ChartRegistry: Initial chart IDs for scenario:', ids)
    
    // Filter charts based on whether we're in historical or current period
    if (isHistoricalPeriod) {
      console.log('ChartRegistry: Filtering out forecast and budget-dependent charts for historical period')
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
      
      // Add contextual charts based on timeframe regardless of historical/current status
      // Temporarily disabled until we implement proper async chart handling
      
      // Add year-over-year for any view (always shows last 2 calendar years)
      // if (!ids.includes('yearOverYearComparison') && !isHistoricalPeriod) {
      //   ids.push('yearOverYearComparison')
      // }
      
      // Add 24-month trend for shorter historical periods
      // if ((currentTimeframe === 'last7days' || currentTimeframe === 'last30days' || currentTimeframe === 'last90days') && !ids.includes('last24MonthsTrend')) {
      //   ids.push('last24MonthsTrend')
      // }
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
      console.log('ChartRegistry: Added billableVsProforma chart for proforma mode')
    }
    
    // Add month-over-month comparison when looking at current month
    // Temporarily disabled
    // if (currentTimeframe === 'thisMonth' && !ids.includes('monthOverMonthComparison')) {
    //   ids.push('monthOverMonthComparison')
    // }
    
    const selectedCharts = ids.map(id => baseCharts[id]).filter(Boolean) as ChartDefinition[]

    // Adjust chart titles based on context
    const contextualCharts = selectedCharts.map(chart => {
      let contextualTitle = chart.title
      let contextualDescription = chart.description

      if (currentScenario === 'single-account') {
        if (chart.id === 'budgetUtilization') {
          contextualTitle = 'Account Budget Status'
          contextualDescription = 'Budget utilization for selected account'
        } else if (chart.id === 'serviceBreakdown') {
          contextualTitle = 'Account Services'
          contextualDescription = 'Service costs for selected account'
        } else if (chart.id === 'forecastGauge') {
          contextualTitle = 'Account Forecast'
          contextualDescription = 'Next month forecast for selected account'
        }
      } else if (currentScenario === 'few-accounts') {
        if (chart.id === 'budgetUtilization') {
          contextualTitle = 'Selected Accounts Budget'
          contextualDescription = 'Budget comparison for selected accounts'
        } else if (chart.id === 'topSpenders') {
          contextualTitle = 'Selected Accounts Ranking'
          contextualDescription = 'Cost ranking of selected accounts'
        } else if (chart.id === 'serviceBreakdown') {
          contextualTitle = 'Combined Services'
          contextualDescription = 'Service costs across selected accounts'
        }
      }

      return {
        ...chart,
        title: contextualTitle,
        description: contextualDescription
      }
    })

    console.log('ChartRegistry: Final selection:', {
      scenario: currentScenario,
      timeframe: currentTimeframe,
      isHistorical: isHistoricalPeriod,
      originalIds: chartIdsByScenario[currentScenario],
      filteredIds: ids,
      chartTitles: contextualCharts.map(c => c.title),
      chartCount: contextualCharts.length,
      forecastChartsIncluded: contextualCharts.filter(c => forecastCharts.includes(c.id)).map(c => c.title)
    })

    return contextualCharts
  })

  return { charts }
}