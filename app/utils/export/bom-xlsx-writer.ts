/**
 * BOM XLSX Writer
 * Handles Excel file generation for BOM exports
 */

import * as XLSX from 'xlsx'
import type { AccountBomData } from '#shared/utils/bom-sheet-builder'
import { createBomWorkbook } from '#shared/utils/bom-sheet-builder'

/**
 * Generates a BOM Excel file for a single account
 */
export async function generateBomFile(bomData: AccountBomData): Promise<Blob> {
  const wb = createBomWorkbook(bomData)

  // Generate Excel file as array buffer
  const wbout = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true
  })

  // Convert to Blob
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

/**
 * Generates filename in format: "requestId - accountName.xlsx"
 */
export function generateBomFilename(accountName: string, requestId?: string): string {
  const id = requestId || 'GHOST'
  // Sanitize filename to remove invalid characters
  const safeName = accountName.replace(/[^a-zA-Z0-9\s\-_]/g, '')
  return `${id} - ${safeName}.xlsx`
}

/**
 * Triggers browser download of a BOM file
 */
export function downloadBomFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Generates and downloads a single BOM file
 */
export async function exportSingleBom(bomData: AccountBomData): Promise<void> {
  const blob = await generateBomFile(bomData)
  const filename = generateBomFilename(bomData.accountName, bomData.requestId)
  downloadBomFile(blob, filename)
}

/**
 * Generates multiple BOM files and downloads as ZIP
 */
export async function exportMultipleBoms(bomDataArray: AccountBomData[]): Promise<void> {
  // Dynamically import JSZip
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // Generate each BOM file and add to ZIP
  for (const bomData of bomDataArray) {
    const blob = await generateBomFile(bomData)
    const filename = generateBomFilename(bomData.accountName, bomData.requestId)
    zip.file(filename, blob)
  }

  // Generate ZIP file
  const zipBlob = await zip.generateAsync({ type: 'blob' })

  // Download ZIP
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'BOM-Exports.zip'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
