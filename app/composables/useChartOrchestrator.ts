// AWS Cost Dashboard Chart Orchestration System
// Intelligent, adaptive charting framework that dynamically selects and organizes
// the most relevant cost analysis visualizations based on context and data availability

export interface ChartContext {
  accountCount: number
  hasHistoricalData: boolean
  hasBudgetData: boolean
  hasAnomalies: boolean
  hasForecast: boolean
  hasServiceBreakdown: boolean
  hasRegionalData: boolean
  selectedDepartments: string[]
  selectedLOBs: string[]
  timeRange: 'day' | 'week' | 'month' | 'quarter' | 'year'
  dataQuality: 'high' | 'medium' | 'low'
  userRole: 'executive' | 'manager' | 'analyst' | 'operator'
}

export interface ChartConfig {
  id: string
  title: string
  type: 'line' | 'bar' | 'pie' | 'area' | 'gauge' | 'scatter' | 'heatmap'
  size: 'small' | 'medium' | 'large' | 'xlarge' | 'full'
  category: 'base' | 'primary' | 'secondary' | 'sidebar'
  dataKey: string
  priority: number
  contextRules: string[]
  responsive: boolean
  drillDown?: string
}

export const useChartOrchestrator = () => {
  // Chart registry with comprehensive metadata
  const chartRegistry: ChartConfig[] = [
    // Base Charts - Always relevant fundamental views
    {
      id: 'total-spend',
      title: 'Total Spend',
      type: 'gauge',
      size: 'small',
      category: 'base',
      dataKey: 'totalSpend',
      priority: 100,
      contextRules: ['always'],
      responsive: true
    },
    {
      id: 'spend-trend',
      title: 'Spend Trend',
      type: 'line',
      size: 'large',
      category: 'base',
      dataKey: 'trendData',
      priority: 95,
      contextRules: ['hasHistoricalData', 'timeRange>week'],
      responsive: true
    },

    // Primary Charts - Key insights for current context
    {
      id: 'service-breakdown',
      title: 'Service Breakdown',
      type: 'pie',
      size: 'medium',
      category: 'primary',
      dataKey: 'serviceBreakdown',
      priority: 90,
      contextRules: ['hasServiceBreakdown', 'accountCount=1'],
      responsive: true,
      drillDown: 'service-detail'
    },
    {
      id: 'account-comparison',
      title: 'Account Comparison',
      type: 'bar',
      size: 'xlarge',
      category: 'primary',
      dataKey: 'accountComparison',
      priority: 85,
      contextRules: ['accountCount>1'],
      responsive: true,
      drillDown: 'account-detail'
    },
    {
      id: 'lob-comparison',
      title: 'Line of Business Comparison',
      type: 'bar',
      size: 'large',
      category: 'primary',
      dataKey: 'lobComparison',
      priority: 80,
      contextRules: ['selectedLOBs.length>1'],
      responsive: true,
      drillDown: 'lob-detail'
    },

    // Secondary Charts - Supporting analysis
    {
      id: 'regional-breakdown',
      title: 'Regional Cost Distribution',
      type: 'pie',
      size: 'medium',
      category: 'secondary',
      dataKey: 'regionalBreakdown',
      priority: 70,
      contextRules: ['hasRegionalData'],
      responsive: true
    },
    {
      id: 'cost-anomalies',
      title: 'Cost Anomalies',
      type: 'bar',
      size: 'medium',
      category: 'secondary',
      dataKey: 'anomalies',
      priority: 65,
      contextRules: ['hasAnomalies'],
      responsive: true
    },

    // Sidebar Charts - Compact supplementary information
    {
      id: 'budget-utilization',
      title: 'Budget Utilization',
      type: 'gauge',
      size: 'small',
      category: 'sidebar',
      dataKey: 'budgetUtilization',
      priority: 55,
      contextRules: ['hasBudgetData'],
      responsive: true
    },
    {
      id: 'cost-forecast',
      title: 'Cost Forecast',
      type: 'line',
      size: 'medium',
      category: 'sidebar',
      dataKey: 'forecast',
      priority: 50,
      contextRules: ['hasForecast', 'timeRange>=month'],
      responsive: true
    },
    {
      id: 'department-costs',
      title: 'Department Costs',
      type: 'bar',
      size: 'medium',
      category: 'secondary',
      dataKey: 'departmentCosts',
      priority: 45,
      contextRules: ['selectedDepartments.length>0'],
      responsive: true
    }
  ]

  // Contextual intelligence engine
  const evaluateContextRules = (chart: ChartConfig, context: ChartContext): boolean => {
    return chart.contextRules.every(rule => {
      switch (rule) {
        case 'always':
          return true
        case 'hasHistoricalData':
          return context.hasHistoricalData
        case 'hasBudgetData':
          return context.hasBudgetData
        case 'hasAnomalies':
          return context.hasAnomalies
        case 'hasForecast':
          return context.hasForecast
        case 'hasServiceBreakdown':
          return context.hasServiceBreakdown
        case 'hasRegionalData':
          return context.hasRegionalData
        case 'accountCount=1':
          return context.accountCount === 1
        case 'accountCount>1':
          return context.accountCount > 1
        case 'selectedLOBs.length>1':
          return context.selectedLOBs.length > 1
        case 'selectedDepartments.length>0':
          return context.selectedDepartments.length > 0
        case 'selectedDepartments.length>2':
          return context.selectedDepartments.length > 2
        case 'timeRange>week':
          return ['month', 'quarter', 'year'].includes(context.timeRange)
        case 'timeRange>=month':
          return ['month', 'quarter', 'year'].includes(context.timeRange)
        case 'dataQuality=high':
          return context.dataQuality === 'high'
        default:
          return false
      }
    })
  }

  // Main chart selection logic with contextual intelligence
  const selectCharts = (context: ChartContext): ChartConfig[] => {
    const validCharts = chartRegistry
      .filter(chart => evaluateContextRules(chart, context))
      .sort((a, b) => b.priority - a.priority)

    // Apply role-based filtering
    const roleFilteredCharts = filterByUserRole(validCharts, context.userRole)
    
    // Apply responsive layout optimization
    return optimizeLayout(roleFilteredCharts, context)
  }

  // Role-based chart filtering
  const filterByUserRole = (charts: ChartConfig[], role: string): ChartConfig[] => {
    switch (role) {
      case 'executive':
        return charts.filter(chart => 
          chart.category === 'base' || 
          chart.category === 'primary' ||
          (chart.category === 'sidebar' && chart.priority > 50)
        )
      case 'manager':
        return charts.filter(chart => 
          chart.category !== 'sidebar' || chart.priority > 40
        )
      case 'analyst':
        return charts // Show all charts for analysts
      case 'operator':
        return charts.filter(chart => 
          chart.category === 'base' || 
          chart.category === 'sidebar'
        )
      default:
        return charts
    }
  }

  // Layout optimization with dense packing
  const optimizeLayout = (charts: ChartConfig[], context: ChartContext): ChartConfig[] => {
    const layoutCharts: ChartConfig[] = []
    let currentRowSpan = 0
    const maxRowSpan = 12

    // Group charts by category for better organization
    const categoryOrder = ['base', 'primary', 'secondary', 'sidebar']
    
    for (const category of categoryOrder) {
      const categoryCharts = charts.filter(chart => chart.category === category)
      
      for (const chart of categoryCharts) {
        const chartSpan = getSizeSpan(chart.size)
        
        // Check if chart fits in current row
        if (currentRowSpan + chartSpan <= maxRowSpan) {
          layoutCharts.push(chart)
          currentRowSpan += chartSpan
        } else {
          // Start new row
          layoutCharts.push(chart)
          currentRowSpan = chartSpan
        }
      }
    }

    return layoutCharts
  }

  // Get column span for size
  const getSizeSpan = (size: string): number => {
    switch (size) {
      case 'small': return 3
      case 'medium': return 6
      case 'large': return 9
      case 'xlarge': return 12
      case 'full': return 12
      default: return 6
    }
  }

  // Get grid layout class based on size with responsive breakpoints
  const getGridClass = (size: string): string => {
    switch (size) {
      case 'small': return 'col-span-12 sm:col-span-6 md:col-span-3'
      case 'medium': return 'col-span-12 md:col-span-6'
      case 'large': return 'col-span-12 md:col-span-9'
      case 'xlarge': return 'col-span-12'
      case 'full': return 'col-span-12'
      default: return 'col-span-12 md:col-span-6'
    }
  }

  // Get chart height based on size and context
  const getChartHeight = (size: string, context: ChartContext): string => {
    const baseHeight = {
      small: '200px',
      medium: '300px',
      large: '400px',
      xlarge: '500px',
      full: '400px'
    }

    // Adjust height based on user role
    if (context.userRole === 'executive') {
      return baseHeight[size] || '300px'
    }
    
    return baseHeight[size] || '300px'
  }

  // Progressive disclosure - get initial charts vs full set
  const getInitialCharts = (context: ChartContext): ChartConfig[] => {
    const allCharts = selectCharts(context)
    return allCharts.slice(0, 6) // Show first 6 charts initially
  }

  // Get additional charts for progressive loading
  const getAdditionalCharts = (context: ChartContext, currentCount: number): ChartConfig[] => {
    const allCharts = selectCharts(context)
    return allCharts.slice(currentCount)
  }

  return {
    selectCharts,
    getInitialCharts,
    getAdditionalCharts,
    getGridClass,
    getChartHeight,
    getSizeSpan,
    chartRegistry
  }
}