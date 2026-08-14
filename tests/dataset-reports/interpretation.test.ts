import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDatasetInterpretationJson, validateDatasetInterpretationDraft } from '../../server/utils/dataset-report-interpreter'

const validDraft = {
  accountReferences: ['production'],
  config: {
    accounts: [],
    accountScope: 'selected',
    format: 'xlsx',
    enableAI: false,
    datasets: { securityHub: { enabled: true, filters: { severities: ['CRITICAL'], lookbackDays: 14 } } }
  },
  explanation: 'Critical production findings',
  warnings: []
}

test('accepts a strictly supported AI report draft', () => {
  assert.doesNotThrow(() => validateDatasetInterpretationDraft(validDraft))
})

test('rejects unknown AI fields and arbitrary SQL', () => {
  assert.throws(() => validateDatasetInterpretationDraft({ ...validDraft, config: { ...validDraft.config, sql: 'SELECT * FROM findings' } }), /Unsupported config fields/)
  assert.throws(() => validateDatasetInterpretationDraft({
    ...validDraft,
    config: { ...validDraft.config, datasets: { config: { enabled: true, filters: { resourceName: 'SELECT secret FROM table' } } } }
  }), /cannot contain SQL/)
})

test('rejects malformed model JSON', () => {
  assert.throws(() => parseDatasetInterpretationJson('```json\n{not json}\n```'), SyntaxError)
})
