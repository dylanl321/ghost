import assert from 'node:assert/strict'
import test from 'node:test'
import { inflateSync } from 'node:zlib'
import { insightPrompts } from '../../server/utils/ai-insight-prompts'
import type { DataExportConfig } from '../../shared/types/export'

const config: DataExportConfig = {
  title: 'Cost Analysis',
  metadata: {},
  sheets: [
    { name: 'Summary', type: 'summary', data: [
      { accountName: 'Production', cost: 300, budget: 400 },
      { accountName: 'Development', cost: 100, budget: 200 }
    ] },
    { name: 'Services', type: 'table', columns: [{ key: 'serviceName', header: 'Service' }, { key: 'cost', header: 'Cost' }], data: [{ serviceName: 'EC2', cost: 400 }] }
  ]
}

test('PDF analysis retains the report prompt and its larger output budget', () => {
  const report = insightPrompts['cost-report-analysis']!
  assert.equal(report.maxTokens, 500)
  assert.equal(insightPrompts['cost-summary']!.maxTokens ?? 120, 120)
  const prompt = report.buildPrompt({ totalCost: 400, totalBudget: 600, topAccounts: [{ name: 'Production', cost: 300 }], topServices: [{ name: 'EC2', cost: 400 }] })
  assert.match(prompt, /Total Spend: \$400/)
  assert.match(prompt, /Total Budget: \$600/)
  assert.match(prompt, /Production: \$300/)
  assert.match(prompt, /EC2: \$400/)
  assert.match(prompt, /Write 3-4 concise paragraphs/)
  assert.match(prompt, /not recommendations/)
})

test('PDF export consumes data.insight and survives insight generation failures', async () => {
  const globals = globalThis as any
  const originalFetch = globals.$fetch
  const originalLogger = globals.createLogger
  globals.createLogger = () => ({ error() {}, info() {}, warn() {}, debug() {} })
  try {
    const { exportToPDF } = await import('../../app/utils/export/pdf-writer.client')
    let calls = 0
    globals.$fetch = async (url: string, options: any) => {
      calls++
      assert.equal(url, '/api/ai/insights')
      assert.equal(options.body.type, 'cost-report-analysis')
      assert.equal(options.body.context.totalCost, 400)
      assert.equal(options.body.context.totalBudget, 600)
      assert.equal(options.body.context.topServices[0].name, 'EC2')
      return { success: true, data: { insight: 'Production drives most of the spend.' } }
    }
    const successful = await exportToPDF(config)
    assert.equal(successful.success, true)
    assert.ok(successful.blob)
    const pdf = Buffer.from(await successful.blob.arrayBuffer()).toString('latin1')
    const content = [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
      .map(match => inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1'))
      .join('\n')
    assert.match(content, /Production drives most/)
    globals.$fetch = async () => { throw new Error('Bedrock unavailable') }
    const fallback = await exportToPDF(config)
    assert.equal(fallback.success, true)
    assert.ok(fallback.blob)
    assert.match(Buffer.from(await fallback.blob.arrayBuffer()).toString('latin1'), /^%PDF/)
    assert.equal(calls, 1)
  } finally {
    globals.$fetch = originalFetch
    globals.createLogger = originalLogger
  }
})
