import {
  GetCostAndUsageCommand,
  GetTagsCommand,
  type ResultByTime
} from '@aws-sdk/client-cost-explorer'
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { getCostExplorerClient, getSTSClient } from '../lib/aws-client-factory'
import { getCostAllocationTags, getCostAndUsage } from './cost-explorer'
import { getRelativeDateRange, type RelativePeriod } from './date-helpers'
import type { CostExplorerParams } from '../types'

const TOLERANCE = 1
export type ValidationStatus = 'PASS' | 'FAIL' | 'UNAVAILABLE'

export interface ValidationTest {
  name: string
  status: ValidationStatus
  passed: boolean
  message: string
  details: {
    awsValue: number
    apiValue: number
    difference: number
    tolerance: number
  }
}

export interface AccountComparison {
  accountId: string
  accountName: string
  awsBillable: number
  apiBillable: number
  awsProforma: number
  apiProforma: number
  billableDifference: number
  proformaDifference: number
  billableMatch: boolean
  proformaMatch: boolean
  notes: string
}

export interface CostValidationResult {
  timestamp: string
  dateRange: { startDate: string; endDate: string; description: string; period?: string }
  environment: 'commercial' | 'govcloud'
  tests: ValidationTest[]
  accountComparisons: AccountComparison[]
  summary: {
    totalTests: number
    passed: number
    failed: number
    unavailable: number
    overallStatus: ValidationStatus
  }
  metadata: {
    masterAccountId: string
    proformaAccountId: string
    totalAccounts: number
    verifiedCallerAccounts: string[]
  }
}

interface DirectDomainResult {
  accountId: string
  periods: ResultByTime[]
  total: number
  groups: Map<string, number>
  tags: string[]
}

function amount(value?: string): number {
  const parsed = Number.parseFloat(value || '0')
  return Number.isFinite(parsed) ? parsed : 0
}

function periodKey(period: ResultByTime): string {
  return `${period.TimePeriod?.Start || ''}|${period.TimePeriod?.End || ''}`
}

function addGroups(periods: ResultByTime[]): Map<string, number> {
  const groups = new Map<string, number>()
  for (const period of periods) {
    for (const group of period.Groups || []) {
      const key = JSON.stringify(group.Keys || [])
      groups.set(key, (groups.get(key) || 0) + amount(group.Metrics?.UnblendedCost?.Amount))
    }
  }
  return groups
}

function mergeDirectPages(pages: ResultByTime[][]): ResultByTime[] {
  const periods = new Map<string, ResultByTime>()
  for (const page of pages) {
    for (const incoming of page) {
      const key = periodKey(incoming)
      const current = periods.get(key)
      if (!current) {
        periods.set(key, { ...incoming, Groups: [...(incoming.Groups || [])] })
      } else {
        current.Groups = [...(current.Groups || []), ...(incoming.Groups || [])]
      }
    }
  }
  return [...periods.values()].sort((a, b) => periodKey(a).localeCompare(periodKey(b)))
}

async function directPages(client: Awaited<ReturnType<typeof getCostExplorerClient>>, params: CostExplorerParams, grouped: boolean) {
  const pages: ResultByTime[][] = []
  let nextPageToken: string | undefined
  do {
    const response = await client.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: params.startDate, End: params.endDate },
      Granularity: params.granularity,
      Metrics: params.metrics,
      Filter: params.filter,
      GroupBy: grouped ? params.groupBy?.map(group => ({ Type: group.type, Key: group.key })) : undefined,
      NextPageToken: nextPageToken
    }))
    pages.push(response.ResultsByTime || [])
    nextPageToken = response.NextPageToken
  } while (nextPageToken)
  return mergeDirectPages(pages)
}

async function directTags(
  client: Awaited<ReturnType<typeof getCostExplorerClient>>,
  startDate: string,
  endDate: string
): Promise<string[]> {
  const tags = new Set<string>()
  let nextPageToken: string | undefined
  do {
    const response = await client.send(new GetTagsCommand({
      TimePeriod: { Start: startDate, End: endDate },
      NextPageToken: nextPageToken
    }))
    for (const tag of response.Tags || []) tags.add(tag)
    nextPageToken = response.NextPageToken
  } while (nextPageToken)
  return [...tags].sort()
}

async function queryDirectDomain(
  params: CostExplorerParams,
  environment: 'commercial' | 'govcloud',
  accountId: string
): Promise<DirectDomainResult> {
  const sts = await getSTSClient(environment, undefined, accountId)
  const identity = await sts.send(new GetCallerIdentityCommand({}))
  if (identity.Account !== accountId) {
    throw new Error(`Caller identity mismatch: expected ${accountId}, received ${identity.Account || 'unknown'}`)
  }
  const client = await getCostExplorerClient(environment, undefined, accountId)
  const [groupedPeriods, totalPeriods, tags] = await Promise.all([
    directPages(client, params, true),
    directPages(client, params, false),
    directTags(client, params.startDate, params.endDate)
  ])
  const totals = new Map(totalPeriods.map(period => [periodKey(period), period.Total || {}]))
  for (const period of groupedPeriods) period.Total = totals.get(periodKey(period)) || period.Total
  return {
    accountId,
    periods: groupedPeriods,
    total: totalPeriods.reduce((sum, period) => sum + amount(period.Total?.UnblendedCost?.Amount), 0),
    groups: addGroups(groupedPeriods),
    tags
  }
}

function testResult(name: string, awsValue: number, apiValue: number, message?: string): ValidationTest {
  const difference = Math.abs(awsValue - apiValue)
  const status: ValidationStatus = difference <= TOLERANCE ? 'PASS' : 'FAIL'
  return {
    name,
    status,
    passed: status === 'PASS',
    message: message || `${name}: direct AWS=${awsValue.toFixed(2)}, canonical=${apiValue.toFixed(2)}`,
    details: { awsValue, apiValue, difference, tolerance: TOLERANCE }
  }
}

function unavailable(name: string, error: unknown): ValidationTest {
  const message = error instanceof Error ? error.message : String(error)
  return {
    name,
    status: 'UNAVAILABLE',
    passed: false,
    message: `Validation unavailable: ${message}`,
    details: { awsValue: 0, apiValue: 0, difference: 0, tolerance: TOLERANCE }
  }
}

function comparePeriods(name: string, direct: ResultByTime[], canonical: ResultByTime[]): ValidationTest {
  const directMap = new Map(direct.map(period => [periodKey(period), amount(period.Total?.UnblendedCost?.Amount)]))
  const canonicalMap = new Map(canonical.map(period => [periodKey(period), amount(period.Total?.UnblendedCost?.Amount)]))
  const keys = new Set([...directMap.keys(), ...canonicalMap.keys()])
  const difference = [...keys].reduce((sum, key) => sum + Math.abs((directMap.get(key) || 0) - (canonicalMap.get(key) || 0)), 0)
  return testResult(name, 0, difference, `${name}: ${keys.size} aligned periods, aggregate delta=${difference.toFixed(2)}`)
}

function compareGroups(name: string, direct: Map<string, number>, canonical: Map<string, number>): ValidationTest {
  const keys = new Set([...direct.keys(), ...canonical.keys()])
  const difference = [...keys].reduce((sum, key) => sum + Math.abs((direct.get(key) || 0) - (canonical.get(key) || 0)), 0)
  return testResult(name, 0, difference, `${name}: ${keys.size} groups, aggregate delta=${difference.toFixed(2)}`)
}

async function validateDomain(
  source: 'Billable' | 'Proforma',
  params: CostExplorerParams,
  environment: 'commercial' | 'govcloud',
  accountId: string
): Promise<{ tests: ValidationTest[]; direct?: DirectDomainResult; canonicalGroups?: Map<string, number> }> {
  try {
    const [direct, canonical, canonicalTags] = await Promise.all([
      queryDirectDomain(params, environment, accountId),
      getCostAndUsage(params, environment, accountId),
      getCostAllocationTags(
        { Start: params.startDate, End: params.endDate },
        undefined,
        params.filter,
        environment,
        accountId
      )
    ])
    const canonicalGroups = addGroups(canonical.resultsByTime)
    const canonicalTotal = amount(canonical.total?.UnblendedCost?.Amount)
    const tagsMatch = JSON.stringify(direct.tags) === JSON.stringify(canonicalTags.tags)
    const tagTest: ValidationTest = {
      name: `${source} tags`,
      status: tagsMatch ? 'PASS' : 'FAIL',
      passed: tagsMatch,
      message: `${source} tags: ${tagsMatch ? 'matching' : 'mismatched'} tag-key sets`,
      details: {
        awsValue: direct.tags.length,
        apiValue: canonicalTags.tags.length,
        difference: tagsMatch ? 0 : Math.max(1, Math.abs(direct.tags.length - canonicalTags.tags.length)),
        tolerance: 0
      }
    }
    return {
      direct,
      canonicalGroups,
      tests: [
        testResult(`${source} total`, direct.total, canonicalTotal),
        comparePeriods(`${source} periods`, direct.periods, canonical.resultsByTime),
        compareGroups(`${source} account groups`, direct.groups, canonicalGroups),
        tagTest
      ]
    }
  } catch (error) {
    return { tests: [unavailable(`${source} AWS validation`, error)] }
  }
}

function buildAccountComparisons(
  billable?: { direct?: DirectDomainResult; canonicalGroups?: Map<string, number> },
  proforma?: { direct?: DirectDomainResult; canonicalGroups?: Map<string, number> }
): AccountComparison[] {
  const ids = new Set<string>()
  const read = (groups: Map<string, number> | undefined, id: string) => groups?.get(JSON.stringify([id])) || 0
  for (const result of [billable?.direct?.groups, billable?.canonicalGroups, proforma?.direct?.groups, proforma?.canonicalGroups]) {
    for (const key of result?.keys() || []) {
      const values = JSON.parse(key) as string[]
      if (values[0]) ids.add(values[0])
    }
  }
  return [...ids].map(accountId => {
    const awsBillable = read(billable?.direct?.groups, accountId)
    const apiBillable = read(billable?.canonicalGroups, accountId)
    const awsProforma = read(proforma?.direct?.groups, accountId)
    const apiProforma = read(proforma?.canonicalGroups, accountId)
    const billableDifference = apiBillable - awsBillable
    const proformaDifference = apiProforma - awsProforma
    return {
      accountId,
      accountName: 'Unknown',
      awsBillable,
      apiBillable,
      awsProforma,
      apiProforma,
      billableDifference,
      proformaDifference,
      billableMatch: Math.abs(billableDifference) <= TOLERANCE,
      proformaMatch: Math.abs(proformaDifference) <= TOLERANCE,
      notes: ''
    }
  }).sort((a, b) => b.awsBillable - a.awsBillable)
}

export async function runValidation(
  period: RelativePeriod,
  environment: 'commercial' | 'govcloud',
  includeProforma: boolean,
  masterAccountId = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477',
  proformaAccountId = process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
): Promise<CostValidationResult> {
  const { startDate, endDate, description } = getRelativeDateRange(period)
  const params: CostExplorerParams = {
    startDate,
    endDate,
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost'],
    groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
  }
  const billableAccountId = environment === 'commercial'
    ? masterAccountId
    : process.env.AWS_GOVCLOUD_MASTER_ACCOUNT_ID
  const billable: Awaited<ReturnType<typeof validateDomain>> = billableAccountId
    ? await validateDomain('Billable', params, environment, billableAccountId)
    : { tests: [unavailable('Billable AWS validation', new Error('AWS_GOVCLOUD_MASTER_ACCOUNT_ID is not configured'))] }
  const proforma: Awaited<ReturnType<typeof validateDomain>> | undefined = includeProforma
    ? environment === 'commercial'
      ? await validateDomain('Proforma', params, 'commercial', proformaAccountId)
      : { tests: [unavailable('Proforma AWS validation', new Error('Proforma is unavailable in GovCloud'))] }
    : undefined
  const tests = [...billable.tests, ...(proforma?.tests || [])]
  const accountComparisons = buildAccountComparisons(billable, proforma)
  const failed = tests.filter(test => test.status === 'FAIL').length
  const unavailableCount = tests.filter(test => test.status === 'UNAVAILABLE').length
  const passed = tests.filter(test => test.status === 'PASS').length
  const overallStatus: ValidationStatus = failed > 0 ? 'FAIL' : unavailableCount > 0 ? 'UNAVAILABLE' : 'PASS'
  return {
    timestamp: new Date().toISOString(),
    dateRange: { startDate, endDate, description, period },
    environment,
    tests,
    accountComparisons,
    summary: { totalTests: tests.length, passed, failed, unavailable: unavailableCount, overallStatus },
    metadata: {
      masterAccountId,
      proformaAccountId,
      totalAccounts: accountComparisons.length,
      verifiedCallerAccounts: [billable.direct?.accountId, proforma?.direct?.accountId].filter(Boolean) as string[]
    }
  }
}

export function generateCsvReport(result: CostValidationResult): string {
  const lines = [
    'Account ID,Account Name,AWS Billable,API Billable,AWS Proforma,API Proforma,Billable Difference,Proforma Difference,Billable Match,Proforma Match,Notes'
  ]
  for (const account of result.accountComparisons) {
    lines.push([
      account.accountId,
      `"${account.accountName}"`,
      account.awsBillable.toFixed(2),
      account.apiBillable.toFixed(2),
      account.awsProforma.toFixed(2),
      account.apiProforma.toFixed(2),
      account.billableDifference.toFixed(2),
      account.proformaDifference.toFixed(2),
      account.billableMatch ? 'YES' : 'NO',
      account.proformaMatch ? 'YES' : 'NO',
      `"${account.notes}"`
    ].join(','))
  }
  lines.push('', '=== SUMMARY ===', 'Metric,Value')
  lines.push(`Overall Status,${result.summary.overallStatus}`)
  lines.push(`Tests Passed,${result.summary.passed}`)
  lines.push(`Tests Failed,${result.summary.failed}`)
  lines.push(`Tests Unavailable,${result.summary.unavailable}`)
  return lines.join('\n')
}
