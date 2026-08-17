import assert from 'node:assert/strict'
import test from 'node:test'
import { renderGhostOutput } from '../../server/mcp/output-format'

test('renders flat values as CSV with spreadsheet formula protection', () => {
  const result = renderGhostOutput([{ account: 'alpha', amount: 12 }, { account: '=danger', amount: 3 }], 'csv')
  assert.equal(result.mimeType, 'text/csv')
  assert.equal(result.content, "account,amount\nalpha,12\n'=danger,3")
})

test('renders nested values as a Markdown table', () => {
  const result = renderGhostOutput([{ account: { id: '123' }, roles: ['ReadOnly'] }], 'markdown')
  assert.match(result.content, /account\.id/)
  assert.match(result.content, /123/)
  assert.match(result.content, /ReadOnly/)
})
