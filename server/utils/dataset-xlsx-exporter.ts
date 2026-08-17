/**
 * Dataset XLSX Exporter
 * Server-side XLSX generation for dataset reports using SheetJS
 *
 * Generates multi-sheet Excel workbooks with:
 * - Separate sheets per dataset type (AWS Config, Security Hub, CloudTrail)
 * - Flattened nested JSON data for searchability
 * - Styled headers with frozen row
 * - Auto-width columns capped at 50 characters
 */

import * as XLSX from 'xlsx'
import type {
  DatasetReportData,
  DatasetReportConfig,
  ConfigResourceRecord,
  SecurityHubFindingRecord,
  CloudTrailEventRecord,
  DatasetColumnConfig
} from '../../shared/types/dataset-reports'
import { flattenNestedData } from './dataset-schema-builder'

import {
  CONFIG_COLUMNS,
  SECURITY_HUB_COLUMNS,
  CLOUDTRAIL_COLUMNS,
  ENTRA_USERS_COLUMNS
} from '../../shared/types/dataset-reports'

/**
 * Result of XLSX generation
 */
export interface XLSXExportResult {
  success: boolean
  buffer?: Buffer
  filename?: string
  mimeType?: string
  error?: string
}

/**
 * Generate a multi-sheet XLSX workbook from dataset report data
 *
 * Creates separate sheets for each enabled dataset type with proper
 * formatting, styled headers, and flattened nested data.
 */
export async function generateXLSXDatasetReport(
  reportData: DatasetReportData,
  config: DatasetReportConfig
): Promise<XLSXExportResult> {
  try {
    const workbook = XLSX.utils.book_new()
    let sheetsAdded = 0

    // Sheet 1: AWS Config Resources
    if (reportData.config?.records && reportData.config.records.length > 0) {
      const records = reportData.config.records.map(flattenConfigRecord)
      const configSheet = createDatasetSheet(
        records,
        resolveExportColumns(CONFIG_COLUMNS, records, config.columns)
      )
      XLSX.utils.book_append_sheet(workbook, configSheet, 'AWS Config')
      sheetsAdded++
    }

    // Sheet 2: Security Hub Findings
    if (reportData.securityHub?.records && reportData.securityHub.records.length > 0) {
      const records = reportData.securityHub.records.map(flattenSecurityHubRecord)
      const securitySheet = createDatasetSheet(
        records,
        resolveExportColumns(SECURITY_HUB_COLUMNS, records, config.columns)
      )
      XLSX.utils.book_append_sheet(workbook, securitySheet, 'Security Hub')
      sheetsAdded++
    }

    // Sheet 3: CloudTrail Events
    if (reportData.cloudtrail?.records && reportData.cloudtrail.records.length > 0) {
      const records = reportData.cloudtrail.records.map(flattenCloudTrailRecord)
      const cloudtrailSheet = createDatasetSheet(
        records,
        resolveExportColumns(CLOUDTRAIL_COLUMNS, records, config.columns)
      )
      XLSX.utils.book_append_sheet(workbook, cloudtrailSheet, 'CloudTrail')
      sheetsAdded++
    }

    // Sheet 4: Entra Users
    if (reportData.entraUsers?.enabled && reportData.entraUsers.records.length > 0) {
      const records = reportData.entraUsers.records.map(flattenEntraUserRecord)
      const entraUsersSheet = createDatasetSheet(
        records,
        resolveExportColumns(ENTRA_USERS_COLUMNS, records, config.columns)
      )
      XLSX.utils.book_append_sheet(workbook, entraUsersSheet, 'Entra Users')
      sheetsAdded++
    }

    // Handle case where no data was available
    if (sheetsAdded === 0) {
      // Add empty placeholder sheet to avoid invalid workbook
      const emptySheet = XLSX.utils.aoa_to_sheet([['No data available for the selected datasets and filters']])
      XLSX.utils.book_append_sheet(workbook, emptySheet, 'No Data')
    }

    // Generate buffer using Node.js 'buffer' type (not 'array' like browser)
    const xlsxBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
      cellStyles: true
    })

    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `dataset-report-${timestamp}.xlsx`

    return {
      success: true,
      buffer: Buffer.from(xlsxBuffer),
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to generate XLSX report'
    }
  }
}

function resolveExportColumns(
  defaults: readonly DatasetColumnConfig[],
  records: Record<string, any>[],
  selected?: string[]
): DatasetColumnConfig[] {
  if (!selected?.length) return [...defaults]
  const defaultsByKey = new Map(defaults.map(column => [column.key, column]))
  return selected
    .filter(key => records.some(record => record[key] !== undefined))
    .map(key => defaultsByKey.get(key) || { key, label: formatColumnLabel(key) })
}

function formatColumnLabel(key: string): string {
  const segment = key.split('.').pop() || key
  return segment.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase()).trim()
}

/**
 * Create a worksheet from flattened records with column definitions
 *
 * Applies styling (bold headers, background color, auto-width, frozen header row)
 */
export function createDatasetSheet(
  records: Record<string, any>[],
  columns: readonly DatasetColumnConfig[]
): XLSX.WorkSheet {
  if (records.length === 0) {
    // Return empty sheet with headers only
    const headers = columns.map(col => col.label)
    const worksheet = XLSX.utils.aoa_to_sheet([headers])
    applySheetStyling(worksheet, headers)
    return worksheet
  }

  // Build data array with headers first
  const headers = columns.map(col => col.label)
  const dataRows = records.map(record =>
    columns.map(col => formatCellValue(record[col.key], col))
  )

  const sheetData = [headers, ...dataRows]
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData)

  // Apply styling and formatting
  applySheetStyling(worksheet, headers)
  applyColumnFormatting(worksheet, columns)

  return worksheet
}

/**
 * Apply header styling, frozen row, and auto-width columns
 */
function applySheetStyling(worksheet: XLSX.WorkSheet, headers: string[]): void {
  if (!worksheet['!ref']) return

  const range = XLSX.utils.decode_range(worksheet['!ref'])

  // Style header row (row 0) - bold text with light gray background
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col })
    if (worksheet[cellRef]) {
      worksheet[cellRef].s = {
        font: { bold: true, sz: 12, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'F0F0F0' } },  // Light gray (#f0f0f0)
        alignment: { horizontal: 'center', vertical: 'center' }
      }
    }
  }

  // Freeze header row
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }

  // Calculate and apply auto-width columns
  const columnWidths = calculateColumnWidths(worksheet, headers)
  worksheet['!cols'] = columnWidths.map(w => ({ wch: w }))
}

/**
 * Calculate column widths based on content, capped at 50 characters
 */
function calculateColumnWidths(worksheet: XLSX.WorkSheet, headers: string[]): number[] {
  if (!worksheet['!ref']) {
    return headers.map(h => Math.min(h.length + 2, 50))
  }

  const range = XLSX.utils.decode_range(worksheet['!ref'])
  const widths: number[] = []

  for (let col = range.s.c; col <= range.e.c; col++) {
    // Start with header width
    let maxWidth = headers[col]?.length || 10

    // Check all data rows for this column
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = worksheet[cellRef]
      if (cell?.v !== undefined && cell?.v !== null) {
        const valueStr = String(cell.v)
        maxWidth = Math.max(maxWidth, valueStr.length)
      }
    }

    // Add padding, cap at 50 characters maximum
    widths.push(Math.min(maxWidth + 2, 50))
  }

  return widths
}

/**
 * Apply Excel format codes to date and number columns
 */
function applyColumnFormatting(worksheet: XLSX.WorkSheet, columns: readonly DatasetColumnConfig[]): void {
  if (!worksheet['!ref']) return

  const range = XLSX.utils.decode_range(worksheet['!ref'])

  columns.forEach((column, colIndex) => {
    if (column.type === 'date') {
      // Apply date format to all cells in this column (skip header)
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: colIndex })
        if (worksheet[cellRef]) {
          worksheet[cellRef].z = column.format || 'mmm d, yyyy h:mm AM/PM'
        }
      }
    } else if (column.type === 'number') {
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: colIndex })
        if (worksheet[cellRef]) {
          worksheet[cellRef].z = column.format || '#,##0'
        }
      }
    }
  })
}

/**
 * Format cell value based on column configuration
 */
function formatCellValue(value: any, column: DatasetColumnConfig): any {
  if (value === undefined || value === null) {
    return ''
  }

  if (column.type === 'date') {
    // Convert to Excel serial date for proper sorting/filtering
    try {
      const date = new Date(value)
      if (!isNaN(date.getTime())) {
        return date
      }
    } catch {
      // Fall through to return original value
    }
  }

  if (column.type === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return value
}

/**
 * Flatten AWS Config resource record for XLSX export
 * Extracts nested configuration fields into flat columns
 */
function flattenConfigRecord(record: ConfigResourceRecord): Record<string, any> {
  const flat: Record<string, any> = {
    accountName: record.accountName,
    accountId: record.accountId,
    region: record.region,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    resourceName: record.resourceName || '',
    complianceStatus: record.complianceStatus || '',
    complianceType: record.complianceType || '',
    configurationItemCaptureTime: record.configurationItemCaptureTime,
    arn: record.arn || ''
  }

  Object.assign(flat, flattenNestedData({ configuration: record.configuration || {} }))

  // Flatten tags if present (common use case)
  if (record.tags && typeof record.tags === 'object') {
    // Add commonly used tag fields as dedicated columns
    if (record.tags.Name) flat['tags.Name'] = record.tags.Name
    if (record.tags.Environment) flat['tags.Environment'] = record.tags.Environment
    if (record.tags.Owner) flat['tags.Owner'] = record.tags.Owner
  }

  return flat
}

/**
 * Flatten Security Hub finding record for XLSX export
 */
function flattenSecurityHubRecord(record: SecurityHubFindingRecord): Record<string, any> {
  return {
    accountName: record.accountName,
    accountId: record.accountId,
    region: record.region,
    findingId: record.findingId,
    title: record.title,
    description: record.description || '',
    severity: record.severity,
    severityScore: record.severityScore,
    workflowStatus: record.workflowStatus,
    productName: record.productName,
    complianceStatus: record.complianceStatus || '',
    complianceStandard: record.complianceStandard || '',
    controlId: record.controlId || '',
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    firstObservedAt: record.firstObservedAt,
    lastObservedAt: record.lastObservedAt || '',
    remediationRecommendation: record.remediationRecommendation || '',
    remediationUrl: record.remediationUrl || ''
  }
}

/**
 * Flatten CloudTrail event record for XLSX export
 * Keeps events relatively flat, parses userIdentity
 */
function flattenCloudTrailRecord(record: CloudTrailEventRecord): Record<string, any> {
  return {
    accountName: record.accountName,
    accountId: record.accountId,
    region: record.region,
    eventId: record.eventId,
    eventName: record.eventName,
    eventType: record.eventType,
    eventTime: record.eventTime,
    eventSource: record.eventSource,
    userIdentityType: record.userIdentityType,
    userIdentityUserName: record.userIdentityUserName || '',
    userIdentityPrincipalId: record.userIdentityPrincipalId || '',
    userIdentityArn: record.userIdentityArn || '',
    sourceIPAddress: record.sourceIPAddress || '',
    userAgent: record.userAgent || '',
    errorCode: record.errorCode || '',
    errorMessage: record.errorMessage || '',
    readOnly: record.readOnly
  }
}

/**
 * Flatten Entra User record for XLSX export
 */
function flattenEntraUserRecord(record: any): Record<string, any> {
  return {
    displayName: record.displayName || '',
    email: record.email || '',
    userPrincipalName: record.userPrincipalName || '',
    accountName: record.accountName || '',
    role: record.role || '',
    groupName: record.groupName || '',
    department: record.department || '',
    jobTitle: record.jobTitle || '',
    lastSignIn: record.lastSignIn || '',
    manager: record.manager || '',
    userId: record.userId || '',
    accountId: record.accountId || '',
    groupId: record.groupId || ''
  }
}
