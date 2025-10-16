/**
 * Universal Data Export Types
 * Defines the configuration schema for multi-format data exports
 */

export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'json'

export type SheetDataType = 'table' | 'summary' | 'chart-data' | 'raw-json' | 'key-value'

export type CellAlignment = 'left' | 'center' | 'right'

export interface ColumnConfig {
  key: string
  header: string
  width?: number // Column width (for XLSX/PDF)
  format?: 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'datetime'
  alignment?: CellAlignment
  decimals?: number // For number/currency formatting
}

export interface FormattingOptions {
  headerStyle?: {
    backgroundColor?: string
    textColor?: string
    bold?: boolean
    fontSize?: number
  }
  rowStyle?: {
    alternateColors?: boolean
    evenRowColor?: string
    oddRowColor?: string
  }
  numberFormat?: {
    currencySymbol?: string
    thousandsSeparator?: string
    decimalSeparator?: string
  }
}

export interface SheetConfig {
  name: string
  type: SheetDataType
  data: any
  columns?: ColumnConfig[]
  formatting?: FormattingOptions
  description?: string // Optional description/subtitle for the sheet
}

export interface ExportMetadata {
  generatedBy?: string
  timestamp?: string
  filters?: Record<string, any>
  selectedAccounts?: string[]
  selectedAccountsCount?: number
  scope?: 'org-wide' | 'selected-accounts' | 'department' | 'lob' | 'single-account'
  timeframe?: string
  mode?: string // 'billable' | 'proforma'
}

export interface DataExportConfig {
  title: string
  subtitle?: string
  metadata: ExportMetadata
  sheets: SheetConfig[]
  options?: ExportOptions
}

export interface ExportOptions {
  // PDF-specific options
  pdf?: {
    orientation?: 'portrait' | 'landscape'
    pageSize?: 'a4' | 'a3' | 'letter' | 'legal'
    includeCharts?: boolean // Whether to embed chart images
    includeToc?: boolean // Table of contents
    footerText?: string
  }
  // XLSX-specific options
  xlsx?: {
    autoWidth?: boolean
    freezeHeader?: boolean
    showGridlines?: boolean
  }
  // CSV-specific options
  csv?: {
    delimiter?: string // Default ','
    includeHeaders?: boolean
    encoding?: string // Default 'utf-8'
    multiFileZip?: boolean // If true, create ZIP with multiple CSVs
  }
  // General options
  filename?: string // Base filename (without extension)
  includeMetadata?: boolean // Include metadata sheet/section
}

export interface ExportResult {
  success: boolean
  format: ExportFormat
  filename: string
  blob?: Blob
  error?: string
}
