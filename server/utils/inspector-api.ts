import {
  ListFindingAggregationsCommand,
  ListFindingsCommand,
  type AccountAggregationResponse,
  type FilterCriteria,
  type Finding,
  type Inspector2Client
} from '@aws-sdk/client-inspector2'
import { getInspector2Client } from '../lib/aws-client-factory'
import type { IntegrationAccount } from './integration-account-scope'
import type { VulnerabilityFinding, VulnerabilitySeverity } from './inspector-findings'
import type { parseInspectorQuery } from './security-api-parameters'
import {
  decodeSecurityCursor,
  encodeSecurityCursor,
  mergeSecurityStreams,
  sanitizeProviderError,
  securityCursorIssuedAt,
  securityQueryFingerprint,
  type SecurityStreamState
} from './security-api-pagination'

export type ParsedInspectorQuery = ReturnType<typeof parseInspectorQuery>

export interface InspectorApiFinding extends VulnerabilityFinding {
  inspectorScore?: number
  fixAvailable?: string
  exploitAvailable?: string
  resourceType?: string
}

const severityRank: Record<string, number> = {
  CRITICAL: 6,
  HIGH: 5,
  MEDIUM: 4,
  LOW: 3,
  INFORMATIONAL: 2,
  UNTRIAGED: 1
}

const defaultRegions = (environment: 'commercial' | 'govcloud') =>
  environment === 'commercial' ? ['us-east-1', 'us-west-2'] : ['us-gov-west-1', 'us-gov-east-1']

const strings = (values: string[] | undefined, comparison: 'EQUALS' | 'PREFIX' = 'EQUALS') =>
  values?.map(value => ({ value, comparison }))

function filtersFor(query: ParsedInspectorQuery, accountIds: string[]): FilterCriteria {
  const filters: FilterCriteria = {
    awsAccountId: strings(accountIds),
    findingStatus: strings(query.statuses)
  }
  if (query.severities) filters.severity = strings(query.severities)
  if (query.findingTypes) filters.findingType = strings(query.findingTypes)
  if (query.resourceTypes) filters.resourceType = strings(query.resourceTypes)
  if (query.resourceIds) filters.resourceId = strings(query.resourceIds)
  if (query.findingArns) filters.findingArn = strings(query.findingArns)
  if (query.vulnerabilityIds) filters.vulnerabilityId = strings(query.vulnerabilityIds)
  if (query.relatedVulnerabilityIds) filters.relatedVulnerabilities = strings(query.relatedVulnerabilityIds)
  if (query.packageNames) filters.vulnerablePackages = query.packageNames.map(value => ({ name: { value, comparison: 'EQUALS' } }))
  if (query.repositoryNames) filters.ecrImageRepositoryName = strings(query.repositoryNames)
  if (query.imageDigests) filters.ecrImageHash = strings(query.imageDigests)
  if (query.fixAvailable) filters.fixAvailable = strings(query.fixAvailable)
  if (query.exploitAvailable) filters.exploitAvailable = strings(query.exploitAvailable)
  if (query.minInspectorScore !== undefined || query.maxInspectorScore !== undefined) {
    filters.inspectorScore = [{
      lowerInclusive: query.minInspectorScore,
      upperInclusive: query.maxInspectorScore
    }]
  }
  if (query.title) filters.title = strings([query.title], 'PREFIX')
  if (query.date.start && query.date.end) {
    const range = [{ startInclusive: query.date.start, endInclusive: query.date.end }]
    const field = query.date.dateField || 'updatedAt'
    if (field === 'firstObservedAt') filters.firstObservedAt = range
    else if (field === 'lastObservedAt') filters.lastObservedAt = range
    else if (field === 'updatedAt') filters.updatedAt = range
    else throw Object.assign(new Error('Unsupported Inspector dateField'), { statusCode: 400 })
  }
  return filters
}

function normalize(finding: Finding): InspectorApiFinding {
  const resource: any = finding.resources?.[0]
  const details: any = resource?.details || {}
  const image = details.awsEcrContainerImage || details.awsEcsContainer || details.awsEksCluster || {}
  const lambda = details.awsLambdaFunction || {}
  const vulnerability = finding.packageVulnerabilityDetails
  return {
    findingArn: finding.findingArn || '',
    instanceId: resource?.type === 'AWS_EC2_INSTANCE' ? resource.id : undefined,
    accountId: finding.awsAccountId || '',
    region: resource?.region || '',
    severity: (finding.severity || 'UNTRIAGED') as VulnerabilitySeverity,
    title: finding.title || 'Unknown Vulnerability',
    description: finding.description,
    type: finding.type || 'UNKNOWN',
    resourceType: resource?.type,
    status: (finding.status || 'ACTIVE') as InspectorApiFinding['status'],
    vulnerabilityId: vulnerability?.vulnerabilityId,
    cveIds: [
      ...(vulnerability?.vulnerabilityId ? [vulnerability.vulnerabilityId] : []),
      ...(vulnerability?.relatedVulnerabilities || [])
    ],
    cvssScore: vulnerability?.cvss?.[0]?.baseScore,
    inspectorScore: finding.inspectorScore,
    fixAvailable: finding.fixAvailable,
    exploitAvailable: finding.exploitAvailable,
    packageName: vulnerability?.vulnerablePackages?.[0]?.name,
    packageVersion: vulnerability?.vulnerablePackages?.[0]?.version,
    fixedVersion: vulnerability?.vulnerablePackages?.[0]?.fixedInVersion,
    remediation: finding.remediation?.recommendation?.text,
    firstObservedAt: finding.firstObservedAt?.toISOString(),
    lastObservedAt: finding.lastObservedAt?.toISOString(),
    updatedAt: finding.updatedAt?.toISOString(),
    resourceArn: resource?.id,
    imageDigest: image.imageHash || image.imageDigest,
    repository: image.repositoryName || image.repository,
    lambdaArn: lambda.functionArn,
    workload: resource?.id || image.containerName || lambda.functionName
  }
}

const sortField: Record<ParsedInspectorQuery['sortBy'], any> = {
  severity: 'SEVERITY',
  firstObservedAt: 'FIRST_OBSERVED_AT',
  lastObservedAt: 'LAST_OBSERVED_AT',
  inspectorScore: 'INSPECTOR_SCORE',
  findingStatus: 'FINDING_STATUS',
  findingType: 'FINDING_TYPE',
  resourceType: 'RESOURCE_TYPE',
  vulnerabilityId: 'VULNERABILITY_ID',
  accountId: 'AWS_ACCOUNT_ID'
}

function value(record: InspectorApiFinding, field: ParsedInspectorQuery['sortBy']) {
  if (field === 'severity') return severityRank[record.severity] || 0
  if (field === 'firstObservedAt' || field === 'lastObservedAt') return new Date(record[field] || 0).getTime()
  if (field === 'inspectorScore') return record.inspectorScore || 0
  if (field === 'findingStatus') return record.status
  if (field === 'findingType') return record.type
  if (field === 'resourceType') return record.resourceType || ''
  if (field === 'vulnerabilityId') return record.vulnerabilityId || ''
  return record.accountId
}

function compare(query: ParsedInspectorQuery, left: InspectorApiFinding, right: InspectorApiFinding) {
  const direction = query.sortOrder === 'asc' ? 1 : -1
  const leftValue = value(left, query.sortBy)
  const rightValue = value(right, query.sortBy)
  const primary = typeof leftValue === 'number' && typeof rightValue === 'number'
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue))
  if (primary) return primary * direction
  return left.findingArn.localeCompare(right.findingArn)
}

function accountId(account: IntegrationAccount, environment: 'commercial' | 'govcloud') {
  return environment === 'commercial' ? account.accountId : account.govCloudAccountId
}

function exactTotalEligible(query: ParsedInspectorQuery) {
  return query.statuses.length === 1 && query.statuses[0] === 'ACTIVE' &&
    !query.date.start && !query.resourceIds && !query.findingArns &&
    !query.vulnerabilityIds && !query.relatedVulnerabilityIds && !query.packageNames &&
    !query.repositoryNames && !query.imageDigests && !query.fixAvailable &&
    !query.exploitAvailable && query.minInspectorScore === undefined &&
    query.maxInspectorScore === undefined && !query.title &&
    (query.findingTypes?.length || 0) <= 1 && (query.resourceTypes?.length || 0) <= 1 &&
    (!query.severities || query.severities.every(severity => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(severity)))
}

async function exactTotal(
  client: Inspector2Client,
  ids: string[],
  query: ParsedInspectorQuery
): Promise<number> {
  let total = 0
  for (let index = 0; index < ids.length; index += 10) {
    let token: string | undefined
    do {
      const response = await client.send(new ListFindingAggregationsCommand({
        aggregationType: 'ACCOUNT',
        accountIds: strings(ids.slice(index, index + 10)),
        aggregationRequest: {
          accountAggregation: {
            findingType: query.findingTypes?.[0] as any,
            resourceType: query.resourceTypes?.[0] as any
          }
        },
        maxResults: 100,
        nextToken: token
      }))
      for (const item of response.responses || []) {
        const counts = (item as { accountAggregation?: AccountAggregationResponse }).accountAggregation?.severityCounts
        total += query.severities
          ? query.severities.reduce((sum, severity) => sum + Number(counts?.[severity.toLowerCase() as keyof typeof counts] || 0), 0)
          : Number(counts?.all || 0)
      }
      token = response.nextToken
    } while (token)
  }
  return total
}

export async function queryInspectorApi(accounts: IntegrationAccount[], query: ParsedInspectorQuery) {
  const anchor = securityCursorIssuedAt(query.cursor) || Date.now()
  if ('lookbackDays' in query.date && query.date.lookbackDays) {
    query.date.start = new Date(anchor - query.date.lookbackDays * 86_400_000)
    query.date.end = new Date(anchor)
  }
  const ids = accounts.map(account => accountId(account, query.environment)).filter((id): id is string => Boolean(id))
  ids.sort()
  const regions = query.regions || defaultRegions(query.environment)
  const securityAccount = query.environment === 'govcloud'
    ? process.env.AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT
    : process.env.AWS_COMMERCIAL_SECURITY_LAKE_ACCOUNT
  const batchSize = securityAccount ? 10 : 1
  const batches = Array.from({ length: Math.ceil(ids.length / batchSize) }, (_, index) => ids.slice(index * batchSize, index * batchSize + batchSize))
  const descriptors = regions.flatMap(region => batches.map((accountIds, batch) => ({
    id: `${region}:${batch}`,
    region,
    accountIds
  })))
  const initialStates: SecurityStreamState[] = descriptors.map(({ id }) => ({ id, offset: 0 }))
  const fingerprint = securityQueryFingerprint({
    provider: 'inspector',
    accounts: [...ids].sort(),
    ...query,
    cursor: undefined,
    page: undefined,
    date: {
      ...query.date,
      start: 'lookbackDays' in query.date && query.date.lookbackDays ? undefined : query.date.start?.toISOString(),
      end: 'lookbackDays' in query.date && query.date.lookbackDays ? undefined : query.date.end?.toISOString()
    }
  })
  let states = decodeSecurityCursor(query.cursor, fingerprint, initialStates)

  const clients = new Map<string, Inspector2Client>()
  const clientFor = async (region: string, id: string) => {
    const key = `${region}:${id}`
    if (!clients.has(key)) {
      clients.set(key, await getInspector2Client(query.environment, region, securityAccount || id))
    }
    return clients.get(key)!
  }

  const runPage = async () => {
    try {
      const merged = await mergeSecurityStreams(states, query.limit, async state => {
        const descriptor = descriptors.find(item => item.id === state.id)!
        const client = await clientFor(descriptor.region, descriptor.accountIds[0]!)
        const response = await client.send(new ListFindingsCommand({
          filterCriteria: filtersFor(query, descriptor.accountIds),
          sortCriteria: {
            field: sortField[query.sortBy],
            sortOrder: query.sortOrder === 'asc' ? 'ASC' : 'DESC'
          },
          maxResults: 100,
          nextToken: state.token
        }))
        return { records: (response.findings || []).map(normalize), nextToken: response.nextToken }
      }, (left, right) => compare(query, left, right))
      states = merged.states
      return merged
    } catch (error) {
      if ((error as any)?.statusCode) throw error
      sanitizeProviderError('Amazon Inspector', error)
    }
  }

  let result = await runPage()
  for (let currentPage = 1; currentPage < query.page; currentPage++) {
    if (!result.hasMore) {
      result = { ...result, records: [] }
      break
    }
    result = await runPage()
  }

  let total: number | null = null
  let totalIsExact = false
  if (exactTotalEligible(query)) {
    try {
      total = 0
      for (const region of regions) {
        if (securityAccount) {
          const client = await clientFor(region, ids[0]!)
          total += await exactTotal(client, ids, query)
        } else {
          for (const id of ids) {
            total += await exactTotal(await clientFor(region, id), [id], query)
          }
        }
      }
      totalIsExact = true
    } catch (error) {
      sanitizeProviderError('Amazon Inspector', error)
    }
  }

  return {
    records: result.records,
    pagination: {
      limit: query.limit,
      returned: result.records.length,
      hasMore: result.hasMore,
      nextCursor: result.hasMore ? encodeSecurityCursor(fingerprint, states, anchor) : null,
      total,
      totalIsExact
    },
    accounts: ids,
    environment: query.environment
  }
}
