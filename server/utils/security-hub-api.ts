import {
  GetFindingsCommand,
  type AwsSecurityFinding,
  type AwsSecurityFindingFilters,
  type SecurityHubClient,
  type SortCriterion
} from '@aws-sdk/client-securityhub'
import { createError } from 'h3'
import type { SecurityHubFindingRecord } from '../../shared/types/dataset-reports'
import type { FindingSeverity, WorkflowStatus } from '../../shared/types/security-hub'
import { getClient } from '../lib/aws-client-factory'
import { logger } from './logger'
import {
  getIntegrationAccountEnvironmentErrors,
  type IntegrationAccount
} from './integration-account-scope'
import type { parseSecurityHubQuery } from './security-api-parameters'
import {
  decodeSecurityCursor,
  encodeSecurityCursor,
  mergeSecurityStreams,
  sanitizeProviderError,
  securityCursorIssuedAt,
  securityQueryFingerprint,
  type SecurityStreamState
} from './security-api-pagination'

export type ParsedSecurityHubQuery = ReturnType<typeof parseSecurityHubQuery>

export interface SecurityFindingsFailureContext {
  provider: string
  environment: string
  regionCount: number
  accountCount: number
  requestId?: string
}

/**
 * Build a sanitized, stable diagnostic record for a failed
 * /api/v1/security/findings execution. Emits only non-sensitive provider
 * context (counts, environment, sanitized error name, AWS request ID, HTTP
 * status). It never includes account IDs, query/filter values, error
 * messages, stack traces, or the raw error object so it is safe for
 * CloudWatch Log Insights. Fields are omitted rather than emitted as null
 * when unavailable to keep query shapes stable.
 */
export function buildSecurityFindingsFailureLog(
  error: unknown,
  context: SecurityFindingsFailureContext
): Record<string, unknown> {
  const candidate = error as {
    name?: string
    code?: string
    statusCode?: number
    $metadata?: { requestId?: string; requestID?: string; httpStatusCode?: number }
  } | undefined
  const awsRequestId = candidate?.$metadata?.requestId || candidate?.$metadata?.requestID
  const httpStatus = candidate?.statusCode ?? candidate?.$metadata?.httpStatusCode
  const entry: Record<string, unknown> = {
    type: 'security_findings_failure',
    route: '/api/v1/security/findings',
    provider: context.provider,
    environment: context.environment,
    regionCount: context.regionCount,
    accountCount: context.accountCount,
    errorCode: candidate?.name || candidate?.code || 'ProviderError'
  }
  if (awsRequestId) entry.awsRequestId = awsRequestId
  if (httpStatus !== undefined) entry.httpStatus = httpStatus
  if (context.requestId) entry.ghostRequestId = context.requestId
  return entry
}

const severityRank: Record<string, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFORMATIONAL: 1
}

const defaultRegions = (environment: 'commercial' | 'govcloud') =>
  environment === 'commercial' ? ['us-east-1', 'us-west-2'] : ['us-gov-west-1', 'us-gov-east-1']

const stringFilters = (values: string[] | undefined, comparison: 'EQUALS' | 'PREFIX' | 'CONTAINS' = 'EQUALS') =>
  values?.map(Value => ({ Value, Comparison: comparison }))

function filtersFor(query: ParsedSecurityHubQuery, accountIds: string[]): AwsSecurityFindingFilters {
  const filters: AwsSecurityFindingFilters = {}
  if (accountIds.length) filters.AwsAccountId = stringFilters(accountIds)
  if (query.severities) filters.SeverityLabel = stringFilters(query.severities)
  if (query.workflowStatuses) filters.WorkflowStatus = stringFilters(query.workflowStatuses)
  if (query.recordStates) filters.RecordState = stringFilters(query.recordStates)
  if (query.products) filters.ProductName = stringFilters(query.products, 'CONTAINS')
  if (query.findingIds) filters.Id = stringFilters(query.findingIds)
  if (query.resourceIds) filters.ResourceId = stringFilters(query.resourceIds)
  if (query.resourceTypes) filters.ResourceType = stringFilters(query.resourceTypes)
  if (query.findingTypes) filters.Type = stringFilters(query.findingTypes, 'PREFIX')
  if (query.controls) filters.ComplianceSecurityControlId = stringFilters(query.controls)
  if (query.complianceStandards) filters.ComplianceAssociatedStandardsId = stringFilters(query.complianceStandards)
  if (query.complianceStatuses) filters.ComplianceStatus = stringFilters(query.complianceStatuses)
  if (query.date.start && query.date.end) {
    const field = query.date.dateField || 'firstObservedAt'
    const key = {
      firstObservedAt: 'FirstObservedAt',
      lastObservedAt: 'LastObservedAt',
      createdAt: 'CreatedAt',
      updatedAt: 'UpdatedAt'
    }[field]
    if (!key) throw Object.assign(new Error('Unsupported Security Hub dateField'), { statusCode: 400 })
    ;(filters as Record<string, unknown>)[key] = [{
      Start: query.date.start.toISOString(),
      End: query.date.end.toISOString()
    }]
  }
  if (Object.keys(filters).length > 10) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Security Hub supports at most 10 filter attributes in one request.'
    })
  }
  return filters
}

function normalize(finding: AwsSecurityFinding, names: Map<string, string>): SecurityHubFindingRecord {
  const resource = finding.Resources?.[0]
  return {
    accountId: finding.AwsAccountId || '',
    accountName: names.get(finding.AwsAccountId || '') || finding.AwsAccountId || 'Unknown',
    region: finding.Region || '',
    findingId: finding.Id || '',
    title: finding.Title || 'Untitled Finding',
    description: finding.Description,
    severity: (finding.Severity?.Label || 'INFORMATIONAL') as FindingSeverity,
    severityScore: finding.Severity?.Normalized,
    workflowStatus: (finding.Workflow?.Status || 'NEW') as WorkflowStatus,
    productName: finding.ProductName || finding.CompanyName || 'Unknown',
    productArn: finding.ProductArn,
    complianceStatus: finding.Compliance?.Status,
    complianceStandard: finding.Compliance?.AssociatedStandards?.[0]?.StandardsId,
    controlId: finding.Compliance?.SecurityControlId || finding.Compliance?.RelatedRequirements?.[0],
    resourceType: resource?.Type || 'Unknown',
    resourceId: resource?.Id || 'Unknown',
    createdAt: finding.CreatedAt || '',
    updatedAt: finding.UpdatedAt || '',
    firstObservedAt: finding.FirstObservedAt || finding.CreatedAt || '',
    lastObservedAt: finding.LastObservedAt,
    remediationRecommendation: finding.Remediation?.Recommendation?.Text,
    remediationUrl: finding.Remediation?.Recommendation?.Url
  }
}

const fieldMap: Record<ParsedSecurityHubQuery['sortBy'], string> = {
  severity: 'SeverityLabel',
  updatedAt: 'UpdatedAt',
  createdAt: 'CreatedAt',
  firstObservedAt: 'FirstObservedAt',
  lastObservedAt: 'LastObservedAt',
  title: 'Title',
  accountId: 'AwsAccountId',
  region: 'Region'
}

function comparable(record: SecurityHubFindingRecord | AwsSecurityFinding, field: ParsedSecurityHubQuery['sortBy']) {
  const raw = record as AwsSecurityFinding
  const normalized = record as SecurityHubFindingRecord
  if (field === 'severity') return severityRank[normalized.severity || raw.Severity?.Label || ''] || 0
  if (field === 'accountId') return normalized.accountId ?? raw.AwsAccountId ?? ''
  if (field === 'region') return normalized.region ?? raw.Region ?? ''
  if (field === 'title') return normalized.title ?? raw.Title ?? ''
  const value = normalized[field] ?? raw[field === 'updatedAt' ? 'UpdatedAt' : field === 'createdAt' ? 'CreatedAt' : field === 'firstObservedAt' ? 'FirstObservedAt' : 'LastObservedAt']
  return new Date(value || 0).getTime()
}

function compare(query: ParsedSecurityHubQuery, left: any, right: any): number {
  const direction = query.sortOrder === 'asc' ? 1 : -1
  const leftValue = comparable(left, query.sortBy)
  const rightValue = comparable(right, query.sortBy)
  const primary = typeof leftValue === 'number' && typeof rightValue === 'number'
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue))
  if (primary) return primary * direction
  const leftUpdated = new Date(left.updatedAt || left.UpdatedAt || 0).getTime()
  const rightUpdated = new Date(right.updatedAt || right.UpdatedAt || 0).getTime()
  if (leftUpdated !== rightUpdated) return (leftUpdated - rightUpdated) * direction
  return String(left.findingId || left.Id || '').localeCompare(String(right.findingId || right.Id || ''))
}

function accountIdentity(account: IntegrationAccount, environment: 'commercial' | 'govcloud') {
  return environment === 'commercial' ? account.accountId : account.govCloudAccountId
}

export async function querySecurityHubApi(
  accounts: IntegrationAccount[] | undefined,
  query: ParsedSecurityHubQuery,
  options: { requestId?: string } = {}
) {
  const anchor = securityCursorIssuedAt(query.cursor) || Date.now()
  if ('lookbackDays' in query.date && query.date.lookbackDays) {
    query.date.start = new Date(anchor - query.date.lookbackDays * 86_400_000)
    query.date.end = new Date(anchor)
  }
  const regions = query.regions || defaultRegions(query.environment)
  const selectedIds = accounts
    ? accounts.map(account => accountIdentity(account, query.environment)).filter((id): id is string => Boolean(id))
    : []
  const errors = getIntegrationAccountEnvironmentErrors(accounts || [], query.environment)
  selectedIds.sort()
  const names = new Map((accounts || []).flatMap(account => {
    const name = account.accountName || account.accountId || account.govCloudAccountId || 'Unknown'
    return [[account.accountId, name], [account.govCloudAccountId, name]].filter((item): item is [string, string] => Boolean(item[0]))
  }))
  const batches: string[][] = selectedIds.length
    ? Array.from({ length: Math.ceil(selectedIds.length / 20) }, (_, index) => selectedIds.slice(index * 20, index * 20 + 20))
    : accounts ? [] : [[]]
  const descriptors = regions.flatMap(region => batches.map((ids, batch) => ({
    id: `${region}:${batch}`,
    region,
    accountIds: ids
  })))
  const initialStates: SecurityStreamState[] = descriptors.map(({ id }) => ({ id, offset: 0 }))
  const fingerprint = securityQueryFingerprint({
    provider: 'securityhub',
    accounts: selectedIds,
    accountErrors: errors,
    ...query,
    cursor: undefined,
    date: {
      ...query.date,
      start: 'lookbackDays' in query.date && query.date.lookbackDays ? undefined : query.date.start?.toISOString(),
      end: 'lookbackDays' in query.date && query.date.lookbackDays ? undefined : query.date.end?.toISOString()
    }
  })
  let states = decodeSecurityCursor(query.cursor, fingerprint, initialStates)
  const securityAccount = query.environment === 'govcloud'
    ? process.env.AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT
    : process.env.AWS_COMMERCIAL_SECURITY_LAKE_ACCOUNT
  if (descriptors.length && !securityAccount) {
    throw Object.assign(new Error('Security Hub aggregation account is not configured.'), { statusCode: 500 })
  }

  const runPage = async () => {
    try {
      const merged = await mergeSecurityStreams(states, query.limit, async state => {
        const descriptor = descriptors.find(item => item.id === state.id)!
        const client = await getClient<SecurityHubClient>(query.environment, 'securityhub', descriptor.region, securityAccount!)
        const sort: SortCriterion[] = [
          { Field: fieldMap[query.sortBy], SortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc' },
          ...(query.sortBy === 'severity' ? [{ Field: 'UpdatedAt', SortOrder: 'desc' as const }] : [])
        ]
        const response = await client.send(new GetFindingsCommand({
          Filters: filtersFor(query, descriptor.accountIds),
          SortCriteria: sort,
          MaxResults: 100,
          NextToken: state.token
        }))
        return {
          records: (response.Findings || []).map(finding => query.format === 'asff' ? finding : normalize(finding, names)),
          nextToken: response.NextToken
        }
      }, (left, right) => compare(query, left, right))
      states = merged.states
      return merged
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode
      // Log only server-side failures so this signal stays clean for isolating
      // the unexplained 5xx responses; client 4xx validation errors (e.g. the
      // filter-count guard) are rethrown untouched without an error log.
      if (typeof statusCode !== 'number' || statusCode >= 500) {
        logger.error('Security Hub findings request failed', buildSecurityFindingsFailureLog(error, {
          provider: 'AWS Security Hub',
          environment: query.environment,
          regionCount: regions.length,
          accountCount: selectedIds.length,
          requestId: options.requestId
        }))
      }
      if (statusCode) throw error
      sanitizeProviderError('AWS Security Hub', error)
    }
  }

  const result = await runPage()
  return {
    records: result.records,
    pagination: {
      limit: query.limit,
      returned: result.records.length,
      hasMore: result.hasMore,
      nextCursor: result.hasMore ? encodeSecurityCursor(fingerprint, states, anchor) : null,
      total: null,
      totalIsExact: false
    },
    format: query.format,
    accounts: selectedIds,
    environment: query.environment,
    errors
  }
}
