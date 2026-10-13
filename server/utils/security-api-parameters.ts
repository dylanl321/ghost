import { createError } from 'h3'
import { integrationAccountParameters } from './integration-account-scope'
import {
  parseBoundedInteger,
  parseCsv,
  parseDateRange,
  parseEnum,
  parseEnumCsv
} from './security-api-pagination'

const parameter = (
  name: string,
  description: string,
  schema: Record<string, unknown> = { type: 'string' }
) => ({ name, in: 'query', description, schema })

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'] as const
export const INSPECTOR_SEVERITIES = [...SEVERITIES, 'UNTRIAGED'] as const
export const SECURITY_HUB_WORKFLOWS = ['NEW', 'NOTIFIED', 'RESOLVED', 'SUPPRESSED'] as const
export const SECURITY_HUB_STATES = ['ACTIVE', 'ARCHIVED'] as const
export const INSPECTOR_STATUSES = ['ACTIVE', 'SUPPRESSED', 'CLOSED'] as const
export const SORT_ORDERS = ['asc', 'desc'] as const

const commonFindingParameters = [
  ...integrationAccountParameters,
  parameter('environment', 'AWS partition to query.', { type: 'string', enum: ['commercial', 'govcloud'], default: 'govcloud' }),
  parameter('regions', 'Comma-separated AWS regions. Defaults to both primary regions in the selected partition.'),
  parameter('startDate', 'Inclusive ISO-8601 range start. Must be paired with endDate and cannot be combined with lookbackDays.', { type: 'string', format: 'date-time' }),
  parameter('endDate', 'Inclusive ISO-8601 range end. Must be paired with startDate and cannot be combined with lookbackDays.', { type: 'string', format: 'date-time' }),
  parameter('lookbackDays', 'Relative date range. Cannot be combined with startDate/endDate.', { type: 'integer', minimum: 1, maximum: 3650 }),
  parameter('limit', 'Maximum findings returned per cursor page.', { type: 'integer', minimum: 1, maximum: 100, default: 100 }),
  parameter('cursor', 'Opaque, signed forward-only continuation cursor returned as nextCursor.'),
  parameter('sortOrder', 'Sort direction.', { type: 'string', enum: SORT_ORDERS, default: 'desc' })
]

export const securityHubParameters = [
  ...commonFindingParameters,
  parameter('dateField', 'Security Hub date field used by startDate/endDate or lookbackDays.', { type: 'string', enum: ['firstObservedAt', 'lastObservedAt', 'createdAt', 'updatedAt'], default: 'firstObservedAt' }),
  parameter('severity', 'Comma-separated severity labels.', { type: 'string', enum: SEVERITIES }),
  parameter('workflowStatus', 'Comma-separated workflow states, including historical resolved or suppressed findings.', { type: 'string', enum: SECURITY_HUB_WORKFLOWS }),
  parameter('recordState', 'Comma-separated ACTIVE or ARCHIVED record states.', { type: 'string', enum: SECURITY_HUB_STATES, default: 'ACTIVE' }),
  parameter('product', 'Comma-separated product names. Values use provider substring matching.'),
  parameter('findingIds', 'Comma-separated exact ASFF finding IDs.'),
  parameter('resourceIds', 'Comma-separated exact resource IDs.'),
  parameter('resourceTypes', 'Comma-separated ASFF resource types.'),
  parameter('findingTypes', 'Comma-separated ASFF finding type namespaces.'),
  parameter('controls', 'Comma-separated Security Hub control IDs.'),
  parameter('complianceStandards', 'Comma-separated compliance standard identifiers.'),
  parameter('complianceStatus', 'Comma-separated compliance states.', { type: 'string', enum: ['PASSED', 'FAILED', 'WARNING', 'NOT_AVAILABLE'] }),
  parameter('format', 'Normalized GHOST schema or original AWS Security Finding Format.', { type: 'string', enum: ['normalized', 'asff'], default: 'normalized' }),
  parameter('sortBy', 'Provider-supported finding field.', {
    type: 'string',
    enum: ['severity', 'updatedAt', 'createdAt', 'firstObservedAt', 'lastObservedAt', 'title', 'accountId', 'region'],
    default: 'severity'
  })
]

export const inspectorParameters = [
  ...commonFindingParameters,
  parameter('dateField', 'Inspector date field used by startDate/endDate or lookbackDays.', { type: 'string', enum: ['firstObservedAt', 'lastObservedAt', 'updatedAt'], default: 'updatedAt' }),
  parameter('status', 'Comma-separated ACTIVE, SUPPRESSED, or CLOSED finding states.', { type: 'string', enum: INSPECTOR_STATUSES, default: 'ACTIVE' }),
  parameter('severity', 'Comma-separated Inspector severity labels.', { type: 'string', enum: INSPECTOR_SEVERITIES }),
  parameter('findingTypes', 'Comma-separated Inspector finding types.'),
  parameter('resourceTypes', 'Comma-separated Inspector resource types.'),
  parameter('resourceIds', 'Comma-separated exact resource IDs.'),
  parameter('findingArns', 'Comma-separated exact Inspector finding ARNs.'),
  parameter('vulnerabilityIds', 'Comma-separated CVE, GHSA, or other vulnerability identifiers.'),
  parameter('relatedVulnerabilityIds', 'Comma-separated related CVE or GHSA identifiers.'),
  parameter('packageNames', 'Comma-separated vulnerable package names.'),
  parameter('repositoryNames', 'Comma-separated ECR repository names.'),
  parameter('imageDigests', 'Comma-separated ECR image hashes/digests.'),
  parameter('fixAvailable', 'Comma-separated YES, NO, or PARTIAL values.', { type: 'string', enum: ['YES', 'NO', 'PARTIAL'] }),
  parameter('exploitAvailable', 'Comma-separated YES or NO values.', { type: 'string', enum: ['YES', 'NO'] }),
  parameter('minInspectorScore', 'Inclusive minimum Inspector score.', { type: 'number', minimum: 0, maximum: 10 }),
  parameter('maxInspectorScore', 'Inclusive maximum Inspector score.', { type: 'number', minimum: 0, maximum: 10 }),
  parameter('title', 'Finding title prefix.'),
  parameter('sortBy', 'Provider-supported Inspector sort field.', {
    type: 'string',
    enum: ['severity', 'firstObservedAt', 'lastObservedAt', 'inspectorScore', 'findingStatus', 'findingType', 'resourceType', 'vulnerabilityId', 'accountId'],
    default: 'severity'
  })
]

const allowedNumber = (value: unknown, name: string) => {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
    throw createError({ statusCode: 400, statusMessage: `${name} must be a number from 0 to 10.` })
  }
  return parsed
}

export function parseCommonSecurityQuery(query: Record<string, unknown>, defaultLookbackDays?: number) {
  const cursor = typeof query.cursor === 'string' && query.cursor ? query.cursor : undefined
  return {
    environment: parseEnum(query.environment, 'environment', ['commercial', 'govcloud'] as const, 'govcloud')!,
    regions: parseCsv(query.regions),
    limit: parseBoundedInteger(query.limit, 'limit', 100, 1, 100),
    cursor,
    sortOrder: parseEnum(query.sortOrder, 'sortOrder', SORT_ORDERS, 'desc')!,
    date: parseDateRange(query, defaultLookbackDays)
  }
}

export function parseSecurityHubQuery(query: Record<string, unknown>) {
  const common = parseCommonSecurityQuery(query, 30)
  return {
    ...common,
    date: {
      ...common.date,
      dateField: parseEnum(query.dateField, 'dateField', ['firstObservedAt', 'lastObservedAt', 'createdAt', 'updatedAt'] as const, 'firstObservedAt')!
    },
    severities: parseEnumCsv(query.severity, 'severity', SEVERITIES),
    workflowStatuses: parseEnumCsv(query.workflowStatus, 'workflowStatus', SECURITY_HUB_WORKFLOWS),
    recordStates: parseEnumCsv(query.recordState, 'recordState', SECURITY_HUB_STATES) || ['ACTIVE'],
    products: parseCsv(query.product),
    findingIds: parseCsv(query.findingIds),
    resourceIds: parseCsv(query.resourceIds),
    resourceTypes: parseCsv(query.resourceTypes),
    findingTypes: parseCsv(query.findingTypes),
    controls: parseCsv(query.controls),
    complianceStandards: parseCsv(query.complianceStandards),
    complianceStatuses: parseEnumCsv(query.complianceStatus, 'complianceStatus', ['PASSED', 'FAILED', 'WARNING', 'NOT_AVAILABLE'] as const),
    format: parseEnum(query.format, 'format', ['normalized', 'asff'] as const, 'normalized')!,
    sortBy: parseEnum(query.sortBy, 'sortBy', ['severity', 'updatedAt', 'createdAt', 'firstObservedAt', 'lastObservedAt', 'title', 'accountId', 'region'] as const, 'severity')!
  }
}

export function parseInspectorQuery(query: Record<string, unknown>) {
  const common = parseCommonSecurityQuery(query)
  const minInspectorScore = allowedNumber(query.minInspectorScore, 'minInspectorScore')
  const maxInspectorScore = allowedNumber(query.maxInspectorScore, 'maxInspectorScore')
  if (minInspectorScore !== undefined && maxInspectorScore !== undefined && minInspectorScore > maxInspectorScore) {
    throw createError({ statusCode: 400, statusMessage: 'minInspectorScore cannot exceed maxInspectorScore.' })
  }
  return {
    ...common,
    date: {
      ...common.date,
      dateField: parseEnum(query.dateField, 'dateField', ['firstObservedAt', 'lastObservedAt', 'updatedAt'] as const, 'updatedAt')!
    },
    statuses: parseEnumCsv(query.status, 'status', INSPECTOR_STATUSES) || ['ACTIVE'],
    severities: parseEnumCsv(query.severity, 'severity', INSPECTOR_SEVERITIES),
    findingTypes: parseCsv(query.findingTypes),
    resourceTypes: parseCsv(query.resourceTypes),
    resourceIds: parseCsv(query.resourceIds),
    findingArns: parseCsv(query.findingArns),
    vulnerabilityIds: parseCsv(query.vulnerabilityIds),
    relatedVulnerabilityIds: parseCsv(query.relatedVulnerabilityIds),
    packageNames: parseCsv(query.packageNames),
    repositoryNames: parseCsv(query.repositoryNames),
    imageDigests: parseCsv(query.imageDigests),
    fixAvailable: parseEnumCsv(query.fixAvailable, 'fixAvailable', ['YES', 'NO', 'PARTIAL'] as const),
    exploitAvailable: parseEnumCsv(query.exploitAvailable, 'exploitAvailable', ['YES', 'NO'] as const),
    minInspectorScore,
    maxInspectorScore,
    title: typeof query.title === 'string' && query.title ? query.title : undefined,
    sortBy: parseEnum(query.sortBy, 'sortBy', ['severity', 'firstObservedAt', 'lastObservedAt', 'inspectorScore', 'findingStatus', 'findingType', 'resourceType', 'vulnerabilityId', 'accountId'] as const, 'severity')!
  }
}
