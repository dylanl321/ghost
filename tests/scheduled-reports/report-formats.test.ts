import assert from 'node:assert/strict'
import test from 'node:test'
import type { DataExportConfig } from '#shared/types/export'
import { buildCombinedCSV } from '../../shared/utils/export/csv-content'
import { buildJSONExport, generateFilename } from '../../shared/utils/export/format'
import { buildXlsxBuffer } from '../../shared/utils/export/xlsx-workbook'
import * as XLSX from 'xlsx'

const config: DataExportConfig = {
  title: 'AWS Cost Report',
  metadata: { timeframe: 'This Month' },
  options: { includeMetadata: false },
  sheets: [
    {
      name: 'Accounts',
      type: 'table',
      data: [{ name: 'Prod, East', cost: 1234.5 }, { name: 'Dev "sandbox"', cost: 7 }],
      columns: [
        { key: 'name', header: 'Account' },
        { key: 'cost', header: 'Cost', format: 'currency' }
      ]
    },
    { name: 'Services', type: 'table', data: [{ service: 'EC2' }] }
  ]
}

test('scheduled CSV reports are real CSV with every sheet', () => {
  const lines = buildCombinedCSV(config).split('\n')
  assert.ok(lines.includes('Account,Cost'))
  assert.ok(lines.some(line => line.startsWith('"Prod, East",')))
  assert.ok(lines.some(line => line.startsWith('"Dev ""sandbox""",')))
  assert.ok(lines.includes('# Sheet: Services'))
  assert.ok(lines.includes('EC2'))
})

test('scheduled JSON reports parse and keep the sheet data', () => {
  const parsed = JSON.parse(buildJSONExport(config))
  assert.equal(parsed.title, 'AWS Cost Report')
  assert.equal(parsed.sheets.length, 2)
  assert.equal(parsed.sheets[0].data[0].cost, 1234.5)
})

test('scheduled XLSX reports open as workbooks with every sheet', () => {
  const workbook = XLSX.read(Buffer.from(buildXlsxBuffer(config)), { type: 'buffer' })
  assert.deepEqual(workbook.SheetNames, ['Accounts', 'Services'])
  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Accounts!, { header: 1 })
  assert.deepEqual(rows[0], ['Account', 'Cost'])
  assert.equal(rows[1]![0], 'Prod, East')
})

test('report filenames carry the requested extension', () => {
  assert.match(generateFilename('AWS Cost Report', 'xlsx'), /^aws-cost-report-\d{4}-\d{2}-\d{2}T[\d-]+\.xlsx$/)
})
