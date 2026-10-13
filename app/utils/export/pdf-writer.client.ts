/**
 * Client-Side PDF Export Adapter
 * Uses the shared PDF generator with client-specific features
 */

import type { DataExportConfig, ExportResult } from '#shared/types/export'
import { createPDF, type PDFGeneratorHooks } from '#shared/utils/pdf-generator'

const logger = createLogger('PdfWriter')

/**
 * Generate AI-powered cost analysis (client-side)
 * Calls the /api/ai/insights endpoint
 */
async function generateAICostAnalysis(
  summarySheet: any,
  servicesSheet: any,
  _config: DataExportConfig
): Promise<string | null> {
  try {
    // Extract key data points - calculate totals if needed
    const summaryData = summarySheet.data?.[0] || {}
    let totalCost = summaryData.totalCost || summaryData.cost || summaryData.current || 0
    let previousCost = summaryData.previousCost || summaryData.previous
    const changePercent = summaryData.changePercent || summaryData.change
    let budgetUtilization = summaryData.budgetUtilization || summaryData.utilization
    let totalBudget: number | undefined

    // If summary has multiple rows (accounts), calculate totals
    if (summarySheet.data && summarySheet.data.length > 1) {
      totalCost = summarySheet.data.reduce((sum: number, row: any) =>
        sum + (row.cost || row.totalCost || 0), 0
      )

      if (summarySheet.data[0]?.ytdTotal !== undefined) {
        previousCost = summarySheet.data.reduce((sum: number, row: any) =>
          sum + (row.ytdTotal || 0), 0
        )
      }

      // Calculate budget totals
      if (summarySheet.data[0]?.budget !== undefined) {
        totalBudget = summarySheet.data.reduce((sum: number, row: any) =>
          sum + (row.budget || 0), 0
        )
        if (totalBudget > 0) {
          budgetUtilization = (totalCost / totalBudget) * 100
        }
      }
    }

    // Get top 15 accounts with detailed info
    const topAccounts = (summarySheet.data?.slice(0, 15) || []).map((acc: any) => ({
      name: acc.accountName || acc.name || acc.accountId,
      cost: acc.cost || acc.totalCost || 0,
      budget: acc.budget,
      utilization: acc.budgetUtilization
    }))

    // Get top 10 services
    const topServices = servicesSheet.data?.slice(0, 10).map((s: any) => ({
      name: s.serviceName || s.service || s.name || s.Service || 'Unknown',
      cost: s.cost || s.amount || s.Cost || 0
    })) || []

    const response = await $fetch<{ success: boolean; data?: { insight: string } }>('/api/ai/insights', {
      method: 'POST',
      body: {
        type: 'cost-report-analysis',
        context: { totalCost, previousCost, changePercent, totalBudget, budgetUtilization, topAccounts, topServices }
      }
    })

    if (response.success && response.data?.insight) {
      return response.data.insight.trim()
    }

    return null
  } catch (error) {
    logger.error('AI cost analysis error:', error)
    return null
  }
}

/**
 * Client-specific hooks for PDF generation
 */
const clientHooks: PDFGeneratorHooks = {
  getAIAnalysis: generateAICostAnalysis,
  canRenderHTML: true
}

/**
 * Export data as PDF (Client version)
 */
export async function exportToPDF(
  config: DataExportConfig
): Promise<ExportResult> {
  return createPDF(config, clientHooks)
}

/**
 * Download PDF file
 */
export function downloadPDF(result: ExportResult): void {
  if (!result.success || !result.blob) {
    logger.error('Cannot download PDF:', result.error)
    return
  }

  const url = URL.createObjectURL(result.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = result.filename
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Clean up the URL object after download
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
