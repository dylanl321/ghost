/**
 * Dataset Report PDF Export
 * Generates PDF reports for AWS datasets with AI-powered insights
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { invokeBedrock } from './bedrock-client'
import { logger } from './logger'
import {
  CONFIG_COLUMNS,
  SECURITY_HUB_COLUMNS,
  CLOUDTRAIL_COLUMNS,
  ENTRA_USERS_COLUMNS,
  type DatasetColumnConfig,
  type DatasetReportData,
  type DatasetReportConfig
} from '../../shared/types/dataset-reports'

/**
 * Analyze dataset report using AI (AWS Bedrock - Claude)
 */
export async function analyzeDatasetReport(
  reportData: DatasetReportData,
  _config: DatasetReportConfig,
  signal?: AbortSignal
): Promise<{
  executiveSummary: string
  keyFindings: string[]
  recommendations?: string[]
}> {
  try {
    logger.info('[Dataset AI] Starting AI analysis')

    // Build analysis prompt
    const prompt = buildAnalysisPrompt(reportData)

    // Same Bedrock path as the other AI features (environment, region and
    // model fallbacks from configuration); this used to build its own client
    // with a GovCloud environment in a commercial region and a fixed model ID.
    if (signal?.aborted) throw signal.reason || new Error('Export canceled')
    const response = await invokeBedrock({ model: 'claude-sonnet', prompt, maxTokens: 2000, temperature: 0.7 })
    if (signal?.aborted) throw signal.reason || new Error('Export canceled')
    if (!response.success || !response.content) throw new Error(response.error?.message || 'No response from Bedrock')
    const analysisText = response.content

    logger.info('[Dataset AI] AI analysis completed successfully')

    // Parse the structured response
    return parseAIResponse(analysisText)

  } catch (error: any) {
    logger.error('[Dataset AI] AI analysis failed:', error)
    throw new Error(`AI analysis failed: ${error.message}`, { cause: error })
  }
}

/**
 * Build analysis prompt for AI
 */
function buildAnalysisPrompt(reportData: DatasetReportData): string {
  const sections: string[] = []

  sections.push('You are a cloud security and compliance analyst. Analyze the following AWS dataset report and provide insights.')
  sections.push('')
  sections.push('# Report Overview')
  sections.push(`- Accounts: ${reportData.metadata.accounts.length}`)
  sections.push(`- Generated: ${reportData.metadata.generatedAt}`)
  if (reportData.metadata.timeRange) {
    sections.push(`- Time Range: ${reportData.metadata.timeRange.startDate} to ${reportData.metadata.timeRange.endDate}`)
  }
  sections.push('')

  // AWS Config summary
  if (reportData.config) {
    sections.push('# AWS Config Resources')
    sections.push(`- Total Resources: ${reportData.config.totalResources}`)
    sections.push(`- Resource Types: ${Object.keys(reportData.config.resourcesByType).length}`)
    sections.push('')
    sections.push('Top Resource Types:')
    const topTypes = Object.entries(reportData.config.resourcesByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
    for (const [type, count] of topTypes) {
      sections.push(`  - ${type}: ${count}`)
    }
    sections.push('')
    sections.push('Compliance Summary:')
    sections.push(`  - Compliant: ${reportData.config.complianceSummary.compliant}`)
    sections.push(`  - Non-Compliant: ${reportData.config.complianceSummary.nonCompliant}`)
    sections.push(`  - Not Applicable: ${reportData.config.complianceSummary.notApplicable}`)
    sections.push(`  - Insufficient Data: ${reportData.config.complianceSummary.insufficientData}`)
    sections.push('')
  }

  // Security Hub summary
  if (reportData.securityHub) {
    sections.push('# AWS Security Hub Findings')
    sections.push(`- Total Findings: ${reportData.securityHub.totalFindings}`)
    sections.push('')
    sections.push('Findings by Severity:')
    sections.push(`  - Critical: ${reportData.securityHub.findingsBySeverity.critical}`)
    sections.push(`  - High: ${reportData.securityHub.findingsBySeverity.high}`)
    sections.push(`  - Medium: ${reportData.securityHub.findingsBySeverity.medium}`)
    sections.push(`  - Low: ${reportData.securityHub.findingsBySeverity.low}`)
    sections.push(`  - Informational: ${reportData.securityHub.findingsBySeverity.informational}`)
    sections.push('')
    sections.push('Findings by Status:')
    sections.push(`  - New: ${reportData.securityHub.findingsByStatus.new}`)
    sections.push(`  - Notified: ${reportData.securityHub.findingsByStatus.notified}`)
    sections.push(`  - Resolved: ${reportData.securityHub.findingsByStatus.resolved}`)
    sections.push(`  - Suppressed: ${reportData.securityHub.findingsByStatus.suppressed}`)
    sections.push('')
    sections.push('Top Products:')
    const topProducts = Object.entries(reportData.securityHub.findingsByProduct)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
    for (const [product, count] of topProducts) {
      sections.push(`  - ${product}: ${count}`)
    }
    sections.push('')

    // Include top critical/high findings
    const criticalFindings = reportData.securityHub.records
      .filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH')
      .slice(0, 5)
    if (criticalFindings.length > 0) {
      sections.push('Top Critical/High Findings:')
      for (const finding of criticalFindings) {
        sections.push(`  - [${finding.severity}] ${finding.title} (${finding.accountName})`)
      }
      sections.push('')
    }
  }

  // CloudTrail summary
  if (reportData.cloudtrail) {
    sections.push('# AWS CloudTrail Events')
    sections.push(`- Total Events: ${reportData.cloudtrail.totalEvents}`)
    sections.push(`- Write Events: ${reportData.cloudtrail.writeEvents}`)
    sections.push(`- Read Events: ${reportData.cloudtrail.readEvents}`)
    sections.push(`- Error Events: ${reportData.cloudtrail.errorEvents}`)
    sections.push('')
    sections.push('Top Users:')
    for (const user of reportData.cloudtrail.topUsers.slice(0, 5)) {
      sections.push(`  - ${user.userName}: ${user.eventCount} events`)
    }
    sections.push('')
    sections.push('Top Event Types:')
    const topEventTypes = Object.entries(reportData.cloudtrail.eventsByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
    for (const [type, count] of topEventTypes) {
      sections.push(`  - ${type}: ${count}`)
    }
    sections.push('')
  }

  sections.push('# Analysis Task')
  sections.push('Provide a structured analysis in the following format:')
  sections.push('')
  sections.push('## Executive Summary')
  sections.push('[3-4 paragraphs summarizing the overall security and compliance posture based on the data above]')
  sections.push('')
  sections.push('## Key Findings')
  sections.push('[Bullet list of 5-7 notable findings, patterns, or concerns]')
  sections.push('')
  sections.push('## Recommendations')
  sections.push('[Bullet list of 3-5 actionable recommendations based on the findings]')
  sections.push('')
  sections.push('Focus on:')
  sections.push('- Security posture and risk assessment')
  sections.push('- Compliance gaps and non-compliant resources')
  sections.push('- Unusual patterns or anomalies')
  sections.push('- Prioritized actions based on severity')
  sections.push('')
  sections.push('Keep the tone professional and concise.')

  return sections.join('\n')
}

/**
 * Parse AI response into structured format
 */
function parseAIResponse(analysisText: string): {
  executiveSummary: string
  keyFindings: string[]
  recommendations?: string[]
} {
  const result: {
    executiveSummary: string
    keyFindings: string[]
    recommendations?: string[]
  } = {
    executiveSummary: '',
    keyFindings: [],
    recommendations: []
  }

  // Split response into sections
  const lines = analysisText.split('\n')
  let currentSection: 'summary' | 'findings' | 'recommendations' | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect section headers
    if (trimmed.toLowerCase().includes('executive summary')) {
      currentSection = 'summary'
      continue
    } else if (trimmed.toLowerCase().includes('key findings')) {
      currentSection = 'findings'
      continue
    } else if (trimmed.toLowerCase().includes('recommendations')) {
      currentSection = 'recommendations'
      continue
    }

    // Skip empty lines and headers
    if (!trimmed || trimmed.startsWith('#')) continue

    // Add content to appropriate section
    if (currentSection === 'summary') {
      if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) {
        result.executiveSummary += (result.executiveSummary ? ' ' : '') + trimmed
      }
    } else if (currentSection === 'findings' && (trimmed.startsWith('-') || trimmed.startsWith('*'))) {
      const finding = trimmed.replace(/^[-*]\s*/, '')
      if (finding) result.keyFindings.push(finding)
    } else if (currentSection === 'recommendations' && (trimmed.startsWith('-') || trimmed.startsWith('*'))) {
      const recommendation = trimmed.replace(/^[-*]\s*/, '')
      if (recommendation) result.recommendations!.push(recommendation)
    }
  }

  // Fallback if parsing fails
  if (!result.executiveSummary) {
    result.executiveSummary = analysisText.substring(0, 500)
  }

  return result
}

/**
 * Export dataset report to PDF
 */
export async function exportDatasetToPDF(
  reportData: DatasetReportData,
  config: DatasetReportConfig
): Promise<Buffer> {
  logger.info('[Dataset PDF] Generating PDF report')

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  let cursorY = 44

  pdf.setProperties({
    title: 'AWS Dataset Report',
    subject: 'AWS resource, security, audit, and access datasets',
    author: 'GHOST AWS Dashboard',
    creator: 'GHOST AWS Dashboard'
  })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(22)
  pdf.text('AWS Dataset Report', 36, cursorY)
  cursorY += 24
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(`Generated: ${new Date(reportData.metadata.generatedAt).toLocaleString()}`, 36, cursorY)
  cursorY += 14
  pdf.text(`Accounts: ${reportData.metadata.accounts.length || 'All'}`, 36, cursorY)
  cursorY += 22

  if (config.enableAI && reportData.aiInsights) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text('Executive Summary', 36, cursorY)
    cursorY += 16
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    const summaryLines = pdf.splitTextToSize(cleanPdfText(reportData.aiInsights.executiveSummary), pageWidth - 72)
    pdf.text(summaryLines, 36, cursorY)
    cursorY += summaryLines.length * 11 + 14
  }

  const tables: Array<{
    title: string
    records: Record<string, unknown>[]
    columns: readonly DatasetColumnConfig[]
  }> = []

  if (reportData.config) {
    tables.push({ title: `AWS Config Resources (${reportData.config.totalResources})`, records: reportData.config.records as unknown as Record<string, unknown>[], columns: CONFIG_COLUMNS })
  }
  if (reportData.securityHub) {
    tables.push({ title: `Security Hub Findings (${reportData.securityHub.totalFindings})`, records: reportData.securityHub.records as unknown as Record<string, unknown>[], columns: SECURITY_HUB_COLUMNS })
  }
  if (reportData.cloudtrail) {
    tables.push({ title: `CloudTrail Events (${reportData.cloudtrail.totalEvents})`, records: reportData.cloudtrail.records as unknown as Record<string, unknown>[], columns: CLOUDTRAIL_COLUMNS })
  }
  if (reportData.entraUsers) {
    tables.push({ title: `Entra ID Access (${reportData.entraUsers.totalUsers})`, records: reportData.entraUsers.records as unknown as Record<string, unknown>[], columns: ENTRA_USERS_COLUMNS })
  }

  for (const [index, table] of tables.entries()) {
    if (index > 0 || cursorY > 130) {
      pdf.addPage()
      cursorY = 40
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text(table.title, 36, cursorY)
    cursorY += 10

    const columns = resolvePdfColumns(table.columns, table.records, config.columns)
    autoTable(pdf, {
      startY: cursorY,
      head: [columns.map(column => column.label)],
      body: table.records.map(record => columns.map(column => formatPdfValue(readPath(record, column.key)))),
      theme: 'striped',
      margin: { left: 24, right: 24 },
      styles: { font: 'helvetica', fontSize: 6, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold' }
    })

    cursorY = ((pdf as any).lastAutoTable?.finalY || cursorY) + 18
  }

  if (tables.length === 0) {
    pdf.setFontSize(11)
    pdf.text('No data matched the selected datasets and filters.', 36, cursorY)
  }

  return Buffer.from(pdf.output('arraybuffer'))
}

function resolvePdfColumns(
  defaults: readonly DatasetColumnConfig[],
  records: Record<string, unknown>[],
  selected?: string[]
): DatasetColumnConfig[] {
  if (!selected?.length) return [...defaults]
  const defaultsByKey = new Map(defaults.map(column => [column.key, column]))
  return selected
    .filter(key => records.some(record => readPath(record, key) !== undefined))
    .map(key => defaultsByKey.get(key) || {
      key,
      label: (key.split('.').pop() || key).replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase()).trim()
    })
}

function readPath(record: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[segment]
  }, record)
}

function formatPdfValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return cleanPdfText(value.join(', '))
  if (typeof value === 'object') return cleanPdfText(JSON.stringify(value))
  return cleanPdfText(String(value))
}

function cleanPdfText(value: string): string {
  return value.replace(/[^\x20-\x7E\n\r\t]/g, '')
}
