import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertPipelineAccountId,
  assertPipelineJobId,
  authorEmailPredicate,
  clampIntParam,
  parsePipelineAthenaRows,
  timeWindowPredicate
} from '../../server/utils/athena-pipeline-queries'

test('account and job IDs are validated before they reach SQL', () => {
  assert.equal(assertPipelineAccountId('012345678901'), '012345678901')
  assert.throws(() => assertPipelineAccountId("123456789012' OR '1'='1"), /12-digit/)
  assert.throws(() => assertPipelineAccountId('12345'), /12-digit/)
  assert.equal(assertPipelineJobId('998877'), '998877')
  assert.throws(() => assertPipelineJobId('1; DROP'), /digits/)
})

test('numeric query params fall back instead of producing NaN', () => {
  assert.equal(clampIntParam(undefined, 30, 1, 90), 30)
  assert.equal(clampIntParam('abc', 30, 1, 90), 30)
  assert.equal(clampIntParam('500', 30, 1, 90), 90)
  assert.equal(clampIntParam('-4', 30, 1, 90), 1)
  assert.equal(clampIntParam('7', 30, 1, 90), 7)
})

test('time window trims rows to the requested days, not just the month partition', () => {
  const sql = timeWindowPredicate(7, 'timestamp_start')
  assert.match(sql, /CONCAT\(year, LPAD\(month, 2, '0'\)\) >= date_format\(date_add\('day', -7, current_date\), '%Y%m'\)/)
  assert.match(sql, /from_iso8601_timestamp\(CAST\(timestamp_start AS varchar\)\)/)
  assert.match(sql, />= date_add\('day', -7, current_timestamp\)/)
  assert.match(timeWindowPredicate(30, 'timestamp', 'e'), /CONCAT\(e\.year, LPAD\(e\.month/)
})

test('author predicate matches one author exactly and escapes quotes', () => {
  const sql = authorEmailPredicate('Bob@Example.com')
  assert.equal(sql, "(LOWER(TRIM(commit_author)) = 'bob@example.com' OR strpos(LOWER(commit_author), '<bob@example.com>') > 0)")
  assert.doesNotMatch(authorEmailPredicate("x') OR 1=1 --"), /[^']'\) OR 1=1/)
  assert.ok(!authorEmailPredicate('a%b_c@x.com').includes('LIKE'))
})

test('Athena rows are typed from column metadata', () => {
  const rows = parsePipelineAthenaRows(
    [{ Data: [{ VarCharValue: '012345678901' }, { VarCharValue: 'true' }, { VarCharValue: '42' }, { VarCharValue: '[a, b]' }, {}] }],
    [
      { Name: 'account_id', Type: 'varchar' },
      { Name: 'applied', Type: 'boolean' },
      { Name: 'total', Type: 'bigint' },
      { Name: 'accounts_processed', Type: 'array' },
      { Name: 'applied_at', Type: 'varchar' }
    ] as any
  )
  assert.deepEqual(rows, [{
    account_id: '012345678901',
    applied: true,
    total: 42,
    accounts_processed: ['a', 'b'],
    applied_at: null
  }])
})
