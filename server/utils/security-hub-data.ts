/**
 * AWS Security Hub Data Fetcher
 *
 * Fetches Security Hub findings, compliance standards, and security insights
 * across multiple accounts and regions.
 */

import {
  GetFindingsCommand,
  DescribeStandardsCommand,
  GetEnabledStandardsCommand,
  type SecurityHubClient,
  type AwsSecurityFinding,
} from '@aws-sdk/client-securityhub'
import { getClient } from '../lib/aws-client-factory'
import { getAllAccountsUnified } from './accounts-consolidated'
import { logger } from './logger'
import type {
  SecurityHubFindingRecord,
  SecurityHubDatasetFilters,
} from '#shared/types/dataset-reports'
import type { FindingSeverity, WorkflowStatus } from '#shared/types/security-hub'

/**
 * Get Security Hub client for a specific account/region
 */
async function getSecurityHubClient(accountId?: string, region: string = 'us-east-1'): Promise<SecurityHubClient> {
  // Default to govcloud environment (can be overridden by env var if needed)
  const environment = (process.env.AWS_SECURITYHUB_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
  return getClient<SecurityHubClient>(environment, 'securityhub', region, accountId)
}

/**
 * Common AWS regions for Security Hub
 */
const DEFAULT_REGIONS = ['us-east-1', 'us-west-2']

/**
 * Normalize Security Hub finding to our simplified record format
 */
function normalizeFinding(finding: AwsSecurityFinding, accountName: string): SecurityHubFindingRecord {
  // Extract severity
  const severityLabel = (finding.Severity?.Label || 'INFORMATIONAL') as FindingSeverity
  const severityScore = finding.Severity?.Normalized || 0

  // Extract workflow status
  const workflowStatus = (finding.Workflow?.Status || 'NEW') as WorkflowStatus

  // Extract compliance info
  const complianceStatus = finding.Compliance?.Status as 'PASSED' | 'FAILED' | 'WARNING' | 'NOT_AVAILABLE' | undefined
  const complianceStandard = finding.Compliance?.RelatedRequirements?.[0]
  const controlId = finding.Compliance?.RelatedRequirements?.[0]

  // Extract product info
  const productArn = finding.ProductArn || ''
  const productName = finding.ProductName || finding.CompanyName || 'Unknown'

  // Extract resource info
  const resource = finding.Resources?.[0]
  const resourceType = resource?.Type || 'Unknown'
  const resourceId = resource?.Id || 'Unknown'

  // Extract remediation
  const remediationRecommendation = finding.Remediation?.Recommendation?.Text
  const remediationUrl = finding.Remediation?.Recommendation?.Url

  return {
    accountId: finding.AwsAccountId || '',
    accountName,
    region: finding.Region || 'unknown',
    findingId: finding.Id || '',
    title: finding.Title || 'Untitled Finding',
    description: finding.Description,
    severity: severityLabel,
    severityScore,
    workflowStatus,
    productName,
    productArn,
    complianceStatus,
    complianceStandard,
    controlId,
    resourceType,
    resourceId,
    createdAt: finding.CreatedAt || '',
    updatedAt: finding.UpdatedAt || '',
    firstObservedAt: finding.FirstObservedAt || finding.CreatedAt || '',
    lastObservedAt: finding.LastObservedAt,
    remediationRecommendation,
    remediationUrl,
  }
}

/**
 * Build Security Hub filters from our dataset filters
 */
function buildSecurityHubFilters(filters: SecurityHubDatasetFilters) {
  const findingFilters: any = {}

  // Filter by severity
  if (filters.severities && filters.severities.length > 0) {
    findingFilters.SeverityLabel = filters.severities.map(s => ({
      Value: s,
      Comparison: 'EQUALS',
    }))
  }

  // Filter by workflow status
  if (filters.statuses && filters.statuses.length > 0) {
    findingFilters.WorkflowStatus = filters.statuses.map(s => ({
      Value: s,
      Comparison: 'EQUALS',
    }))
  }

  // Filter by product
  if (filters.products && filters.products.length > 0) {
    findingFilters.ProductName = filters.products.map(p => ({
      Value: p,
      Comparison: 'CONTAINS',
    }))
  }

  // Filter by compliance status
  if (filters.complianceStandards && filters.complianceStandards.length > 0) {
    findingFilters.ComplianceAssociatedStandardsId = filters.complianceStandards.map(s => ({
      Value: s,
      Comparison: 'EQUALS',
    }))
  }

  // Filter by control IDs
  if (filters.controlIds && filters.controlIds.length > 0) {
    findingFilters.ComplianceSecurityControlId = filters.controlIds.map(c => ({
      Value: c,
      Comparison: 'EQUALS',
    }))
  }

  // Record state - only active findings unless specified
  if (filters.activeOnly !== false) {
    findingFilters.RecordState = [
      {
        Value: 'ACTIVE',
        Comparison: 'EQUALS',
      },
    ]
  }

  // Time range - lookback period
  if (filters.lookbackDays) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - filters.lookbackDays)
    findingFilters.FirstObservedAt = [
      {
        Start: startDate.toISOString(),
        End: new Date().toISOString(),
      },
    ]
  }

  return findingFilters
}

/**
 * Fetch findings for a single account/region
 */
async function fetchFindingsForAccountRegion(
  accountId: string,
  accountName: string,
  region: string,
  filters: SecurityHubDatasetFilters
): Promise<SecurityHubFindingRecord[]> {
  const findings: SecurityHubFindingRecord[] = []

  try {
    const client = await getSecurityHubClient(accountId, region)
    const secHubFilters = buildSecurityHubFilters(filters)

    let nextToken: string | undefined
    let pageCount = 0
    const maxPages = 20  // Limit to prevent excessive API calls

    do {
      const command = new GetFindingsCommand({
        Filters: secHubFilters,
        MaxResults: 100,
        NextToken: nextToken,
      })

      const response = await client.send(command)
      pageCount++

      if (response.Findings) {
        for (const finding of response.Findings) {
          findings.push(normalizeFinding(finding, accountName))
        }
      }

      nextToken = response.NextToken

      logger.debug('[SecurityHub] Fetched findings page', {
        accountId,
        region,
        page: pageCount,
        findingsInPage: response.Findings?.length || 0,
        totalFindings: findings.length,
      })

    } while (nextToken && pageCount < maxPages)

    if (nextToken) {
      logger.warn('[SecurityHub] Exceeded max pages for account/region', {
        accountId,
        region,
        maxPages,
        totalFindings: findings.length,
      })
    }

  } catch (error: any) {
    // Security Hub might not be enabled in this account/region
    if (error.name === 'InvalidAccessException' || error.message?.includes('not subscribed')) {
      logger.warn('[SecurityHub] Not enabled in account/region', { accountId, region })
    } else {
      logger.error('[SecurityHub] Failed to fetch findings', {
        accountId,
        region,
        error: error.message,
      })
    }
    // Non-fatal - continue with other accounts/regions
  }

  return findings
}

/**
 * Main function: Get Security Hub findings for dataset reports
 *
 * @param accountIds - List of account IDs to query (empty = all accounts)
 * @param filters - Filter options for findings
 * @param regions - List of regions to query (defaults to us-east-1, us-west-2)
 * @returns Normalized Security Hub finding records
 */
export async function getSecurityHubFindings(
  accountIds: string[],
  filters: SecurityHubDatasetFilters = {},
  regions: string[] = DEFAULT_REGIONS
): Promise<SecurityHubFindingRecord[]> {
  const startTime = Date.now()

  logger.info('[SecurityHub] Fetching findings', {
    accountCount: accountIds.length || 'all',
    regions,
    filters,
  })

  try {
    // Get all accounts for name mapping
    const allAccounts = await getAllAccountsUnified()
    const accountMap = new Map(
      allAccounts.map(acc => [acc.accountId, acc.accountName || acc.accountId])
    )

    // Determine which accounts to query
    let targetAccounts = accountIds
    if (accountIds.length === 0) {
      // Empty array = all accounts
      targetAccounts = allAccounts.map(acc => acc.accountId)
    }

    // Validate accounts exist
    const validAccounts = targetAccounts
      .filter(id => accountMap.has(id))
      .map(id => ({
        accountId: id,
        accountName: accountMap.get(id)!,
      }))

    if (validAccounts.length < targetAccounts.length) {
      const missing = targetAccounts.filter(id => !accountMap.has(id))
      logger.warn('[SecurityHub] Some accounts not found', { missing })
    }

    // Fetch findings from all account/region combinations
    const allFindings: SecurityHubFindingRecord[] = []

    // Process accounts in parallel (with concurrency limit)
    const concurrencyLimit = 5
    for (let i = 0; i < validAccounts.length; i += concurrencyLimit) {
      const batch = validAccounts.slice(i, i + concurrencyLimit)

      const batchPromises = batch.flatMap(({ accountId, accountName }) =>
        regions.map(region =>
          fetchFindingsForAccountRegion(accountId, accountName, region, filters)
        )
      )

      const batchResults = await Promise.all(batchPromises)
      for (const findings of batchResults) {
        allFindings.push(...findings)
      }

      logger.info('[SecurityHub] Batch completed', {
        batchNumber: Math.floor(i / concurrencyLimit) + 1,
        accountsInBatch: batch.length,
        totalFindings: allFindings.length,
      })
    }

    // Sort by severity (critical first) and then by date (newest first)
    const severityOrder: Record<FindingSeverity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFORMATIONAL: 4,
    }

    allFindings.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
      if (severityDiff !== 0) return severityDiff

      // Sort by updated date (newest first)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

    const duration = Date.now() - startTime
    logger.info('[SecurityHub] Findings fetched successfully', {
      totalFindings: allFindings.length,
      durationMs: duration,
      accountsQueried: validAccounts.length,
      regionsQueried: regions.length,
    })

    return allFindings

  } catch (error) {
    logger.error('[SecurityHub] Failed to fetch findings', { error })
    throw new Error(`Failed to fetch Security Hub findings: ${error.message}`)
  }
}

/**
 * Get Security Hub findings summary
 *
 * Returns aggregated statistics about findings.
 */
export async function getSecurityHubFindingsSummary(
  accountIds: string[],
  filters: SecurityHubDatasetFilters = {},
  regions: string[] = DEFAULT_REGIONS
): Promise<{
  totalFindings: number
  findingsBySeverity: Record<FindingSeverity, number>
  findingsByStatus: Record<WorkflowStatus, number>
  findingsByProduct: Record<string, number>
  findingsByResourceType: Record<string, number>
}> {
  const findings = await getSecurityHubFindings(accountIds, filters, regions)

  const summary = {
    totalFindings: findings.length,
    findingsBySeverity: {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFORMATIONAL: 0,
    } as Record<FindingSeverity, number>,
    findingsByStatus: {
      NEW: 0,
      NOTIFIED: 0,
      RESOLVED: 0,
      SUPPRESSED: 0,
    } as Record<WorkflowStatus, number>,
    findingsByProduct: {} as Record<string, number>,
    findingsByResourceType: {} as Record<string, number>,
  }

  for (const finding of findings) {
    // Count by severity
    summary.findingsBySeverity[finding.severity]++

    // Count by status
    summary.findingsByStatus[finding.workflowStatus]++

    // Count by product
    summary.findingsByProduct[finding.productName] =
      (summary.findingsByProduct[finding.productName] || 0) + 1

    // Count by resource type
    summary.findingsByResourceType[finding.resourceType] =
      (summary.findingsByResourceType[finding.resourceType] || 0) + 1
  }

  return summary
}

/**
 * Get top critical/high findings
 *
 * Returns the most critical findings for executive summary.
 */
export async function getTopCriticalFindings(
  accountIds: string[],
  filters: SecurityHubDatasetFilters = {},
  regions: string[] = DEFAULT_REGIONS,
  limit: number = 10
): Promise<SecurityHubFindingRecord[]> {
  // Modify filters to only include CRITICAL and HIGH
  const criticalFilters: SecurityHubDatasetFilters = {
    ...filters,
    severities: ['CRITICAL', 'HIGH'],
    statuses: filters.statuses || ['NEW', 'NOTIFIED'],  // Exclude resolved/suppressed
  }

  const findings = await getSecurityHubFindings(accountIds, criticalFilters, regions)

  // Return top N findings (already sorted by severity)
  return findings.slice(0, limit)
}
