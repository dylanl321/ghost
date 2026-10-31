import {
  DescribeInstancesCommand,
  DescribeVolumesCommand,
  type Instance,
  type Volume
} from '@aws-sdk/client-ec2'
import { ScanCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { getDynamoDBClient, getEC2Client } from '../lib/aws-client-factory'
import { costCache, CacheTags } from './cache-manager'
import { queryCostDataset } from './cost-domain'
import {
  getEBSVolumePricing,
  getEC2InstancePricing,
  type EC2OperatingSystem
} from './aws-pricing'

export const VMAAS_ACCOUNT_ID = '650505514334'
export const VMAAS_BILLING_ACCOUNT_ID = '871049984747'
export const VMAAS_REGION = 'us-gov-west-1'

/**
 * Instance-level actuals are grouped on NetUnblendedCost, but queryCostDataset
 * requires UnblendedCost to reconcile the authoritative total (see
 * validateCostQuery). Request both so the query passes validation while the
 * grouped per-instance amounts keep using NetUnblendedCost.
 */
export const VMAAS_INSTANCE_ACTUAL_METRICS = ['UnblendedCost', 'NetUnblendedCost'] as const
const TEAM_TABLE = 'vmaas-team-registry'
const TENANT_TABLE = 'vmaas-tenant-registry'
const SCHEDULER_TABLE = 'SchedulerConfig'
const HOUR_MS = 60 * 60 * 1000

export interface SchedulerPeriod {
  name: string
  begintime?: string
  endtime?: string
  weekdays?: string[] | string
  [key: string]: unknown
}

export interface SchedulerSchedule {
  name: string
  periods: string[] | string
  timezone?: string
}

export interface ScheduleHours {
  available: boolean
  hours: number | null
  alwaysOnHours: number
  timezone: string
  reason?: string
}

export interface VmaasServerCost {
  instance_id: string
  name: string
  team_id: string
  department: string
  operating_system: 'Linux' | 'RHEL' | 'Windows'
  instance_type: string
  region: string
  state: string
  schedule: string
  compute_hourly_usd: number | null
  storage_monthly_usd: number | null
  scheduled_hours: number | null
  scheduled_monthly_usd: number | null
  always_on_hours: number
  always_on_monthly_usd: number | null
  schedule_savings_usd: number | null
  scheduled_estimate_available: boolean
  scheduled_estimate_reason?: string
  actual_month_usd: number | null
  in_fleet: boolean
}

export interface VmaasCostReport {
  account_id: typeof VMAAS_ACCOUNT_ID
  currency: 'USD'
  generated_at: string
  month: { start: string; end: string; data_through: string | null }
  actuals: {
    billable_mtd_usd: number | null
    proforma_mtd_usd: number | null
    delayed: true
    available: boolean
  }
  projections: {
    scheduled_monthly_usd: number
    always_on_monthly_usd: number
    schedule_savings_usd: number
    actual_month_usd: number
    unavailable_server_count: number
  }
  servers: VmaasServerCost[]
  allocation: VmaasMonthlyAllocation
}

export interface VmaasAllocationRow {
  tenant_id: string
  team_id: string
  department: string
  cost_center: string
  project: string
  owner: string
  cost_manager_emails: string[]
  billable_direct_usd: number
  allocation_share: number
  allocated_proforma_usd: number
}

export interface VmaasMonthlyAllocation {
  status: 'available' | 'pending' | 'unavailable'
  month: { start: string; end: string; data_through: string | null }
  billable_total_usd: number | null
  proforma_total_usd: number | null
  allocated_direct_usd: number | null
  shared_residual_usd: number | null
  reconciled: boolean
  issues: string[]
  rows: VmaasAllocationRow[]
}

export interface VmaasBillableGroup {
  tenant_id: string
  cost_center: string
  billable_direct_usd: number
}

interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function localParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value || 0)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second')
  }
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = localParts(date, timezone)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime()
}

function localDateTimeToUtc(parts: LocalParts, timezone: string): Date {
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  let result = new Date(wallClock - timezoneOffsetMs(new Date(wallClock), timezone))
  const correctedOffset = timezoneOffsetMs(result, timezone)
  result = new Date(wallClock - correctedOffset)
  return result
}

function addLocalDays(parts: LocalParts, days: number): LocalParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  }
}

function parseTime(value: string | undefined): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) return null
  return { hour, minute }
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function expandWeekdayToken(token: string): number[] | null {
  const normalized = token.trim().toLowerCase()
  if (!normalized) return []
  if (/^[0-6]$/.test(normalized)) return [Number(normalized)]
  const single = WEEKDAYS.indexOf(normalized.slice(0, 3))
  if (!normalized.includes('-')) return single >= 0 ? [single] : null
  const [startText, endText, extra] = normalized.split('-')
  if (!startText || !endText || extra) return null
  const start = WEEKDAYS.indexOf(startText.slice(0, 3))
  const end = WEEKDAYS.indexOf(endText.slice(0, 3))
  if (start < 0 || end < 0) return null
  const days: number[] = []
  for (let current = start; ; current = (current + 1) % 7) {
    days.push(current)
    if (current === end) return days
  }
}

function parseWeekdays(value: SchedulerPeriod['weekdays']): Set<number> | null {
  if (value === undefined) return new Set([0, 1, 2, 3, 4, 5, 6])
  const raw = Array.isArray(value) ? value : [value]
  const tokens = raw.flatMap(item => String(item).split(/[\s,]+/)).filter(Boolean)
  const result = new Set<number>()
  for (const token of tokens) {
    const expanded = expandWeekdayToken(token)
    if (!expanded) return null
    expanded.forEach(day => result.add(day))
  }
  return result.size ? result : null
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function parseMonthParts(month?: string, referenceDate = new Date(), fallback: 'previous' | 'current' = 'previous'): { year: number; monthIndex: number } {
  const match = month ? /^(\d{4})-(\d{2})$/.exec(month) : null
  if (month) {
    if (!match) throw new Error('VMaaS allocation month must use YYYY-MM')
    const year = Number(match[1])
    const monthIndex = Number(match[2]) - 1
    if (monthIndex < 0 || monthIndex > 11) throw new Error('VMaaS allocation month is invalid')
    return { year, monthIndex }
  }
  return {
    year: referenceDate.getUTCFullYear(),
    monthIndex: fallback === 'current' ? referenceDate.getUTCMonth() : referenceDate.getUTCMonth() - 1
  }
}

function closedMonthRange(month?: string, referenceDate = new Date()): { start: string; end: string } {
  const { year, monthIndex } = parseMonthParts(month, referenceDate, 'previous')
  const start = new Date(Date.UTC(year, monthIndex, 1))
  const end = new Date(Date.UTC(year, monthIndex + 1, 1))
  if (end > new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1))) {
    throw new Error('VMaaS allocation reports are available only for closed months')
  }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export function reportingMonthRange(month?: string, referenceDate = new Date()): { start: string; end: string; closed: boolean } {
  const { year, monthIndex } = parseMonthParts(month, referenceDate, 'current')
  const start = new Date(Date.UTC(year, monthIndex, 1))
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 1))
  const currentMonthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1))
  if (start > currentMonthStart) throw new Error('VMaaS cost reports are not available for future months')
  const closed = monthEnd <= currentMonthStart
  const end = closed
    ? monthEnd
    : new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), closed }
}

function tagValue(key: string, value: string | undefined): string {
  const raw = String(value || '')
  const prefix = `${key}$`
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw
}

export function allocateVmaasActuals(input: {
  billableTotal: number
  proformaTotal: number
  groups: VmaasBillableGroup[]
}): { rows: Array<VmaasBillableGroup & { allocation_share: number; allocated_proforma_usd: number }>; allocatedDirect: number; sharedResidual: number; reconciled: boolean } {
  if (!Number.isFinite(input.billableTotal) || input.billableTotal <= 0) throw new Error('billable total must be positive')
  if (!Number.isFinite(input.proformaTotal)) throw new Error('pro forma total is unavailable')
  if (!input.groups.length) throw new Error('no tenant-tagged direct usage was found')
  const rows = input.groups.map(group => {
    const share = group.billable_direct_usd / input.billableTotal
    return {
      ...group,
      allocation_share: share,
      allocated_proforma_usd: round(input.proformaTotal * share)
    }
  })
  const allocatedDirect = round(rows.reduce((total, row) => total + row.allocated_proforma_usd, 0))
  const sharedResidual = round(input.proformaTotal - allocatedDirect)
  return {
    rows,
    allocatedDirect,
    sharedResidual,
    reconciled: Math.abs(round(allocatedDirect + sharedResidual - input.proformaTotal)) <= 0.01
  }
}

/** Calculate a full calendar month's elapsed runtime from the union of scheduler periods. */
export function scheduledHoursForMonth(
  schedule: SchedulerSchedule,
  periodRows: SchedulerPeriod[],
  referenceDate: Date = new Date()
): ScheduleHours {
  const timezone = schedule.timezone || 'UTC'
  let current: LocalParts
  try {
    current = localParts(referenceDate, timezone)
  } catch {
    return { available: false, hours: null, alwaysOnHours: 0, timezone, reason: 'Unsupported schedule timezone' }
  }

  const monthStartParts: LocalParts = {
    year: current.year, month: current.month, day: 1, hour: 0, minute: 0, second: 0
  }
  const nextMonthDate = new Date(Date.UTC(current.year, current.month, 1))
  const monthEndParts: LocalParts = {
    year: nextMonthDate.getUTCFullYear(),
    month: nextMonthDate.getUTCMonth() + 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0
  }
  const monthStart = localDateTimeToUtc(monthStartParts, timezone).getTime()
  const monthEnd = localDateTimeToUtc(monthEndParts, timezone).getTime()
  const alwaysOnHours = round((monthEnd - monthStart) / HOUR_MS, 4)
  const periodNames = Array.isArray(schedule.periods) ? schedule.periods : [schedule.periods]
  const periods = new Map(periodRows.map(period => [period.name, period]))
  const selected: Array<{ period: SchedulerPeriod; weekdays: Set<number>; begin: { hour: number; minute: number }; end: { hour: number; minute: number } }> = []

  for (const name of periodNames) {
    const period = periods.get(String(name))
    const begin = parseTime(period?.begintime)
    const end = parseTime(period?.endtime)
    const weekdays = parseWeekdays(period?.weekdays)
    const unsupportedKeys = Object.keys(period || {}).filter(key => ['months', 'monthdays'].includes(key))
    if (!period || !begin || !end || !weekdays || unsupportedKeys.length) {
      return {
        available: false,
        hours: null,
        alwaysOnHours,
        timezone,
        reason: `Schedule period ${name} uses an unsupported definition`
      }
    }
    selected.push({ period, weekdays, begin, end })
  }

  const daysInMonth = new Date(Date.UTC(current.year, current.month, 0)).getUTCDate()
  const intervals: Array<[number, number]> = []
  for (let day = 1; day <= daysInMonth; day++) {
    const weekday = new Date(Date.UTC(current.year, current.month - 1, day)).getUTCDay()
    for (const entry of selected) {
      if (!entry.weekdays.has(weekday)) continue
      let startParts: LocalParts = {
        year: current.year,
        month: current.month,
        day,
        hour: entry.begin.hour === 24 ? 0 : entry.begin.hour,
        minute: entry.begin.minute,
        second: 0
      }
      if (entry.begin.hour === 24) startParts = addLocalDays(startParts, 1)
      let endParts: LocalParts = {
        year: current.year,
        month: current.month,
        day,
        hour: entry.end.hour === 24 ? 0 : entry.end.hour,
        minute: entry.end.minute,
        second: 0
      }
      const beginMinutes = entry.begin.hour * 60 + entry.begin.minute
      const endMinutes = entry.end.hour * 60 + entry.end.minute
      if (endMinutes <= beginMinutes || entry.end.hour === 24) endParts = addLocalDays(endParts, 1)
      const start = Math.max(monthStart, localDateTimeToUtc(startParts, timezone).getTime())
      const end = Math.min(monthEnd, localDateTimeToUtc(endParts, timezone).getTime())
      if (end > start) intervals.push([start, end])
    }
  }

  intervals.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const interval of intervals) {
    const previous = merged.at(-1)
    if (!previous || interval[0] > previous[1]) merged.push([...interval])
    else previous[1] = Math.max(previous[1], interval[1])
  }
  const hours = merged.reduce((sum, [start, end]) => sum + (end - start) / HOUR_MS, 0)
  return { available: true, hours: round(hours, 4), alwaysOnHours, timezone }
}

export function normalizeVmaasOperatingSystem(instance: Pick<Instance, 'PlatformDetails' | 'Platform'>, tags: Record<string, string>): {
  key: EC2OperatingSystem
  label: 'Linux' | 'RHEL' | 'Windows'
} {
  const value = `${instance.PlatformDetails || ''} ${instance.Platform || ''} ${tags.OS || ''} ${tags.OperatingSystem || ''}`.toLowerCase()
  if (value.includes('windows')) return { key: 'windows', label: 'Windows' }
  if (value.includes('red hat') || value.includes('rhel')) return { key: 'rhel', label: 'RHEL' }
  return { key: 'linux', label: 'Linux' }
}

export function isVmaasOwned(tags: Record<string, string>): boolean {
  return tags.GDLZ_DeployedBy === 'shared-vpc-tenant' && Boolean(tags.team_id && tags.tenant_id)
}

function tagsOf(instance: Instance): Record<string, string> {
  return Object.fromEntries((instance.Tags || []).flatMap(tag => tag.Key && tag.Value !== undefined ? [[tag.Key, tag.Value]] : []))
}

async function scanTable(tableName: string): Promise<Record<string, any>[]> {
  const client = await getDynamoDBClient('govcloud', VMAAS_REGION, VMAAS_ACCOUNT_ID)
  const items: Record<string, any>[] = []
  let exclusiveStartKey: Record<string, any> | undefined
  do {
    const response = await client.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: exclusiveStartKey }))
    items.push(...(response.Items || []).map(item => unmarshall(item, { wrapNumbers: false })))
    exclusiveStartKey = response.LastEvaluatedKey
  } while (exclusiveStartKey)
  return items
}

async function loadInstances(): Promise<Instance[]> {
  const client = await getEC2Client('govcloud', VMAAS_REGION, VMAAS_ACCOUNT_ID)
  const instances: Instance[] = []
  let nextToken: string | undefined
  do {
    const response = await client.send(new DescribeInstancesCommand({
      Filters: [
        { Name: 'tag:GDLZ_DeployedBy', Values: ['shared-vpc-tenant'] },
        { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] }
      ],
      NextToken: nextToken
    }))
    instances.push(...(response.Reservations || []).flatMap(reservation => reservation.Instances || []))
    nextToken = response.NextToken
  } while (nextToken)
  return instances.filter(instance => isVmaasOwned(tagsOf(instance)))
}

async function loadVolumes(instances: Instance[]): Promise<Map<string, Volume>> {
  const client = await getEC2Client('govcloud', VMAAS_REGION, VMAAS_ACCOUNT_ID)
  const ids = [...new Set(instances.flatMap(instance => (instance.BlockDeviceMappings || []).map(mapping => mapping.Ebs?.VolumeId).filter(Boolean) as string[]))]
  const result = new Map<string, Volume>()
  for (let offset = 0; offset < ids.length; offset += 500) {
    const response = await client.send(new DescribeVolumesCommand({ VolumeIds: ids.slice(offset, offset + 500) }))
    for (const volume of response.Volumes || []) if (volume.VolumeId) result.set(volume.VolumeId, volume)
  }
  return result
}

async function loadActual(source: 'billable' | 'proforma', billingAccountId: string | undefined, referenceDate: Date) {
  if (!billingAccountId) return null
  const startDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const endDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())).toISOString().slice(0, 10)
  if (startDate === endDate) return { total: 0, dataThroughDate: null }
  const result = await queryCostDataset({
    startDate,
    endDate,
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost'],
    filter: { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [VMAAS_BILLING_ACCOUNT_ID], MatchOptions: ['EQUALS'] } }
  }, {
    environment: 'commercial',
    source,
    accountId: billingAccountId
  })
  return {
    total: result.dataset.reconciliation.authoritativeTotal,
    dataThroughDate: result.dataset.dataThroughDate
  }
}

async function loadAllocationInputs(month: string | undefined, referenceDate: Date) {
  let range: { start: string; end: string }
  try {
    range = closedMonthRange(month, referenceDate)
  } catch (error) {
    const reporting = reportingMonthRange(month, referenceDate)
    return {
      range: { start: reporting.start, end: reporting.end },
      groups: [] as VmaasBillableGroup[],
      billableTotal: Number.NaN,
      proformaTotal: Number.NaN,
      estimated: true,
      dataThrough: null,
      issues: [error instanceof Error ? error.message : String(error)]
    }
  }
  const accountFilter = { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [VMAAS_BILLING_ACCOUNT_ID], MatchOptions: ['EQUALS'] } }
  const tenantFilter = {
    And: [
      accountFilter,
      { Tags: { Key: 'Module', Values: ['shared-vpc-tenant'], MatchOptions: ['EQUALS'] } }
    ]
  }
  const [taggedBillable, accountBillable, proforma] = await Promise.all([
    queryCostDataset({
      startDate: range.start,
      endDate: range.end,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost', 'NetUnblendedCost'],
      groupBy: [{ type: 'TAG', key: 'TenantID' }, { type: 'TAG', key: 'CostCenter' }],
      filter: tenantFilter
    }, {
      environment: 'commercial',
      source: 'billable',
      accountId: process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
    }),
    queryCostDataset({
      startDate: range.start,
      endDate: range.end,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost', 'NetUnblendedCost'],
      filter: accountFilter
    }, {
      environment: 'commercial',
      source: 'billable',
      accountId: process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
    }),
    queryCostDataset({
      startDate: range.start,
      endDate: range.end,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost'],
      filter: accountFilter
    }, {
      environment: 'commercial',
      source: 'proforma',
      accountId: process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
    })
  ])
  const groups = new Map<string, VmaasBillableGroup>()
  const issues: string[] = []
  for (const period of taggedBillable.resultsByTime) {
    for (const group of period.Groups || []) {
      const tenantId = tagValue('TenantID', group.Keys?.[0])
      const costCenter = tagValue('CostCenter', group.Keys?.[1])
      const amount = Number(group.Metrics?.NetUnblendedCost?.Amount || 0)
      if (!tenantId || !costCenter) {
        if (amount) issues.push('Tenant Module usage is missing TenantID or CostCenter.')
        continue
      }
      const key = `${tenantId}\0${costCenter}`
      const current = groups.get(key)
      groups.set(key, {
        tenant_id: tenantId,
        cost_center: costCenter,
        billable_direct_usd: (current?.billable_direct_usd || 0) + amount
      })
    }
  }
  return {
    range,
    groups: [...groups.values()],
    billableTotal: Number(accountBillable.total.NetUnblendedCost?.Amount || 0),
    proformaTotal: Number(proforma.total.UnblendedCost?.Amount || 0),
    estimated: taggedBillable.dataset.estimated || accountBillable.dataset.estimated || proforma.dataset.estimated,
    dataThrough: proforma.dataset.dataThroughDate || accountBillable.dataset.dataThroughDate,
    issues
  }
}

async function loadInstanceActuals(month: string | undefined, referenceDate: Date): Promise<{
  range: { start: string; end: string; closed: boolean }
  actuals: VmaasInstanceActual[]
  dataThrough: string | null
}> {
  const range = reportingMonthRange(month, referenceDate)
  if (range.start === range.end) return { range, actuals: [], dataThrough: null }
  const result = await queryCostDataset({
    startDate: range.start,
    endDate: range.end,
    granularity: 'MONTHLY',
    metrics: [...VMAAS_INSTANCE_ACTUAL_METRICS],
    groupBy: [{ type: 'TAG', key: 'InstanceID' }, { type: 'TAG', key: 'TenantID' }],
    filter: {
      And: [
        { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [VMAAS_BILLING_ACCOUNT_ID], MatchOptions: ['EQUALS'] } },
        { Tags: { Key: 'Module', Values: ['shared-vpc-tenant'], MatchOptions: ['EQUALS'] } }
      ]
    }
  }, {
    environment: 'commercial',
    source: 'billable',
    accountId: process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
  })
  const actuals: VmaasInstanceActual[] = []
  for (const period of result.resultsByTime) {
    for (const group of period.Groups || []) {
      const instanceTag = tagValue('InstanceID', group.Keys?.[0])
      const tenantId = tagValue('TenantID', group.Keys?.[1])
      const amount = Number(group.Metrics?.NetUnblendedCost?.Amount || 0)
      if (!amount) continue
      actuals.push({
        instance_id: INSTANCE_ID.test(instanceTag) ? instanceTag : '',
        tenant_id: tenantId,
        actual_month_usd: amount
      })
    }
  }
  return { range, actuals, dataThrough: result.dataset.dataThroughDate }
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (value || 0), 0)
}

export function aggregateVmaasProjections(servers: VmaasServerCost[]) {
  return {
    scheduled_monthly_usd: round(sum(servers.map(server => server.scheduled_monthly_usd))),
    always_on_monthly_usd: round(sum(servers.map(server => server.always_on_monthly_usd))),
    schedule_savings_usd: round(sum(servers.map(server => server.schedule_savings_usd))),
    actual_month_usd: round(sum(servers.map(server => server.actual_month_usd))),
    unavailable_server_count: servers.filter(server => !server.scheduled_estimate_available).length
  }
}

export interface VmaasInstanceActual {
  instance_id: string
  tenant_id: string
  actual_month_usd: number
}

const INSTANCE_ID = /^i-[0-9a-f]{8,17}$/

export function mergeVmaasInstanceActuals(servers: VmaasServerCost[], actuals: VmaasInstanceActual[]): VmaasServerCost[] {
  const remaining = new Map<string, VmaasInstanceActual>()
  for (const actual of actuals) {
    const key = actual.instance_id || `unmapped:${actual.tenant_id}`
    const current = remaining.get(key)
    remaining.set(key, {
      instance_id: actual.instance_id,
      tenant_id: actual.tenant_id,
      actual_month_usd: (current?.actual_month_usd || 0) + actual.actual_month_usd
    })
  }
  const merged = servers.map(server => {
    const actual = remaining.get(server.instance_id)
    if (actual) remaining.delete(server.instance_id)
    return { ...server, actual_month_usd: actual ? round(actual.actual_month_usd) : 0, in_fleet: true }
  })
  for (const actual of remaining.values()) {
    merged.push({
      instance_id: actual.instance_id || `unmapped:${actual.tenant_id || 'shared'}`,
      name: actual.instance_id || 'Untagged VMaaS usage',
      team_id: '',
      department: '',
      operating_system: 'Linux',
      instance_type: '',
      region: VMAAS_REGION,
      state: actual.instance_id ? 'terminated' : 'unmapped',
      schedule: '',
      compute_hourly_usd: null,
      storage_monthly_usd: null,
      scheduled_hours: null,
      scheduled_monthly_usd: null,
      always_on_hours: 0,
      always_on_monthly_usd: null,
      schedule_savings_usd: null,
      scheduled_estimate_available: false,
      scheduled_estimate_reason: 'Server is not in the current fleet',
      actual_month_usd: round(actual.actual_month_usd),
      in_fleet: false
    })
  }
  return merged
}

async function buildReport(referenceDate = new Date(), allocationMonth?: string): Promise<VmaasCostReport> {
  const [instances, teams, tenants, schedulerRows, billable, proforma, allocationInput, instanceActuals] = await Promise.all([
    loadInstances(),
    scanTable(TEAM_TABLE),
    scanTable(TENANT_TABLE),
    scanTable(SCHEDULER_TABLE),
    loadActual('billable', process.env.AWS_MASTER_ACCOUNT_ID || '205950196477', referenceDate),
    loadActual('proforma', process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832', referenceDate),
    loadAllocationInputs(allocationMonth, referenceDate),
    loadInstanceActuals(allocationMonth, referenceDate)
  ])
  const volumes = await loadVolumes(instances)
  const teamMap = new Map(teams.map(team => [String(team.team_id || ''), team]))
  const tenantMap = new Map(tenants.map(tenant => [String(tenant.tenant_id || ''), tenant]))
  const scheduleMap = new Map(schedulerRows.filter(row => row.type === 'schedule').map(row => [String(row.name), row as SchedulerSchedule]))
  const periods = schedulerRows.filter(row => row.type === 'period') as SchedulerPeriod[]

  const projected = await Promise.all(instances.map(async instance => {
    const tags = tagsOf(instance)
    const os = normalizeVmaasOperatingSystem(instance, tags)
    const scheduleName = tags.Schedule || ''
    const schedule = scheduleName ? scheduleMap.get(scheduleName) : null
    const scheduleHours = schedule
      ? scheduledHoursForMonth(schedule, periods, referenceDate)
      : scheduleName
        ? { available: false, hours: null, alwaysOnHours: scheduledHoursForMonth({ name: 'always', periods: [], timezone: 'UTC' }, [], referenceDate).alwaysOnHours, timezone: 'UTC', reason: 'Schedule definition not found' }
        : scheduledHoursForMonth({ name: 'always', periods: [], timezone: 'UTC' }, [], referenceDate)
    if (!scheduleName) scheduleHours.hours = scheduleHours.alwaysOnHours

    const compute = instance.InstanceType
      ? await getEC2InstancePricing(instance.InstanceType, instance.Placement?.AvailabilityZone?.slice(0, -1) || VMAAS_REGION, 'govcloud', os.key)
      : null
    const attachedVolumes = (instance.BlockDeviceMappings || []).flatMap(mapping => {
      const volume = mapping.Ebs?.VolumeId ? volumes.get(mapping.Ebs.VolumeId) : undefined
      return volume ? [volume] : []
    })
    const storagePrices = await Promise.all(attachedVolumes.map(volume => getEBSVolumePricing(
      volume.VolumeType || 'gp3',
      volume.Size || 0,
      instance.Placement?.AvailabilityZone?.slice(0, -1) || VMAAS_REGION,
      'govcloud'
    )))
    const storageAvailable = storagePrices.every(Boolean)
    const storageMonthly = storageAvailable ? sum(storagePrices.map(price => price?.monthlyEstimate || 0)) : null
    const alwaysOnMonthly = compute && storageMonthly !== null
      ? compute.hourlyRate * scheduleHours.alwaysOnHours + storageMonthly
      : null
    const scheduledMonthly = scheduleHours.available && scheduleHours.hours !== null && compute && storageMonthly !== null
      ? compute.hourlyRate * scheduleHours.hours + storageMonthly
      : null
    const teamId = tags.team_id || ''
    const team = teamMap.get(teamId)

    return {
      instance_id: instance.InstanceId || '',
      name: tags.Name || tags.InstanceID || instance.InstanceId || 'VMaaS server',
      team_id: teamId,
      department: String(team?.department || ''),
      operating_system: os.label,
      instance_type: instance.InstanceType || '',
      region: instance.Placement?.AvailabilityZone?.slice(0, -1) || VMAAS_REGION,
      state: instance.State?.Name || 'unknown',
      schedule: scheduleName || 'Always on',
      compute_hourly_usd: compute ? round(compute.hourlyRate, 6) : null,
      storage_monthly_usd: storageMonthly === null ? null : round(storageMonthly),
      scheduled_hours: scheduleHours.hours,
      scheduled_monthly_usd: scheduledMonthly === null ? null : round(scheduledMonthly),
      always_on_hours: scheduleHours.alwaysOnHours,
      always_on_monthly_usd: alwaysOnMonthly === null ? null : round(alwaysOnMonthly),
      schedule_savings_usd: scheduledMonthly === null || alwaysOnMonthly === null ? null : round(Math.max(0, alwaysOnMonthly - scheduledMonthly)),
      scheduled_estimate_available: Boolean(scheduleHours.available && compute && storageAvailable),
      ...(!scheduleHours.available ? { scheduled_estimate_reason: scheduleHours.reason } : {}),
      actual_month_usd: 0,
      in_fleet: true
    } satisfies VmaasServerCost
  }))

  const servers = mergeVmaasInstanceActuals(projected, instanceActuals.actuals).map(server => {
    if (server.in_fleet) return server
    const actual = instanceActuals.actuals.find(row => (row.instance_id || `unmapped:${row.tenant_id}`) === server.instance_id || row.instance_id === server.instance_id)
    if (!actual?.tenant_id) return server
    const tenant = tenantMap.get(actual.tenant_id) || {}
    const teamId = String(tenant.team_id || '')
    const team = teamMap.get(teamId)
    return { ...server, team_id: teamId, department: String(team?.department || '') }
  })

  servers.sort((a, b) => a.team_id.localeCompare(b.team_id) || a.name.localeCompare(b.name))
  const allocationIssues = [...allocationInput.issues]
  const costCentersByTenant = new Map<string, Set<string>>()
  for (const group of allocationInput.groups) {
    if (!costCentersByTenant.has(group.tenant_id)) costCentersByTenant.set(group.tenant_id, new Set())
    costCentersByTenant.get(group.tenant_id)!.add(group.cost_center)
  }
  for (const [tenantId, values] of costCentersByTenant) {
    if (values.size > 1) allocationIssues.push(`TenantID ${tenantId} appears under multiple CostCenter values.`)
  }
  let allocation: VmaasMonthlyAllocation
  try {
    if (allocationInput.estimated) throw new Error('AWS still marks the selected month as estimated')
    const calculated = allocateVmaasActuals({
      billableTotal: allocationInput.billableTotal,
      proformaTotal: allocationInput.proformaTotal,
      groups: allocationInput.groups
    })
    const allocationRows: VmaasAllocationRow[] = calculated.rows.map(row => {
      const tenant = tenantMap.get(row.tenant_id) || {}
      const config = typeof tenant.config === 'string' ? JSON.parse(tenant.config) : (tenant.config || {})
      const teamId = String(tenant.team_id || '')
      const team = teamMap.get(teamId) || {}
      if (!teamId) allocationIssues.push(`TenantID ${row.tenant_id} has no team registry mapping.`)
      if (team.cost_center && String(team.cost_center) !== row.cost_center) {
        allocationIssues.push(`TenantID ${row.tenant_id} CostCenter does not match its team record.`)
      }
      if (!Array.isArray(team.cost_manager_emails) || team.cost_manager_emails.length === 0) {
        allocationIssues.push(`Team ${teamId || '(unmapped)'} has no registered cost manager.`)
      }
      return {
        ...row,
        team_id: teamId,
        department: String(team.department || ''),
        project: String(config.project_name || ''),
        owner: String(config.owner || tenant.requested_by || ''),
        cost_manager_emails: Array.isArray(team.cost_manager_emails) ? team.cost_manager_emails.map(String) : []
      }
    })
    allocation = {
      status: allocationIssues.some(issue => /missing TenantID|no team|does not match|multiple CostCenter|no registered cost manager/.test(issue)) ? 'unavailable' : 'available',
      month: { start: allocationInput.range.start, end: allocationInput.range.end, data_through: allocationInput.dataThrough },
      billable_total_usd: round(allocationInput.billableTotal),
      proforma_total_usd: round(allocationInput.proformaTotal),
      allocated_direct_usd: calculated.allocatedDirect,
      shared_residual_usd: calculated.sharedResidual,
      reconciled: calculated.reconciled,
      issues: allocationIssues,
      rows: allocationRows.sort((a, b) => a.department.localeCompare(b.department) || a.team_id.localeCompare(b.team_id) || a.tenant_id.localeCompare(b.tenant_id))
    }
  } catch (error) {
    allocation = {
      status: allocationInput.estimated ? 'pending' : 'unavailable',
      month: { start: allocationInput.range.start, end: allocationInput.range.end, data_through: allocationInput.dataThrough },
      billable_total_usd: Number.isFinite(allocationInput.billableTotal) ? round(allocationInput.billableTotal) : null,
      proforma_total_usd: Number.isFinite(allocationInput.proformaTotal) ? round(allocationInput.proformaTotal) : null,
      allocated_direct_usd: null,
      shared_residual_usd: null,
      reconciled: false,
      issues: [...allocationIssues, error instanceof Error ? error.message : String(error)],
      rows: []
    }
  }
  return {
    account_id: VMAAS_ACCOUNT_ID,
    currency: 'USD',
    generated_at: referenceDate.toISOString(),
    month: {
      start: instanceActuals.range.start,
      end: instanceActuals.range.end,
      data_through: instanceActuals.dataThrough || billable?.dataThroughDate || proforma?.dataThroughDate || null
    },
    actuals: {
      billable_mtd_usd: billable ? round(billable.total) : null,
      proforma_mtd_usd: proforma ? round(proforma.total) : null,
      delayed: true,
      available: Boolean(billable || proforma)
    },
    projections: aggregateVmaasProjections(servers),
    servers,
    allocation
  }
}

export async function getVmaasCostReport(month?: string): Promise<VmaasCostReport> {
  // The default report mixes current-month actuals with the last closed month's
  // allocation, so it must not share a key with an explicit closed month.
  const cacheMonth = month || `latest:${reportingMonthRange().start.slice(0, 7)}`
  return costCache.getOrSet(`vmaas:costs:${VMAAS_ACCOUNT_ID}:${cacheMonth}`, () => buildReport(new Date(), month), {
    ttl: 300,
    tags: [CacheTags.COSTS, 'vmaas']
  })
}

export async function getVmaasInstanceCost(instanceId: string, month?: string): Promise<VmaasServerCost | null> {
  if (!INSTANCE_ID.test(instanceId)) return null
  const report = await getVmaasCostReport(month)
  return report.servers.find(server => server.instance_id === instanceId) || null
}
