import { computed, ref } from 'vue'
import type { Ref } from 'vue'

interface OrganizationalGroup {
  name: string
  accounts: string[]
  totalSpend: number
  monthlyData: Array<{ month: string; cost: number }>
  serviceBreakdown: Array<{ service: string; cost: number }>
  topAccounts: Array<{ account: string; cost: number }>
}

export const useOrganizationalData = (dataset: Ref<any>) => {
  
  // Process data into LOB groups
  const lobGroups = computed(() => {
    if (!dataset.value) return []
    
    const groups = new Map<string, OrganizationalGroup>()
    const accounts = dataset.value.accounts || []
    const historical = dataset.value.historical?.data || dataset.value.historical
    
    // If we don't have account metadata, return empty
    if (!Array.isArray(accounts) || accounts.length === 0 || typeof accounts[0] === 'string') {
      console.log('No account metadata available for LOB grouping')
      return []
    }
    
    // Group accounts by LOB
    const lobMap = new Map<string, any[]>()
    accounts.forEach((account: any) => {
      const lob = account.linesOfBusiness || account.lineOfBusiness || 'Unknown LOB'
      if (!lobMap.has(lob)) {
        lobMap.set(lob, [])
      }
      lobMap.get(lob)!.push(account)
    })
    
    // For each LOB, calculate metrics
    lobMap.forEach((lobAccounts, lobName) => {
      const accountIds = lobAccounts.map(a => 
        a.accountId || a.awsStandardAccountID || a.awsCommercialAccountID
      ).filter(Boolean)
      
      // Calculate total spend for this LOB
      let totalSpend = 0
      const monthlyData: Array<{ month: string; cost: number }> = []
      
      // Process historical data if available
      if (historical?.resultsByTime) {
        historical.resultsByTime.forEach((bucket: any) => {
          const month = bucket.TimePeriod?.Start?.substring(0, 7) // YYYY-MM
          let monthTotal = 0
          
          if (bucket.Groups) {
            bucket.Groups.forEach((g: any) => {
              const accountId = g.Keys?.[0]
              if (accountIds.includes(accountId)) {
                const cost = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
                monthTotal += cost
                totalSpend += cost
              }
            })
          }
          
          if (month && monthTotal > 0) {
            monthlyData.push({ month, cost: monthTotal })
          }
        })
      }
      
      groups.set(lobName, {
        name: lobName,
        accounts: accountIds,
        totalSpend,
        monthlyData,
        serviceBreakdown: [], // Would need service-level data
        topAccounts: lobAccounts
          .map(a => ({
            account: a.accountName || a.accountId,
            cost: parseFloat(a.estimatedMonthlyCharge || a.currentSpend || '0')
          }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 5)
      })
    })
    
    return Array.from(groups.values()).sort((a, b) => b.totalSpend - a.totalSpend)
  })
  
  // Process data into Department groups
  const departmentGroups = computed(() => {
    if (!dataset.value) return []
    
    const groups = new Map<string, OrganizationalGroup>()
    const accounts = dataset.value.accounts || []
    
    // If we don't have account metadata, return empty
    if (!Array.isArray(accounts) || accounts.length === 0 || typeof accounts[0] === 'string') {
      console.log('No account metadata available for department grouping')
      return []
    }
    
    // Group accounts by Department
    const deptMap = new Map<string, any[]>()
    accounts.forEach((account: any) => {
      const dept = account.departmentNumber || account.department || 'Unknown Department'
      if (!deptMap.has(dept)) {
        deptMap.set(dept, [])
      }
      deptMap.get(dept)!.push(account)
    })
    
    // Similar processing as LOB but for departments
    deptMap.forEach((deptAccounts, deptName) => {
      const accountIds = deptAccounts.map(a => 
        a.accountId || a.awsStandardAccountID || a.awsCommercialAccountID
      ).filter(Boolean)
      
      let totalSpend = 0
      deptAccounts.forEach(a => {
        totalSpend += parseFloat(a.estimatedMonthlyCharge || a.currentSpend || '0')
      })
      
      groups.set(deptName, {
        name: deptName,
        accounts: accountIds,
        totalSpend,
        monthlyData: [], // Would be populated from historical data
        serviceBreakdown: [],
        topAccounts: deptAccounts
          .map(a => ({
            account: a.accountName || a.accountId,
            cost: parseFloat(a.estimatedMonthlyCharge || a.currentSpend || '0')
          }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 5)
      })
    })
    
    return Array.from(groups.values()).sort((a, b) => b.totalSpend - a.totalSpend)
  })
  
  // Get standard charts for a group
  const getGroupCharts = (group: OrganizationalGroup) => {
    return {
      // Monthly trend chart
      monthlyTrend: {
        type: 'line',
        data: group.monthlyData,
        title: `${group.name} - Monthly Spending Trend`
      },
      
      // Top accounts bar chart
      topAccounts: {
        type: 'bar',
        data: group.topAccounts,
        title: `${group.name} - Top Spending Accounts`
      },
      
      // Total spend gauge
      totalSpend: {
        type: 'gauge',
        data: { value: group.totalSpend, max: group.totalSpend * 1.5 },
        title: `${group.name} - Total Spend`
      },
      
      // Service breakdown pie (if available)
      serviceBreakdown: {
        type: 'pie',
        data: group.serviceBreakdown,
        title: `${group.name} - Service Distribution`
      }
    }
  }
  
  return {
    lobGroups,
    departmentGroups,
    getGroupCharts
  }
}