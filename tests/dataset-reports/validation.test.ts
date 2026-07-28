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

test('supports explicit all and selected account scope while preserving legacy behavior', () => {
  const base = { format: 'json', datasets: { config: { enabled: true } } }
  assert.deepEqual(getDatasetReportConfigErrors({ ...base, accounts: [] }), [])
  assert.deepEqual(getDatasetReportConfigErrors({ ...base, accounts: [], accountScope: 'all' }), [])
  assert.ok(getDatasetReportConfigErrors({ ...base, accounts: [], accountScope: 'selected' }).includes(
    'At least one account must be selected when account scope is selected'
  ))
  assert.deepEqual(getDatasetReportConfigErrors({ ...base, accounts: ['123456789012'], accountScope: 'selected' }), [])
})

test('validates dataset filters and absolute date ranges', () => {
  const errors = getDatasetReportConfigErrors({
    accounts: [],
    accountScope: 'all',
    format: 'xlsx',
    datasets: {
      securityHub: { enabled: true, filters: { severities: ['URGENT'], lookbackDays: 0 } },
      cloudtrail: { enabled: true, filters: { startTime: '2026-02-02', endTime: '2026-01-01' } }
    }
  })
  assert.ok(errors.some(error => error.includes('securityHub.severities')))
  assert.ok(errors.some(error => error.includes('securityHub.lookbackDays')))
  assert.ok(errors.includes('cloudtrail start time must be before end time'))
})

test('rejects unknown report and filter fields', () => {
  const errors = getDatasetReportConfigErrors({
    accounts: [], format: 'json', arbitrarySql: 'SELECT *',
    datasets: { config: { enabled: true, filters: { arbitrary: true, quickFilters: { mystery: true } } } }
  })
  assert.ok(errors.some(error => error.startsWith('Unsupported report fields')))
  assert.ok(errors.some(error => error.startsWith('Unsupported config filters')))
  assert.ok(errors.some(error => error.startsWith('Unsupported config quick filters')))
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
