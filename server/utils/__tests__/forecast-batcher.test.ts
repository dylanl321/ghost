import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { batchForecastCalls, isNonRetryableForecastError } from '../forecast-batcher'

const request = {
  accountId: '123456789012',
  startDate: '2026-08-01',
  endDate: '2026-09-01',
  metric: 'UNBLENDED_COST',
  granularity: 'DAILY' as const,
  proforma: true,
  environment: 'commercial' as const
}

test('classifies Cost Explorer no-history failures as non-retryable', () => {
  assert.equal(isNonRetryableForecastError(Object.assign(new Error('no data'), { name: 'DataUnavailableException' })), true)
  assert.equal(isNonRetryableForecastError(new Error('Insufficient amount of historical data.')), true)
  assert.equal(isNonRetryableForecastError(Object.assign(new Error('rate exceeded'), { name: 'ThrottlingException' })), false)
})

test('does not retry deterministic no-history failures', async () => {
  let calls = 0
  const results = await batchForecastCalls([request], {
    maxRetries: 2,
    retryDelay: 0,
    forecastFn: async () => {
      calls++
      throw Object.assign(new Error('Insufficient amount of historical data.'), { name: 'DataUnavailableException' })
    }
  })

  assert.equal(calls, 1)
  assert.equal(results.length, 1)
  assert.equal(results[0]!.success, false)
  assert.equal(results[0]!.retryable, false)
  assert.equal(results[0]!.errorName, 'DataUnavailableException')
})

test('retains the existing retry path for transient failures', async () => {
  let calls = 0
  const results = await batchForecastCalls([request], {
    maxRetries: 2,
    retryDelay: 0,
    forecastFn: async () => {
      calls++
      if (calls === 1) throw Object.assign(new Error('rate exceeded'), { name: 'ThrottlingException' })
      return { total: {}, forecastResultsByTime: [] }
    }
  })

  assert.equal(calls, 2)
  assert.equal(results.length, 1)
  assert.equal(results[0]!.success, true)
})