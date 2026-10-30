import assert from 'node:assert/strict'
import test from 'node:test'
import {
  STORED_QUERIES,
  buildSQL,
  isAwsAccountId,
  validateParameters
} from '../../server/utils/security-lake-consolidated'

const accountFilteredQuery = STORED_QUERIES.find(query =>
  query.parameters.some(parameter => parameter.name === 'accountIds')
)!

const window = { startTime: '2026-10-01T00:00:00Z', endTime: '2026-10-02T00:00:00Z' }

test('account ids must be bare 12-digit strings', () => {
  assert.equal(isAwsAccountId('123456789012'), true)
  assert.equal(isAwsAccountId('12345678901'), false)
  assert.equal(isAwsAccountId("123456789012') OR 1=1 --"), false)
  assert.equal(isAwsAccountId(123456789012), false)
})

test('parameter validation rejects SQL in accountIds', () => {
  assert.ok(accountFilteredQuery, 'expected a stored query that filters by account')
  assert.deepEqual(
    validateParameters(accountFilteredQuery, { ...window, accountIds: ['123456789012'] }),
    { valid: true }
  )
  const rejected = validateParameters(accountFilteredQuery, {
    ...window,
    accountIds: ["x') OR 1=1 --"]
  })
  assert.equal(rejected.valid, false)
})

test('buildSQL never interpolates an unvalidated account id', () => {
  const sql = buildSQL(accountFilteredQuery, { ...window, accountIds: ['123456789012', '210987654321'] }, 'govcloud')
  assert.match(sql, /accountid IN \('123456789012', '210987654321'\)/)

  assert.throws(() => buildSQL(
    accountFilteredQuery,
    { ...window, accountIds: ["x') OR 1=1 --"] },
    'govcloud'
  ))
})

test('buildSQL clamps LIMIT to a bounded integer', () => {
  assert.match(buildSQL(accountFilteredQuery, { ...window, limit: 25 }, 'govcloud'), /LIMIT 25$/)
  assert.match(buildSQL(accountFilteredQuery, { ...window, limit: 10_000_000 }, 'govcloud'), /LIMIT 10000$/)
  assert.match(buildSQL(accountFilteredQuery, { ...window, limit: 0.5 }, 'govcloud'), /LIMIT 1$/)
})
