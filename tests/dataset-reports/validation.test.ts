import assert from 'node:assert/strict'
import test from 'node:test'
import { getDatasetReportConfigErrors, getScheduleErrors } from '../../server/utils/dataset-report-validation'

test('accepts a valid dataset report configuration', () => {
  assert.deepEqual(getDatasetReportConfigErrors({
    accounts: ['123456789012'],
    format: 'xlsx',
    datasets: { config: { enabled: true, filters: {} } }
  }), [])
})

test('rejects missing datasets and unsupported formats', () => {
  const errors = getDatasetReportConfigErrors({ accounts: [], format: 'html', datasets: {} })
  assert.ok(errors.includes('Format must be pdf, xlsx, csv, or json'))
  assert.ok(errors.includes('At least one dataset must be selected'))
})

test('rejects malformed account IDs', () => {
  assert.ok(getDatasetReportConfigErrors({
    accounts: ['not-an-account'],
    format: 'json',
    datasets: { cloudtrail: { enabled: true } }
  }).some(error => error.startsWith('Accounts must')))
})

test('validates schedule-specific fields', () => {
  assert.deepEqual(getScheduleErrors({
    frequency: 'weekly',
    dayOfWeek: 1,
    time: '09:30',
    timezone: 'America/New_York'
  }), [])
  assert.ok(getScheduleErrors({
    frequency: 'weekly',
    dayOfWeek: 9,
    time: '25:00',
    timezone: ''
  }).length >= 3)
})
