import type { DatasetReportConfig } from '../../shared/types/dataset-reports'

const REPORT_FORMATS = new Set(['pdf', 'xlsx', 'csv', 'json'])
const DATASET_KEYS = ['config', 'securityHub', 'cloudtrail', 'entraUsers'] as const
const CONFIG_KEYS = new Set(['accounts', 'accountScope', 'datasets', 'format', 'enableAI', 'columns', 'timeRange'])
const DATASET_VALUE_KEYS = new Set(['enabled', 'filters'])
const QUICK_FILTER_KEYS = new Set(['publicIpOnly', 'publicAccessEnabled', 'openToInternet', 'unencryptedOnly', 'noMfaOnly'])
const FILTER_KEYS: Record<(typeof DATASET_KEYS)[number], Set<string>> = {
  config: new Set(['resourceId', 'resourceName', 'tags', 'resourceTypes', 'complianceStatus', 'complianceOnly', 'regions', 'quickFilters']),
  securityHub: new Set(['severities', 'statuses', 'products', 'complianceStandards', 'controlIds', 'activeOnly', 'lookbackDays', 'resourceId', 'regions']),
  cloudtrail: new Set(['eventTypes', 'eventNames', 'userIdentities', 'eventSources', 'writeEventsOnly', 'errorsOnly', 'lookbackDays', 'regions', 'startTime', 'endTime']),
  entraUsers: new Set(['activityStatus', 'roles', 'activeOnly', 'lookbackDays', 'departments', 'userSearch'])
}
const MAX_LIST_LENGTH = 100
const MAX_TEXT_LENGTH = 256
const SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'])
const WORKFLOW_STATUSES = new Set(['NEW', 'NOTIFIED', 'RESOLVED', 'SUPPRESSED'])
const COMPLIANCE_STATUSES = new Set(['COMPLIANT', 'NON_COMPLIANT', 'NOT_APPLICABLE', 'INSUFFICIENT_DATA'])

function validateStringList(value: unknown, path: string, errors: string[], allowed?: Set<string>) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH || value.some(item =>
    typeof item !== 'string' || item.length === 0 || item.length > MAX_TEXT_LENGTH || (allowed && !allowed.has(item))
  )) errors.push(`${path} contains unsupported values`)
}

function validateDays(value: unknown, path: string, errors: string[], max = 365) {
  if (value !== undefined && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > max)) {
    errors.push(`${path} must be between 1 and ${max}`)
  }
}

function validateBoolean(value: unknown, path: string, errors: string[]) {
  if (value !== undefined && typeof value !== 'boolean') errors.push(`${path} must be a boolean`)
}

export function getDatasetReportConfigErrors(value: unknown): string[] {
  const errors: string[] = []
  if (!value || typeof value !== 'object') return ['Report configuration is required']

  const config = value as Partial<DatasetReportConfig>
  const unknownConfig = Object.keys(config).filter(key => !CONFIG_KEYS.has(key))
  if (unknownConfig.length) errors.push(`Unsupported report fields: ${unknownConfig.join(', ')}`)
  if (!Array.isArray(config.accounts) || config.accounts.some(id => typeof id !== 'string' || !/^\d{12}$/.test(id))) {
    errors.push('Accounts must be an array of 12-digit AWS account IDs')
  }
  if (config.accountScope !== undefined && config.accountScope !== 'all' && config.accountScope !== 'selected') {
    errors.push('Account scope must be all or selected')
  }
  if (config.accountScope === 'selected' && config.accounts?.length === 0) {
    errors.push('At least one account must be selected when account scope is selected')
  }
  if (!config.format || !REPORT_FORMATS.has(config.format)) {
    errors.push('Format must be pdf, xlsx, csv, or json')
  }
  validateBoolean(config.enableAI, 'enableAI', errors)
  if (!config.datasets || typeof config.datasets !== 'object') {
    errors.push('Dataset selection is required')
    return errors
  }

  let enabledCount = 0
  const unknownDatasets = Object.keys(config.datasets).filter(key => !DATASET_KEYS.includes(key as any))
  if (unknownDatasets.length) errors.push(`Unsupported datasets: ${unknownDatasets.join(', ')}`)
  for (const key of DATASET_KEYS) {
    const dataset = config.datasets[key]
    if (dataset?.enabled) enabledCount++
    if (dataset && typeof dataset.enabled !== 'boolean') {
      errors.push(`${key}.enabled must be a boolean`)
    }
    if (dataset) {
      const unknownDatasetFields = Object.keys(dataset).filter(field => !DATASET_VALUE_KEYS.has(field))
      if (unknownDatasetFields.length) errors.push(`Unsupported ${key} fields: ${unknownDatasetFields.join(', ')}`)
      if (dataset.filters !== undefined && (!dataset.filters || typeof dataset.filters !== 'object' || Array.isArray(dataset.filters))) {
        errors.push(`${key}.filters must be an object`)
      } else if (dataset.filters) {
        const unknownFilters = Object.keys(dataset.filters).filter(field => !FILTER_KEYS[key].has(field))
        if (unknownFilters.length) errors.push(`Unsupported ${key} filters: ${unknownFilters.join(', ')}`)
      }
    }
  }
  if (enabledCount === 0) errors.push('At least one dataset must be selected')

  const configFilters = config.datasets.config?.filters
  const unknownQuickFilters = Object.keys(configFilters?.quickFilters || {}).filter(key => !QUICK_FILTER_KEYS.has(key))
  if (unknownQuickFilters.length) errors.push(`Unsupported config quick filters: ${unknownQuickFilters.join(', ')}`)
  validateBoolean(configFilters?.complianceOnly, 'config.complianceOnly', errors)
  for (const [name, value] of Object.entries(configFilters?.quickFilters || {})) validateBoolean(value, `config.quickFilters.${name}`, errors)
  validateStringList(configFilters?.resourceTypes, 'config.resourceTypes', errors)
  validateStringList(configFilters?.regions, 'config.regions', errors)
  validateStringList(configFilters?.complianceStatus, 'config.complianceStatus', errors, COMPLIANCE_STATUSES)
  if (configFilters?.resourceId && configFilters.resourceId.length > MAX_TEXT_LENGTH) errors.push('config.resourceId is too long')
  if (configFilters?.resourceName && configFilters.resourceName.length > MAX_TEXT_LENGTH) errors.push('config.resourceName is too long')
  if (configFilters?.tags && (typeof configFilters.tags !== 'object' || Array.isArray(configFilters.tags) || Object.entries(configFilters.tags).length > 25 || Object.entries(configFilters.tags).some(([key, val]) => !key || key.length > 128 || typeof val !== 'string' || val.length > MAX_TEXT_LENGTH))) {
    errors.push('config.tags contains unsupported values')
  }

  const securityFilters = config.datasets.securityHub?.filters
  validateBoolean(securityFilters?.activeOnly, 'securityHub.activeOnly', errors)
  validateStringList(securityFilters?.severities, 'securityHub.severities', errors, SEVERITIES)
  validateStringList(securityFilters?.statuses, 'securityHub.statuses', errors, WORKFLOW_STATUSES)
  for (const field of ['products', 'complianceStandards', 'controlIds', 'regions'] as const) validateStringList(securityFilters?.[field], `securityHub.${field}`, errors)
  validateDays(securityFilters?.lookbackDays, 'securityHub.lookbackDays', errors)
  if (securityFilters?.resourceId && securityFilters.resourceId.length > MAX_TEXT_LENGTH) errors.push('securityHub.resourceId is too long')

  const cloudTrailFilters = config.datasets.cloudtrail?.filters
  validateBoolean(cloudTrailFilters?.writeEventsOnly, 'cloudtrail.writeEventsOnly', errors)
  validateBoolean(cloudTrailFilters?.errorsOnly, 'cloudtrail.errorsOnly', errors)
  for (const field of ['eventTypes', 'eventNames', 'userIdentities', 'eventSources', 'regions'] as const) validateStringList(cloudTrailFilters?.[field], `cloudtrail.${field}`, errors)
  validateDays(cloudTrailFilters?.lookbackDays, 'cloudtrail.lookbackDays', errors)
  if (cloudTrailFilters?.startTime && !Number.isFinite(Date.parse(cloudTrailFilters.startTime))) errors.push('cloudtrail.startTime must be an ISO date')
  if (cloudTrailFilters?.endTime && !Number.isFinite(Date.parse(cloudTrailFilters.endTime))) errors.push('cloudtrail.endTime must be an ISO date')
  if (cloudTrailFilters?.startTime && cloudTrailFilters?.endTime && Date.parse(cloudTrailFilters.startTime) >= Date.parse(cloudTrailFilters.endTime)) errors.push('cloudtrail start time must be before end time')

  const entraFilters = config.datasets.entraUsers?.filters
  validateBoolean(entraFilters?.activeOnly, 'entraUsers.activeOnly', errors)
  if (entraFilters?.activityStatus && !['all', 'active', 'inactive'].includes(entraFilters.activityStatus)) errors.push('entraUsers.activityStatus is invalid')
  validateStringList(entraFilters?.roles, 'entraUsers.roles', errors)
  validateStringList(entraFilters?.departments, 'entraUsers.departments', errors)
  validateDays(entraFilters?.lookbackDays, 'entraUsers.lookbackDays', errors)
  if (entraFilters?.userSearch && entraFilters.userSearch.length > MAX_TEXT_LENGTH) errors.push('entraUsers.userSearch is too long')

  if (config.columns) validateStringList(config.columns, 'columns', errors)
  if (config.timeRange?.type === 'relative') validateDays(config.timeRange.relativeDays, 'timeRange.relativeDays', errors)
  if (config.timeRange && config.timeRange.type !== 'relative' && config.timeRange.type !== 'absolute') errors.push('Time range type must be relative or absolute')
  if (config.timeRange?.type === 'absolute') {
    const start = Date.parse(config.timeRange.startDate || '')
    const end = Date.parse(config.timeRange.endDate || '')
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) errors.push('Absolute time range is invalid')
  }

  return errors
}
