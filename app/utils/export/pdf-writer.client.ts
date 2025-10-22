/**
 * Client-Side PDF Export Adapter
 * Uses the shared PDF generator with client-specific features
 */

import type { DataExportConfig, ExportResult } from '~/shared/types/export'
import { createPDF, type PDFGeneratorHooks } from '#shared/utils/pdf-generator'

/**
 * Generate AI-powered cost analysis (client-side)
 * Calls the /api/ai/chat endpoint
 */
async function generateAICostAnalysis(
  summarySheet: any,
  servicesSheet: any,
  config: DataExportConfig
): Promise<string | null> {
  try {
    // Extract key data points - calculate totals if needed
    const summaryData = summarySheet.data?.[0] || {}
    let totalCost = summaryData.totalCost || summaryData.cost || summaryData.current || 0
    let previousCost = summaryData.previousCost || summaryData.previous
    let changePercent = summaryData.changePercent || summaryData.change
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

    // Call AI API with system-level instruction to avoid preambles
    const response = await $fetch<{responseBody: string, references: any[]}>('/api/ai/chat', {
      method: 'POST',
      body: {
        userInput: `COST OVERVIEW:
- Total Spend: $${totalCost.toLocaleString()}${changePercent !== undefined ? ` (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}% vs previous period)` : ''}
${totalBudget ? `- Total Budget: $${totalBudget.toLocaleString()}` : ''}
${budgetUtilization !== undefined ? `- Budget Utilization: ${budgetUtilization.toFixed(1)}%` : ''}
${previousCost !== undefined ? `- Previous Period: $${previousCost.toLocaleString()}` : ''}

TOP 15 ACCOUNTS:
${topAccounts.map((a: any, i: number) =>
  `${i + 1}. ${a.name}: $${a.cost.toLocaleString()}${a.budget ? ` (Budget: $${a.budget.toLocaleString()}, ${a.utilization?.toFixed(0)}% utilized)` : ''}`
).join('\n')}

TOP AWS SERVICES:
${topServices.map((s: any, i: number) => `${i + 1}. ${s.name}: $${s.cost.toLocaleString()}`).join('\n')}

Write 3-4 concise paragraphs (~200 words) covering:

1. Overall Cost Health: Assess the spending trends and budget performance
2. Key Patterns & Highlights: Identify notable spending patterns, top accounts, and services driving costs
3. Notable Items: Highlight accounts or services that warrant attention (over/under budget, unusual patterns)

IMPORTANT: Focus on analysis and observations, not recommendations. Write direct analysis without preambles or meta-commentary. Never use phrases like "Based on the provided data". Be specific with numbers and patterns.`
      }
    })

    if (response?.responseBody) {
      return response.responseBody.trim()
    }

    return null
  } catch (error) {
    console.error('AI cost analysis error:', error)
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
    console.error('Cannot download PDF:', result.error)
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
