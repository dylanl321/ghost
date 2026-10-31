import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateNextRunTime,
  calculateNextRunTimes,
  getScheduleErrors,
  isScheduledSlot
} from '../../shared/utils/report-schedule'

const at = (iso: string) => new Date(iso)

test('daily runs later today, or tomorrow once the time has passed', () => {
  const schedule = { frequency: 'daily' as const, time: '09:00', timezone: 'America/New_York' }
  // 08:00 EDT on 2026-10-30
  assert.equal(calculateNextRunTime(schedule, 'America/New_York', at('2026-10-30T12:00:00Z')).toISOString(), '2026-10-30T13:00:00.000Z')
  // 09:00 EDT exactly: the next run is tomorrow, not now
  assert.equal(calculateNextRunTime(schedule, 'America/New_York', at('2026-10-30T13:00:00Z')).toISOString(), '2026-10-31T13:00:00.000Z')
})

test('weekly runs later today when today is the target day', () => {
  // 2026-10-30 is a Friday (5)
  const schedule = { frequency: 'weekly' as const, dayOfWeek: 5, time: '17:00', timezone: 'UTC' }
  assert.equal(calculateNextRunTime(schedule, 'UTC', at('2026-10-30T09:00:00Z')).toISOString(), '2026-10-30T17:00:00.000Z')
  assert.equal(calculateNextRunTime(schedule, 'UTC', at('2026-10-30T17:00:00Z')).toISOString(), '2026-11-06T17:00:00.000Z')
})

test('weekly honours Sunday (dayOfWeek 0) instead of falling back to Monday', () => {
  const schedule = { frequency: 'weekly' as const, dayOfWeek: 0, time: '08:00', timezone: 'UTC' }
  const next = calculateNextRunTime(schedule, 'UTC', at('2026-10-30T09:00:00Z'))
  assert.equal(next.toISOString(), '2026-11-01T08:00:00.000Z')
  assert.equal(next.getUTCDay(), 0)
  // Values stored as strings in DynamoDB still work
  assert.equal(calculateNextRunTime({ ...schedule, dayOfWeek: '0' as unknown as number }, 'UTC', at('2026-10-30T09:00:00Z')).getUTCDay(), 0)
})

test('monthly clamps to the last day of shorter months and never returns a past time', () => {
  const schedule = { frequency: 'monthly' as const, dayOfMonth: 31, time: '09:00', timezone: 'UTC' }
  // After the run on Nov 30 (Nov has 30 days), the next is Dec 31, not Nov 30 again
  assert.equal(calculateNextRunTime(schedule, 'UTC', at('2026-11-30T10:00:00Z')).toISOString(), '2026-12-31T09:00:00.000Z')
  assert.equal(calculateNextRunTime(schedule, 'UTC', at('2026-11-15T10:00:00Z')).toISOString(), '2026-11-30T09:00:00.000Z')
  assert.equal(calculateNextRunTime(schedule, 'UTC', at('2027-01-31T10:00:00Z')).toISOString(), '2027-02-28T09:00:00.000Z')
})

test('quarterly picks the right month even from the 31st', () => {
  const schedule = { frequency: 'quarterly' as const, monthOfQuarter: 1, time: '09:00', timezone: 'UTC' }
  // From May 31: the next first-month-of-quarter is July 1, not August 1
  assert.equal(calculateNextRunTime(schedule, 'UTC', at('2026-05-31T12:00:00Z')).toISOString(), '2026-07-01T09:00:00.000Z')
  // From March 31: April 1, not May 1 (April has no 31st)
  assert.equal(calculateNextRunTime(schedule, 'UTC', at('2026-03-31T12:00:00Z')).toISOString(), '2026-04-01T09:00:00.000Z')
  // Year rollover
  assert.equal(calculateNextRunTime(schedule, 'UTC', at('2026-10-02T12:00:00Z')).toISOString(), '2027-01-01T09:00:00.000Z')
  const third = { ...schedule, monthOfQuarter: 3 }
  assert.equal(calculateNextRunTime(third, 'UTC', at('2026-10-30T12:00:00Z')).toISOString(), '2026-12-01T09:00:00.000Z')
})

test('results do not depend on DST: 09:00 local stays 09:00 local across the change', () => {
  const schedule = { frequency: 'daily' as const, time: '09:00', timezone: 'America/New_York' }
  const [beforeChange, afterChange] = calculateNextRunTimes(schedule, 2, 'America/New_York', at('2026-10-31T14:00:00Z'))
  // Nov 1 2026 is the fall-back day: 09:00 EST = 14:00Z, Nov 2 also 14:00Z
  assert.equal(beforeChange!.toISOString(), '2026-11-01T14:00:00.000Z')
  assert.equal(afterChange!.toISOString(), '2026-11-02T14:00:00.000Z')
})

test('midnight schedules are not shifted a day', () => {
  const schedule = { frequency: 'daily' as const, time: '00:00', timezone: 'UTC' }
  assert.equal(calculateNextRunTime(schedule, 'UTC', at('2026-10-30T23:30:00Z')).toISOString(), '2026-10-31T00:00:00.000Z')
})

test('a due run is still a valid slot, a corrupt time is not', () => {
  const schedule = { frequency: 'weekly' as const, dayOfWeek: 5, time: '09:00', timezone: 'America/Chicago' }
  const due = calculateNextRunTime(schedule, 'America/Chicago', at('2026-10-29T00:00:00Z'))
  assert.equal(isScheduledSlot(schedule, due), true)
  assert.equal(isScheduledSlot(schedule, new Date(due.getTime() + 3 * 3600_000)), false)
})

test('schedule validation rejects unknown timezones', () => {
  assert.deepEqual(getScheduleErrors({ frequency: 'daily', time: '09:00', timezone: 'America/New_York' }), [])
  assert.ok(getScheduleErrors({ frequency: 'daily', time: '09:00', timezone: 'Mars/Olympus' }).some(e => e.includes('Unknown schedule timezone')))
})
