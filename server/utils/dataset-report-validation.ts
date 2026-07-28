import type { DatasetReportConfig } from '../../shared/types/dataset-reports'
import type { ScheduleConfig } from '../../shared/types/scheduled-reports'

const REPORT_FORMATS = new Set(['pdf', 'xlsx', 'csv', 'json'])
const FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'quarterly'])
const DATASET_KEYS = ['config', 'securityHub', 'cloudtrail', 'entraUsers'] as const

export function getDatasetReportConfigErrors(value: unknown): string[] {
  const errors: string[] = []
  if (!value || typeof value !== 'object') return ['Report configuration is required']

  const config = value as Partial<DatasetReportConfig>
  if (!Array.isArray(config.accounts) || config.accounts.some(id => typeof id !== 'string' || !/^\d{12}$/.test(id))) {
    errors.push('Accounts must be an array of 12-digit AWS account IDs')
  }
  if (!config.format || !REPORT_FORMATS.has(config.format)) {
    errors.push('Format must be pdf, xlsx, csv, or json')
  }
  if (!config.datasets || typeof config.datasets !== 'object') {
    errors.push('Dataset selection is required')
    return errors
  }

  let enabledCount = 0
  for (const key of DATASET_KEYS) {
    const dataset = config.datasets[key]
    if (dataset?.enabled) enabledCount++
    if (dataset && typeof dataset.enabled !== 'boolean') {
      errors.push(`${key}.enabled must be a boolean`)
    }
  }
  if (enabledCount === 0) errors.push('At least one dataset must be selected')

  return errors
}

export function getScheduleErrors(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['Schedule is required']
  const schedule = value as Partial<ScheduleConfig>
  const errors: string[] = []

  if (!schedule.frequency || !FREQUENCIES.has(schedule.frequency)) errors.push('Invalid schedule frequency')
  if (!schedule.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) errors.push('Schedule time must use HH:MM')
  if (!schedule.timezone || typeof schedule.timezone !== 'string') errors.push('Schedule timezone is required')
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
