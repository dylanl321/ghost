import assert from 'node:assert/strict'
import test from 'node:test'
import type { ScheduledReport } from '../../shared/types/scheduled-reports'
import { calculateNextRunTime } from '../../shared/utils/report-schedule'
import { checkForSuspiciousPattern } from '../../server/utils/report-scheduler'

function report(schedule: ScheduledReport['schedule'], nextRunTime: string, extra: Partial<ScheduledReport> = {}): ScheduledReport {
  return {
    reportId: 'r1',
    reportName: 'Test',
    reportType: 'cost',
    createdBy: 'owner@example.com',
    isAdmin: false,
    reportConfig: {} as ScheduledReport['reportConfig'],
    schedule,
    recipients: ['owner@example.com'],
    emailTemplate: { subject: '', body: '', isCustom: false },
    status: 'active',
    nextRunTime,
    runCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra
  }
}

const noRuns = async () => 0

test('a weekly report that is due today runs instead of being paused', async () => {
  const schedule = { frequency: 'weekly' as const, dayOfWeek: 5, time: '09:00', timezone: 'UTC' }
  // Picked up by the 08:59 tick for a 09:00 Friday run
  const result = await checkForSuspiciousPattern(report(schedule, '2026-10-30T09:00:00.000Z'), new Date('2026-10-30T08:59:00Z'), noRuns)
  assert.equal(result.action, 'run')
})

test('a daily report with a long run history keeps running', async () => {
  const schedule = { frequency: 'daily' as const, time: '09:00', timezone: 'UTC' }
  const daily = report(schedule, '2026-10-30T09:00:00.000Z', { runCount: 40, lastRunTime: '2026-10-29T09:00:20.000Z' })
  const result = await checkForSuspiciousPattern(daily, new Date('2026-10-30T08:59:00Z'), async () => 1)
  assert.equal(result.action, 'run')
})

test('a report stuck in a loop is paused', async () => {
  const schedule = { frequency: 'daily' as const, time: '09:00', timezone: 'UTC' }
  const result = await checkForSuspiciousPattern(report(schedule, '2026-10-30T09:00:00.000Z'), new Date('2026-10-30T08:59:00Z'), async () => 12)
  assert.equal(result.action, 'pause')
})

test('a next run stored by the old calculation is realigned, not paused', async () => {
  // Sunday schedule whose stored time is a Monday (the old dayOfWeek 0 bug)
  const schedule = { frequency: 'weekly' as const, dayOfWeek: 0, time: '08:00', timezone: 'UTC' }
  const result = await checkForSuspiciousPattern(report(schedule, '2026-11-02T08:00:00.000Z'), new Date('2026-11-02T07:59:30Z'), noRuns)
  assert.equal(result.action, 'realign')
})

test('a run missed by more than a day is realigned; a recent miss still runs', async () => {
  const schedule = { frequency: 'daily' as const, time: '09:00', timezone: 'UTC' }
  const stale = await checkForSuspiciousPattern(report(schedule, '2026-10-27T09:00:00.000Z'), new Date('2026-10-30T10:00:00Z'), noRuns)
  assert.equal(stale.action, 'realign')
  const recent = await checkForSuspiciousPattern(report(schedule, '2026-10-30T09:00:00.000Z'), new Date('2026-10-30T11:00:00Z'), noRuns)
  assert.equal(recent.action, 'run')
})

test('the stored slot of a freshly created report is accepted', async () => {
  const schedule = { frequency: 'monthly' as const, dayOfMonth: 31, time: '06:30', timezone: 'America/Los_Angeles' }
  const next = calculateNextRunTime(schedule, schedule.timezone, new Date('2026-11-02T00:00:00Z'))
  const result = await checkForSuspiciousPattern(report(schedule, next.toISOString()), new Date(next.getTime() - 30_000), noRuns)
  assert.equal(result.action, 'run')
})
