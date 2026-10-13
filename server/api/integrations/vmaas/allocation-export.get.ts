import ExcelJS from 'exceljs'
import { defineEventHandler, getQuery, setHeader } from 'h3'
import { getVmaasCostReport } from '../../../utils/vmaas-costs'

const columns = [
  'Department', 'CostCenter', 'Team', 'TenantID', 'Project', 'Owner',
  'Cost Managers', 'Billable Direct USD', 'Allocation Share', 'Allocated Pro Forma USD'
]

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const month = String(query.month || '') || undefined
  const format = String(query.format || 'xlsx').toLowerCase()
  if (!['csv', 'xlsx'].includes(format)) throw createError({ statusCode: 400, statusMessage: 'format must be csv or xlsx' })
  const report = await getVmaasCostReport(month)
  if (report.allocation.status !== 'available' || !report.allocation.reconciled) {
    throw createError({ statusCode: 409, statusMessage: 'selected VMaaS allocation is not finalized and reconciled' })
  }
  const rows = report.allocation.rows.map(row => [
    row.department, row.cost_center, row.team_id, row.tenant_id, row.project, row.owner,
    row.cost_manager_emails.join('; '), row.billable_direct_usd, row.allocation_share,
    row.allocated_proforma_usd
  ])
  const label = report.allocation.month.start.slice(0, 7)
  if (format === 'csv') {
    const body = [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="vmaas-allocated-usage-${label}.csv"`)
    return body
  }

  const workbook = new ExcelJS.Workbook()
  const usage = workbook.addWorksheet('Tenant usage')
  usage.addRow(columns)
  rows.forEach(row => usage.addRow(row))
  usage.getRow(1).font = { bold: true }
  usage.columns.forEach(column => { column.width = 22 })
  const reconciliation = workbook.addWorksheet('Reconciliation')
  reconciliation.addRows([
    ['Metric', 'USD'],
    ['Pro forma account total', report.allocation.proforma_total_usd],
    ['Allocated tenant direct usage', report.allocation.allocated_direct_usd],
    ['GDMS IT shared/unallocated residual', report.allocation.shared_residual_usd],
    ['Reconciled', report.allocation.reconciled ? 'Yes' : 'No']
  ])
  reconciliation.getRow(1).font = { bold: true }
  reconciliation.columns = [{ width: 38 }, { width: 18 }]
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="vmaas-allocated-usage-${label}.xlsx"`)
  setHeader(event, 'Content-Length', String(buffer.length))
  return buffer
})
