/**
 * Universal Data Export Composable
 * Orchestrates export functionality across all formats (CSV, XLSX, PDF, JSON)
 */

import { ref, computed } from 'vue'
import type {
  DataExportConfig,
  ExportFormat,
  ExportResult
} from '#shared/types/export'

const logger = createLogger('DataExport')

export function useDataExport() {
  const isExporting = ref(false)
  const exportProgress = ref<string>('')
  const lastExportResult = ref<ExportResult | null>(null)
  const toast = useToast()

  /**
   * Export data in specified format
   */
  async function exportData(
    config: DataExportConfig,
    format: ExportFormat
  ): Promise<ExportResult> {
    isExporting.value = true
    exportProgress.value = `Preparing ${format.toUpperCase()} export...`

    try {
      let result: ExportResult

      switch (format) {
        case 'csv': {
          const { exportToCSV } = await import('~/utils/export/csv-writer')
          exportProgress.value = 'Generating CSV file...'
          result = await exportToCSV(config)
          break
        }

        case 'xlsx': {
          const { exportToXLSX } = await import('~/utils/export/xlsx-writer')
          exportProgress.value = 'Generating Excel file...'
          result = await exportToXLSX(config)
          break
        }

        case 'pdf': {
          const { exportToPDF } = await import('~/utils/export/pdf-writer.client')
          exportProgress.value = 'Generating PDF document...'
          result = await exportToPDF(config)
          break
        }

        case 'json': {
          exportProgress.value = 'Generating JSON file...'
          result = await exportToJSON(config)
          break
        }

        default:
          throw new Error(`Unsupported export format: ${format}`)
      }

      lastExportResult.value = result

      if (result.success) {
        exportProgress.value = 'Download starting...'

        // Auto-download if blob is present
        if (result.blob) {
          downloadFile(result.blob, result.filename)
        }

        useEventBus().emit('export.completed', { format })

        toast.add({
          title: 'Export Successful',
          description: `${format.toUpperCase()} file has been downloaded`,
          color: 'green',
          timeout: 3000
        })
      } else {
        toast.add({
          title: 'Export Failed',
          description: result.error || 'An unknown error occurred',
          color: 'red',
          timeout: 5000
        })
      }

      return result

    } catch (error) {
      logger.error('Export failed:', error)

      const errorResult: ExportResult = {
        success: false,
        format,
        filename: '',
        error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown export error'
      }

      lastExportResult.value = errorResult

      toast.add({
        title: 'Export Error',
        description: errorResult.error,
        color: 'red',
        timeout: 5000
      })

      return errorResult

    } finally {
      isExporting.value = false
      exportProgress.value = ''
    }
  }

  /**
   * Export to JSON
   */
  async function exportToJSON(config: DataExportConfig): Promise<ExportResult> {
    try {
      // Create a structured JSON export
      const exportData = {
        metadata: config.metadata,
        title: config.title,
        subtitle: config.subtitle,
        sheets: config.sheets.map(sheet => ({
          name: sheet.name,
          type: sheet.type,
          description: sheet.description,
          data: sheet.data,
          columns: sheet.columns
        })),
        exportedAt: new Date().toISOString()
      }

      const jsonString = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })

      const { generateFilename } = await import('~/utils/export/export-utils')
      const filename = generateFilename(
        config.options?.filename || config.title,
        'json'
      )

      return {
        success: true,
        format: 'json',
        filename,
        blob
      }

    } catch (error) {
      logger.error('JSON export failed:', error)
      return {
        success: false,
        format: 'json',
        filename: '',
        error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error during JSON export'
      }
    }
  }

  /**
   * Download file helper
   */
  function downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.visibility = 'hidden'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Clean up the URL object after download
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  /**
   * Export in multiple formats sequentially
   */
  async function exportMultipleFormats(
    config: DataExportConfig,
    formats: ExportFormat[]
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = []

    for (const format of formats) {
      const result = await exportData(config, format)
      results.push(result)

      // Small delay between exports
      if (formats.indexOf(format) < formats.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    return results
  }

  /**
   * Validate export configuration
   */
  function validateConfig(config: DataExportConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!config.title) {
      errors.push('Export title is required')
    }

    if (!config.sheets || config.sheets.length === 0) {
      errors.push('At least one sheet is required')
    }

    config.sheets?.forEach((sheet, index) => {
      if (!sheet.name) {
        errors.push(`Sheet ${index + 1} is missing a name`)
      }
      if (!sheet.data) {
        errors.push(`Sheet ${index + 1} is missing data`)
      }
    })

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Get file size estimate (rough approximation)
   */
  function estimateFileSize(config: DataExportConfig, format: ExportFormat): string {
    let totalDataPoints = 0

    config.sheets.forEach(sheet => {
      if (Array.isArray(sheet.data)) {
        totalDataPoints += sheet.data.length
      } else if (typeof sheet.data === 'object') {
        totalDataPoints += Object.keys(sheet.data).length
      }
    })

    // Rough estimates
    let bytesPerDataPoint = 50 // default

    switch (format) {
      case 'csv':
        bytesPerDataPoint = 30
        break
      case 'xlsx':
        bytesPerDataPoint = 50
        break
      case 'pdf':
        bytesPerDataPoint = 100
        break
      case 'json':
        bytesPerDataPoint = 80
        break
    }

    const estimatedBytes = totalDataPoints * bytesPerDataPoint

    if (estimatedBytes < 1024) {
      return `${estimatedBytes} B`
    } else if (estimatedBytes < 1024 * 1024) {
      return `${(estimatedBytes / 1024).toFixed(1)} KB`
    } else {
      return `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`
    }
  }

  return {
    // State
    isExporting: computed(() => isExporting.value),
    exportProgress: computed(() => exportProgress.value),
    lastExportResult: computed(() => lastExportResult.value),

    // Methods
    exportData,
    exportMultipleFormats,
    validateConfig,
    estimateFileSize,
    downloadFile
  }
}
