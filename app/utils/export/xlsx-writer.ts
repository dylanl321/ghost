/**
 * XLSX Writer
 * Generates Excel files from DataExportConfig
 */

import type { DataExportConfig, ExportResult } from '#shared/types/export'
import { buildXlsxBuffer } from '#shared/utils/export/xlsx-workbook'
import {
  generateFilename,
  downloadBlob
} from './export-utils'

const logger = createLogger('XlsxWriter')

/**
 * Export data as XLSX
 */
export async function exportToXLSX(
  config: DataExportConfig
): Promise<ExportResult> {
  try {
    const wbout = buildXlsxBuffer(config)

    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })

    const filename = generateFilename(
      config.options?.filename || config.title,
      'xlsx'
    )

    return {
      success: true,
      format: 'xlsx',
      filename,
      blob
    }

  } catch (error) {
    logger.error('XLSX export failed:', error)
    return {
      success: false,
      format: 'xlsx',
      filename: '',
      error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error during XLSX export'
    }
  }
}

/**
 * Download XLSX file
 */
export function downloadXLSX(result: ExportResult): void {
  if (!result.success || !result.blob) {
    logger.error('Cannot download XLSX:', result.error)
    return
  }

  downloadBlob(result.blob, result.filename)
}
