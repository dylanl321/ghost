import assert from 'node:assert/strict'
import test from 'node:test'
import { getForecastDateRange } from '../../server/utils/forecast-handler'

const at = (iso: string) => new Date(`${iso}T15:00:00.000Z`)

test('current-month remainder ends on the first of next month, even on the 31st', () => {
  // setMonth() on Oct 31 overflows to Dec 1; the window must still end Nov 1
  assert.deepEqual(getForecastDateRange('current-month-remainder', 1, at('2026-10-31')), {
    startDate: '2026-10-31', endDate: '2026-11-01', months: 0
  })
  assert.deepEqual(getForecastDateRange('current-month-remainder', 1, at('2026-01-30')), {
    startDate: '2026-01-30', endDate: '2026-02-01', months: 0
  })
  assert.equal(getForecastDateRange('current-month-remainder', 1, at('2026-12-15'))?.endDate, '2027-01-01')
})

test('multi-month forecasts start next month and do not skip a month from the 31st', () => {
  assert.deepEqual(getForecastDateRange('3-months', 1, at('2026-08-31')), {
    startDate: '2026-09-01', endDate: '2026-12-01', months: 3
  })
  assert.deepEqual(getForecastDateRange('12-months', 1, at('2026-10-31')), {
    startDate: '2026-11-01', endDate: '2027-11-01', months: 12
  })
  assert.deepEqual(getForecastDateRange('custom', 2, at('2026-03-31')), {
    startDate: '2026-04-01', endDate: '2026-06-01', months: 2
  })
})

test('rest-of-year runs through December, and is January only in December', () => {
  assert.deepEqual(getForecastDateRange('rest-of-year', 1, at('2026-10-30')), {
    startDate: '2026-11-01', endDate: '2027-01-01', months: 2
  })
  assert.deepEqual(getForecastDateRange('rest-of-year', 1, at('2026-12-31')), {
    startDate: '2027-01-01', endDate: '2027-02-01', months: 1
  })
})

test('uses the UTC date, not the server local date', () => {
  // 23:30 UTC on Oct 31 is still Oct 31 for Cost Explorer
  assert.equal(getForecastDateRange('current-month-remainder', 1, new Date('2026-10-31T23:30:00Z'))?.startDate, '2026-10-31')
})

test('rejects unknown periods and out-of-range custom months', () => {
  assert.equal(getForecastDateRange('fortnight', 1, at('2026-10-30')), null)
  assert.equal(getForecastDateRange('custom', 13, at('2026-10-30')), null)
})
