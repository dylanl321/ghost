/**
 * Browser Export Utilities
 * Formatting helpers live in shared/utils/export/format so the server can
 * build the same files for scheduled reports
 */

export {
  formatCellValue,
  formatCurrency,
  formatNumber,
  formatDate,
  formatDateTime,
  escapeCSV,
  normalizeSheetData,
  generateFilename,
  calculateColumnWidths
} from '#shared/utils/export/format'

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
