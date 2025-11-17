/**
 * BOM (Bill of Materials) Sheet Builder
 * Creates Excel sheets matching the standard BOM format for cost exports
 */

import type { WorkSheet } from 'xlsx'
import * as XLSX from 'xlsx'

interface AccountBomData {
  accountId: string
  accountName: string
  requestId?: string
  costs2025: number[] // 12 months Jan-Dec
  costs2026: number[] // 12 months Jan-Dec
  shortLink: string
}

/**
 * Creates the General sheet with roles and status template
 */
export function createGeneralSheet(): WorkSheet {
  const data = [
    ['ROLE', 'POC', 'Status', 'Notes'],
    [
      'Program BOM Lead',
      null,
      null,
      'Overall lead that will take ownership of the file once IT LAA and Apps team has provided their input'
    ],
    ['Program Lead', null, null, null],
    ['IT LAA Manager', null, null, null],
    ['IT LAA Lead', null, null, null],
    ['EAS Lead', null, null, null],
    ['SCM Lead', null, null, null],
    ['PM', null, null, null],
    ['DPME', null, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
    ['Overall Status', null, null, null],
    [null, null, null, null],
    ['Additional details', null, null, null]
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)

  // Set column widths
  ws['!cols'] = [
    { wch: 25 }, // A - ROLE
    { wch: 15 }, // B - POC
    { wch: 20 }, // C - Status
    { wch: 80 }  // D - Notes
  ]

  return ws
}

/**
 * Creates the Assumptions sheet with IT assumptions template
 */
export function createAssumptionsSheet(): WorkSheet {
  const data = [
    ['IT- LAA', 'Assumption'],
    [],
    [],
    [],
    [],
    [],
    ['Bulk Software (Schedule)', 'IT LAA Maintenance Bulk Renewal Schedule.docx'],
    [],
    [],
    ['IT Engineering Apps', 'Description', 'In the File'],
    [
      'Indirect apps (Quote process question)',
      'These apps will NOT need to be quoted by SCM as these will not be part of the BOM or Bid. IT Eng Apps team will track them for future demand planning purposes.',
      'Yes'
    ],
    [
      'Indirect apps (UnClass- Isolated of the enterprise network via firewall)',
      'Meaning the enclave can utilize the enterprise license server. There will be no license cost, but the labor cost to maintain them applies (Indirect to Indirect in 2026)',
      'Yes'
    ],
    [
      'Indirect apps (UnClass- Standalone/airgapped)\nAirgapped means cannot access Enterprise server.',
      'Meaning the enclave does utilize the enterprise license server, but IT was paying for the apps. Will be included in the BOM. The rows will be clearly be marked Direct for inventory and per program request (As these will be moving from Indirect to Direct)',
      'Yes'
    ],
    [
      'Direct apps (Classified and airgapped) (Non-Std on any type of Enclave)',
      'There will be license and labor cost to acquire, support and maintain them. If the application is Direct in 2025 and stays Direct 2026, then remove this row from the file.',
      'No'
    ],
    [
      'Direct apps (Classified and airgapped)- IBM only (if tokens provided by GDMS)',
      'There will be license cost, and the labor cost to maintain them applies. Work with Keryn Skerly on this process. (This row will stay in the file as Direct for next year with charge back)',
      'Yes'
    ],
    [
      'If the lic. expires in the middle of the year for Indirect apps? Indirect for 2025, and becomes direct for 2026',
      "We renew for 12 months per the vendor lic. agreement. They can continue to use the app until the lic. expires as Indirect (no lic. charge) and then work with SCM to get new quote for that app. This row stays in the file and the expiry date is visible for the program to pick up the license cost in 2026. \n\nWill the formal BOE will include EAS labor for this app even though it becomes Direct in the middle of the year? ' Yes, include labor based on procurement support, monitoring , management, and renewal of the license still.",
      'Yes'
    ],
    [
      'Is EAS going to input labor hours for Indirect eng software that will become direct 2026 onwards?\n',
      'Yes and this row will stay in the file. \nIn the BOE, put the following assumption:\nAssumption: "This basis of estimate is written based on the assumption that Engineering Application Services will support enclaves with software procurement, provisioning, monitoring, management, and renewals for standard engineering tools starting in January 2026."\n',
      'Yes'
    ],
    [
      'Will Enclaves be allowed to take over/transfer renewals to assume the savings? Meri (PIttsfield)',
      'Net new licensing for proposals and renewals in 2026. If there are specific licenses the program wants to know about, then we can give a list over to supply chain to evaluate the licenses on a case by case scenario. ',
      'N/A'
    ],
    [
      'If the lic. expires in the middle of the year for Direct apps?  Direct as of 2025 and going forward.',
      'No action needed. This row will be deleted.',
      'No'
    ],
    [
      'Enclaves pulling enterprise server licenses (poking hole in the Firewall) from program paid hardware?',
      "That's allowed and the cost stays Indirect. Keep the row in the file and make sure to mark 'GFE Hardware'.\nNote: All Enclaves (except the the enterpise ones) hardware will be program paid in 2026",
      "Yes with 'GFE Hardware' comment"
    ]
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)

  // Set column widths
  ws['!cols'] = [
    { wch: 40 }, // A - IT Engineering Apps
    { wch: 100 }, // B - Description
    { wch: 20 }   // C - In the File
  ]

  return ws
}

/**
 * Converts a date to Excel serial number
 * Excel dates start from 1900-01-01 = 1
 */
function dateToExcelSerial(date: Date): number {
  const epoch = new Date(1899, 11, 30) // Excel epoch
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((date.getTime() - epoch.getTime()) / msPerDay)
}

/**
 * Creates the IT Cloud sheet with monthly cost data
 */
export function createITCloudSheet(bomData: AccountBomData): WorkSheet {
  // Create month headers as Excel serial numbers for proper date formatting
  const months2025 = Array.from({ length: 12 }, (_, i) => {
    return dateToExcelSerial(new Date(2025, i, 1))
  })

  const months2026 = Array.from({ length: 12 }, (_, i) => {
    return dateToExcelSerial(new Date(2026, i, 1))
  })

  const data = [
    ['2025 Estimated Spend:', { f: '=N7' }], // Formula to sum 2025 total
    ['2026 Estimated Spend:', { f: '=N11' }], // Formula to sum 2026 total
    [],
    [],
    ['2025 Month by Month'], // Section header
    [null, ...months2025, '2025 Total'], // Month headers row
    [null, ...bomData.costs2025, { f: '=SUM(B7:M7)' }], // Cost values + formula
    [],
    ['2026 Month by Month'], // Section header
    [null, ...months2026, '2026 Total'], // Month headers row
    [null, ...bomData.costs2026, { f: '=SUM(B11:M11)' }], // Cost values + formula
    [],
    [],
    ['Source:', bomData.shortLink] // Short link to cost page
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)

  // Set column widths
  ws['!cols'] = [
    { wch: 25 }, // A - Labels
    ...Array(12).fill({ wch: 12 }), // B-M - Months
    { wch: 15 }  // N - Total
  ]

  // Note: Cell styling (bold, colors) requires xlsx-style library
  // For now, we only apply number formatting which is supported by standard xlsx library

  // Row 6: Month headers (dates) - format as "mmm-yy"
  for (let col = 1; col <= 12; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 5, c: col })
    if (ws[cellRef]) {
      ws[cellRef].t = 'n' // Number type (Excel serial)
      ws[cellRef].z = 'mmm-yy' // Date format
    }
  }

  // Row 7: 2025 cost values - format as currency
  for (let col = 1; col <= 12; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 6, c: col })
    if (ws[cellRef]) {
      ws[cellRef].t = 'n' // Number type
      ws[cellRef].z = '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"??_);_(@_)'
    }
  }

  // Row 10: Month headers (dates) - format as "mmm-yy"
  for (let col = 1; col <= 12; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 9, c: col })
    if (ws[cellRef]) {
      ws[cellRef].t = 'n' // Number type (Excel serial)
      ws[cellRef].z = 'mmm-yy' // Date format
    }
  }

  // Row 11: 2026 cost values - format as currency
  for (let col = 1; col <= 12; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 10, c: col })
    if (ws[cellRef]) {
      ws[cellRef].t = 'n' // Number type
      ws[cellRef].z = '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"??_);_(@_)'
    }
  }

  // Total columns (N7 and N11) - format as currency
  if (ws['N7']) ws['N7'].z = '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"??_);_(@_)'
  if (ws['N11']) ws['N11'].z = '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"??_);_(@_)'

  // Summary cells (B1 and B2) - format as currency
  if (ws['B1']) ws['B1'].z = '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"??_);_(@_)'
  if (ws['B2']) ws['B2'].z = '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"??_);_(@_)'

  // Add hyperlink to source cell (B14)
  if (ws['B14'] && bomData.shortLink) {
    ws['B14'].l = {
      Target: bomData.shortLink,
      Tooltip: 'View in GHOST Cost Dashboard'
    }
  }

  return ws
}

/**
 * Creates a complete BOM workbook for an account
 */
export function createBomWorkbook(bomData: AccountBomData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  // Add sheets in order
  const generalSheet = createGeneralSheet()
  const assumptionsSheet = createAssumptionsSheet()
  const itCloudSheet = createITCloudSheet(bomData)

  XLSX.utils.book_append_sheet(wb, generalSheet, 'General')
  XLSX.utils.book_append_sheet(wb, assumptionsSheet, 'Assumptions')
  XLSX.utils.book_append_sheet(wb, itCloudSheet, 'IT Cloud')

  return wb
}

export type { AccountBomData }
