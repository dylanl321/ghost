/**
 * Report schedule maths shared by the scheduler, the report routes and the
 * report forms, so the next-run time a user previews is the one the server
 * stores and the scheduler runs.
 *
 * All calendar arithmetic is done on wall-clock parts in the schedule's own
 * timezone and only converted to a UTC instant at the end, so the result does
 * not depend on the timezone of the machine running it.
 */

import type { ScheduleConfig } from '../types/scheduled-reports'

const FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'quarterly'])
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

interface WallClock {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  weekday: number // 0 (Sunday) - 6
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    // hourCycle h23 keeps midnight as 00; `hour12: false` can render it as 24.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
      hourCycle: 'h23'
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false
  try {
    getFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

function getWallClock(instant: Date, timeZone: string): WallClock & { second: number } {
  const parts: Record<string, string> = {}
  for (const part of getFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday!] ?? 0
  }
}

/** Offset of the timezone from UTC at the given instant, in milliseconds. */
function getOffsetMs(instant: Date, timeZone: string): number {
  const wall = getWallClock(instant, timeZone)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * Convert a wall-clock time in a timezone to a UTC instant. A time skipped by
 * a DST jump resolves to the first valid instant after the gap.
 */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  const first = new Date(asUtc - getOffsetMs(new Date(asUtc), timeZone))
  // A second pass settles instants on the other side of a DST change.
  const second = new Date(asUtc - getOffsetMs(first, timeZone))
  const matches = (candidate: Date) => {
    const wall = getWallClock(candidate, timeZone)
    return wall.hour === hour && wall.minute === minute
  }
  if (matches(second)) return second
  if (matches(first)) return first
  return first > second ? first : second
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Calendar date `days` after the given one (month and year roll over). */
function addDays(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function parseTime(time: unknown): { hour: number, minute: number } {
  const [hour, minute] = String(time ?? '').split(':').map(Number)
  return {
    hour: Number.isInteger(hour) && hour! >= 0 && hour! <= 23 ? hour! : 0,
    minute: Number.isInteger(minute) && minute! >= 0 && minute! <= 59 ? minute! : 0
  }
}

/** Integer option that may arrive as a string from DynamoDB; 0 is a valid value. */
function toInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isInteger(parsed) ? parsed : fallback
}

/**
 * The first run strictly after `fromTime` (default now), as a UTC instant.
 */
export function calculateNextRunTime(
  schedule: Pick<ScheduleConfig, 'frequency' | 'time'> & Partial<ScheduleConfig>,
  timeZone: string = schedule.timezone || 'UTC',
  fromTime: Date = new Date()
): Date {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC'
  const now = getWallClock(fromTime, zone)
  const { hour, minute } = parseTime(schedule.time)
  const at = (date: { year: number, month: number, day: number }) =>
    zonedTimeToUtc(date.year, date.month, date.day, hour, minute, zone)
  const isFuture = (candidate: Date) => candidate.getTime() > fromTime.getTime()
  const today = { year: now.year, month: now.month, day: now.day }

  switch (schedule.frequency) {
    case 'weekly': {
      const target = Math.min(Math.max(toInteger(schedule.dayOfWeek, 1), 0), 6)
      const daysUntil = (target - now.weekday + 7) % 7
      const candidate = at(addDays(now.year, now.month, now.day, daysUntil))
      return isFuture(candidate) ? candidate : at(addDays(now.year, now.month, now.day, daysUntil + 7))
    }

    case 'monthly': {
      const target = Math.min(Math.max(toInteger(schedule.dayOfMonth, 1), 1), 31)
      for (let offset = 0; offset < 3; offset++) {
        const monthIndex = now.month - 1 + offset
        const year = now.year + Math.floor(monthIndex / 12)
        const month = (monthIndex % 12) + 1
        // Day 31 in a 30-day month runs on the last day of that month.
        const candidate = at({ year, month, day: Math.min(target, daysInMonth(year, month)) })
        if (isFuture(candidate)) return candidate
      }
      break
    }

    case 'quarterly': {
      const monthOfQuarter = Math.min(Math.max(toInteger(schedule.monthOfQuarter, 1), 1), 3)
      const quarterStart = Math.floor((now.month - 1) / 3) * 3
      for (let quarter = 0; quarter < 6; quarter++) {
        const monthIndex = quarterStart + quarter * 3 + (monthOfQuarter - 1)
        const year = now.year + Math.floor(monthIndex / 12)
        const month = (monthIndex % 12) + 1
        const candidate = at({ year, month, day: 1 })
        if (isFuture(candidate)) return candidate
      }
      break
    }

    case 'daily':
    default: {
      const candidate = at(today)
      return isFuture(candidate) ? candidate : at(addDays(now.year, now.month, now.day, 1))
    }
  }

  // Unreachable for valid input; fall back to the next daily slot.
  return at(addDays(now.year, now.month, now.day, 1))
}

/** The next `count` runs after `fromTime`, for schedule previews. */
export function calculateNextRunTimes(
  schedule: Pick<ScheduleConfig, 'frequency' | 'time'> & Partial<ScheduleConfig>,
  count: number,
  timeZone: string = schedule.timezone || 'UTC',
  fromTime: Date = new Date()
): Date[] {
  const runs: Date[] = []
  let cursor = fromTime
  for (let i = 0; i < count; i++) {
    const next = calculateNextRunTime(schedule, timeZone, cursor)
    runs.push(next)
    cursor = next
  }
  return runs
}

/**
 * True when `instant` is a slot the schedule would actually run at. Used to
 * tell a stored nextRunTime that is merely due from one that is corrupt.
 */
export function isScheduledSlot(
  schedule: Pick<ScheduleConfig, 'frequency' | 'time'> & Partial<ScheduleConfig>,
  instant: Date,
  timeZone: string = schedule.timezone || 'UTC'
): boolean {
  const slot = calculateNextRunTime(schedule, timeZone, new Date(instant.getTime() - 1000))
  return Math.abs(slot.getTime() - instant.getTime()) < 60_000
}

export function getScheduleErrors(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['Schedule is required']
  const schedule = value as Partial<ScheduleConfig>
  const errors: string[] = []

  if (!schedule.frequency || !FREQUENCIES.has(schedule.frequency)) errors.push('Invalid schedule frequency')
  if (!schedule.time || !TIME_PATTERN.test(schedule.time)) errors.push('Schedule time must use HH:MM')
  if (!schedule.timezone || typeof schedule.timezone !== 'string') errors.push('Schedule timezone is required')
  else if (!isValidTimeZone(schedule.timezone)) errors.push(`Unknown schedule timezone: ${schedule.timezone}`)
  if (schedule.frequency === 'weekly' && (!Number.isInteger(schedule.dayOfWeek) || schedule.dayOfWeek! < 0 || schedule.dayOfWeek! > 6)) {
    errors.push('Weekly schedules require dayOfWeek from 0 to 6')
  }
  if (schedule.frequency === 'monthly' && (!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth! < 1 || schedule.dayOfMonth! > 31)) {
    errors.push('Monthly schedules require dayOfMonth from 1 to 31')
  }
  if (schedule.frequency === 'quarterly' && (!Number.isInteger(schedule.monthOfQuarter) || schedule.monthOfQuarter! < 1 || schedule.monthOfQuarter! > 3)) {
    errors.push('Quarterly schedules require monthOfQuarter from 1 to 3')
  }

  return errors
}
