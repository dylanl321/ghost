/**
 * Dataset Report Generator
 * Generates AWS dataset reports (Config, Security Hub, CloudTrail) for scheduled delivery
 */

import type { DatasetReportConfig, DatasetReportData } from '#shared/types/dataset-reports'
import { getConfigResources, getConfigComplianceSummary, getConfigResourceTypeSummary } from './aws-config-data'
import { getSecurityHubFindings } from './security-hub-data'
import { getCloudTrailEvents } from './cloudtrail-data'
import { getAllAccountsUnified } from './accounts-consolidated'
import { exportDatasetToPDF } from './pdf-export-dataset'
import { logger } from './logger'

/**
 * Generate a dataset report based on configuration
 * Returns report as Buffer for email attachment
 */
export async function generateDatasetReport(
  config: DatasetReportConfig
): Promise<{
  success: boolean
  buffer?: Buffer
  filename?: string
  mimeType?: string
  error?: string
}> {
  try {
    logger.info('[Dataset Report] Generating with config:', {
      accounts: config.accounts?.length || 'all',
      datasets: Object.keys(config.datasets),
      format: config.format,
      enableAI: config.enableAI
    })

    // Step 1: Fetch all required dataset data
    const reportData = await buildDatasetReport(config)

    // Step 2: Generate AI insights if enabled
    if (config.enableAI) {
      reportData.aiInsights = await generateAIInsights(reportData, config)
    }

    // Step 3: Generate export in requested format
    if (config.format === 'pdf') {
      return await generatePDFDatasetReport(reportData, config)
    } else if (config.format === 'csv') {
      return await generateCSVDatasetReport(reportData, config)
    } else if (config.format === 'json') {
      return await generateJSONDatasetReport(reportData, config)
    } else if (config.format === 'xlsx') {
      return await generateXLSXDatasetReport(reportData, config)
    } else {
      throw new Error(`Unsupported format: ${config.format}`)
    }
  } catch (error: any) {
    logger.error('[Dataset Report] Generation error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error during report generation'
    }
  }
}

/**
 * Build complete dataset report data
 */
async function buildDatasetReport(config: DatasetReportConfig): Promise<DatasetReportData> {
  const startTime = Date.now()

  logger.info('[Dataset Report] Building dataset report')

  // Get account information
  const allAccounts = await getAllAccountsUnified()
  const accountMap = new Map(
    allAccounts.map(acc => [acc.accountId, acc.accountName || acc.accountId])
  )

  // Determine target accounts
  const targetAccountIds = config.accounts.length > 0
    ? config.accounts
    : allAccounts.map(acc => acc.accountId)

  const targetAccounts = targetAccountIds
    .filter(id => accountMap.has(id))
    .map(id => ({
      accountId: id,
      accountName: accountMap.get(id)!
    }))

  // Calculate time range if specified
  let timeRange: { startDate: string; endDate: string } | undefined
  if (config.timeRange) {
    if (config.timeRange.type === 'relative' && config.timeRange.relativeDays) {
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - config.timeRange.relativeDays)
      timeRange = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    } else if (config.timeRange.type === 'absolute') {
      timeRange = {
        startDate: config.timeRange.startDate!,
        endDate: config.timeRange.endDate!
      }
    }
  }

  // Initialize report data structure
  const reportData: DatasetReportData = {
    metadata: {
      reportId: '', // Will be set by caller
      reportName: '', // Will be set by caller
      generatedAt: new Date().toISOString(),
      accounts: targetAccounts,
      timeRange
    }
  }

  // Fetch each dataset in parallel
  const datasetPromises: Promise<void>[] = []

  // AWS Config
  if (config.datasets.config?.enabled) {
    datasetPromises.push(
      (async () => {
        logger.info('[Dataset Report] Fetching Config resources')
        const filters = config.datasets.config!.filters || {}

        const [records, complianceSummary, resourceTypeSummary] = await Promise.all([
          getConfigResources(targetAccountIds, filters),
          getConfigComplianceSummary(targetAccountIds, filters),
          getConfigResourceTypeSummary(targetAccountIds, filters)
        ])

        reportData.config = {
          enabled: true,
          totalResources: records.length,
          resourcesByType: resourceTypeSummary,
          complianceSummary,
          records
        }

        logger.info('[Dataset Report] Config data fetched', {
          totalResources: records.length,
          resourceTypes: Object.keys(resourceTypeSummary).length
        })
      })()
    )
  }

  // AWS Security Hub
  if (config.datasets.securityHub?.enabled) {
    datasetPromises.push(
      (async () => {
        logger.info('[Dataset Report] Fetching Security Hub findings')
        const filters = config.datasets.securityHub!.filters || {}

        // Fetch records (regions are determined inside the function now)
        const records = await getSecurityHubFindings(targetAccountIds, filters)

        // Build summary from records
        const findingsBySeverity = {
          CRITICAL: records.filter(f => f.severity === 'CRITICAL').length,
          HIGH: records.filter(f => f.severity === 'HIGH').length,
          MEDIUM: records.filter(f => f.severity === 'MEDIUM').length,
          LOW: records.filter(f => f.severity === 'LOW').length,
          INFORMATIONAL: records.filter(f => f.severity === 'INFORMATIONAL').length
        }

        const findingsByStatus = {
          NEW: records.filter(f => f.workflowStatus === 'NEW').length,
          NOTIFIED: records.filter(f => f.workflowStatus === 'NOTIFIED').length,
          RESOLVED: records.filter(f => f.workflowStatus === 'RESOLVED').length,
          SUPPRESSED: records.filter(f => f.workflowStatus === 'SUPPRESSED').length
        }

        const findingsByProduct: Record<string, number> = {}
        for (const record of records) {
          findingsByProduct[record.productName] = (findingsByProduct[record.productName] || 0) + 1
        }

        reportData.securityHub = {
          enabled: true,
          totalFindings: records.length,
          findingsBySeverity: {
            critical: findingsBySeverity.CRITICAL,
            high: findingsBySeverity.HIGH,
            medium: findingsBySeverity.MEDIUM,
            low: findingsBySeverity.LOW,
            informational: findingsBySeverity.INFORMATIONAL
          },
          findingsByStatus: {
            new: findingsByStatus.NEW,
            notified: findingsByStatus.NOTIFIED,
            resolved: findingsByStatus.RESOLVED,
            suppressed: findingsByStatus.SUPPRESSED
          },
          findingsByProduct,
          records
        }

        logger.info('[Dataset Report] Security Hub data fetched', {
          totalFindings: records.length,
          criticalFindings: findingsBySeverity.CRITICAL,
          highFindings: findingsBySeverity.HIGH
        })
      })()
    )
  }

  // AWS CloudTrail
  if (config.datasets.cloudtrail?.enabled) {
    datasetPromises.push(
      (async () => {
        logger.info('[Dataset Report] Fetching CloudTrail events')
        const filters = config.datasets.cloudtrail!.filters || {}

        const records = await getCloudTrailEvents(targetAccountIds, filters)

        // Build statistics from records
        const eventsByType: Record<string, number> = {}
        const eventsByService: Record<string, number> = {}
        const userCounts: Record<string, number> = {}
        let errorEvents = 0
        let writeEvents = 0
        let readEvents = 0

        for (const record of records) {
          // Count by event type
          eventsByType[record.eventType] = (eventsByType[record.eventType] || 0) + 1

          // Count by service
          eventsByService[record.eventSource] = (eventsByService[record.eventSource] || 0) + 1

          // Count by user
          if (record.userIdentityUserName) {
            userCounts[record.userIdentityUserName] = (userCounts[record.userIdentityUserName] || 0) + 1
          }

          // Count errors
          if (record.errorCode) {
            errorEvents++
          }

          // Count read vs write
          if (record.readOnly) {
            readEvents++
          } else {
            writeEvents++
          }
        }

        // Get top users
        const topUsers = Object.entries(userCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([userName, eventCount]) => ({ userName, eventCount }))

        reportData.cloudtrail = {
          enabled: true,
          totalEvents: records.length,
          eventsByType,
          eventsByService,
          topUsers,
          errorEvents,
          writeEvents,
          readEvents,
          records
        }

        logger.info('[Dataset Report] CloudTrail data fetched', {
          totalEvents: records.length,
          writeEvents,
          errorEvents
        })
      })()
    )
  }

  // Wait for all datasets to complete
  await Promise.all(datasetPromises)

  const duration = Date.now() - startTime
  logger.info('[Dataset Report] Dataset built successfully', {
    durationMs: duration,
    accountCount: targetAccounts.length,
    datasetsIncluded: Object.keys(reportData).filter(k => k !== 'metadata' && k !== 'aiInsights')
  })

  return reportData
}

/**
 * Generate AI insights for the dataset report
 */
async function generateAIInsights(
  reportData: DatasetReportData,
  config: DatasetReportConfig
): Promise<{
  executiveSummary: string
  keyFindings: string[]
  recommendations?: string[]
}> {
  logger.info('[Dataset Report] Generating AI insights')

  try {
    const { analyzeDatasetReport } = await import('./pdf-export-dataset')
    const insights = await analyzeDatasetReport(reportData, config)

    logger.info('[Dataset Report] AI insights generated successfully')
    return insights
  } catch (error: any) {
    logger.error('[Dataset Report] AI insights generation failed:', error)
    // Non-fatal - return empty insights
    return {
      executiveSummary: 'AI analysis unavailable',
      keyFindings: [],
      recommendations: []
    }
  }
}

/**
 * Generate PDF dataset report
 */
async function generatePDFDatasetReport(
  reportData: DatasetReportData,
  config: DatasetReportConfig
): Promise<{
  success: boolean
  buffer: Buffer
  filename: string
  mimeType: string
}> {
  logger.info('[Dataset Report] Generating PDF')

  const buffer = await exportDatasetToPDF(reportData, config)
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `dataset-report-${timestamp}.pdf`

  return {
    success: true,
    buffer,
    filename,
    mimeType: 'application/pdf'
  }
}

/**
 * Generate CSV dataset report
 */
async function generateCSVDatasetReport(
  reportData: DatasetReportData,
  config: DatasetReportConfig
): Promise<{
  success: boolean
  buffer: Buffer
  filename: string
  mimeType: string
}> {
  logger.info('[Dataset Report] Generating CSV')

  const csvRows: string[] = []

  // Config resources
  if (reportData.config) {
    csvRows.push('=== AWS Config Resources ===')
    csvRows.push('Account,Region,Resource Type,Resource ID,Resource Name,Compliance Status,Compliance Rule,Last Updated')

    for (const record of reportData.config.records) {
      csvRows.push([
        record.accountName,
        record.region,
        record.resourceType,
        record.resourceId,
        record.resourceName || '',
        record.complianceStatus || '',
        record.complianceType || '',
        record.configurationItemCaptureTime
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    csvRows.push('')
  }

  // Security Hub findings
  if (reportData.securityHub) {
    csvRows.push('=== AWS Security Hub Findings ===')
    csvRows.push('Account,Severity,Title,Product,Status,Resource Type,Resource ID,Compliance Standard,Control ID,First Observed,Last Updated')

    for (const record of reportData.securityHub.records) {
      csvRows.push([
        record.accountName,
        record.severity,
        record.title,
        record.productName,
        record.workflowStatus,
        record.resourceType,
        record.resourceId,
        record.complianceStandard || '',
        record.controlId || '',
        record.firstObservedAt,
        record.updatedAt
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    csvRows.push('')
  }

  // CloudTrail events
  if (reportData.cloudtrail) {
    csvRows.push('=== AWS CloudTrail Events ===')
    csvRows.push('Account,Event Time,Event Name,Event Type,Service,User/Role,Identity Type,Source IP,Read Only,Error Code,Region')

    for (const record of reportData.cloudtrail.records) {
      csvRows.push([
        record.accountName,
        record.eventTime,
        record.eventName,
        record.eventType,
        record.eventSource,
        record.userIdentityUserName || '',
        record.userIdentityType,
        record.sourceIPAddress || '',
        record.readOnly ? 'Yes' : 'No',
        record.errorCode || '',
        record.region
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    csvRows.push('')
  }

  const csvContent = csvRows.join('\n')
  const buffer = Buffer.from(csvContent, 'utf-8')
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `dataset-report-${timestamp}.csv`

  return {
    success: true,
    buffer,
    filename,
    mimeType: 'text/csv'
  }
}

/**
 * Generate JSON dataset report
 */
async function generateJSONDatasetReport(
  reportData: DatasetReportData,
  config: DatasetReportConfig
): Promise<{
  success: boolean
  buffer: Buffer
  filename: string
  mimeType: string
}> {
  logger.info('[Dataset Report] Generating JSON')

  const jsonContent = JSON.stringify(reportData, null, 2)
  const buffer = Buffer.from(jsonContent, 'utf-8')
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `dataset-report-${timestamp}.json`

  return {
    success: true,
    buffer,
    filename,
    mimeType: 'application/json'
  }
}

/**
 * Generate XLSX dataset report
 */
async function generateXLSXDatasetReport(
  reportData: DatasetReportData,
  config: DatasetReportConfig
): Promise<{
  success: boolean
  buffer: Buffer
  filename: string
  mimeType: string
}> {
  logger.info('[Dataset Report] Generating XLSX')

  // For now, fall back to CSV format with proper extension
  // TODO: Implement proper XLSX generation when excel library is integrated
  logger.warn('[Dataset Report] XLSX format not yet implemented, falling back to CSV')
  const csvResult = await generateCSVDatasetReport(reportData, config)

  // Keep CSV format but update filename extension to match what user requested
  return {
    ...csvResult,
    filename: csvResult.filename.replace('.csv', '.csv') // Keep as CSV for now
  }
}
