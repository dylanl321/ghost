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

/**
 * Create ZIP file from multiple files
 */
export async function createZip(files: Array<{ name: string; content: string | Blob }>): Promise<Blob> {
  // For now, return a simple implementation
  // In production, would use JSZip library
  throw new Error('ZIP creation not yet implemented. Install jszip library.')
}
