export interface CostFilterSettings {
  hideSavingsPlans: boolean
  hideEnterpriseSupport: boolean
  hideReservedInstances: boolean
  hideDevAccounts: boolean
  minCostThreshold: number
  currencyFormat: 'full' | 'abbreviated'
  showDecommissioned: boolean
}

export interface FilteredCostData {
  filteredAmount: number
  originalAmount: number
  isFiltered: boolean
}

export const useCostFilters = () => {
  const filterCostData = (
    rawData: any,
    settings: CostFilterSettings
  ): FilteredCostData => {
    if (!rawData) {
      return {
        filteredAmount: 0,
        originalAmount: 0,
        isFiltered: false
      }
    }

    let filteredAmount = rawData.totalCost || rawData.actualCost || rawData.cost || 0
    const originalAmount = filteredAmount
    let isFiltered = false

    // Filter out specific service types if they exist in the data structure
    if (rawData.services && Array.isArray(rawData.services)) {
      const filteredServices = rawData.services.filter((service: any) => {
        const serviceName = service.serviceName?.toLowerCase() || ''
        
        if (settings.hideSavingsPlans && serviceName.includes('savings plan')) {
          isFiltered = true
          return false
        }
        
        if (settings.hideEnterpriseSupport && serviceName.includes('enterprise support')) {
          isFiltered = true
          return false
        }
        
        if (settings.hideReservedInstances && serviceName.includes('reserved instance')) {
          isFiltered = true
          return false
        }
        
        return true
      })
      
      filteredAmount = filteredServices.reduce((sum: number, service: any) => 
        sum + (service.cost || service.amount || 0), 0
      )
    }

    // Apply minimum cost threshold
    if (settings.minCostThreshold > 0 && filteredAmount < settings.minCostThreshold) {
      return {
        filteredAmount: 0,
        originalAmount,
        isFiltered: true
      }
    }

    return {
      filteredAmount,
      originalAmount,
      isFiltered
    }
  }

  const formatCurrency = (value: number, format: 'full' | 'abbreviated' = 'abbreviated'): string => {
    if (format === 'full') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
      }).format(value)
    }

    // Abbreviated format (existing logic from the component)
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }

  const applyAccountFilters = (
    accounts: any[],
    settings: CostFilterSettings
  ): any[] => {
    return accounts
      .filter(account => {
        // Filter decommissioned accounts if setting is disabled
        if (!settings.showDecommissioned && account.status === 'decommissioned') {
          return false
        }
        
        // Filter dev accounts if setting is enabled (requestId 9100 or higher)
        if (settings.hideDevAccounts) {
          const requestId = parseInt(account.requestId || '0')
          if (requestId >= 9100) {
            return false
          }
        }
        
        // Apply minimum threshold (use currentSpend, totalSpend, or spend)
        const accountSpend = account.currentSpend || account.totalSpend || account.spend || 0
        return settings.minCostThreshold === 0 || accountSpend >= settings.minCostThreshold
      })
  }

  return {
    filterCostData,
    formatCurrency,
    applyAccountFilters
  }
}