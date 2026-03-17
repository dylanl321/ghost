/**
 * LEGACY FALLBACK - Prefer security-hub-athena.ts for production data.
 *
 * Security Hub V2 Statistics Utility
 *
 * Uses GetFindingStatisticsV2Command to get aggregate counts without pagination limits.
 * Falls back to GetFindingsCommand-based approach if V2 API is unavailable (e.g. GovCloud).
 *
 * This module is retained as an emergency fallback when Athena is unavailable.
 * The primary data path is: Athena -> DynamoDB -> in-memory cache
 * (see security-hub-athena.ts and security-summary-store.ts)
 */

import {
  GetFindingStatisticsV2Command,
  GroupByField,
  OcsfStringField,
  OcsfDateField,
  DateRangeUnit,
  StringFilterComparison,
  AllowedOperators,
  type SecurityHubClient,
  type GroupByRule,
  type GroupByResult,
  type OcsfFindingFilters,
  type CompositeFilter,
} from '@aws-sdk/client-securityhub'
import { getClient } from '../lib/aws-client-factory'
import { getAllAccountsUnified } from './accounts-consolidated'
import { getSecurityHubFindings } from './security-hub-data'
import { logger } from './logger'
import type {
  OrgSecuritySummary,
  AccountRiskEntry,
  SecurityFindingSummary,
} from '../../shared/types/security-dashboard'
import type { FindingSeverity } from '../../shared/types/security-hub'

export interface ProgressEvent {
  stage: string
  message: string
  percent: number
  region?: string
  totalAccounts?: number
  findingsSoFar?: number
}

type ProgressCallback = (event: ProgressEvent) => void

interface SecurityStatistics {
  severityBreakdown: Record<FindingSeverity, number>
  accountBreakdown: Map<string, { critical: number; high: number; medium: number; low: number; total: number }>
  productBreakdown: Record<string, number>
  complianceCounts: { passed: number; failed: number; warning: number; notAvailable: number; total: number }
  totalFindings: number
}

async function getSecurityHubClient(region: string, environment: 'commercial' | 'govcloud'): Promise<SecurityHubClient> {
  const securityLakeAccount = environment === 'govcloud'
    ? process.env.AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT
    : process.env.AWS_COMMERCIAL_SECURITY_LAKE_ACCOUNT

  if (!securityLakeAccount) {
    throw new Error(`Security Lake account not configured for ${environment}`)
  }

  return getClient<SecurityHubClient>(environment, 'securityhub', region, securityLakeAccount)
}

function getDefaultRegions(environment: 'commercial' | 'govcloud'): string[] {
  if (environment === 'govcloud') return ['us-gov-west-1', 'us-gov-east-1']
  return ['us-east-1', 'us-west-2']
}

function getRiskLevel(score: number): AccountRiskEntry['riskLevel'] {
  if (score >= 80) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  if (score > 0) return 'LOW'
  return 'MINIMAL'
}

/**
 * Build OCSF filter for active findings in the last 90 days
 */
function buildActiveFilter(): OcsfFindingFilters {
  const statusFilter: CompositeFilter = {
    StringFilters: [
      {
        FieldName: OcsfStringField.STATUS,
        Filter: { Value: 'New', Comparison: StringFilterComparison.EQUALS },
      },
    ],
    DateFilters: [
      {
        FieldName: OcsfDateField.FINDING_INFO_CREATED_TIME_DT,
        Filter: { DateRange: { Value: 90, Unit: DateRangeUnit.DAYS } },
      },
    ],
    Operator: AllowedOperators.AND,
  }

  return {
    CompositeFilters: [statusFilter],
    CompositeOperator: AllowedOperators.AND,
  }
}

/**
 * Build OCSF filter for active findings of a specific severity
 */
function buildSeverityFilter(severity: string): OcsfFindingFilters {
  const filter: CompositeFilter = {
    StringFilters: [
      {
        FieldName: OcsfStringField.STATUS,
        Filter: { Value: 'New', Comparison: StringFilterComparison.EQUALS },
      },
      {
        FieldName: OcsfStringField.SEVERITY,
        Filter: { Value: severity, Comparison: StringFilterComparison.EQUALS },
      },
    ],
    DateFilters: [
      {
        FieldName: OcsfDateField.FINDING_INFO_CREATED_TIME_DT,
        Filter: { DateRange: { Value: 90, Unit: DateRangeUnit.DAYS } },
      },
    ],
    Operator: AllowedOperators.AND,
  }

  return {
    CompositeFilters: [filter],
    CompositeOperator: AllowedOperators.AND,
  }
}

/**
 * Parse GroupByResult into a key-value map of field value -> count
 */
function parseGroupByResult(result: GroupByResult): Map<string, number> {
  const map = new Map<string, number>()
  for (const gv of result.GroupByValues || []) {
    if (gv.FieldValue && gv.Count != null) {
      map.set(gv.FieldValue, gv.Count)
    }
  }
  return map
}

/**
 * Get aggregate security statistics using V2 API
 */
export async function getOrgSecurityStatistics(
  onProgress?: ProgressCallback
): Promise<SecurityStatistics> {
  const environment = (process.env.AWS_SECURITYHUB_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
  const regions = getDefaultRegions(environment)

  const stats: SecurityStatistics = {
    severityBreakdown: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 },
    accountBreakdown: new Map(),
    productBreakdown: {},
    complianceCounts: { passed: 0, failed: 0, warning: 0, notAvailable: 0, total: 0 },
    totalFindings: 0,
  }

  const activeFilter = buildActiveFilter()
  const regionStep = 30 / regions.length // 10-40% range spread across regions

  for (let ri = 0; ri < regions.length; ri++) {
    const region = regions[ri]
    const basePercent = 10 + ri * regionStep

    onProgress?.({
      stage: 'querying_region',
      message: `Querying statistics in ${region}...`,
      percent: Math.round(basePercent),
      region,
    })

    let client: SecurityHubClient
    try {
      client = await getSecurityHubClient(region, environment)
    } catch (err: any) {
      logger.warn('[SecurityHubStats] Cannot get client for region', { region, error: err.message })
      continue
    }

    try {
      // Request 1: severity, product, compliance breakdowns
      const overviewRules: GroupByRule[] = [
        { GroupByField: GroupByField.SEVERITY, Filters: activeFilter },
        { GroupByField: GroupByField.METADATA_PRODUCT_NAME, Filters: activeFilter },
        { GroupByField: GroupByField.COMPLIANCE_STATUS, Filters: activeFilter },
      ]

      const overviewResponse = await client.send(new GetFindingStatisticsV2Command({
        GroupByRules: overviewRules,
        MaxStatisticResults: 500,
      }))

      for (const result of overviewResponse.GroupByResults || []) {
        const values = parseGroupByResult(result)

        if (result.GroupByField === GroupByField.SEVERITY) {
          for (const [rawVal, count] of values) {
            const key = rawVal.toUpperCase() as FindingSeverity
            if (key in stats.severityBreakdown) {
              stats.severityBreakdown[key] += count
            }
          }
        } else if (result.GroupByField === GroupByField.METADATA_PRODUCT_NAME) {
          for (const [product, count] of values) {
            stats.productBreakdown[product] = (stats.productBreakdown[product] || 0) + count
          }
        } else if (result.GroupByField === GroupByField.COMPLIANCE_STATUS) {
          for (const [rawStatus, count] of values) {
            const status = rawStatus.toUpperCase()
            if (status === 'PASSED' || status === 'PASS') stats.complianceCounts.passed += count
            else if (status === 'FAILED' || status === 'FAIL') stats.complianceCounts.failed += count
            else if (status === 'WARNING') stats.complianceCounts.warning += count
            else stats.complianceCounts.notAvailable += count
            stats.complianceCounts.total += count
          }
        }
      }

      // Request 2: per-account breakdown by severity (4 rules, one per severity)
      const severityLabels = ['Critical', 'High', 'Medium', 'Low'] as const
      const accountRules: GroupByRule[] = severityLabels.map(sev => ({
        GroupByField: GroupByField.CLOUD_ACCOUNT_UID,
        Filters: buildSeverityFilter(sev),
      }))

      const accountResponse = await client.send(new GetFindingStatisticsV2Command({
        GroupByRules: accountRules,
        MaxStatisticResults: 500,
      }))

      // Each result corresponds to a severity level in order
      const accountResults = accountResponse.GroupByResults || []
      for (let si = 0; si < accountResults.length && si < severityLabels.length; si++) {
        const sevKey = severityLabels[si].toLowerCase() as 'critical' | 'high' | 'medium' | 'low'
        const values = parseGroupByResult(accountResults[si])

        for (const [accountId, count] of values) {
          const existing = stats.accountBreakdown.get(accountId) || { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
          existing[sevKey] += count
          existing.total += count
          stats.accountBreakdown.set(accountId, existing)
        }
      }

      onProgress?.({
        stage: 'querying_region',
        message: `${region} statistics complete`,
        percent: Math.round(basePercent + regionStep),
        region,
      })
    } catch (err: any) {
      // V2 API may not be available in this region/environment
      logger.error('[SecurityHubStats] V2 statistics failed for region', { region, error: err.message })
      throw err // Let caller handle fallback
    }
  }

  // Calculate total from severity breakdown
  stats.totalFindings = Object.values(stats.severityBreakdown).reduce((sum, v) => sum + v, 0)

  return stats
}

/**
 * Fetch top critical/high findings using GetFindingsCommand (limited, for display only)
 */
export async function getTopCriticalFindingsLite(
  environment: 'commercial' | 'govcloud',
  regions?: string[],
  limit: number = 20
): Promise<SecurityFindingSummary[]> {
  const { GetFindingsCommand } = await import('@aws-sdk/client-securityhub')
  const queryRegions = regions || getDefaultRegions(environment)
  const allAccounts = await getAllAccountsUnified()

  // Build account name map for the environment
  const accountNameMap = new Map<string, string>()
  for (const acc of allAccounts) {
    const name = acc.accountName || acc.projectName || acc.accountId
    if (environment === 'govcloud' && acc.awsGovCloudAccountID) {
      accountNameMap.set(acc.awsGovCloudAccountID, name)
    } else {
      accountNameMap.set(acc.accountId, name)
    }
  }

  const findings: SecurityFindingSummary[] = []
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 90)

  for (const region of queryRegions) {
    try {
      const client = await getSecurityHubClient(region, environment)

      let nextToken: string | undefined
      let pageCount = 0
      const maxPages = 2 // Only need top findings, 200 is plenty

      do {
        const response = await client.send(new GetFindingsCommand({
          Filters: {
            SeverityLabel: [
              { Value: 'CRITICAL', Comparison: 'EQUALS' },
              { Value: 'HIGH', Comparison: 'EQUALS' },
            ],
            RecordState: [{ Value: 'ACTIVE', Comparison: 'EQUALS' }],
            WorkflowStatus: [
              { Value: 'NEW', Comparison: 'EQUALS' },
              { Value: 'NOTIFIED', Comparison: 'EQUALS' },
            ],
            FirstObservedAt: [{ Start: startDate.toISOString(), End: new Date().toISOString() }],
          },
          SortCriteria: [{ Field: 'SeverityNormalized', SortOrder: 'desc' }],
          MaxResults: 100,
          NextToken: nextToken,
        }))
        pageCount++

        for (const f of response.Findings || []) {
          findings.push({
            id: f.Id || '',
            title: f.Title || 'Untitled Finding',
            severity: (f.Severity?.Label || 'INFORMATIONAL') as FindingSeverity,
            workflowStatus: (f.Workflow?.Status || 'NEW') as any,
            productName: f.ProductName || f.CompanyName || 'Unknown',
            resourceType: f.Resources?.[0]?.Type || 'Unknown',
            resourceId: f.Resources?.[0]?.Id || 'Unknown',
            accountId: f.AwsAccountId || '',
            accountName: accountNameMap.get(f.AwsAccountId || '') || f.AwsAccountId || 'Unknown',
            region: f.Region || region,
            complianceStatus: f.Compliance?.Status as any,
            recommendation: f.Remediation?.Recommendation?.Text,
            remediationUrl: f.Remediation?.Recommendation?.Url,
            createdAt: f.CreatedAt || '',
            updatedAt: f.UpdatedAt || '',
          })
        }

        nextToken = response.NextToken
      } while (nextToken && pageCount < maxPages)
    } catch (err: any) {
      if (err.name !== 'InvalidAccessException' && !err.message?.includes('not subscribed')) {
        logger.error('[SecurityHubStats] Failed to fetch top findings', { region, error: err.message })
      }
    }
  }

  // Sort by severity (CRITICAL first) then by date
  const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 }
  findings.sort((a, b) => {
    const d = (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
    return d !== 0 ? d : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  return findings.slice(0, limit)
}

/**
 * Build a complete OrgSecuritySummary.
 * Tries V2 aggregate API first, falls back to GetFindingsCommand if unavailable.
 */
export async function buildOrgSecuritySummary(
  onProgress?: ProgressCallback
): Promise<OrgSecuritySummary> {
  const environment = (process.env.AWS_SECURITYHUB_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'

  onProgress?.({ stage: 'init', message: 'Initializing security data fetch...', percent: 0 })

  // Load accounts for name mapping
  onProgress?.({ stage: 'accounts_loading', message: 'Loading account list...', percent: 5 })
  const allAccounts = await getAllAccountsUnified()

  const accountNameMap = new Map<string, string>()
  for (const acc of allAccounts) {
    const name = acc.accountName || acc.projectName || acc.accountId
    if (environment === 'govcloud' && acc.awsGovCloudAccountID) {
      accountNameMap.set(acc.awsGovCloudAccountID, name)
    }
    accountNameMap.set(acc.accountId, name)
  }

  onProgress?.({
    stage: 'accounts_loaded',
    message: `Found ${allAccounts.length} accounts`,
    percent: 10,
    totalAccounts: allAccounts.length,
  })

  let useV2 = true
  let stats: SecurityStatistics | null = null

  // Try V2 aggregate API
  try {
    stats = await getOrgSecurityStatistics(onProgress)
    logger.info('[SecurityHubStats] V2 statistics retrieved successfully', {
      totalFindings: stats.totalFindings,
      accountsWithFindings: stats.accountBreakdown.size,
    })
  } catch (err: any) {
    useV2 = false
    logger.warn('[SecurityHubStats] V2 API unavailable, falling back to GetFindingsCommand', { error: err.message })

    onProgress?.({ stage: 'fallback', message: 'Using legacy findings API...', percent: 15 })

    // Fallback: use existing GetFindingsCommand-based approach
    const findings = await getSecurityHubFindings([], { activeOnly: true, lookbackDays: 90 })

    stats = {
      severityBreakdown: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 },
      accountBreakdown: new Map(),
      productBreakdown: {},
      complianceCounts: { passed: 0, failed: 0, warning: 0, notAvailable: 0, total: 0 },
      totalFindings: findings.length,
    }

    for (const f of findings) {
      stats.severityBreakdown[f.severity]++
      stats.productBreakdown[f.productName] = (stats.productBreakdown[f.productName] || 0) + 1

      const acct = stats.accountBreakdown.get(f.accountId) || { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
      acct.total++
      if (f.severity === 'CRITICAL') acct.critical++
      else if (f.severity === 'HIGH') acct.high++
      else if (f.severity === 'MEDIUM') acct.medium++
      else if (f.severity === 'LOW') acct.low++
      stats.accountBreakdown.set(f.accountId, acct)

      if (f.complianceStatus) {
        stats.complianceCounts.total++
        if (f.complianceStatus === 'PASSED') stats.complianceCounts.passed++
        else if (f.complianceStatus === 'FAILED') stats.complianceCounts.failed++
        else if (f.complianceStatus === 'WARNING') stats.complianceCounts.warning++
        else stats.complianceCounts.notAvailable++
      }
    }
  }

  // Fetch top findings
  onProgress?.({ stage: 'fetching_top_findings', message: 'Fetching top critical findings...', percent: 80 })
  const topFindings = await getTopCriticalFindingsLite(environment)

  // Aggregate results
  onProgress?.({ stage: 'aggregating', message: 'Computing risk scores...', percent: 90 })

  // Build per-account risk ranking
  const accountRiskRanking: AccountRiskEntry[] = []
  for (const [accountId, counts] of stats.accountBreakdown) {
    const riskScore = Math.min(100, counts.critical * 20 + counts.high * 10 + counts.medium * 3 + counts.low * 1)
    accountRiskRanking.push({
      accountId,
      accountName: accountNameMap.get(accountId) || accountId,
      riskScore,
      riskLevel: getRiskLevel(riskScore),
      totalFindings: counts.total,
      criticalCount: counts.critical,
      highCount: counts.high,
    })
  }

  accountRiskRanking.sort((a, b) => b.riskScore - a.riskScore)

  // Org risk score: weighted average of top 10 accounts
  const top10Scores = accountRiskRanking.slice(0, 10).map(a => a.riskScore)
  const orgRiskScore = top10Scores.length > 0
    ? Math.round(top10Scores.reduce((s, v) => s + v, 0) / top10Scores.length)
    : 0

  const accountsAtRisk = accountRiskRanking.filter(a => a.riskScore >= 50).length
  const complianceRate = stats.complianceCounts.total > 0
    ? Math.round((stats.complianceCounts.passed / stats.complianceCounts.total) * 100)
    : 100

  const result: OrgSecuritySummary = {
    totalFindings: stats.totalFindings,
    totalAccounts: stats.accountBreakdown.size,
    accountsAtRisk,
    orgRiskScore,
    complianceRate,
    severityBreakdown: stats.severityBreakdown,
    findingsByProduct: stats.productBreakdown,
    accountRiskRanking,
    topFindings,
    lastUpdated: new Date().toISOString(),
  }

  logger.info(`[SecurityHubStats] Summary built (${useV2 ? 'V2' : 'fallback'}): ${result.totalFindings} findings, ${result.totalAccounts} accounts, orgRiskScore=${orgRiskScore}`)

  return result
}
