/**
 * Shared PDF Generator
 * Unified PDF generation logic for both client and server
 * Uses dependency injection for environment-specific features
 */

import type { DataExportConfig, ExportResult, SheetConfig } from '#shared/types/export'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Environment-specific hooks for AI and HTML rendering
 */
export interface PDFGeneratorHooks {
  /**
   * Get AI-powered cost analysis
   * @param summarySheet - Summary sheet data
   * @param servicesSheet - Services sheet data
   * @param config - Export configuration
   * @returns AI-generated analysis text or null if unavailable
   */
  getAIAnalysis?: (
    summarySheet: any,
    servicesSheet: any,
    config: DataExportConfig
  ) => Promise<string | null>

  /**
   * Whether HTML rendering is supported in this environment
   */
  canRenderHTML?: boolean
}

/**
 * Generate filename with timestamp
 */
function generateFilename(base: string, format: string): string {
  const timestamp = new Date().toISOString().split('T')[0]
  return `${base}-${timestamp}.${format}`
}

/**
 * Format cell value based on column configuration
 */
function formatCellValue(value: any, column?: any, formatting?: any): string {
  if (value === null || value === undefined) return ''

  if (column?.format === 'currency') {
    const num = typeof value === 'number' ? value : parseFloat(value)
    if (isNaN(num)) return value.toString()
    return `$${num.toFixed(column.decimals || 2)}`
  }

  if (column?.format === 'percentage') {
    const num = typeof value === 'number' ? value : parseFloat(value)
    if (isNaN(num)) return value.toString()
    return `${num.toFixed(column.decimals || 1)}%`
  }

  if (column?.format === 'number') {
    const num = typeof value === 'number' ? value : parseFloat(value)
    if (isNaN(num)) return value.toString()
    return num.toFixed(column.decimals || 0)
  }

  return value.toString()
}

/**
 * Normalize sheet data to headers and rows format
 */
function normalizeSheetData(data: any[], columns?: any[]): { headers: string[], rows: any[][] } {
  if (!data || data.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = columns?.map(c => c.header) || Object.keys(data[0])
  const keys = columns?.map(c => c.key) || Object.keys(data[0])

  const rows = data.map(item =>
    keys.map(key => item[key])
  )

  return { headers, rows }
}

/**
 * Term definitions with footnote numbers
 */
const TERM_DEFINITIONS = [
  {
    term: 'Billable',
    fullTerm: 'Billable Costs',
    footnote: '¹',
    definition: 'Actual costs billed by AWS without any credits, discounts, or savings plans applied. This represents the true cost of AWS resources consumed during the period.'
  },
  {
    term: 'Pro-forma',
    fullTerm: 'Pro-forma Costs',
    footnote: '²',
    definition: 'Costs calculated after applying AWS Savings Plans, Reserved Instances, and other discount programs. This shows the effective cost after all organizational cost optimizations are applied.'
  },
  {
    term: 'Month-to-Date',
    fullTerm: 'Month-to-Date (MTD)',
    footnote: '³',
    definition: 'Actual costs incurred from the first day of the current month through today. This represents confirmed spending that has already occurred.'
  },
  {
    term: 'MTD',
    fullTerm: 'Month-to-Date (MTD)',
    footnote: '³',
    definition: 'Actual costs incurred from the first day of the current month through today. This represents confirmed spending that has already occurred.'
  },
  {
    term: 'Forecast',
    fullTerm: 'Forecast',
    footnote: '⁴',
    definition: 'Projected future costs calculated by AWS Cost Explorer using machine learning algorithms. Forecasts analyze historical spending patterns, seasonal trends, and current usage to predict future costs. AWS provides prediction intervals showing the range of likely outcomes.'
  },
  {
    term: 'Year-to-Date',
    fullTerm: 'Year-to-Date (YTD)',
    footnote: '⁵',
    definition: 'Total actual costs from January 1st through today. For the current month, this includes complete historical months plus the current month\'s MTD actual spending.'
  },
  {
    term: 'YTD',
    fullTerm: 'Year-to-Date (YTD)',
    footnote: '⁵',
    definition: 'Total actual costs from January 1st through today. For the current month, this includes complete historical months plus the current month\'s MTD actual spending.'
  },
  {
    term: 'Year-End Projection',
    fullTerm: 'Year-End Projection',
    footnote: '⁶',
    definition: 'Estimated total cost for the entire calendar year, calculated as: Year-to-Date Actual + Current Month Remainder Forecast + Future Months Forecast. This combines confirmed spending with AWS\'s machine learning predictions.'
  },
  {
    term: 'Budget Utilization',
    fullTerm: 'Budget Utilization',
    footnote: '⁷',
    definition: 'Percentage of allocated budget consumed. Values over 100% indicate spending has exceeded the budgeted amount for the period.'
  },
  {
    term: 'Utilization',
    fullTerm: 'Budget Utilization',
    footnote: '⁷',
    definition: 'Percentage of allocated budget consumed. Values over 100% indicate spending has exceeded the budgeted amount for the period.'
  },
  {
    term: 'Variance',
    fullTerm: 'Variance',
    footnote: '⁸',
    definition: 'The difference between actual costs and budgeted amounts. Positive variance indicates over-budget spending; negative variance indicates under-budget spending.'
  },
  {
    term: 'Unblended Cost',
    fullTerm: 'Unblended Cost',
    footnote: '⁹',
    definition: 'AWS costs shown at the rates originally charged for each service and usage type. This is the standard cost metric used throughout this report for consistent analysis across accounts.'
  }
]

/**
 * Add footnote markers to text where terms appear
 */
function addFootnoteMarkers(text: string): string {
  if (!text) return text

  let markedText = text
  const processedTerms = new Set<string>()

  // Sort by length descending to match longer terms first
  const sortedTerms = [...TERM_DEFINITIONS].sort((a, b) => b.term.length - a.term.length)

  for (const term of sortedTerms) {
    // Skip if we've already processed this footnote
    if (processedTerms.has(term.footnote)) continue

    // Create regex to match whole words only
    const regex = new RegExp(`\\b(${term.term})\\b`, 'gi')

    if (regex.test(markedText)) {
      // Replace first occurrence only
      markedText = markedText.replace(regex, `$1${term.footnote}`)
      processedTerms.add(term.footnote)
    }
  }

  return markedText
}

/**
 * Create professional title page
 */
function createTitlePage(pdf: any, config: DataExportConfig): void {
  const pageWidth = pdf.internal.pageSize.width
  const pageHeight = pdf.internal.pageSize.height
  const centerX = pageWidth / 2

  // Add vertical spacing
  let currentY = pageHeight / 4

  // Main Title
  pdf.setFontSize(28)
  pdf.setTextColor('#1e40af') // Blue
  pdf.setFont(undefined, 'bold')
  const titleLines = pdf.splitTextToSize(config.title, pageWidth - 40)
  titleLines.forEach((line: string) => {
    pdf.text(line, centerX, currentY, { align: 'center' })
    currentY += 12
  })

  currentY += 10

  // Subtitle
  if (config.subtitle) {
    pdf.setFontSize(16)
    pdf.setTextColor('#64748b') // Gray
    pdf.setFont(undefined, 'normal')
    const subtitleLines = pdf.splitTextToSize(config.subtitle, pageWidth - 60)
    subtitleLines.forEach((line: string) => {
      pdf.text(line, centerX, currentY, { align: 'center' })
      currentY += 8
    })
  }

  currentY += 20

  // Decorative line
  pdf.setDrawColor('#1e40af')
  pdf.setLineWidth(0.5)
  pdf.line(pageWidth / 4, currentY, (pageWidth * 3) / 4, currentY)

  currentY += 20

  // Key metadata in a clean box
  if (config.metadata) {
    const boxWidth = pageWidth - 80
    const boxLeft = 40
    let boxY = currentY

    pdf.setFontSize(11)
    pdf.setTextColor('#000000')
    pdf.setFont(undefined, 'normal')

    // Generated info
    if (config.metadata.generatedBy) {
      pdf.text('Generated By:', boxLeft, boxY)
      pdf.setFont(undefined, 'bold')
      pdf.text(String(config.metadata.generatedBy), boxLeft + 60, boxY)
      pdf.setFont(undefined, 'normal')
      boxY += 8
    }

    if (config.metadata.timestamp) {
      pdf.text('Date:', boxLeft, boxY)
      pdf.setFont(undefined, 'bold')
      pdf.text(String(config.metadata.timestamp), boxLeft + 60, boxY)
      pdf.setFont(undefined, 'normal')
      boxY += 8
    }

    boxY += 5

    if (config.metadata.timeframe) {
      pdf.text('Time Period:', boxLeft, boxY)
      pdf.setFont(undefined, 'bold')
      const timeframeText = addFootnoteMarkers(String(config.metadata.timeframe))
      pdf.text(timeframeText, boxLeft + 60, boxY)
      pdf.setFont(undefined, 'normal')
      boxY += 8
    }

    if (config.metadata.mode) {
      pdf.text('Data Mode:', boxLeft, boxY)
      pdf.setFont(undefined, 'bold')
      const modeText = addFootnoteMarkers(String(config.metadata.mode))
      pdf.text(modeText, boxLeft + 60, boxY)
      pdf.setFont(undefined, 'normal')
      boxY += 8
    }

    if (config.metadata.scope) {
      pdf.text('Scope:', boxLeft, boxY)
      pdf.setFont(undefined, 'bold')
      pdf.text(String(config.metadata.scope), boxLeft + 60, boxY)
      pdf.setFont(undefined, 'normal')
      boxY += 8
    }
  }

  // Footer text at bottom of title page
  pdf.setFontSize(9)
  pdf.setTextColor('#64748b')
  pdf.setFont(undefined, 'italic')
  pdf.text('GHOST Cost Dashboard', centerX, pageHeight - 20, { align: 'center' })
  pdf.text('AWS Cost Analysis Report', centerX, pageHeight - 15, { align: 'center' })
}

/**
 * Create Executive Summary page
 */
function createExecutiveSummary(pdf: any, config: DataExportConfig): void {
  const pageWidth = pdf.internal.pageSize.width
  const centerX = pageWidth / 2
  let currentY = 30

  // Page Title
  pdf.setFontSize(22)
  pdf.setTextColor('#1e40af')
  pdf.setFont(undefined, 'bold')
  pdf.text('Executive Summary', centerX, currentY, { align: 'center' })
  currentY += 15

  // Extract key metrics from metadata
  const metadata = config.metadata || {}
  const summarySheet = config.sheets.find(s => s.type === 'summary' || s.name.toLowerCase().includes('summary'))

  // Helper to format currency
  const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return 'N/A'
    if (Math.abs(value) >= 1e6) {
      return `$${(value / 1e6).toFixed(2)}M`
    } else if (Math.abs(value) >= 1e3) {
      return `$${(value / 1e3).toFixed(1)}K`
    }
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Helper to get trend status
  const getTrendStatus = (change: number): { status: 'success' | 'warning' | 'error', trend: 'up' | 'down' | 'flat' } => {
    if (Math.abs(change) < 1) return { status: 'success', trend: 'flat' }
    if (change < 0) return { status: 'success', trend: 'down' }
    if (change < 10) return { status: 'warning', trend: 'up' }
    return { status: 'error', trend: 'up' }
  }

  // Try to extract key metrics from summary data
  let totalCost: number | undefined
  let previousCost: number | undefined
  let changePercent: number | undefined
  let budgetUtilization: number | undefined
  let totalBudget: number | undefined

  if (summarySheet && Array.isArray(summarySheet.data)) {
    const summaryData = summarySheet.data[0] || {}

    // If summary has individual account rows, calculate totals
    if (summarySheet.data.length > 1 || !summaryData.totalCost) {
      totalCost = summarySheet.data.reduce((sum: number, row: any) =>
        sum + (row.cost || row.totalCost || 0), 0
      )

      // Calculate YTD if available
      if (summarySheet.data[0]?.ytdTotal !== undefined) {
        previousCost = summarySheet.data.reduce((sum: number, row: any) =>
          sum + (row.ytdTotal || 0), 0
        )
      }

      // Calculate total budget if available
      if (summarySheet.data[0]?.budget !== undefined) {
        totalBudget = summarySheet.data.reduce((sum: number, row: any) =>
          sum + (row.budget || 0), 0
        )
        if (totalBudget > 0) {
          budgetUtilization = (totalCost / totalBudget) * 100
        }
      }
    } else {
      // Single summary row with totals
      totalCost = summaryData.totalCost || summaryData.cost || summaryData.current
      previousCost = summaryData.previousCost || summaryData.previous
      changePercent = summaryData.changePercent || summaryData.change
      budgetUtilization = summaryData.budgetUtilization || summaryData.utilization
      totalBudget = summaryData.budget
    }
  }

  // Draw key metrics in boxes
  const boxWidth = (pageWidth - 60) / 2
  const boxHeight = 35
  const boxLeft1 = 20
  const boxLeft2 = boxLeft1 + boxWidth + 10

  // Box 1: Total Cost
  pdf.setFillColor(248, 250, 252) // Light gray background
  pdf.rect(boxLeft1, currentY, boxWidth, boxHeight, 'F')
  pdf.setDrawColor(226, 232, 240)
  pdf.rect(boxLeft1, currentY, boxWidth, boxHeight)

  pdf.setFontSize(11)
  pdf.setTextColor('#64748b')
  pdf.setFont(undefined, 'normal')
  pdf.text('Total Cost', boxLeft1 + 5, currentY + 8)

  pdf.setFontSize(20)
  pdf.setTextColor('#1e40af')
  pdf.setFont(undefined, 'bold')
  const costText = totalCost !== undefined ? formatCurrency(totalCost) : 'N/A'
  pdf.text(costText, boxLeft1 + 5, currentY + 22)

  if (changePercent !== undefined) {
    const trendInfo = getTrendStatus(changePercent)
    const changeText = changePercent >= 0 ? `+${changePercent.toFixed(1)}%` : `${changePercent.toFixed(1)}%`

    pdf.setFontSize(10)
    const trendColors = { success: '#22c55e', warning: '#eab308', error: '#ef4444' }
    pdf.setTextColor(trendColors[trendInfo.status])
    pdf.text(changeText, boxLeft1 + 5, currentY + 30)

    // Add trend arrow
    const arrowX = boxLeft1 + 5 + pdf.getTextWidth(changeText) + 5
    const arrowY = currentY + 28
    const arrowColors = {
      success: [34, 197, 94],
      warning: [234, 179, 8],
      error: [239, 68, 68]
    }
    pdf.setFillColor(...(arrowColors[trendInfo.status] as [number, number, number]))
    if (trendInfo.trend === 'up') {
      pdf.triangle(arrowX, arrowY - 2, arrowX - 2, arrowY + 2, arrowX + 2, arrowY + 2, 'F')
    } else if (trendInfo.trend === 'down') {
      pdf.triangle(arrowX, arrowY + 2, arrowX - 2, arrowY - 2, arrowX + 2, arrowY - 2, 'F')
    }
  }

  // Box 2: Budget Status (if available)
  pdf.setFillColor(248, 250, 252)
  pdf.rect(boxLeft2, currentY, boxWidth, boxHeight, 'F')
  pdf.setDrawColor(226, 232, 240)
  pdf.rect(boxLeft2, currentY, boxWidth, boxHeight)

  pdf.setFontSize(11)
  pdf.setTextColor('#64748b')
  pdf.setFont(undefined, 'normal')
  pdf.text('Budget Status', boxLeft2 + 5, currentY + 8)

  if (budgetUtilization !== undefined) {
    pdf.setFontSize(20)
    const utilizationStatus = budgetUtilization > 100 ? 'error' : budgetUtilization > 90 ? 'warning' : 'success'
    const statusColors = { success: '#22c55e', warning: '#eab308', error: '#ef4444' }
    pdf.setTextColor(statusColors[utilizationStatus])
    pdf.setFont(undefined, 'bold')
    pdf.text(`${budgetUtilization.toFixed(0)}%`, boxLeft2 + 5, currentY + 22)

    // Status indicator circle
    const circleColors = {
      success: [34, 197, 94],
      warning: [234, 179, 8],
      error: [239, 68, 68]
    }
    pdf.setFillColor(...(circleColors[utilizationStatus] as [number, number, number]))
    pdf.circle(boxLeft2 + boxWidth - 10, currentY + 18, 3, 'F')

    pdf.setFontSize(10)
    pdf.setTextColor('#64748b')
    pdf.setFont(undefined, 'normal')
    const statusText = budgetUtilization > 100 ? 'Over Budget' : budgetUtilization > 90 ? 'Near Limit' : 'On Track'
    pdf.text(statusText, boxLeft2 + 5, currentY + 30)
  } else {
    pdf.setFontSize(16)
    pdf.setTextColor('#94a3b8')
    pdf.setFont(undefined, 'normal')
    pdf.text('No Budget Set', boxLeft2 + 5, currentY + 22)
  }

  currentY += boxHeight + 15

  // Top Cost Drivers section
  const servicesSheet = config.sheets.find(s =>
    s.name.toLowerCase().includes('service') ||
    s.name.toLowerCase().includes('breakdown')
  )

  if (servicesSheet && Array.isArray(servicesSheet.data) && servicesSheet.data.length > 0) {
    pdf.setFontSize(14)
    pdf.setTextColor('#1e40af')
    pdf.setFont(undefined, 'bold')
    pdf.text('Top Cost Drivers', 20, currentY)
    currentY += 10

    // Get top 5 services
    const topServices = servicesSheet.data
      .slice(0, 5)
      .map((item: any) => ({
        name: item.serviceName || item.service || item.name || item.Service || 'Unknown',
        cost: item.cost || item.amount || item.Cost || 0
      }))

    topServices.forEach((service: any, index: number) => {
      // Service name and cost
      pdf.setFontSize(11)
      pdf.setTextColor('#000000')
      pdf.setFont(undefined, 'normal')

      const serviceName = String(service.name).length > 40
        ? String(service.name).substring(0, 37) + '...'
        : String(service.name)

      pdf.text(`${index + 1}. ${serviceName}`, 25, currentY)

      pdf.setFont(undefined, 'bold')
      pdf.text(formatCurrency(service.cost), pageWidth - 25, currentY, { align: 'right' })

      currentY += 8
    })
  }

  currentY += 5

  // Key Insights box (if we have comparison data)
  if (changePercent !== undefined && totalCost !== undefined && previousCost !== undefined) {
    currentY += 5
    pdf.setFontSize(14)
    pdf.setTextColor('#1e40af')
    pdf.setFont(undefined, 'bold')
    pdf.text('Key Insights', 20, currentY)
    currentY += 10

    pdf.setFontSize(10)
    pdf.setTextColor('#000000')
    pdf.setFont(undefined, 'normal')

    const changeDollar = totalCost - previousCost
    const changeDollarText = Math.abs(changeDollar) >= 1000
      ? `$${(Math.abs(changeDollar) / 1000).toFixed(1)}K`
      : `$${Math.abs(changeDollar).toFixed(0)}`

    if (changePercent > 10) {
      pdf.text(`• Costs increased by ${changePercent.toFixed(1)}% (${changeDollarText}) from previous period`, 25, currentY)
      currentY += 6
      pdf.text(`• Review top services for optimization opportunities`, 25, currentY)
    } else if (changePercent < -10) {
      pdf.text(`• Costs decreased by ${Math.abs(changePercent).toFixed(1)}% (${changeDollarText}) from previous period`, 25, currentY)
      currentY += 6
      pdf.text(`• Good cost management - continue monitoring`, 25, currentY)
    } else {
      pdf.text(`• Costs are relatively stable compared to previous period`, 25, currentY)
    }
    currentY += 6

    if (budgetUtilization !== undefined && budgetUtilization > 90) {
      pdf.text(`• Budget utilization is at ${budgetUtilization.toFixed(0)}% - immediate attention needed`, 25, currentY)
    }
  }
}

/**
 * Create Intelligent Insights page (with optional AI analysis)
 */
async function createInsightsPage(
  pdf: any,
  config: DataExportConfig,
  hooks: PDFGeneratorHooks
): Promise<void> {
  const pageWidth = pdf.internal.pageSize.width
  let currentY = 30

  // Page Title
  pdf.setFontSize(22)
  pdf.setTextColor('#1e40af')
  pdf.setFont(undefined, 'bold')
  pdf.text('Intelligent Insights', 20, currentY)
  currentY += 15

  // Extract data for analysis
  const summarySheet = config.sheets.find(s => s.type === 'summary' || s.name.toLowerCase().includes('summary'))
  const servicesSheet = config.sheets.find(s => s.name.toLowerCase().includes('service') || s.name.toLowerCase().includes('breakdown'))
  const historicalSheet = config.sheets.find(s => s.name.toLowerCase().includes('historical'))

  // Try to get AI analysis first if enabled
  let aiAnalysis: string | null = null
  const includeAI = config.options?.includeAI !== false // Default to true

  if (includeAI && hooks.getAIAnalysis && summarySheet && servicesSheet) {
    try {
      aiAnalysis = await hooks.getAIAnalysis(summarySheet, servicesSheet, config)
    } catch (error) {
      console.error('AI analysis failed, falling back to rule-based insights:', error)
    }
  }

  // If AI analysis is available, use it
  if (aiAnalysis) {
    pdf.setFontSize(12)
    pdf.setTextColor('#000000')
    pdf.setFont(undefined, 'normal')

    // Add AI attribution badge
    pdf.setFillColor(243, 244, 246)
    pdf.rect(20, currentY, 80, 8, 'F')
    pdf.setFontSize(9)
    pdf.setTextColor('#6b7280')
    pdf.text('AI-Powered Analysis (Claude)', 23, currentY + 5)
    currentY += 13

    // Render AI analysis
    pdf.setFontSize(10)
    pdf.setTextColor('#000000')
    const aiLines = pdf.splitTextToSize(aiAnalysis, pageWidth - 40)
    aiLines.forEach((line: string) => {
      if (currentY > pdf.internal.pageSize.height - 40) {
        pdf.addPage()
        currentY = 30
      }
      pdf.text(line, 20, currentY)
      currentY += 5
    })

    currentY += 10
    return // Skip rule-based insights if AI succeeded
  }

  // Fall back to rule-based insights
  let insights: Array<{
    category: 'optimization' | 'warning' | 'info' | 'success'
    title: string
    description: string
  }> = []

  // Analyze Summary Data
  if (summarySheet && Array.isArray(summarySheet.data) && summarySheet.data.length > 0) {
    const data = summarySheet.data[0]
    let totalCost = data.totalCost || data.cost || data.current || 0
    let previousCost = data.previousCost || data.previous
    let changePercent = data.changePercent || data.change
    let budgetUtilization = data.budgetUtilization || data.utilization

    // If summary has multiple rows, calculate total
    if (summarySheet.data.length > 1) {
      totalCost = summarySheet.data.reduce((sum: number, row: any) =>
        sum + (row.cost || row.totalCost || 0), 0
      )

      if (summarySheet.data[0]?.ytdTotal !== undefined) {
        previousCost = summarySheet.data.reduce((sum: number, row: any) =>
          sum + (row.ytdTotal || 0), 0
        )
      }
    }

    // Cost Increase Analysis
    if (changePercent !== undefined && changePercent > 20) {
      insights.push({
        category: 'warning',
        title: 'Significant Cost Increase Detected',
        description: `Costs have increased by ${changePercent.toFixed(1)}% from the previous period. Review top services for unexpected growth in usage or new resources that may need optimization.`
      })
    } else if (changePercent !== undefined && changePercent < -15) {
      insights.push({
        category: 'success',
        title: 'Successful Cost Reduction',
        description: `Costs have decreased by ${Math.abs(changePercent).toFixed(1)}% from the previous period. Continue monitoring to ensure service performance remains stable.`
      })
    }

    // Budget Analysis
    if (budgetUtilization !== undefined) {
      if (budgetUtilization > 100) {
        insights.push({
          category: 'warning',
          title: 'Budget Exceeded',
          description: `Current spending is at ${budgetUtilization.toFixed(0)}% of budget. Immediate cost control measures recommended. Review largest cost drivers and identify quick wins for reduction.`
        })
      } else if (budgetUtilization > 90) {
        insights.push({
          category: 'warning',
          title: 'Approaching Budget Limit',
          description: `Budget utilization is at ${budgetUtilization.toFixed(0)}%. Implement spending alerts and review planned resource deployments to avoid overruns.`
        })
      } else if (budgetUtilization < 70) {
        insights.push({
          category: 'info',
          title: 'Under Budget Performance',
          description: `Currently at ${budgetUtilization.toFixed(0)}% of budget. Consider allocating remaining budget to planned initiatives or optimization projects.`
        })
      }
    }

    // Cost Magnitude Analysis
    if (totalCost > 1000000) {
      insights.push({
        category: 'optimization',
        title: 'High Volume Spending Opportunity',
        description: `With monthly costs exceeding $1M, small percentage optimizations can yield significant savings. Consider Reserved Instances, Savings Plans, and architectural reviews.`
      })
    }
  }

  // Analyze Service Breakdown
  if (servicesSheet && Array.isArray(servicesSheet.data) && servicesSheet.data.length > 0) {
    const services = servicesSheet.data.slice(0, 10)
    const totalCost = services.reduce((sum, s) => sum + (s.cost || s.amount || s.Cost || 0), 0)

    // Top service concentration
    const topServiceCost = services[0]?.cost || services[0]?.amount || services[0]?.Cost || 0
    const concentration = totalCost > 0 ? (topServiceCost / totalCost) * 100 : 0

    if (concentration > 50) {
      const serviceName = services[0]?.serviceName || services[0]?.service || services[0]?.name || services[0]?.Service || 'Unknown'
      insights.push({
        category: 'info',
        title: 'High Service Concentration',
        description: `${serviceName} represents ${concentration.toFixed(0)}% of total costs. Ensure this service is optimized with appropriate instance types, storage classes, and usage patterns.`
      })
    }

    // Identify common optimization opportunities by service
    services.forEach((service: any) => {
      const serviceName = String(service.serviceName || service.service || service.name || service.Service || '').toLowerCase()
      const cost = service.cost || service.amount || service.Cost || 0

      if (serviceName.includes('ec2') && cost > 10000) {
        insights.push({
          category: 'optimization',
          title: 'EC2 Optimization Opportunity',
          description: `Significant EC2 spending detected. Review instance utilization, consider Reserved Instances or Savings Plans, and evaluate spot instances for non-critical workloads.`
        })
      }

      if (serviceName.includes('rds') && cost > 5000) {
        insights.push({
          category: 'optimization',
          title: 'Database Cost Review',
          description: `Review RDS instance sizing, enable storage auto-scaling, and consider Aurora for better price-performance. Implement automated start/stop for non-production databases.`
        })
      }

      if (serviceName.includes('s3') && cost > 3000) {
        insights.push({
          category: 'optimization',
          title: 'Storage Lifecycle Optimization',
          description: `Implement S3 lifecycle policies to transition infrequently accessed data to cheaper storage classes. Enable intelligent tiering and clean up incomplete multipart uploads.`
        })
      }

      if (serviceName.includes('lambda') && cost > 2000) {
        insights.push({
          category: 'optimization',
          title: 'Lambda Efficiency Review',
          description: `Review Lambda function memory allocation and execution time. Over-provisioned memory or inefficient code can significantly increase costs at scale.`
        })
      }
    })
  }

  // Limit to top 6 insights
  insights = insights.slice(0, 6)

  // Draw insights
  if (insights.length > 0) {
    insights.forEach((insight, index) => {
      // Check if we need a new page
      if (currentY > pdf.internal.pageSize.height - 60) {
        pdf.addPage()
        currentY = 30
      }

      // Category icon/indicator
      const categoryColors = {
        optimization: { fill: [59, 130, 246], text: '#3b82f6', label: 'Optimization' },
        warning: { fill: [234, 179, 8], text: '#eab308', label: 'Warning' },
        info: { fill: [100, 116, 139], text: '#64748b', label: 'Info' },
        success: { fill: [34, 197, 94], text: '#22c55e', label: 'Success' }
      }

      const category = categoryColors[insight.category]

      // Draw indicator circle
      pdf.setFillColor(...category.fill)
      pdf.circle(23, currentY, 2.5, 'F')

      // Draw title
      pdf.setFontSize(12)
      pdf.setTextColor(category.text)
      pdf.setFont(undefined, 'bold')
      pdf.text(insight.title, 30, currentY + 1)
      currentY += 6

      // Draw description
      pdf.setFontSize(10)
      pdf.setTextColor('#000000')
      pdf.setFont(undefined, 'normal')
      const descLines = pdf.splitTextToSize(insight.description, pageWidth - 50)
      descLines.forEach((line: string) => {
        if (currentY > pdf.internal.pageSize.height - 40) {
          pdf.addPage()
          currentY = 30
        }
        pdf.text(line, 30, currentY)
        currentY += 5
      })

      currentY += 8 // Space between insights
    })
  } else {
    // No insights available
    pdf.setFontSize(11)
    pdf.setTextColor('#64748b')
    pdf.setFont(undefined, 'italic')
    pdf.text('No specific insights available for this report period.', 20, currentY)
    currentY += 8
    pdf.text('Continue monitoring costs and review trends regularly.', 20, currentY)
  }

  // Add general recommendations section
  currentY += 10
  if (currentY > pdf.internal.pageSize.height - 80) {
    pdf.addPage()
    currentY = 30
  }

  pdf.setFontSize(14)
  pdf.setTextColor('#1e40af')
  pdf.setFont(undefined, 'bold')
  pdf.text('General Recommendations', 20, currentY)
  currentY += 10

  const generalRecs = [
    'Implement automated cost alerting at 50%, 80%, and 100% of budget',
    'Tag all resources with cost center, environment, and owner for better tracking',
    'Review and rightsize underutilized resources monthly',
    'Enable AWS Cost Anomaly Detection for real-time monitoring',
    'Conduct quarterly architectural reviews for optimization opportunities'
  ]

  pdf.setFontSize(10)
  pdf.setTextColor('#000000')
  pdf.setFont(undefined, 'normal')

  generalRecs.forEach((rec, index) => {
    if (currentY > pdf.internal.pageSize.height - 30) {
      pdf.addPage()
      currentY = 30
    }
    pdf.text(`${index + 1}. ${rec}`, 25, currentY)
    currentY += 6
  })
}

/**
 * Create terms and definitions page (at end of report)
 */
function createTermsPage(pdf: any, config: DataExportConfig): void {
  const pageWidth = pdf.internal.pageSize.width
  const margins = { left: 20, right: 20 }
  let currentY = 30

  // Page title
  pdf.setFontSize(18)
  pdf.setTextColor('#1e40af')
  pdf.setFont(undefined, 'bold')
  pdf.text('Glossary of Terms', margins.left, currentY)
  currentY += 15

  pdf.setFontSize(10)
  pdf.setTextColor('#000000')

  // Get unique terms (by footnote number)
  const uniqueTerms = TERM_DEFINITIONS.filter((term, index, self) =>
    index === self.findIndex(t => t.footnote === term.footnote)
  )

  uniqueTerms.forEach((item) => {
    // Check if we need a new page
    if (currentY > pdf.internal.pageSize.height - 50) {
      pdf.addPage()
      currentY = 30
    }

    // Term with footnote number (bold)
    pdf.setFont(undefined, 'bold')
    pdf.text(`${item.footnote} ${item.fullTerm}`, margins.left, currentY)
    currentY += 6

    // Definition (normal, wrapped)
    pdf.setFont(undefined, 'normal')
    const defLines = pdf.splitTextToSize(
      item.definition,
      pageWidth - margins.left - margins.right - 5
    )
    defLines.forEach((line: string) => {
      if (currentY > pdf.internal.pageSize.height - 40) {
        pdf.addPage()
        currentY = 30
      }
      pdf.text(line, margins.left + 5, currentY)
      currentY += 5
    })

    currentY += 8 // Space between terms
  })

  // Data source note at bottom
  currentY += 10
  if (currentY > pdf.internal.pageSize.height - 60) {
    pdf.addPage()
    currentY = 30
  }

  pdf.setFontSize(9)
  pdf.setTextColor('#64748b')
  pdf.setFont(undefined, 'italic')
  const noteLines = pdf.splitTextToSize(
    'Data Source: All cost and forecast data in this report is sourced directly from AWS Cost Explorer API. ' +
    'Forecasts are generated by AWS using their proprietary machine learning algorithms, which analyze historical ' +
    'spending patterns across your organization. Budget data is sourced from your organization\'s AWS Budgets configuration.',
    pageWidth - margins.left - margins.right
  )
  noteLines.forEach((line: string) => {
    pdf.text(line, margins.left, currentY)
    currentY += 5
  })
}

/**
 * Create table of contents page
 */
function createTableOfContents(pdf: any, config: DataExportConfig): void {
  if (!config.options?.pdf?.includeToc || config.sheets.length <= 1) {
    return
  }

  const pageWidth = pdf.internal.pageSize.width
  const margins = { left: 20, right: 20 }
  let currentY = 30

  // Page title
  pdf.setFontSize(18)
  pdf.setTextColor('#1e40af')
  pdf.setFont(undefined, 'bold')
  pdf.text('Table of Contents', margins.left, currentY)
  currentY += 15

  pdf.setFontSize(11)
  pdf.setTextColor('#000000')

  config.sheets.forEach((sheet, index) => {
    // Check if we need a new page
    if (currentY > pdf.internal.pageSize.height - 40) {
      pdf.addPage()
      currentY = 30
    }

    // Section number and name
    pdf.setFont(undefined, 'bold')
    pdf.text(`${index + 1}.`, margins.left, currentY)
    pdf.text(sheet.name, margins.left + 10, currentY)
    currentY += 6

    // Description if available
    if (sheet.description) {
      pdf.setFont(undefined, 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor('#64748b')
      const descLines = pdf.splitTextToSize(
        sheet.description,
        pageWidth - margins.left - margins.right - 10
      )
      descLines.forEach((line: string) => {
        pdf.text(line, margins.left + 10, currentY)
        currentY += 5
      })
      pdf.setFontSize(11)
      pdf.setTextColor('#000000')
    }

    currentY += 5 // Space between sections
  })

  // Add Glossary to TOC
  currentY += 5
  if (currentY > pdf.internal.pageSize.height - 40) {
    pdf.addPage()
    currentY = 30
  }
  pdf.setFont(undefined, 'bold')
  pdf.text(`${config.sheets.length + 1}.`, margins.left, currentY)
  pdf.text('Glossary of Terms', margins.left + 10, currentY)
  currentY += 6
  pdf.setFont(undefined, 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor('#64748b')
  pdf.text('Definitions of key terms used throughout this report', margins.left + 10, currentY)
}

/**
 * Convert sheet to PDF data items
 */
function sheetToPDFItems(
  sheet: SheetConfig,
  config: DataExportConfig
): Array<{
  data: any
  type: 'data' | 'text'
  title?: string
  pageBreak?: boolean
}> {
  const items: Array<{
    data: any
    type: 'data' | 'text'
    title?: string
    pageBreak?: boolean
  }> = []

  // Add sheet title with footnote markers
  items.push({
    data: '',
    type: 'text',
    title: addFootnoteMarkers(sheet.name),
    pageBreak: true
  })

  // Add description with footnote markers
  if (sheet.description) {
    items.push({
      data: addFootnoteMarkers(sheet.description),
      type: 'text'
    })
  }

  // Handle different sheet types
  switch (sheet.type) {
    case 'table': {
      const { headers, rows } = normalizeSheetData(sheet.data, sheet.columns)

      // Format cell values based on column config
      const formattedRows = rows.map(row =>
        row.map((cell, index) => {
          const column = sheet.columns?.[index]
          return formatCellValue(cell, column, sheet.formatting)
        })
      )

      items.push({
        data: { headers, rows: formattedRows },
        type: 'data'
      })
      break
    }

    case 'summary':
    case 'key-value': {
      // Convert to key-value table format
      const { headers, rows } = normalizeSheetData(sheet.data, sheet.columns)
      items.push({
        data: { headers, rows },
        type: 'data'
      })
      break
    }

    case 'chart-data': {
      // For chart data, show as table
      const { headers, rows } = normalizeSheetData(sheet.data, sheet.columns)
      items.push({
        data: { headers, rows },
        type: 'data'
      })
      break
    }

    case 'raw-json': {
      // Show JSON in a readable format
      items.push({
        data: JSON.stringify(sheet.data, null, 2),
        type: 'text'
      })
      break
    }

    default: {
      // Default: try to normalize and show as table
      const { headers, rows } = normalizeSheetData(sheet.data, sheet.columns)
      items.push({
        data: { headers, rows },
        type: 'data'
      })
    }
  }

  return items
}

/**
 * Main PDF generation function
 * Uses dependency injection for environment-specific features
 */
export async function createPDF(
  config: DataExportConfig,
  hooks: PDFGeneratorHooks = {}
): Promise<ExportResult> {
  try {
    console.log('[PDF Generator] Using SHARED pdf-generator.ts', {
      hasAIHook: !!hooks.getAIAnalysis,
      canRenderHTML: hooks.canRenderHTML,
      title: config.title
    })
    const pdfOptions = config.options?.pdf || {}

    // Create jsPDF instance
    const pdf = new jsPDF({
      orientation: pdfOptions.orientation || 'portrait',
      format: pdfOptions.pageSize || 'a4',
      compress: true
    })

    // Set PDF metadata
    pdf.setProperties({
      title: config.title || 'GHOST Cost Report',
      subject: config.subtitle || '',
      author: 'GHOST Cost Dashboard',
      keywords: 'AWS, Cost Report, GHOST, Analytics',
      creator: 'GHOST Cost Dashboard'
    })

    // Page 1: Professional Title Page
    createTitlePage(pdf, config)

    // Page 2: Executive Summary (if summary data available)
    const hasSummaryData = config.sheets.some(s =>
      s.type === 'summary' || s.name.toLowerCase().includes('summary')
    )
    if (hasSummaryData) {
      pdf.addPage()
      createExecutiveSummary(pdf, config)
    }

    // Page 3: Intelligent Insights (with optional AI analysis)
    pdf.addPage()
    await createInsightsPage(pdf, config, hooks)

    // Page 4+: Table of Contents (if enabled and multiple sheets)
    if (config.options?.pdf?.includeToc && config.sheets.length > 1) {
      pdf.addPage()
      createTableOfContents(pdf, config)
    }

    // Content Pages: Add all sheets
    let currentY = 20
    let isFirstSheet = true

    for (const sheet of config.sheets) {
      const sheetItems = sheetToPDFItems(sheet, config)

      for (const item of sheetItems) {
        // Add page break if needed (always break for first sheet after TOC, or if explicitly requested)
        if (item.pageBreak && (isFirstSheet || currentY > 20)) {
          pdf.addPage()
          currentY = 20
          isFirstSheet = false
        }

        // Add section title
        if (item.title) {
          pdf.setFontSize(14)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(30, 64, 175)
          pdf.text(item.title, 20, currentY)
          currentY += 10
        }

        // Add section content
        if (item.type === 'data' && item.data) {
          // @ts-ignore - jspdf-autotable types
          autoTable(pdf, {
            head: [item.data.headers],
            body: item.data.rows,
            startY: currentY,
            theme: 'striped',
            styles: {
              fontSize: 7,        // Even smaller font to fit more columns
              cellPadding: 1.5,   // Tighter padding
              overflow: 'linebreak',
              cellWidth: 'auto',
              halign: 'left',
              minCellWidth: 10    // Minimum width to prevent too-narrow columns
            },
            headStyles: {
              fillColor: [30, 64, 175],
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 8,        // Smaller header font
              cellPadding: 2,
              halign: 'left'
            },
            margin: { left: 10, right: 10 },  // Tight margins for maximum width
            tableWidth: 'auto'  // Auto-calculate to fit within page
          })
          // @ts-ignore
          currentY = (pdf as any).lastAutoTable.finalY + 10
        } else if (item.type === 'text' && item.data) {
          pdf.setFontSize(10)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(0, 0, 0)
          const lines = pdf.splitTextToSize(item.data, pdf.internal.pageSize.width - 40)
          pdf.text(lines, 20, currentY)
          currentY += lines.length * 6 + 10
        }

        // Check if we need a new page
        if (currentY > pdf.internal.pageSize.height - 40) {
          pdf.addPage()
          currentY = 20
        }
      }
    }

    // Final Page: Glossary of Terms
    pdf.addPage()
    createTermsPage(pdf, config)

    // Generate the PDF as ArrayBuffer then convert to Blob
    const pdfArrayBuffer = pdf.output('arraybuffer')
    const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })

    const filename = generateFilename(
      config.options?.filename || config.title,
      'pdf'
    )

    return {
      success: true,
      format: 'pdf',
      filename,
      blob
    }

  } catch (error) {
    console.error('PDF export failed:', error)
    return {
      success: false,
      format: 'pdf',
      filename: '',
      error: error instanceof Error ? error.message : 'Unknown error during PDF export'
    }
  }
}
