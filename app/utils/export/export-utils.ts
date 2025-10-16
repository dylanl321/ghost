/**
 * Shared Export Utilities
 * Common helpers for data transformation and formatting
 */

import type { ColumnConfig, FormattingOptions } from '~/shared/types/export'

/**
 * Format a value based on column configuration
 */
export function formatCellValue(
  value: any,
  column?: ColumnConfig,
  formatting?: FormattingOptions
): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  const format = column?.format || 'text'
  const decimals = column?.decimals ?? 2

  switch (format) {
    case 'currency':
      return formatCurrency(value, formatting?.numberFormat)

    case 'percentage':
      const numValue = typeof value === 'number' ? value : parseFloat(value)
      if (isNaN(numValue)) return value
      return `${numValue.toFixed(decimals)}%`

    case 'number':
      const num = typeof value === 'number' ? value : parseFloat(value)
      if (isNaN(num)) return value
      return formatNumber(num, decimals, formatting?.numberFormat)

    case 'date':
      return formatDate(value)

    case 'datetime':
      return formatDateTime(value)

    case 'text':
    default:
      return String(value)
  }
}

/**
 * Format currency value
 */
export function formatCurrency(
  value: number | string,
  options?: {
    currencySymbol?: string
    thousandsSeparator?: string
    decimalSeparator?: string
  }
): string {
  const numValue = typeof value === 'number' ? value : parseFloat(value)
  if (isNaN(numValue)) return String(value)

  const symbol = options?.currencySymbol || '$'
  const formatted = formatNumber(numValue, 2, options)

  return numValue < 0 ? `-${symbol}${formatted.replace('-', '')}` : `${symbol}${formatted}`
}

/**
 * Format number with thousands separator
 */
export function formatNumber(
  value: number,
  decimals: number = 2,
  options?: {
    thousandsSeparator?: string
    decimalSeparator?: string
  }
): string {
  const thousandsSep = options?.thousandsSeparator || ','
  const decimalSep = options?.decimalSeparator || '.'

  const fixed = value.toFixed(decimals)
  const parts = fixed.split('.')

  // Add thousands separator
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep)

  return parts.join(decimalSep)
}

/**
 * Format date to locale string
 */
export function formatDate(value: any): string {
  const date = new Date(value)
  if (isNaN(date.getTime())) return String(value)

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Format datetime to locale string
 */
export function formatDateTime(value: any): string {
  const date = new Date(value)
  if (isNaN(date.getTime())) return String(value)

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Escape CSV value
 */
export function escapeCSV(value: any): string {
  if (value === null || value === undefined) return ''

  const str = String(value)

  // If contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * Convert sheet data to table format
 * Handles different data structures and normalizes to rows/columns
 */
export function normalizeSheetData(
  data: any,
  columns?: ColumnConfig[]
): { headers: string[]; rows: any[][] } {
  if (!data) {
    return { headers: [], rows: [] }
  }

  // Already normalized table structure
  if (typeof data === 'object' && !Array.isArray(data) && data.headers && data.rows) {
    return {
      headers: data.headers,
      rows: data.rows
    }
  }

  // Array of objects
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    // If columns are provided, use them; otherwise infer from first object
    const headers = columns
      ? columns.map(col => col.header)
      : Object.keys(data[0])

    const keys = columns
      ? columns.map(col => col.key)
      : Object.keys(data[0])

    const rows = data.map(item =>
      keys.map(key => item[key])
    )

    return { headers, rows }
  }

  // Key-value object
  if (typeof data === 'object' && !Array.isArray(data)) {
    const headers = ['Property', 'Value']
    const rows = Object.entries(data).map(([key, value]) => [key, value])
    return { headers, rows }
  }

  // Simple array
  if (Array.isArray(data)) {
    return {
      headers: ['Value'],
      rows: data.map(item => [item])
    }
  }

  // Scalar value
  return {
    headers: ['Value'],
    rows: [[data]]
  }
}

/**
 * Generate filename with timestamp
 */
export function generateFilename(
  baseName: string,
  extension: string,
  includeTimestamp: boolean = true
): string {
  const sanitized = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  if (includeTimestamp) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
    return `${sanitized}-${timestamp}.${extension}`
  }

  return `${sanitized}.${extension}`
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Create ZIP file from multiple files
 */
export async function createZip(files: Array<{ name: string; content: string | Blob }>): Promise<Blob> {
  // For now, return a simple implementation
  // In production, would use JSZip library
  throw new Error('ZIP creation not yet implemented. Install jszip library.')
}

/**
 * Calculate column widths based on content
 */
export function calculateColumnWidths(
  headers: string[],
  rows: any[][],
  maxWidth: number = 50
): number[] {
  return headers.map((header, colIndex) => {
    // Start with header length
    let maxLength = header.length

    // Check row values
    rows.forEach(row => {
      const cellValue = String(row[colIndex] || '')
      maxLength = Math.max(maxLength, cellValue.length)
    })

    // Convert to appropriate width unit (characters to points/pixels)
    // Excel: ~1.2 chars per width unit, PDF: ~10 points per char
    return Math.min(maxLength, maxWidth)
  })
}
