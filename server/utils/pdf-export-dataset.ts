/**
 * Dataset Report PDF Export
 * Generates PDF reports for AWS datasets with AI-powered insights
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { getBedrockRuntimeClient } from '../lib/aws-client-factory'
import { logger } from './logger'
import type { DatasetReportData, DatasetReportConfig } from '#shared/types/dataset-reports'

/**
 * Analyze dataset report using AI (AWS Bedrock - Claude)
 */
export async function analyzeDatasetReport(
  reportData: DatasetReportData,
  config: DatasetReportConfig
): Promise<{
  executiveSummary: string
  keyFindings: string[]
  recommendations?: string[]
}> {
  try {
    logger.info('[Dataset AI] Starting AI analysis')

    // Build analysis prompt
    const prompt = buildAnalysisPrompt(reportData)

    // Call Bedrock (Claude)
    // Default to govcloud environment (can be overridden by env var if needed)
    const environment = (process.env.AWS_BEDROCK_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
    const bedrockClient = await getBedrockRuntimeClient(environment, 'us-east-1')

    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7
    }

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    })

    logger.debug('[Dataset AI] Invoking Bedrock model')
    const response = await bedrockClient.send(command)

    const responseBody = JSON.parse(new TextDecoder().decode(response.body))
    const analysisText = responseBody.content[0].text

    logger.info('[Dataset AI] AI analysis completed successfully')

    // Parse the structured response
    return parseAIResponse(analysisText)

  } catch (error: any) {
    logger.error('[Dataset AI] AI analysis failed:', error)
    throw new Error(`AI analysis failed: ${error.message}`)
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

  // Build HTML content for PDF
  const html = buildDatasetReportHTML(reportData, config)

  // Convert HTML to PDF using shared PDF generator
  // For now, return a simple placeholder buffer
  // TODO: Integrate with actual PDF generation library (puppeteer/pdfkit)

  logger.warn('[Dataset PDF] PDF generation not yet fully implemented, returning HTML as buffer')
  return Buffer.from(html, 'utf-8')
}

/**
 * Build HTML for dataset report
 */
function buildDatasetReportHTML(
  reportData: DatasetReportData,
  config: DatasetReportConfig
): string {
  const sections: string[] = []

  sections.push('<!DOCTYPE html>')
  sections.push('<html>')
  sections.push('<head>')
  sections.push('<meta charset="UTF-8">')
  sections.push('<title>AWS Dataset Report</title>')
  sections.push('<style>')
  sections.push(`
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #232F3E; border-bottom: 3px solid #FF9900; padding-bottom: 10px; }
    h2 { color: #232F3E; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
    h3 { color: #555; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 12px; }
    th { background-color: #232F3E; color: white; padding: 10px; text-align: left; }
    td { border: 1px solid #ddd; padding: 8px; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .summary-box { background-color: #f0f8ff; border-left: 4px solid #0073bb; padding: 15px; margin: 20px 0; }
    .critical { color: #d13212; font-weight: bold; }
    .high { color: #ff9900; font-weight: bold; }
    .medium { color: #ffa500; }
    .low { color: #2ea043; }
    .metadata { color: #666; font-size: 12px; margin-bottom: 30px; }
    ul { line-height: 1.8; }
  `)
  sections.push('</style>')
  sections.push('</head>')
  sections.push('<body>')

  // Header
  sections.push('<h1>AWS Dataset Report</h1>')
  sections.push('<div class="metadata">')
  sections.push(`<p><strong>Generated:</strong> ${new Date(reportData.metadata.generatedAt).toLocaleString()}</p>`)
  sections.push(`<p><strong>Accounts:</strong> ${reportData.metadata.accounts.map(a => a.accountName).join(', ')}</p>`)
  if (reportData.metadata.timeRange) {
    sections.push(`<p><strong>Time Range:</strong> ${reportData.metadata.timeRange.startDate} to ${reportData.metadata.timeRange.endDate}</p>`)
  }
  sections.push('</div>')

  // AI Insights (if available)
  if (reportData.aiInsights) {
    sections.push('<h2>Executive Summary</h2>')
    sections.push('<div class="summary-box">')
    sections.push(`<p>${reportData.aiInsights.executiveSummary}</p>`)
    sections.push('</div>')

    if (reportData.aiInsights.keyFindings.length > 0) {
      sections.push('<h3>Key Findings</h3>')
      sections.push('<ul>')
      for (const finding of reportData.aiInsights.keyFindings) {
        sections.push(`<li>${finding}</li>`)
      }
      sections.push('</ul>')
    }

    if (reportData.aiInsights.recommendations && reportData.aiInsights.recommendations.length > 0) {
      sections.push('<h3>Recommendations</h3>')
      sections.push('<ul>')
      for (const rec of reportData.aiInsights.recommendations) {
        sections.push(`<li>${rec}</li>`)
      }
      sections.push('</ul>')
    }
  }

  // Config Resources
  if (reportData.config) {
    sections.push('<h2>AWS Config Resources</h2>')
    sections.push(`<p><strong>Total Resources:</strong> ${reportData.config.totalResources}</p>`)
    sections.push('<h3>Compliance Summary</h3>')
    sections.push('<ul>')
    sections.push(`<li>Compliant: ${reportData.config.complianceSummary.compliant}</li>`)
    sections.push(`<li class="critical">Non-Compliant: ${reportData.config.complianceSummary.nonCompliant}</li>`)
    sections.push(`<li>Not Applicable: ${reportData.config.complianceSummary.notApplicable}</li>`)
    sections.push(`<li>Insufficient Data: ${reportData.config.complianceSummary.insufficientData}</li>`)
    sections.push('</ul>')

    // Top 50 resources table
    if (reportData.config.records.length > 0) {
      sections.push('<h3>Resources (Top 50)</h3>')
      sections.push('<table>')
      sections.push('<tr><th>Account</th><th>Region</th><th>Type</th><th>Resource ID</th><th>Compliance</th></tr>')
      for (const record of reportData.config.records.slice(0, 50)) {
        sections.push('<tr>')
        sections.push(`<td>${record.accountName}</td>`)
        sections.push(`<td>${record.region}</td>`)
        sections.push(`<td>${record.resourceType}</td>`)
        sections.push(`<td>${record.resourceId}</td>`)
        sections.push(`<td>${record.complianceStatus || 'N/A'}</td>`)
        sections.push('</tr>')
      }
      sections.push('</table>')
    }
  }

  // Security Hub Findings
  if (reportData.securityHub) {
    sections.push('<h2>AWS Security Hub Findings</h2>')
    sections.push(`<p><strong>Total Findings:</strong> ${reportData.securityHub.totalFindings}</p>`)
    sections.push('<h3>Findings by Severity</h3>')
    sections.push('<ul>')
    sections.push(`<li class="critical">Critical: ${reportData.securityHub.findingsBySeverity.critical}</li>`)
    sections.push(`<li class="high">High: ${reportData.securityHub.findingsBySeverity.high}</li>`)
    sections.push(`<li class="medium">Medium: ${reportData.securityHub.findingsBySeverity.medium}</li>`)
    sections.push(`<li class="low">Low: ${reportData.securityHub.findingsBySeverity.low}</li>`)
    sections.push(`<li>Informational: ${reportData.securityHub.findingsBySeverity.informational}</li>`)
    sections.push('</ul>')

    // Top 50 findings table
    if (reportData.securityHub.records.length > 0) {
      sections.push('<h3>Top Findings (By Severity)</h3>')
      sections.push('<table>')
      sections.push('<tr><th>Severity</th><th>Title</th><th>Account</th><th>Product</th><th>Status</th></tr>')
      for (const record of reportData.securityHub.records.slice(0, 50)) {
        sections.push('<tr>')
        sections.push(`<td class="${record.severity.toLowerCase()}">${record.severity}</td>`)
        sections.push(`<td>${record.title}</td>`)
        sections.push(`<td>${record.accountName}</td>`)
        sections.push(`<td>${record.productName}</td>`)
        sections.push(`<td>${record.workflowStatus}</td>`)
        sections.push('</tr>')
      }
      sections.push('</table>')
    }
  }

  // CloudTrail Events
  if (reportData.cloudtrail) {
    sections.push('<h2>AWS CloudTrail Events</h2>')
    sections.push(`<p><strong>Total Events:</strong> ${reportData.cloudtrail.totalEvents}</p>`)
    sections.push('<ul>')
    sections.push(`<li>Write Events: ${reportData.cloudtrail.writeEvents}</li>`)
    sections.push(`<li>Read Events: ${reportData.cloudtrail.readEvents}</li>`)
    sections.push(`<li class="high">Error Events: ${reportData.cloudtrail.errorEvents}</li>`)
    sections.push('</ul>')

    // Top users
    if (reportData.cloudtrail.topUsers.length > 0) {
      sections.push('<h3>Top Users</h3>')
      sections.push('<table>')
      sections.push('<tr><th>User</th><th>Event Count</th></tr>')
      for (const user of reportData.cloudtrail.topUsers.slice(0, 10)) {
        sections.push('<tr>')
        sections.push(`<td>${user.userName}</td>`)
        sections.push(`<td>${user.eventCount}</td>`)
        sections.push('</tr>')
      }
      sections.push('</table>')
    }

    // Recent events (top 50)
    if (reportData.cloudtrail.records.length > 0) {
      sections.push('<h3>Recent Events (Top 50)</h3>')
      sections.push('<table>')
      sections.push('<tr><th>Time</th><th>Event</th><th>User</th><th>Service</th><th>Account</th></tr>')
      for (const record of reportData.cloudtrail.records.slice(0, 50)) {
        sections.push('<tr>')
        sections.push(`<td>${new Date(record.eventTime).toLocaleString()}</td>`)
        sections.push(`<td>${record.eventName}</td>`)
        sections.push(`<td>${record.userIdentityUserName || 'N/A'}</td>`)
        sections.push(`<td>${record.eventSource}</td>`)
        sections.push(`<td>${record.accountName}</td>`)
        sections.push('</tr>')
      }
      sections.push('</table>')
    }
  }

  sections.push('</body>')
  sections.push('</html>')

  return sections.join('\n')
}
