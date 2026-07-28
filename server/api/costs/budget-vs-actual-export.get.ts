/**
 * GET /api/costs/budget-vs-actual-export
 *
 * Generates an Excel workbook (.xlsx) with one sheet per department.
 * Each sheet: monthly summary table, YTD summary, account detail, plus
 * two native OOXML charts (bar + line) injected via JSZip.
 *
 * Query params:
 *   year: number (default: current year)
 */

import { defineEventHandler, getQuery, setResponseHeaders, send } from 'h3'
import { requirePermission } from '../../utils/user-roles'
import { getItem } from '../../utils/dynamodb'
import { getDynamoDBConfig } from '../../lib/dynamodb-config'
import { getCostAndUsage, getProformaCosts } from '../../utils/cost-explorer'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { queryDevOrgChargesByMonth } from '../../utils/dev-org-charges'
import { logger } from '../../utils/logger'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

const ALLOWED_DEPARTMENTS = ['DE158', 'DT509'] as const
type AllowedDepartment = typeof ALLOWED_DEPARTMENTS[number]

const PAYER_ACCOUNT_ID    = process.env.AWS_MASTER_ACCOUNT_ID    || '205950196477'
const PROFORMA_ACCOUNT_ID = process.env.AWS_PROFORMA_ACCOUNT_ID  || '253821132832'
const DEV_ORG_ACCOUNT_ID  = process.env.AWS_DEV_ORG_ACCOUNT_ID   || '266632029214'
const LAS_APNT_CLD_IDS    = ['767397758347', '105013955011']

const DEPT_NAMED_CATEGORIES: Record<AllowedDepartment, { name: string; note?: string }[]> = {
  DE158: [
    { name: 'External Access VPC',               note: 'proportional to network traffic levels' },
    { name: 'DevSecOps - Engineering Solutions',  note: 'proportional to engineering GitLab usage' },
  ],
  DT509: [
    { name: 'Software Engineering Solutions' },
    { name: 'GDMS ITS SOC' },
  ]
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function indexByAccountMonth(resultsByTime: any[] | undefined): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  if (!resultsByTime) return out
  for (const period of resultsByTime) {
    const month = period.TimePeriod?.End || period.TimePeriod?.Start || ''
    if (!month) continue
    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      if (!accountId) continue
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      if (!out.has(accountId)) out.set(accountId, new Map())
      out.get(accountId)!.set(month, (out.get(accountId)!.get(month) || 0) + cost)
    }
  }
  return out
}

function accountDepartment(acc: any): string {
  return (acc.pepDepartment || acc.departmentNumber || acc.department || '').trim()
}

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

    const startDate = `${year - 1}-12-01`
    const now = new Date()
    const endMonthNum = now.getMonth() + 2
    const endYear = endMonthNum > 12 ? now.getFullYear() + 1 : now.getFullYear()
    const endDate = `${endYear}-${String(endMonthNum > 12 ? 1 : endMonthNum).padStart(2, '0')}-01`

    const allMonths: string[] = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}-01`
    )
    const yearMonthMin = allMonths[0]
    const yearMonthMax = allMonths[11]

    // ── Fetch accounts ──
    const accounts = await getAllAccountsUnified()
    const deptAccounts = new Map<AllowedDepartment, string[]>()
    for (const dept of ALLOWED_DEPARTMENTS) deptAccounts.set(dept, [])
    for (const acc of accounts) {
      const dept = accountDepartment(acc)
      if (!ALLOWED_DEPARTMENTS.includes(dept as AllowedDepartment)) continue
      const id = acc.accountId || acc.id
      if (!id || LAS_APNT_CLD_IDS.includes(id)) continue
      deptAccounts.get(dept as AllowedDepartment)!.push(id)
    }

    // ── Fetch proforma (budget) + billable (actual) grouped by linked account ──
    const proformaResult = await getProformaCosts({
      startDate,
      endDate,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost'],
      groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
    })

    const budgetByAcct = indexByAccountMonth(proformaResult.proforma?.costs?.resultsByTime)
    const actualByAcct = indexByAccountMonth(proformaResult.billable?.costs?.resultsByTime)

    const payerBudgetFromProforma = budgetByAcct.get(PAYER_ACCOUNT_ID)
    budgetByAcct.delete(PAYER_ACCOUNT_ID)
    budgetByAcct.delete(DEV_ORG_ACCOUNT_ID)
    actualByAcct.delete(PAYER_ACCOUNT_ID)
    actualByAcct.delete(DEV_ORG_ACCOUNT_ID)
    for (const id of LAS_APNT_CLD_IDS) { budgetByAcct.delete(id); actualByAcct.delete(id) }

    // ── GDMS Cloud actuals + DevOrg ──
    const ceParams = { startDate, endDate, granularity: 'MONTHLY' as const, metrics: ['UnblendedCost'] }
    const [masterBillable, proformaOrgTotals, devOrgResult] = await Promise.all([
      getCostAndUsage(ceParams, 'commercial', PAYER_ACCOUNT_ID),
      getCostAndUsage(ceParams, 'commercial', PROFORMA_ACCOUNT_ID),
      queryDevOrgChargesByMonth(year).catch(err => {
        logger.warn('[BudgetVsActualExport] DevOrg failed:', err)
        return { byMonth: new Map<string, number>(), byAccountMonth: new Map(), accountNames: new Map() }
      })
    ])

    const billableByMonth = new Map<string, number>()
    for (const period of masterBillable.resultsByTime || []) {
      const month = period.TimePeriod?.End || period.TimePeriod?.Start || ''
      if (month) billableByMonth.set(month, parseFloat(period.Total?.UnblendedCost?.Amount || '0'))
    }
    const proformaOrgByMonth = new Map<string, number>()
    for (const period of proformaOrgTotals.resultsByTime || []) {
      const month = period.TimePeriod?.End || period.TimePeriod?.Start || ''
      if (month) proformaOrgByMonth.set(month, parseFloat(period.Total?.UnblendedCost?.Amount || '0'))
    }

    const payerActualByMonth = new Map<string, number>()
    const payerBudgetByMonth = new Map<string, number>()
    for (const month of allMonths) {
      const gdmsCloud = (billableByMonth.get(month) ?? 0) - (proformaOrgByMonth.get(month) ?? 0)
      if (gdmsCloud > 0) payerActualByMonth.set(month, gdmsCloud)
    }
    for (const [m, c] of payerBudgetFromProforma || []) payerBudgetByMonth.set(m, c)

    const devOrgBudgetByMonth = new Map<string, number>()
    for (const [m, c] of budgetByAcct.get(DEV_ORG_ACCOUNT_ID) || []) devOrgBudgetByMonth.set(m, c)

    const resolvedDevOrgActual = [...devOrgResult.byMonth.entries()]
      .filter(([m]) => m >= yearMonthMin && m <= yearMonthMax)
      .reduce((s, [, v]) => s + v, 0)
    const payerBudgetTotal = [...payerBudgetByMonth.entries()].filter(([m]) => m >= yearMonthMin && m <= yearMonthMax).reduce((s, [, v]) => s + v, 0)
    const payerActualTotal = [...payerActualByMonth.entries()].filter(([m]) => m >= yearMonthMin && m <= yearMonthMax).reduce((s, [, v]) => s + v, 0)

    // ── Plan overrides ──
    const [planOverridesDE158, planOverridesDT509] = await Promise.all([
      fetchPlanOverrides('DE158', year),
      fetchPlanOverrides('DT509', year),
    ])
    const planOverrides: Record<string, Record<string, number>> = {
      DE158: planOverridesDE158,
      DT509: planOverridesDT509,
    }

    // ── Build department results ──
    interface MonthlyPoint { month: string; budget: number; actual: number }
    interface AccountRow { accountId: string; name: string; ytdBudget: number; ytdActual: number; ytdVariance: number; monthlyActuals: Record<string, number> }
    interface CategoryRow { name: string; ytdBudget: number; ytdActual: number; ytdVariance: number; note?: string; accounts: AccountRow[] }
    interface DeptResult { department: string; budgetTotal: number; actualTotal: number; monthly: MonthlyPoint[]; categories: CategoryRow[] }

    const deptResults: DeptResult[] = []

    for (const dept of ALLOWED_DEPARTMENTS) {
      const monthMap = new Map<string, { budget: number; actual: number }>()
      for (const m of allMonths) monthMap.set(m, { budget: 0, actual: 0 })
      const ensure = (m: string) => { if (!monthMap.has(m)) monthMap.set(m, { budget: 0, actual: 0 }); return monthMap.get(m)! }

      const accountTotals = new Map<string, { budget: number; actual: number }>()
      const accountMonthlyActuals = new Map<string, Map<string, number>>()

      for (const accountId of deptAccounts.get(dept)!) {
        let acctBudget = 0, acctActual = 0
        for (const [m, c] of budgetByAcct.get(accountId) || []) { ensure(m).budget += c; if (m >= yearMonthMin && m <= yearMonthMax) acctBudget += c }
        for (const [m, c] of actualByAcct.get(accountId) || []) { ensure(m).actual += c; if (m >= yearMonthMin && m <= yearMonthMax) acctActual += c }
        accountTotals.set(accountId, { budget: acctBudget, actual: acctActual })
        const monthly = new Map<string, number>()
        for (const m of allMonths) monthly.set(m, actualByAcct.get(accountId)?.get(m) ?? 0)
        accountMonthlyActuals.set(accountId, monthly)
      }

      if (dept === 'DE158') {
        for (const [m, c] of payerActualByMonth) ensure(m).actual += c
        for (const [m, c] of payerBudgetByMonth) ensure(m).budget += c
        for (const [m, c] of devOrgResult.byMonth) ensure(m).actual += c
        for (const [m, c] of devOrgBudgetByMonth) ensure(m).budget += c
      }

      const monthly: MonthlyPoint[] = allMonths.map(m => {
        const pt = monthMap.get(m)!
        return { month: m, budget: Math.round(pt.budget), actual: Math.round(pt.actual) }
      })

      const overrides = planOverrides[dept] || {}
      const planByMonth = (m: string) => overrides[m] ?? monthly.find(x => x.month === m)?.budget ?? 0
      const budgetTotal = allMonths.filter(m => m >= yearMonthMin && m <= yearMonthMax).reduce((s, m) => s + planByMonth(m), 0)
      const actualTotal = monthly.filter(x => x.month >= yearMonthMin && x.month <= yearMonthMax).reduce((s, x) => s + x.actual, 0)

      const acctList = accounts.filter(a => { const id = a.accountId || a.id; return id && deptAccounts.get(dept)!.includes(id) && !LAS_APNT_CLD_IDS.includes(id) })
      const categories: CategoryRow[] = []

      for (const def of DEPT_NAMED_CATEGORIES[dept]) {
        const catAccounts: AccountRow[] = []
        for (const acc of acctList) {
          const id = acc.accountId || acc.id
          const name = acc.projectName || acc.name || ''
          if (!name.toLowerCase().includes(def.name.toLowerCase())) continue
          const totals = accountTotals.get(id) || { budget: 0, actual: 0 }
          const monthlyActuals: Record<string, number> = {}
          for (const m of allMonths) monthlyActuals[m] = accountMonthlyActuals.get(id)?.get(m) ?? 0
          catAccounts.push({ accountId: id, name, ytdBudget: Math.round(totals.budget), ytdActual: Math.round(totals.actual), ytdVariance: Math.round(totals.actual - totals.budget), monthlyActuals })
        }
        const ytdBudget = catAccounts.reduce((s, a) => s + a.ytdBudget, 0)
        const ytdActual = catAccounts.reduce((s, a) => s + a.ytdActual, 0)
        categories.push({ name: def.name, ytdBudget, ytdActual, ytdVariance: ytdActual - ytdBudget, note: def.note, accounts: catAccounts })
      }

      if (dept === 'DE158') {
        const payerMonthly: Record<string, number> = {}
        for (const m of allMonths) payerMonthly[m] = Math.round(payerActualByMonth.get(m) ?? 0)
        categories.push({ name: 'GDMS Cloud', ytdBudget: Math.round(payerBudgetTotal), ytdActual: Math.round(payerActualTotal), ytdVariance: Math.round(payerActualTotal - payerBudgetTotal), accounts: [{ accountId: PAYER_ACCOUNT_ID, name: 'GDMS Cloud', ytdBudget: Math.round(payerBudgetTotal), ytdActual: Math.round(payerActualTotal), ytdVariance: Math.round(payerActualTotal - payerBudgetTotal), monthlyActuals: payerMonthly }] })
        const devBudgetTotal = [...devOrgBudgetByMonth.entries()].filter(([m]) => m >= yearMonthMin && m <= yearMonthMax).reduce((s, [, v]) => s + v, 0)
        const devMonthly: Record<string, number> = {}
        for (const m of allMonths) devMonthly[m] = Math.round(devOrgResult.byMonth.get(m) ?? 0)
        categories.push({ name: 'GDMS-DevOrg', ytdBudget: Math.round(devBudgetTotal), ytdActual: Math.round(resolvedDevOrgActual), ytdVariance: Math.round(resolvedDevOrgActual - devBudgetTotal), accounts: [{ accountId: DEV_ORG_ACCOUNT_ID, name: 'GDMS-DevOrg', ytdBudget: Math.round(devBudgetTotal), ytdActual: Math.round(resolvedDevOrgActual), ytdVariance: Math.round(resolvedDevOrgActual - devBudgetTotal), monthlyActuals: devMonthly }] })
      }

      deptResults.push({ department: dept, budgetTotal: Math.round(budgetTotal), actualTotal: Math.round(actualTotal), monthly, categories })
    }

    // ── Build Excel workbook ──
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Ghost Dashboard'
    wb.created = new Date()

    const CURRENCY_FMT = '$#,##0'
    const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF6' } }
    const SECTION_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    const BORDER_BOTTOM: Partial<ExcelJS.Borders> = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } }
    const RED    = { argb: 'FFDC2626' }
    const GREEN  = { argb: 'FF059669' }
    const BLUE   = { argb: 'FF4E79A7' }
    const ORANGE = { argb: 'FFF28E2B' }

    const monthLabels = allMonths.map(m => {
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
      const titleRow = ws.addRow([`${dept.department} — IT AWS Cost Tracking ${year}`])
      titleRow.getCell(1).font = { bold: true, size: 13 }

      // Row 2: empty
      ws.addRow([])

      // Row 3: header (label col + 12 month cols)
      const hdrRow = ws.addRow(['', ...monthLabels])
      const labelRowNum = hdrRow.number
      hdrRow.font = { bold: true }
      hdrRow.fill = HEADER_FILL
      hdrRow.eachCell((cell, col) => { cell.alignment = { horizontal: col === 1 ? 'left' : 'right' }; cell.border = BORDER_BOTTOM })

      const addMonthlyRow = (label: string, vals: (number | null)[], color?: ExcelJS.Color) => {
        const row = ws.addRow([label, ...vals])
        row.getCell(1).font = { bold: true, ...(color ? { color } : {}) }
        for (let c = 2; c <= vals.length + 1; c++) {
          const cell = row.getCell(c)
          if (cell.value !== null && cell.value !== undefined) cell.numFmt = CURRENCY_FMT
          cell.alignment = { horizontal: 'right' }
          if (color) cell.font = { color }
        }
        return row
      }

      // Rows 4-5: plan + actual by month
      const planRow = addMonthlyRow('Plan By Month', allMonths.map(m => planByMonthFn(m)), BLUE)
      const actualRow = addMonthlyRow('Actual By Month', allMonths.map((m, i) => i <= lastActualMonth ? actualByMonthFn(m) : null), ORANGE)

      // Row 6: empty
      ws.addRow([])

      // Rows 7-8: cumulative
      let runPlan = 0
      const cumPlanRow = addMonthlyRow('Plan (Cumulative)', allMonths.map(m => { runPlan += planByMonthFn(m); return runPlan }))
      let runActual = 0
      const cumActualRow = addMonthlyRow('Actual (Cumulative)', allMonths.map((m, i) => { if (i > lastActualMonth) return null; runActual += actualByMonthFn(m); return runActual }))

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
        lastDataCol: 1 + allMonths.length,
        chartAnchorRow: chartAnchorRow0,
      })

      // YTD Summary section (below chart space — charts float so rows continue)
      const ytdTitle = ws.addRow(['YTD Summary'])
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

      // Account detail section
      const detailTitle = ws.addRow(['Account Detail'])
      detailTitle.getCell(1).font = { bold: true, size: 11 }
      const detailHdr = ws.addRow(['Category', 'Account ID', 'Account Name', 'YTD Plan', 'YTD Actual', 'YTD Variance', ...monthLabels])
      detailHdr.font = { bold: true }
      detailHdr.fill = HEADER_FILL
      detailHdr.eachCell(cell => { cell.border = BORDER_BOTTOM })
      ;[4, 5, 6].forEach(c => { detailHdr.getCell(c).alignment = { horizontal: 'right' } })

      for (const cat of dept.categories) {
        const catRow = ws.addRow([cat.name, '', '', cat.ytdBudget, cat.ytdActual, cat.ytdVariance, ...allMonths.map(() => '')])
        catRow.font = { bold: true }
        catRow.fill = SECTION_FILL
        ;[4, 5, 6].forEach(c => { catRow.getCell(c).numFmt = CURRENCY_FMT; catRow.getCell(c).alignment = { horizontal: 'right' } })
        catRow.getCell(6).font = { bold: true, color: cat.ytdVariance > 0 ? RED : GREEN }
        for (const acct of cat.accounts || []) {
          const acctRow = ws.addRow([cat.name, acct.accountId, acct.name, acct.ytdBudget, acct.ytdActual, acct.ytdVariance,
            ...allMonths.map(m => acct.monthlyActuals[m] || null)])
          ;[4, 5, 6].forEach(c => { acctRow.getCell(c).numFmt = CURRENCY_FMT; acctRow.getCell(c).alignment = { horizontal: 'right' } })
          for (let c = 7; c <= 6 + allMonths.length; c++) { acctRow.getCell(c).numFmt = CURRENCY_FMT; acctRow.getCell(c).alignment = { horizontal: 'right' } }
        }
      }

      ws.columns = [
        { width: 32 }, { width: 16 }, { width: 34 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 36 },
        ...Array(allMonths.length).fill({ width: 12 })
      ]
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
      'Content-Disposition': `attachment; filename="IT-AWS-Cost-Tracking-${year}.xlsx"`,
      'Content-Length': String(finalBuffer.byteLength),
    })
    return send(event, finalBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

  } catch (err: any) {
    logger.error('[BudgetVsActualExport] Error:', { message: err?.message, stack: err?.stack })
    setResponseHeaders(event, { 'Content-Type': 'application/json' })
    return send(event, JSON.stringify({ error: err?.message || String(err), stack: err?.stack }), 'application/json')
  }
})
