/**
 * Dataset Report Generator
 * Generates AWS dataset reports (Config, Security Hub, CloudTrail) for scheduled delivery
 */

import type { H3Event } from 'h3'
import type { DatasetQueryOptions, DatasetReportConfig, DatasetReportData, DatasetType } from '../../shared/types/dataset-reports'
import { getConfigResources } from './aws-config-data'
import { getSecurityHubFindings } from './security-hub-data'
import { getCloudTrailEvents } from './cloudtrail-data'
import { getEntraUsers } from './entra-users-data'
import { getAllAccountsUnified } from './accounts-consolidated'
import { exportDatasetToPDF } from './pdf-export-dataset'
import { generateXLSXDatasetReport as generateXLSX } from './dataset-xlsx-exporter'
import { logger } from './logger'
import { flattenNestedData } from './dataset-schema-builder'

/**
 * Generate a dataset report based on configuration
 * Returns report as Buffer for email attachment
 */
export async function generateDatasetReport(
  config: DatasetReportConfig,
  event?: H3Event,
  options: DatasetQueryOptions = {}
): Promise<{
  success: boolean
  buffer?: Buffer
  filename?: string
  mimeType?: string
  error?: string
  datasetCounts?: Partial<Record<DatasetType, number>>
}> {
  try {
    logger.info('[Dataset Report] Generating with config:', {
      accounts: config.accounts?.length || 'all',
      datasets: Object.keys(config.datasets),
      format: config.format,
      enableAI: config.enableAI
    })

    // Step 1: Fetch all required dataset data
    const reportData = await buildDatasetReport(config, event, options)

    // Step 2: Generate AI insights if enabled
    if (config.enableAI) {
      if (options.signal?.aborted) throw options.signal.reason || new Error('Export canceled')
      reportData.aiInsights = await generateAIInsights(reportData, config, options.signal)
    }

    // Step 3: Generate export in requested format
    if (config.format === 'pdf') {
      return { ...await generatePDFDatasetReport(reportData, config), datasetCounts: getDatasetCounts(reportData) }
    } else if (config.format === 'csv') {
      return { ...await generateCSVDatasetReport(reportData, config), datasetCounts: getDatasetCounts(reportData) }
    } else if (config.format === 'json') {
      return { ...await generateJSONDatasetReport(reportData, config), datasetCounts: getDatasetCounts(reportData) }
    } else if (config.format === 'xlsx') {
      return { ...await generateXLSXDatasetReport(reportData, config), datasetCounts: getDatasetCounts(reportData) }
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
async function buildDatasetReport(
  config: DatasetReportConfig,
  event?: H3Event,
  options: DatasetQueryOptions = {}
): Promise<DatasetReportData> {
  const startTime = Date.now()

  logger.info('[Dataset Report] Building dataset report')

  // Get account information
  const allAccounts = await getAllAccountsUnified()
  const accountsWithIds = allAccounts.filter(
    (account): account is typeof account & { accountId: string } => Boolean(account.accountId)
  )
  const accountMap = new Map(
    accountsWithIds.map(acc => [acc.accountId, acc.accountName || acc.accountId])
  )

  // Determine target accounts
  const targetAccountIds = config.accountScope === 'all' || (!config.accountScope && config.accounts.length === 0)
    ? accountsWithIds.map(acc => acc.accountId)
    : config.accounts.length > 0
    ? config.accounts
    : accountsWithIds.map(acc => acc.accountId)

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

        const records = await getConfigResources(targetAccountIds, filters, options)
        const resourceTypeSummary: Record<string, number> = {}
        const complianceSummary = {
          compliant: 0,
          nonCompliant: 0,
          notApplicable: 0,
          insufficientData: 0,
          total: records.length
        }

        for (const record of records) {
          resourceTypeSummary[record.resourceType] = (resourceTypeSummary[record.resourceType] || 0) + 1
          if (record.complianceStatus === 'COMPLIANT') complianceSummary.compliant++
          if (record.complianceStatus === 'NON_COMPLIANT') complianceSummary.nonCompliant++
          if (record.complianceStatus === 'NOT_APPLICABLE') complianceSummary.notApplicable++
          if (record.complianceStatus === 'INSUFFICIENT_DATA') complianceSummary.insufficientData++
        }

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
        const filters = { ...(config.datasets.securityHub!.filters || {}) }
        if (config.timeRange?.type === 'relative' && config.timeRange.relativeDays && !filters.lookbackDays) filters.lookbackDays = config.timeRange.relativeDays

        // Fetch records (regions are determined inside the function now)
        const records = await getSecurityHubFindings(targetAccountIds, filters, options)

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
        const filters = { ...(config.datasets.cloudtrail!.filters || {}) }
        if (config.timeRange?.type === 'relative' && config.timeRange.relativeDays && !filters.lookbackDays) filters.lookbackDays = config.timeRange.relativeDays
        if (config.timeRange?.type === 'absolute') {
          filters.startTime ||= config.timeRange.startDate
          filters.endTime ||= config.timeRange.endDate
        }

        const records = await getCloudTrailEvents(targetAccountIds, filters, options)

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

  // Entra ID Users
  if (config.datasets.entraUsers?.enabled) {
    if (!event) {
      throw new Error('Entra Users reports require an interactive user session and cannot run in the background')
    } else {
      datasetPromises.push(
        (async () => {
          logger.info('[Dataset Report] Fetching Entra Users data')
          const filters = config.datasets.entraUsers!.filters || {}

          try {
            const records = await getEntraUsers(event, targetAccountIds, filters, options)

            // Build statistics from records
            const usersByRole: Record<string, number> = {}
            const usersByDepartment: Record<string, number> = {}
            let activeUsers = 0

            for (const record of records) {
              // Count by role
              usersByRole[record.role] = (usersByRole[record.role] || 0) + 1

              // Count by department
              if (record.department) {
                usersByDepartment[record.department] = (usersByDepartment[record.department] || 0) + 1
              }

              // Count active users (signed in within 30 days)
              if (record.lastSignIn) {
                const lastSignInDate = new Date(record.lastSignIn)
                const thirtyDaysAgo = new Date()
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
                if (lastSignInDate > thirtyDaysAgo) {
                  activeUsers++
                }
              }
            }

            reportData.entraUsers = {
              enabled: true,
              totalUsers: records.length,
              usersByRole,
              usersByDepartment,
              activeUsers,
              records
            }

            logger.info('[Dataset Report] Entra Users data fetched', {
              totalUsers: records.length,
              uniqueRoles: Object.keys(usersByRole).length,
              activeUsers
            })
          } catch (error: any) {
            logger.error('[Dataset Report] Entra Users fetch failed', {
              error: error.message,
              devMode: error.data?.devMode
            })
            // Continue without Entra data - don't fail entire report
          }
        })()
      )
    }
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
  config: DatasetReportConfig,
  signal?: AbortSignal
): Promise<{
  executiveSummary: string
  keyFindings: string[]
  recommendations?: string[]
}> {
  logger.info('[Dataset Report] Generating AI insights')

  try {
    const { analyzeDatasetReport } = await import('./pdf-export-dataset')
    const insights = await analyzeDatasetReport(reportData, config, signal)

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

  if (config.columns?.length) {
    appendSelectedCsvRows(csvRows, 'AWS Config Resources', reportData.config?.records || [], config.columns)
    appendSelectedCsvRows(csvRows, 'AWS Security Hub Findings', reportData.securityHub?.records || [], config.columns)
    appendSelectedCsvRows(csvRows, 'AWS CloudTrail Events', reportData.cloudtrail?.records || [], config.columns)
    appendSelectedCsvRows(csvRows, 'Entra ID Users', reportData.entraUsers?.records || [], config.columns)
    return createCsvResult(csvRows)
  }

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

  // Entra Users
  if (reportData.entraUsers?.enabled && reportData.entraUsers.records.length > 0) {
    csvRows.push('=== Entra ID Users ===')
    csvRows.push('Display Name,Email,Principal Name,Account,Role,Group Name,Department,Job Title,Last Sign-In,Manager')

    for (const record of reportData.entraUsers.records) {
      csvRows.push([
        record.displayName,
        record.email,
        record.userPrincipalName,
        record.accountName,
        record.role,
        record.groupName,
        record.department || '',
        record.jobTitle || '',
        record.lastSignIn || '',
        record.manager || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    csvRows.push('')
  }

  return createCsvResult(csvRows)
}

function appendSelectedCsvRows(csvRows: string[], title: string, records: object[], columns: string[]): void {
  if (records.length === 0) return
  const flattened = records.map(record => flattenNestedData(record as Record<string, any>))
  const available = columns.filter(key => flattened.some(record => record[key] !== undefined))
  if (available.length === 0) return
  csvRows.push(`=== ${title} ===`, available.map(csvEscape).join(','))
  for (const record of flattened) csvRows.push(available.map(key => csvEscape(record[key])).join(','))
  csvRows.push('')
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function createCsvResult(csvRows: string[]) {
  const timestamp = new Date().toISOString().split('T')[0]
  return {
    success: true as const,
    buffer: Buffer.from(csvRows.join('\n'), 'utf-8'),
    filename: `dataset-report-${timestamp}.csv`,
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

  const outputData = config.columns?.length
    ? projectDatasetColumns(reportData, config.columns)
    : reportData
  const jsonContent = JSON.stringify(outputData, null, 2)
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

function getDatasetCounts(reportData: DatasetReportData): Partial<Record<DatasetType, number>> {
  return {
    ...(reportData.config ? { config: reportData.config.records.length } : {}),
    ...(reportData.securityHub ? { securityHub: reportData.securityHub.records.length } : {}),
    ...(reportData.cloudtrail ? { cloudtrail: reportData.cloudtrail.records.length } : {}),
    ...(reportData.entraUsers ? { entraUsers: reportData.entraUsers.records.length } : {})
  }
}

function projectDatasetColumns(reportData: DatasetReportData, columns: string[]): DatasetReportData {
  const projected = structuredClone(reportData)
  const project = (records: object[]) => records.map(record => {
    const flat = flattenNestedData(record as Record<string, any>)
    return Object.fromEntries(columns.filter(key => flat[key] !== undefined).map(key => [key, flat[key]]))
  })

  if (projected.config) projected.config.records = project(projected.config.records) as any
  if (projected.securityHub) projected.securityHub.records = project(projected.securityHub.records) as any
  if (projected.cloudtrail) projected.cloudtrail.records = project(projected.cloudtrail.records) as any
  if (projected.entraUsers) projected.entraUsers.records = project(projected.entraUsers.records) as any
  return projected
}

/**
 * Generate XLSX dataset report using the XLSX exporter utility
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

  try {
    // Use the XLSX exporter utility for actual .xlsx generation
    const result = await generateXLSX(reportData, config)

    if (!result.success || !result.buffer) {
      throw new Error(result.error || 'XLSX generation failed')
    }

    logger.info('[Dataset Report] XLSX generated successfully')
    return {
      success: true,
      buffer: result.buffer,
      filename: result.filename!,
      mimeType: result.mimeType!
    }
  } catch (error: any) {
    logger.error('[Dataset Report] XLSX generation error:', error)
    // Fail explicitly - no silent fallback to CSV
    throw new Error(`Failed to generate XLSX: ${error.message}`)
  }
}
