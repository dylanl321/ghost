/**
 * Security Hub Athena Aggregation
 *
 * Queries the `security_hub` database via Athena to get complete
 * finding statistics. The parquet_findings table contains normalized findings
 * from Security Hub, Inspector, and operating-system benchmark scans.
 *
 * Falls back to the legacy Security Hub API if Athena fails.
 */

import { getAthenaClient } from '../lib/aws-client-factory'
import { getEnvironmentConfig } from './security-lake-consolidated'
import { getAllAccountsUnified, lookupAccountUnified } from './accounts-consolidated'
import { logger } from './logger'
import type {
  OrgSecuritySummary,
  AccountSecuritySummary,
  AccountRiskEntry,
  SecurityFindingSummary,
  FindingsTrendPoint,
  SeverityByProductEntry,
  FindingAgeBuckets,
  SecuritySourceFilter,
  ResourceFindingGroup,
  TitleFindingGroup,
  CveFindingGroup,
} from '../../shared/types/security-dashboard'
import type { FindingSeverity } from '../../shared/types/security-hub'

// ProgressEvent is already exported from security-hub-statistics.ts (auto-imported by Nitro)
interface AthenaProgressEvent {
  stage: string
  message: string
  percent: number
  region?: string
  totalAccounts?: number
  findingsSoFar?: number
}

type ProgressCallback = (event: AthenaProgressEvent) => void

// ---------------------------------------------------------------------------
// security_hub source subquery helper
// ---------------------------------------------------------------------------

const SECURITY_HUB_DATABASE = 'security_hub'
const SECURITY_HUB_TABLE = 'parquet_findings'

/** Builds a findings subquery while preserving the dashboard source filters. */
export function buildFindingsSource(source: SecuritySourceFilter = 'all'): string {
  const sourcePredicates: Record<SecuritySourceFilter, string | null> = {
    all: null,
    platform: "productname IN ('Security Hub', 'Inspector')",
    os: "productname LIKE 'Inspector CIS Benchmark%'",
  }
  const predicate = sourcePredicates[source]
  const where = predicate ? `\n  WHERE ${predicate}` : ''

  return `(\n  SELECT * FROM ${SECURITY_HUB_DATABASE}.${SECURITY_HUB_TABLE}${where}\n) AS findings`
}

// ---------------------------------------------------------------------------
// Athena SQL execution helper
// ---------------------------------------------------------------------------

async function executeAthenaSQL(
  sql: string,
  environment: 'commercial' | 'govcloud'
): Promise<Record<string, string>[]> {
  // Reuse getEnvironmentConfig for region, account, and bucket — but override database
  const config = getEnvironmentConfig(environment)
  const athenaClient = await getAthenaClient(environment, config.region, config.monitoringAccountId)

  const { StartQueryExecutionCommand } = await import('@aws-sdk/client-athena')
  const startResponse = await athenaClient.send(new StartQueryExecutionCommand({
    QueryString: sql,
    WorkGroup: 'primary',
    QueryExecutionContext: {
      Database: SECURITY_HUB_DATABASE,
    },
    ResultConfiguration: {
      OutputLocation: `s3://${config.athenaResultsBucket}/security-lake/`,
    },
  }))

  if (!startResponse.QueryExecutionId) {
    throw new Error('Failed to start Athena query')
  }

  // Poll for completion
  const { GetQueryExecutionCommand } = await import('@aws-sdk/client-athena')
  const pollIntervalMs = 2000
  const maxAttempts = 120 // 4 minutes
  let attempts = 0

  while (attempts < maxAttempts) {
    const statusResponse = await athenaClient.send(new GetQueryExecutionCommand({
      QueryExecutionId: startResponse.QueryExecutionId,
    }))

    const state = statusResponse.QueryExecution?.Status?.State
    if (state === 'SUCCEEDED') break
    if (state === 'FAILED' || state === 'CANCELLED') {
      const reason = statusResponse.QueryExecution?.Status?.StateChangeReason || 'Unknown error'
      throw new Error(`Athena query failed: ${reason}`)
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    attempts++
  }

  if (attempts >= maxAttempts) {
    throw new Error('Athena query timeout after 4 minutes')
  }

  // Get results
  const { GetQueryResultsCommand } = await import('@aws-sdk/client-athena')
  const resultsResponse = await athenaClient.send(new GetQueryResultsCommand({
    QueryExecutionId: startResponse.QueryExecutionId,
  }))

  const rows = resultsResponse.ResultSet?.Rows || []
  const columns = rows[0]?.Data || []

  return rows.slice(1).map(row => {
    const record: Record<string, string> = {}
    row.Data?.forEach((cell, index) => {
      const columnName = columns[index]?.VarCharValue || `column_${index}`
      record[columnName] = cell.VarCharValue || ''
    })
    return record
  })
}

// ---------------------------------------------------------------------------
// Risk scoring helpers
// ---------------------------------------------------------------------------

export function computeRiskScore(critical: number, high: number, medium: number, low: number): number {
  return Math.min(100, critical * 20 + high * 10 + medium * 3 + low * 1)
}

export function getRiskLevel(score: number): AccountRiskEntry['riskLevel'] {
  if (score >= 80) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  if (score > 0) return 'LOW'
  return 'MINIMAL'
}

// ---------------------------------------------------------------------------
// Account-level Athena query
// ---------------------------------------------------------------------------

/**
 * Build an AccountSecuritySummary using Athena queries against the
 * security_hub database for a single account. Runs 6 queries in parallel:
 * severity breakdown, product breakdown, compliance status, top findings,
 * findings by resource, and findings by title.
 */
export async function buildAccountSecurityViaAthena(
  accountId: string,
  accountName: string,
  sourceFilter: SecuritySourceFilter = 'all'
): Promise<AccountSecuritySummary> {
  const environment = (process.env.AWS_SECURITYHUB_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
  const findingsSource = buildFindingsSource(sourceFilter)

  // Resolve the correct account ID for the Athena tables (GovCloud stores GovCloud IDs)
  let resolvedAccountId = accountId
  if (environment === 'govcloud') {
    const account = await lookupAccountUnified({ accountId })
    if (account?.awsGovCloudAccountID) {
      resolvedAccountId = account.awsGovCloudAccountID
    }
  }

  logger.info(`[SecurityAthena] Account query for ${accountId} (resolved: ${resolvedAccountId}), source: ${sourceFilter}`)

  const accountFilter = `awsaccountid = '${resolvedAccountId}'`
  const baseWhere = `${accountFilter} AND workflow_status IN ('NEW', 'NOTIFIED') AND from_iso8601_timestamp(lastobservedat) >= date_add('day', -90, current_timestamp)`

  const queries = {
    severity: `
      SELECT severity_label AS severity, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE ${baseWhere}
      GROUP BY severity_label
    `,
    product: `
      SELECT productname AS product_name, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE ${baseWhere}
      GROUP BY productname
    `,
    compliance: `
      SELECT compliance_status, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE ${baseWhere}
        AND compliance_status IS NOT NULL AND compliance_status != ''
      GROUP BY compliance_status
    `,
    topFindings: `
      SELECT
        generatorid AS id,
        title,
        severity_label AS severity,
        productname AS product_name,
        productname AS resource_type,
        resourceids AS resource_id,
        awsaccountid AS accountid,
        region,
        compliance_status,
        description AS recommendation,
        createdat AS created_at,
        updatedat AS updated_at
      FROM ${findingsSource}
      WHERE ${baseWhere}
        AND severity_label IN ('CRITICAL', 'HIGH')
      ORDER BY CASE severity_label WHEN 'CRITICAL' THEN 5 ELSE 4 END DESC,
               from_iso8601_timestamp(updatedat) DESC
      LIMIT 25
    `,
    byResource: `
      SELECT resourceids AS resource_id, severity_label AS severity, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE ${baseWhere}
        AND resourceids IS NOT NULL AND resourceids != ''
      GROUP BY resourceids, severity_label
    `,
    byTitle: `
      SELECT title, severity_label AS severity, productname AS product_name, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE ${baseWhere}
      GROUP BY title, severity_label, productname
      ORDER BY cnt DESC
      LIMIT 100
    `,
  }

  const [sevResult, prodResult, compResult, topResult, resResult, titleResult] = await Promise.allSettled([
    executeAthenaSQL(queries.severity, environment),
    executeAthenaSQL(queries.product, environment),
    executeAthenaSQL(queries.compliance, environment),
    executeAthenaSQL(queries.topFindings, environment),
    executeAthenaSQL(queries.byResource, environment),
    executeAthenaSQL(queries.byTitle, environment),
  ])

  // Risk and total counts depend on severity; use the API fallback rather than
  // returning a misleading empty/healthy summary when this core query fails.
  if (sevResult.status === 'rejected') {
    throw new Error(`Athena account severity query failed: ${sevResult.reason instanceof Error ? sevResult.reason.message : String(sevResult.reason)}`)
  }

  // Parse severity breakdown
  const severityBreakdown: Record<FindingSeverity, number> = {
    CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0,
  }
  for (const row of sevResult.value) {
    const sev = (row.severity || '').toUpperCase() as FindingSeverity
    if (sev in severityBreakdown) {
      severityBreakdown[sev] = (severityBreakdown[sev] || 0) + (parseInt(row.cnt || '0', 10) || 0)
    }
  }

  // Parse product breakdown
  const findingsByProduct: Record<string, number> = {}
  if (prodResult.status === 'fulfilled') {
    for (const row of prodResult.value) {
      findingsByProduct[row.product_name || 'Unknown'] = parseInt(row.cnt || '0', 10) || 0
    }
  } else {
    logger.error('[SecurityAthena] Account product query failed:', prodResult.reason)
  }

  // Parse compliance
  const complianceCounts = { passed: 0, failed: 0, warning: 0, notAvailable: 0, total: 0 }
  if (compResult.status === 'fulfilled') {
    for (const row of compResult.value) {
      const status = (row.compliance_status || '').toUpperCase()
      const count = parseInt(row.cnt || '0', 10) || 0
      complianceCounts.total += count
      if (status === 'PASSED' || status === 'PASS') complianceCounts.passed += count
      else if (status === 'FAILED' || status === 'FAIL') complianceCounts.failed += count
      else if (status === 'WARNING') complianceCounts.warning += count
      else complianceCounts.notAvailable += count
    }
  } else {
    logger.error('[SecurityAthena] Account compliance query failed:', compResult.reason)
  }

  // Parse top findings
  const topFindings: SecurityFindingSummary[] = []
  if (topResult.status === 'fulfilled') {
    for (const row of topResult.value) {
      const sev = (row.severity || '').toUpperCase() as FindingSeverity
      topFindings.push({
        id: row.id || '',
        title: row.title || 'Untitled Finding',
        severity: sev in severityBreakdown ? sev : 'INFORMATIONAL',
        workflowStatus: 'NEW',
        productName: row.product_name || 'Unknown',
        resourceType: row.resource_type || 'Unknown',
        resourceId: row.resource_id || 'Unknown',
        accountId,
        accountName,
        region: row.region || '',
        complianceStatus: row.compliance_status as any,
        recommendation: row.recommendation || undefined,
        createdAt: row.created_at || '',
        updatedAt: row.updated_at || '',
      })
    }
  } else {
    logger.error('[SecurityAthena] Account top findings query failed:', topResult.reason)
  }

  // Parse findings by resource — pivot severity counts per resource
  const findingsByResource: ResourceFindingGroup[] = []
  if (resResult.status === 'fulfilled') {
    const resourceMap = new Map<string, ResourceFindingGroup>()
    for (const row of resResult.value) {
      const resId = row.resource_id || ''
      const sev = (row.severity || '').toUpperCase()
      const count = parseInt(row.cnt || '0', 10) || 0
      const group = resourceMap.get(resId) || { resourceId: resId, totalFindings: 0, critical: 0, high: 0, medium: 0, low: 0 }
      group.totalFindings += count
      if (sev === 'CRITICAL') group.critical += count
      else if (sev === 'HIGH') group.high += count
      else if (sev === 'MEDIUM') group.medium += count
      else if (sev === 'LOW') group.low += count
      resourceMap.set(resId, group)
    }
    findingsByResource.push(...[...resourceMap.values()].sort((a, b) => b.totalFindings - a.totalFindings))
  } else {
    logger.error('[SecurityAthena] Account by-resource query failed:', resResult.reason)
  }

  // Parse findings by title + extract CVEs from Inspector rows
  const findingsByTitle: TitleFindingGroup[] = []
  const findingsByCve: CveFindingGroup[] = []
  if (titleResult.status === 'fulfilled') {
    const cvePattern = /^(CVE-\d{4}-\d+)/
    for (const row of titleResult.value) {
      const title = row.title || ''
      const count = parseInt(row.cnt || '0', 10) || 0
      const sev = (row.severity || '').toUpperCase() as FindingSeverity
      const productName = row.product_name || ''

      findingsByTitle.push({ title, count, severity: sev, productName })

      // Extract CVE entries from Inspector findings
      const cveId = title.match(cvePattern)?.[1]
      if (cveId && productName.toLowerCase().includes('inspector')) {
        findingsByCve.push({ cveId, title, count, severity: sev })
      }
    }
  } else {
    logger.error('[SecurityAthena] Account by-title query failed:', titleResult.reason)
  }

  // Compute risk score and level
  const totalFindings = Object.values(severityBreakdown).reduce((sum, v) => sum + v, 0)
  const riskScore = computeRiskScore(severityBreakdown.CRITICAL, severityBreakdown.HIGH, severityBreakdown.MEDIUM, severityBreakdown.LOW)
  const riskLevel = getRiskLevel(riskScore)

  // Compliance pass rate
  const passRate = complianceCounts.total > 0
    ? Math.round((complianceCounts.passed / complianceCounts.total) * 100)
    : 100

  // Recommendations
  const recommendations: string[] = []
  if (severityBreakdown.CRITICAL > 0) {
    recommendations.push(`Address ${severityBreakdown.CRITICAL} critical finding(s) immediately - these represent severe security risks`)
  }
  if (severityBreakdown.HIGH > 0) {
    recommendations.push(`Review and remediate ${severityBreakdown.HIGH} high severity finding(s) as soon as possible`)
  }
  if (findingsByProduct['Inspector']) {
    recommendations.push('Review Inspector vulnerability findings for outdated packages or known CVEs')
  }
  if (findingsByProduct['Security Hub']) {
    recommendations.push('Check Security Hub for compliance standard violations and misconfigurations')
  }
  if (passRate < 70 && complianceCounts.total > 0) {
    recommendations.push(`Compliance pass rate is ${passRate}% - review failed controls to improve posture`)
  }
  if (recommendations.length === 0) {
    recommendations.push('Security posture is healthy - continue monitoring for new findings')
  }

  logger.info(`[SecurityAthena] Account ${accountId}: ${totalFindings} findings, risk ${riskLevel} (${riskScore})`)

  return {
    accountId,
    accountName,
    environment,
    riskScore,
    riskLevel,
    totalFindings,
    severityBreakdown,
    findingsByProduct,
    compliance: { ...complianceCounts, passRate },
    topFindings,
    recommendations,
    lastUpdated: new Date().toISOString(),
    findingsByResource,
    findingsByTitle,
    findingsByCve,
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Build a complete OrgSecuritySummary using Athena queries against the
 * security_hub database (flat, pre-processed tables).
 * Runs 8 queries in parallel: severity-by-account, product breakdown,
 * compliance status, top findings, region distribution, weekly trend,
 * severity-by-product matrix, and finding age buckets.
 *
 * Falls back to the legacy Security Hub API (capped) if Athena fails entirely.
 */
export async function buildSecuritySummaryViaAthena(
  onProgress?: ProgressCallback,
  options: { allowFallback?: boolean } = {}
): Promise<OrgSecuritySummary> {
  const environment = (process.env.AWS_SECURITYHUB_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
  const findingsSource = buildFindingsSource()

  onProgress?.({ stage: 'init', message: 'Initializing Athena security scan...', percent: 0 })

  // Load account name map
  const allAccounts = await getAllAccountsUnified()
  const accountNameMap = new Map<string, string>()
  for (const acc of allAccounts) {
    const name = acc.accountName || acc.projectName || acc.accountId || 'Unknown'
    if (environment === 'govcloud' && acc.awsGovCloudAccountID) {
      accountNameMap.set(acc.awsGovCloudAccountID, name)
    }
    if (acc.accountId) {
      accountNameMap.set(acc.accountId, name)
    }
  }

  onProgress?.({
    stage: 'accounts_loaded',
    message: `Found ${allAccounts.length} accounts`,
    percent: 10,
    totalAccounts: allAccounts.length,
  })

  // Define 8 Athena queries against security_hub flat tables (run in parallel)
  const queries = {
    severityByAccount: `
      SELECT awsaccountid AS accountid, severity_label AS severity, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE workflow_status IN ('NEW', 'NOTIFIED')
        AND from_iso8601_timestamp(lastobservedat) >= date_add('day', -90, current_timestamp)
      GROUP BY awsaccountid, severity_label
    `,
    productBreakdown: `
      SELECT productname AS product_name, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE workflow_status IN ('NEW', 'NOTIFIED')
        AND from_iso8601_timestamp(lastobservedat) >= date_add('day', -90, current_timestamp)
      GROUP BY productname
    `,
    complianceStatus: `
      SELECT compliance_status, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE workflow_status IN ('NEW', 'NOTIFIED')
        AND from_iso8601_timestamp(lastobservedat) >= date_add('day', -90, current_timestamp)
        AND compliance_status IS NOT NULL AND compliance_status != ''
      GROUP BY compliance_status
    `,
    topFindings: `
      SELECT
        generatorid AS id,
        title,
        severity_label AS severity,
        CASE severity_label
          WHEN 'CRITICAL' THEN 5 WHEN 'HIGH' THEN 4
          WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 2 ELSE 1
        END AS severity_id,
        productname AS product_name,
        productname AS resource_type,
        resourceids AS resource_id,
        awsaccountid AS accountid,
        region,
        compliance_status,
        description AS recommendation,
        createdat AS created_at,
        updatedat AS updated_at
      FROM ${findingsSource}
      WHERE workflow_status IN ('NEW', 'NOTIFIED')
        AND severity_label IN ('CRITICAL', 'HIGH')
        AND from_iso8601_timestamp(lastobservedat) >= date_add('day', -90, current_timestamp)
      ORDER BY CASE severity_label WHEN 'CRITICAL' THEN 5 ELSE 4 END DESC,
               from_iso8601_timestamp(updatedat) DESC
      LIMIT 20
    `,
    // --- Extended analysis queries ---
    findingsByRegion: `
      SELECT region, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE workflow_status IN ('NEW', 'NOTIFIED')
        AND from_iso8601_timestamp(lastobservedat) >= date_add('day', -90, current_timestamp)
        AND region IS NOT NULL AND region != ''
      GROUP BY region
      ORDER BY cnt DESC
    `,
    findingsTrend: `
      SELECT
        date_format(date_trunc('week', from_iso8601_timestamp(createdat)), '%Y-%m-%d') AS week_start,
        severity_label,
        COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE workflow_status IN ('NEW', 'NOTIFIED')
        AND from_iso8601_timestamp(createdat) >= date_add('day', -90, current_timestamp)
      GROUP BY date_trunc('week', from_iso8601_timestamp(createdat)), severity_label
      ORDER BY week_start
    `,
    severityByProduct: `
      SELECT productname, severity_label, COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE workflow_status IN ('NEW', 'NOTIFIED')
        AND from_iso8601_timestamp(lastobservedat) >= date_add('day', -90, current_timestamp)
      GROUP BY productname, severity_label
    `,
    findingAge: `
      SELECT
        CASE
          WHEN date_diff('day', from_iso8601_timestamp(createdat), current_timestamp) < 7 THEN 'under7'
          WHEN date_diff('day', from_iso8601_timestamp(createdat), current_timestamp) < 30 THEN 'under30'
          WHEN date_diff('day', from_iso8601_timestamp(createdat), current_timestamp) < 90 THEN 'under90'
          ELSE 'over90'
        END AS age_bucket,
        COUNT(*) AS cnt
      FROM ${findingsSource}
      WHERE workflow_status IN ('NEW', 'NOTIFIED')
        AND from_iso8601_timestamp(lastobservedat) >= date_add('day', -90, current_timestamp)
      GROUP BY 1
    `,
  }

  onProgress?.({ stage: 'athena_submitted', message: 'Submitting Athena queries...', percent: 15 })

  try {
    // Run all 8 queries in parallel
    const [sevResult, prodResult, compResult, topResult, regionResult, trendResult, sevProdResult, ageResult] = await Promise.allSettled([
      executeAthenaSQL(queries.severityByAccount, environment),
      executeAthenaSQL(queries.productBreakdown, environment),
      executeAthenaSQL(queries.complianceStatus, environment),
      executeAthenaSQL(queries.topFindings, environment),
      executeAthenaSQL(queries.findingsByRegion, environment),
      executeAthenaSQL(queries.findingsTrend, environment),
      executeAthenaSQL(queries.severityByProduct, environment),
      executeAthenaSQL(queries.findingAge, environment),
    ])

    if (sevResult.status === 'rejected') {
      throw new Error(`Athena organization severity query failed: ${sevResult.reason instanceof Error ? sevResult.reason.message : String(sevResult.reason)}`)
    }

    onProgress?.({ stage: 'athena_complete', message: 'Athena queries complete', percent: 75 })

    // Parse severity-by-account results
    const severityBreakdown: Record<FindingSeverity, number> = {
      CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0,
    }
    const accountBreakdown = new Map<string, { critical: number; high: number; medium: number; low: number; total: number }>()

    for (const row of sevResult.value) {
      const accountId = row.accountid || ''
      const severity = (row.severity || '').toUpperCase() as FindingSeverity
      const count = parseInt(row.cnt || '0', 10) || 0

      if (severity in severityBreakdown) {
        severityBreakdown[severity] = (severityBreakdown[severity] || 0) + count
      }

      const acct = accountBreakdown.get(accountId) || { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
      acct.total += count
      if (severity === 'CRITICAL') acct.critical += count
      else if (severity === 'HIGH') acct.high += count
      else if (severity === 'MEDIUM') acct.medium += count
      else if (severity === 'LOW') acct.low += count
      accountBreakdown.set(accountId, acct)
    }

    // Parse product breakdown
    const findingsByProduct: Record<string, number> = {}
    if (prodResult.status === 'fulfilled') {
      for (const row of prodResult.value) {
        const product = row.product_name || 'Unknown'
        findingsByProduct[product] = parseInt(row.cnt || '0', 10) || 0
      }
    } else {
      logger.error('[SecurityAthena] Product breakdown query failed:', prodResult.reason)
    }

    // Parse compliance counts
    const complianceCounts = { passed: 0, failed: 0, warning: 0, notAvailable: 0, total: 0 }
    if (compResult.status === 'fulfilled') {
      for (const row of compResult.value) {
        const status = (row.compliance_status || '').toUpperCase()
        const count = parseInt(row.cnt || '0', 10) || 0
        complianceCounts.total += count
        if (status === 'PASSED' || status === 'PASS') complianceCounts.passed += count
        else if (status === 'FAILED' || status === 'FAIL') complianceCounts.failed += count
        else if (status === 'WARNING') complianceCounts.warning += count
        else complianceCounts.notAvailable += count
      }
    } else {
      logger.error('[SecurityAthena] Compliance query failed:', compResult.reason)
    }

    // Parse top findings
    const topFindings: SecurityFindingSummary[] = []
    if (topResult.status === 'fulfilled') {
      for (const row of topResult.value) {
        const sevId = parseInt(row.severity_id || '0', 10) || 0
        const severity: FindingSeverity = sevId >= 5 ? 'CRITICAL' : sevId >= 4 ? 'HIGH' : sevId >= 3 ? 'MEDIUM' : sevId >= 2 ? 'LOW' : 'INFORMATIONAL'
        topFindings.push({
          id: row.id || '',
          title: row.title || 'Untitled Finding',
          severity,
          workflowStatus: 'NEW',
          productName: row.product_name || 'Unknown',
          resourceType: row.resource_type || 'Unknown',
          resourceId: row.resource_id || 'Unknown',
          accountId: row.accountid || '',
          accountName: accountNameMap.get(row.accountid || '') || row.accountid || 'Unknown',
          region: row.region || '',
          complianceStatus: row.compliance_status as any,
          recommendation: row.recommendation || undefined,
          createdAt: row.created_at || '',
          updatedAt: row.updated_at || '',
        })
      }
    } else {
      logger.error('[SecurityAthena] Top findings query failed:', topResult.reason)
    }

    // Parse findings by region
    const findingsByRegion: Record<string, number> = {}
    if (regionResult.status === 'fulfilled') {
      for (const row of regionResult.value) {
        const region = row.region || 'Unknown'
        findingsByRegion[region] = parseInt(row.cnt || '0', 10) || 0
      }
    } else {
      logger.error('[SecurityAthena] Findings-by-region query failed:', regionResult.reason)
    }

    // Parse findings trend (weekly time series)
    const trendMap = new Map<string, FindingsTrendPoint>()
    if (trendResult.status === 'fulfilled') {
      for (const row of trendResult.value) {
        const week = row.week_start || ''
        if (!week) continue
        const sev = (row.severity_label || '').toUpperCase()
        const count = parseInt(row.cnt || '0', 10) || 0
        const point = trendMap.get(week) || { week, critical: 0, high: 0, medium: 0, low: 0, informational: 0, total: 0 }
        point.total += count
        if (sev === 'CRITICAL') point.critical += count
        else if (sev === 'HIGH') point.high += count
        else if (sev === 'MEDIUM') point.medium += count
        else if (sev === 'LOW') point.low += count
        else if (sev === 'INFORMATIONAL') point.informational += count
        trendMap.set(week, point)
      }
    } else {
      logger.error('[SecurityAthena] Findings-trend query failed:', trendResult.reason)
    }
    const findingsTrend = [...trendMap.values()].sort((a, b) => a.week.localeCompare(b.week))

    // Parse severity-by-product matrix
    const sevProdMap = new Map<string, SeverityByProductEntry>()
    if (sevProdResult.status === 'fulfilled') {
      for (const row of sevProdResult.value) {
        const product = row.productname || 'Unknown'
        const sev = (row.severity_label || '').toUpperCase()
        const count = parseInt(row.cnt || '0', 10) || 0
        const entry = sevProdMap.get(product) || { product, critical: 0, high: 0, medium: 0, low: 0, informational: 0, total: 0 }
        entry.total += count
        if (sev === 'CRITICAL') entry.critical += count
        else if (sev === 'HIGH') entry.high += count
        else if (sev === 'MEDIUM') entry.medium += count
        else if (sev === 'LOW') entry.low += count
        else if (sev === 'INFORMATIONAL') entry.informational += count
        sevProdMap.set(product, entry)
      }
    } else {
      logger.error('[SecurityAthena] Severity-by-product query failed:', sevProdResult.reason)
    }
    const severityByProduct = [...sevProdMap.values()].sort((a, b) => b.total - a.total)

    // Parse finding age buckets
    const findingAgeBuckets: FindingAgeBuckets = { under7Days: 0, under30Days: 0, under90Days: 0, over90Days: 0 }
    if (ageResult.status === 'fulfilled') {
      for (const row of ageResult.value) {
        const bucket = row.age_bucket || ''
        const count = parseInt(row.cnt || '0', 10) || 0
        if (bucket === 'under7') findingAgeBuckets.under7Days = count
        else if (bucket === 'under30') findingAgeBuckets.under30Days = count
        else if (bucket === 'under90') findingAgeBuckets.under90Days = count
        else if (bucket === 'over90') findingAgeBuckets.over90Days = count
      }
    } else {
      logger.error('[SecurityAthena] Finding-age query failed:', ageResult.reason)
    }

    onProgress?.({ stage: 'aggregating', message: 'Computing risk scores...', percent: 90 })

    // Build per-account risk ranking
    const totalFindings = Object.values(severityBreakdown).reduce((sum, v) => sum + v, 0)
    const accountRiskRanking: AccountRiskEntry[] = []
    for (const [accountId, counts] of accountBreakdown) {
      const riskScore = computeRiskScore(counts.critical, counts.high, counts.medium, counts.low)
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
    const complianceRate = complianceCounts.total > 0
      ? Math.round((complianceCounts.passed / complianceCounts.total) * 100)
      : 100

    const result: OrgSecuritySummary = {
      totalFindings,
      totalAccounts: accountBreakdown.size,
      accountsAtRisk,
      orgRiskScore,
      complianceRate,
      severityBreakdown,
      findingsByProduct,
      accountRiskRanking,
      topFindings,
      lastUpdated: new Date().toISOString(),
      findingsByRegion,
      findingsTrend,
      severityByProduct,
      findingAgeBuckets,
    }

    onProgress?.({ stage: 'complete', message: 'Security data loaded via Athena', percent: 100 })

    logger.info(`[SecurityAthena] Summary built: ${totalFindings} findings, ${accountBreakdown.size} accounts, orgRiskScore=${orgRiskScore}`)
    return result
  } catch (err: any) {
    if (options.allowFallback === false) throw err
    logger.error('[SecurityAthena] Athena queries failed entirely, falling back to legacy API', { error: err.message })
    onProgress?.({ stage: 'fallback', message: 'Athena unavailable, using legacy API...', percent: 50 })

    // Fallback to the capped Security Hub API
    const { buildOrgSecuritySummary } = await import('./security-hub-statistics')
    return buildOrgSecuritySummary(onProgress)
  }
}
