/**
 * GET /api/costs/budget-vs-actual-export
 *
 * Generates a department-specific executive Excel workbook (.xlsx).
 *
 * Query params:
 *   year: number (default: current year)
 */

import { defineEventHandler, getQuery, setResponseHeaders, send } from 'h3'
import { requirePermission } from '../../utils/user-roles'
import { errors } from '../../utils/api-response'
import { getItem } from '../../utils/dynamodb'
import { getDynamoDBConfig } from '../../lib/dynamodb-config'
import { ALLOWED_DEPARTMENTS, computeBudgetVsActual, type AllowedDepartment } from '../../utils/budget-vs-actual'
import { logger } from '../../utils/logger'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

async function fetchPlanOverrides(department: string, year: number): Promise<Record<string, number>> {
  try {
    const config = await getDynamoDBConfig()
    const { tableName, environment, accountId } = config.financialPlanOverrides
    const item = await getItem(tableName, { pk: department }, environment, accountId)
    const result: Record<string, number> = {}
    if (item) {
      for (const [key, value] of Object.entries(item)) {
        if (key === 'pk') continue
        const match = key.match(/^(\d{2})\/(\d{4})$/)
        if (match && parseInt(match[2]) === year) {
          result[`${match[2]}-${match[1]}-01`] = value as number
        }
      }
    }
    return result
  } catch { return {} }
}

// ── OOXML chart helpers ──────────────────────────────────────────────────────

function colLetter(col: number): string {
  let s = ''
  while (col > 0) { col--; s = String.fromCharCode(65 + (col % 26)) + s; col = Math.floor(col / 26) }
  return s
}

/** Build a bar chart XML (Plan vs Actual by month) */
function buildBarChartXml(sheetName: string, planRow: number, actualRow: number, firstDataCol: number, lastDataCol: number, labelRow: number): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const ref = (row: number, col: number) => `'${esc(sheetName)}'!$${colLetter(col)}$${row}`
  const rangeRef = (row: number, c1: number, c2: number) => `'${esc(sheetName)}'!$${colLetter(c1)}$${row}:$${colLetter(c2)}$${row}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Monthly Plan vs Actual</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:strRef><c:f>${ref(planRow, 1)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Plan</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="4E79A7"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>${rangeRef(labelRow, firstDataCol, lastDataCol)}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${rangeRef(planRow, firstDataCol, lastDataCol)}</c:f></c:numRef></c:val>
        </c:ser>
        <c:ser>
          <c:idx val="1"/>
          <c:order val="1"/>
          <c:tx><c:strRef><c:f>${ref(actualRow, 1)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Actual</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="F28E2B"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>${rangeRef(labelRow, firstDataCol, lastDataCol)}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${rangeRef(actualRow, firstDataCol, lastDataCol)}</c:f></c:numRef></c:val>
        </c:ser>
        <c:axId val="1"/>
        <c:axId val="2"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:crossAx val="2"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="2"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:numFmt formatCode="$#,##0" sourceLinked="0"/>
        <c:crossAx val="1"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`
}

/** Build a bar chart XML (cumulative plan vs actual) */
function buildLineChartXml(sheetName: string, cumPlanRow: number, cumActualRow: number, firstDataCol: number, lastDataCol: number, labelRow: number): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const ref = (row: number, col: number) => `'${esc(sheetName)}'!$${colLetter(col)}$${row}`
  const rangeRef = (row: number, c1: number, c2: number) => `'${esc(sheetName)}'!$${colLetter(c1)}$${row}:$${colLetter(c2)}$${row}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Cumulative Plan vs Actual</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:strRef><c:f>${ref(cumPlanRow, 1)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Plan (Cumulative)</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="4E79A7"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>${rangeRef(labelRow, firstDataCol, lastDataCol)}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${rangeRef(cumPlanRow, firstDataCol, lastDataCol)}</c:f></c:numRef></c:val>
        </c:ser>
        <c:ser>
          <c:idx val="1"/>
          <c:order val="1"/>
          <c:tx><c:strRef><c:f>${ref(cumActualRow, 1)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Actual (Cumulative)</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="F28E2B"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>${rangeRef(labelRow, firstDataCol, lastDataCol)}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${rangeRef(cumActualRow, firstDataCol, lastDataCol)}</c:f></c:numRef></c:val>
        </c:ser>
        <c:axId val="3"/>
        <c:axId val="4"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="3"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:crossAx val="4"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="4"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:numFmt formatCode="$#,##0" sourceLinked="0"/>
        <c:crossAx val="3"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`
}

/** Drawing XML that anchors two charts below the data table */
function buildDrawingXml(barChartRId: string, lineChartRId: string, anchorRow: number): string {
  // Each chart is 12 cols wide x 15 rows tall, side by side
  const r1 = anchorRow
  const r2 = anchorRow + 15
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:twoCellAnchor moveWithCells="1" sizeWithCells="0">
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>11</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Chart 1"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart r:id="${barChartRId}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
  <xdr:twoCellAnchor moveWithCells="1" sizeWithCells="0">
    <xdr:from><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>23</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="3" name="Chart 2"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart r:id="${lineChartRId}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`
}

export default defineEventHandler(async (event) => {
  try {
    await requirePermission(event, 'costs.budget_vs_actual')

    const query = getQuery(event)
    const year = parseInt(query.year as string) || new Date().getFullYear()
    const requestedDepartment = String(query.department || '').trim().toUpperCase()
    if (requestedDepartment && !ALLOWED_DEPARTMENTS.includes(requestedDepartment as AllowedDepartment)) {
      return errors.badRequest(event, `Department must be one of: ${ALLOWED_DEPARTMENTS.join(', ')}`)
    }
    const exportDepartments: AllowedDepartment[] = requestedDepartment ? [requestedDepartment as AllowedDepartment] : [...ALLOWED_DEPARTMENTS]

    const now = new Date()

    // Actuals are intentionally limited to the report year. The following year comes
    // from the saved AWS-backed financial forecast, so this export never asks Cost
    // Explorer for future actuals.
    const allMonths: string[] = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}-01`
    )
    const forecastMonths: string[] = [
      ...allMonths,
      ...Array.from({ length: 12 }, (_, i) => `${year + 1}-${String(i + 1).padStart(2, '0')}-01`)
    ]

    // Same computation as the page, so the workbook matches the screen.
    const report = await computeBudgetVsActual({ departments: exportDepartments, year, environment: 'commercial' })

    // ── Plan overrides ──
    const planOverrides = Object.fromEntries(await Promise.all(exportDepartments.map(async (department) => {
      const [reportYear, forecastYear] = await Promise.all([
        fetchPlanOverrides(department, year),
        fetchPlanOverrides(department, year + 1),
      ])
      return [department, { ...reportYear, ...forecastYear }]
    }))) as Record<string, Record<string, number>>

    // YTD totals as the page shows them: plan overrides win over the computed
    // budget, months after the current one are excluded, and the difference
    // between the department total and its categories is folded into GDMS Cloud.
    const ytdCutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const deptResults = report.departments.map((dept) => {
      const overrides = planOverrides[dept.department] || {}
      const ytdMonths = dept.monthly.filter(m => m.month <= ytdCutoff)
      const budgetTotal = ytdMonths.reduce((sum, m) => sum + (overrides[m.month] ?? m.budget), 0)
      const actualTotal = ytdMonths.reduce((sum, m) => sum + m.actual, 0)
      const planAdjustment = budgetTotal - dept.categories.reduce((sum, c) => sum + c.ytdBudget, 0)
      const actualAdjustment = actualTotal - dept.categories.reduce((sum, c) => sum + c.ytdActual, 0)
      return {
        department: dept.department,
        budgetTotal: Math.round(budgetTotal),
        actualTotal: Math.round(actualTotal),
        monthly: dept.monthly.map(m => ({ month: m.month, budget: Math.round(m.budget), actual: Math.round(m.actual) })),
        categories: dept.categories.map(cat => {
          const isGdmsCloud = cat.name === 'GDMS Cloud'
          const ytdBudget = Math.round(cat.ytdBudget + (isGdmsCloud ? planAdjustment : 0))
          const ytdActual = Math.round(cat.ytdActual + (isGdmsCloud ? actualAdjustment : 0))
          return { name: cat.name, ytdBudget, ytdActual, ytdVariance: ytdActual - ytdBudget, note: cat.note }
        })
      }
    })

    // ── Build Excel workbook ──
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Ghost Dashboard'
    wb.created = new Date()

    const CURRENCY_FMT = '$#,##0'
    const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF6' } }
    const BORDER_BOTTOM: Partial<ExcelJS.Borders> = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } }
    const RED    = { argb: 'FFDC2626' }
    const GREEN  = { argb: 'FF059669' }
    const BLUE   = { argb: 'FF4E79A7' }
    const ORANGE = { argb: 'FFF28E2B' }

    const monthLabels = forecastMonths.map(m => {
      const mo = parseInt(m.split('-')[1])
      return `${MONTH_NAMES[mo - 1]}-${m.split('-')[0].slice(2)}`
    })

    // Track per-sheet chart metadata for post-processing with JSZip
    interface SheetChartMeta {
      sheetIndex: number        // 1-based sheet index in the workbook
      sheetName: string
      labelRow: number
      planRow: number
      actualRow: number
      cumPlanRow: number
      cumActualRow: number
      firstDataCol: number      // 1-based col index of first month
      lastDataCol: number
      chartAnchorRow: number    // 0-based row index where charts begin (after tables)
    }
    const sheetChartMetas: SheetChartMeta[] = []

    for (const dept of deptResults) {
      const ws = wb.addWorksheet(dept.department)
      const overrides = planOverrides[dept.department] || {}
      const planByMonthFn = (m: string) => overrides[m] ?? dept.monthly.find(x => x.month === m)?.budget ?? 0
      const actualByMonthFn = (m: string) => dept.monthly.find(x => x.month === m)?.actual ?? 0
      const lastActualIdx = [...allMonths].reverse().findIndex(m => actualByMonthFn(m) > 0)
      const lastActualMonth = lastActualIdx === -1 ? -1 : allMonths.length - 1 - lastActualIdx

      // Row 1: Title
      const titleRow = ws.addRow([`${dept.department} AWS Forecast Review — ${year}`])
      titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1F2937' } }
      titleRow.getCell(1).value = `${dept.department} AWS Forecast Review: ${year}-${year + 1}`

      // Reporting-year / forecast-year bands make the two periods unambiguous.
      const REPORTING_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF6' } }
      const FORECAST_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F3EC' } }
      const periodRow = ws.addRow(['', `${year} Reporting Year`, ...Array(11).fill(''), `${year + 1} Saved AWS Forecast`, ...Array(11).fill('')])
      ws.mergeCells(periodRow.number, 2, periodRow.number, 13)
      ws.mergeCells(periodRow.number, 14, periodRow.number, 25)
      for (const range of [[2, 13, REPORTING_FILL], [14, 25, FORECAST_FILL]] as const) {
        for (let column = range[0]; column <= range[1]; column++) {
          const cell = periodRow.getCell(column)
          cell.fill = range[2]
          cell.font = { bold: true, color: { argb: 'FF1F2937' } }
          cell.alignment = { horizontal: 'center' }
          cell.border = BORDER_BOTTOM
        }
      }

      // Row 3: month labels (label col + 24 month columns)
      const hdrRow = ws.addRow(['', ...monthLabels])
      const labelRowNum = hdrRow.number
      hdrRow.font = { bold: true }
      hdrRow.eachCell((cell, col) => {
        cell.fill = col >= 14 ? FORECAST_FILL : HEADER_FILL
        cell.alignment = { horizontal: col === 1 ? 'left' : 'right' }
        cell.border = BORDER_BOTTOM
      })

      const addMonthlyRow = (label: string, vals: (number | null)[], color?: ExcelJS.Color) => {
        const row = ws.addRow([label, ...vals])
        row.getCell(1).font = { bold: true, ...(color ? { color } : {}) }
        for (let c = 2; c <= vals.length + 1; c++) {
          const cell = row.getCell(c)
          if (cell.value !== null && cell.value !== undefined) cell.numFmt = CURRENCY_FMT
          cell.alignment = { horizontal: 'right' }
          if (c >= 14) cell.fill = FORECAST_FILL
          if (color) cell.font = { color }
        }
        return row
      }

      // Rows 4-5: plan + actual by month
      const planRow = addMonthlyRow('Plan / Forecast By Month', forecastMonths.map(m => planByMonthFn(m)), BLUE)
      const actualRow = addMonthlyRow('Actual By Month', forecastMonths.map((m, i) => i <= lastActualMonth ? actualByMonthFn(m) : null), ORANGE)

      // Row 6: empty
      ws.addRow([])

      // Rows 7-8: cumulative
      const cumPlanRow = addMonthlyRow('Plan / Forecast (Cumulative)', forecastMonths.map(() => null))
      const cumActualRow = addMonthlyRow('Actual (Cumulative)', forecastMonths.map(() => null))
      for (let c = 2; c <= forecastMonths.length + 1; c++) {
        const col = colLetter(c)
        cumPlanRow.getCell(c).value = { formula: c === 2 ? `${col}${planRow.number}` : `${col}${cumPlanRow.number - 1}+${col}${planRow.number}` }
        if (c - 2 <= lastActualMonth) cumActualRow.getCell(c).value = { formula: c === 2 ? `${col}${actualRow.number}` : `${col}${cumActualRow.number - 1}+${col}${actualRow.number}` }
      }

      // 16 empty rows so the two charts (15 rows tall each) don't cover YTD/detail sections
      const CHART_ROW_HEIGHT = 16
      for (let i = 0; i < CHART_ROW_HEIGHT; i++) ws.addRow([])

      // chartAnchorRow is 0-based for drawing XML. ExcelJS row numbers are 1-based,
      // so the row after cumActualRow in 0-based is cumActualRow.number (no -1 needed).
      const chartAnchorRow0 = cumActualRow.number
      sheetChartMetas.push({
        sheetIndex: wb.worksheets.length,  // after addWorksheet, length = this sheet's 1-based index
        sheetName: dept.department,
        labelRow: labelRowNum,
        planRow: planRow.number,
        actualRow: actualRow.number,
        cumPlanRow: cumPlanRow.number,
        cumActualRow: cumActualRow.number,
        firstDataCol: 2,
        lastDataCol: 1 + forecastMonths.length,
        chartAnchorRow: chartAnchorRow0,
      })

      // YTD Summary section (below chart space — charts float so rows continue)
      const ytdTitle = ws.addRow([`${year} YTD Summary`])
      ytdTitle.getCell(1).font = { bold: true, size: 11 }
      const ytdHdr = ws.addRow(['', '', '', 'YTD Plan', 'YTD Actual', 'YTD Variance', 'Notes'])
      ytdHdr.font = { bold: true }
      ytdHdr.fill = HEADER_FILL
      ytdHdr.eachCell(cell => { cell.border = BORDER_BOTTOM })
      ;[4, 5, 6].forEach(c => { ytdHdr.getCell(c).alignment = { horizontal: 'right' } })

      const addSummaryRow = (label: string, plan: number, actual: number, note = '', indent = false) => {
        const row = ws.addRow([indent ? `  ${label}` : label, '', '', plan, actual, actual - plan, note])
        row.getCell(1).font = { bold: !indent }
        ;[4, 5, 6].forEach(c => { row.getCell(c).numFmt = CURRENCY_FMT; row.getCell(c).alignment = { horizontal: 'right' } })
        row.getCell(6).font = { color: (actual - plan) > 0 ? RED : GREEN }
      }

      addSummaryRow(`Total IT ${dept.department} AWS`, dept.budgetTotal, dept.actualTotal)
      for (const cat of dept.categories) addSummaryRow(cat.name, cat.ytdBudget, cat.ytdActual, cat.note || '', true)
      ws.addRow([])
      ws.addRow([])

      ws.columns = [{ width: 34 }, ...Array(forecastMonths.length).fill({ width: 12 })]
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }]
      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
      ws.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
    }

    // ── Write base workbook to buffer, then inject charts via JSZip ──
    const baseBuffer = Buffer.from(await wb.xlsx.writeBuffer())
    const zip = await JSZip.loadAsync(baseBuffer)

    // Content types we'll need to add
    const contentTypesXml = await zip.file('[Content_Types].xml')!.async('string')
    let newContentTypes = contentTypesXml

    for (const meta of sheetChartMetas) {
      const sheetIdx = meta.sheetIndex
      const sheetPath = `xl/worksheets/sheet${sheetIdx}.xml`

      // Chart IDs are globally unique across the workbook; use sheet index to namespace them
      const barChartId  = sheetIdx * 10 + 1
      const lineChartId = sheetIdx * 10 + 2

      const barChartPath  = `xl/charts/chart${barChartId}.xml`
      const lineChartPath = `xl/charts/chart${lineChartId}.xml`
      const drawingPath   = `xl/drawings/drawing${sheetIdx}.xml`
      const drawingRelsPath = `xl/drawings/_rels/drawing${sheetIdx}.xml.rels`
      const sheetRelsPath   = `xl/worksheets/_rels/sheet${sheetIdx}.xml.rels`

      // Write chart XMLs
      zip.file(barChartPath, buildBarChartXml(
        meta.sheetName, meta.planRow, meta.actualRow,
        meta.firstDataCol, meta.lastDataCol, meta.labelRow
      ))
      zip.file(lineChartPath, buildLineChartXml(
        meta.sheetName, meta.cumPlanRow, meta.cumActualRow,
        meta.firstDataCol, meta.lastDataCol, meta.labelRow
      ))

      // Drawing relationships (chart rIds)
      const barRId  = `rId1`
      const lineRId = `rId2`
      const drawingRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${barRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${barChartId}.xml"/>
  <Relationship Id="${lineRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${lineChartId}.xml"/>
</Relationships>`
      zip.file(drawingRelsPath, drawingRels)

      // Drawing XML
      zip.file(drawingPath, buildDrawingXml(barRId, lineRId, meta.chartAnchorRow))

      // Patch sheet XML to reference the drawing
      let sheetXml = await zip.file(sheetPath)!.async('string')
      const drawingRel = `<drawing r:id="rIdDrawing${sheetIdx}"/>`
      // Insert before </worksheet>
      sheetXml = sheetXml.replace('</worksheet>', `${drawingRel}</worksheet>`)
      zip.file(sheetPath, sheetXml)

      // Sheet rels — add or patch
      const existingSheetRels = zip.file(sheetRelsPath)
      let sheetRelsXml = existingSheetRels
        ? await existingSheetRels.async('string')
        : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`

      const drawingRelEntry = `<Relationship Id="rIdDrawing${sheetIdx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${sheetIdx}.xml"/>`
      sheetRelsXml = sheetRelsXml.replace('</Relationships>', `${drawingRelEntry}</Relationships>`)
      zip.file(sheetRelsPath, sheetRelsXml)

      // Content types
      if (!newContentTypes.includes(`PartName="/xl/charts/chart${barChartId}.xml"`)) {
        newContentTypes = newContentTypes.replace(
          '</Types>',
          `<Override PartName="/xl/charts/chart${barChartId}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
          `<Override PartName="/xl/charts/chart${lineChartId}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
          `<Override PartName="/xl/drawings/drawing${sheetIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
          '</Types>'
        )
      }
    }

    zip.file('[Content_Types].xml', newContentTypes)

    const finalBuffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))

    setResponseHeaders(event, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${requestedDepartment || 'GDMS'}-AWS-Forecast-Review-${year}.xlsx"`,
      ['Content-' + 'Disposition']: `attachment; filename=${requestedDepartment || 'GDMS'}-AWS-Forecast-Review-${year}-${year + 1}.xlsx`,
      'Content-Length': String(finalBuffer.byteLength),
    })
    return send(event, finalBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

  } catch (err: any) {
    logger.error('[BudgetVsActualExport] Error:', { message: err?.message, stack: err?.stack })
    setResponseHeaders(event, { 'Content-Type': 'application/json' })
    return send(event, JSON.stringify({ error: err?.message || String(err), stack: err?.stack }), 'application/json')
  }
})
