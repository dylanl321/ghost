/**
 * AWS Security Hub Data Fetcher
 *
 * Fetches Security Hub findings, compliance standards, and security insights
 * across multiple accounts and regions.
 */

import {
  GetFindingsCommand,
  type SecurityHubClient,
  type AwsSecurityFinding,
} from '@aws-sdk/client-securityhub'
import { getClient } from '../lib/aws-client-factory'
import { getAllAccountsUnified } from './accounts-consolidated'
import { logger } from './logger'
import type {
  SecurityHubFindingRecord,
  SecurityHubDatasetFilters,
  DatasetQueryOptions,
  DatasetQueryResult,
} from '../../shared/types/dataset-reports'
import type { FindingSeverity, WorkflowStatus } from '../../shared/types/security-hub'

/**
 * Get Security Hub client for the Security Lake aggregation account
 * Security Hub data is centralized in Security Lake accounts
 */
async function getSecurityHubClient(region: string, environment: 'commercial' | 'govcloud'): Promise<SecurityHubClient> {
  // Use the Security Lake aggregation account for the environment
  const securityLakeAccount = environment === 'govcloud'
    ? process.env.AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT
    : process.env.AWS_COMMERCIAL_SECURITY_LAKE_ACCOUNT

  if (!securityLakeAccount) {
    throw new Error(`Security Lake account not configured for ${environment} environment. Set AWS_${environment.toUpperCase()}_SECURITY_LAKE_ACCOUNT`)
  }

  return getClient<SecurityHubClient>(environment, 'securityhub', region, securityLakeAccount)
}

/**
 * Get default regions based on environment
 */
function getDefaultRegions(environment: 'commercial' | 'govcloud'): string[] {
  if (environment === 'govcloud') {
    return ['us-gov-west-1', 'us-gov-east-1']
  }
  return ['us-east-1', 'us-west-2']
}

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

  // Filter by resource ID (uses PREFIX to match instance IDs within resource ARNs)
  if (filters.resourceId) {
    findingFilters.ResourceId = [
      {
        Value: filters.resourceId,
        Comparison: 'PREFIX',
      },
    ]
  }
  if (filters.resourceIds && filters.resourceIds.length > 0) {
    findingFilters.ResourceId = filters.resourceIds.map(resourceId => ({
      Value: resourceId,
      Comparison: 'EQUALS'
    }))
  }
  if (filters.findingIds && filters.findingIds.length > 0) {
    findingFilters.Id = filters.findingIds.map(findingId => ({
      Value: findingId,
      Comparison: 'EQUALS'
    }))
  }

  return findingFilters
}

/**
 * Fetch findings for specific accounts in a region
 * Queries the centralized Security Lake account which aggregates all findings
 */
async function fetchFindingsForRegion(
  targetAccountIds: string[],
  accountNameMap: Map<string, string>,
  region: string,
  filters: SecurityHubDatasetFilters,
  environment: 'commercial' | 'govcloud',
  options: DatasetQueryOptions = {}
): Promise<{ records: SecurityHubFindingRecord[]; hasMore: boolean }> {
  const findings: SecurityHubFindingRecord[] = []

  try {
    // Get client for Security Lake aggregation account
    const client = await getSecurityHubClient(region, environment)

    // Security Hub AwsAccountId filter is limited to 20 items per request.
    // Batch account IDs into groups of 20; empty array means no account filter (all accounts).
    const MAX_ACCOUNT_FILTER = 20
    const accountBatches: string[][] = []
    if (targetAccountIds.length > 0) {
      for (let i = 0; i < targetAccountIds.length; i += MAX_ACCOUNT_FILTER) {
        accountBatches.push(targetAccountIds.slice(i, i + MAX_ACCOUNT_FILTER))
      }
    } else {
      accountBatches.push([]) // Single batch with no account filter
    }

    for (const batch of accountBatches) {
      if (options.signal?.aborted) throw options.signal.reason || new Error('Query canceled')
      const secHubFilters = buildSecurityHubFilters(filters)

      if (batch.length > 0) {
        secHubFilters.AwsAccountId = batch.map(id => ({
          Value: id,
          Comparison: 'EQUALS'
        }))
      }

      let nextToken: string | undefined
      let pageCount = 0
      const maxPages = 20  // Limit to prevent excessive API calls

      do {
        const command = new GetFindingsCommand({
          Filters: secHubFilters,
          MaxResults: options.limit ? Math.min(100, Math.max(1, options.limit - findings.length)) : 100,
          NextToken: nextToken,
        })

        const response = await client.send(command, { abortSignal: options.signal })
        pageCount++

        if (response.Findings) {
          for (const finding of response.Findings) {
            const accountName = accountNameMap.get(finding.AwsAccountId || '') || finding.AwsAccountId || 'Unknown'
            findings.push((options.format === 'asff' ? finding : normalizeFinding(finding, accountName)) as SecurityHubFindingRecord)
          }
        }

        nextToken = response.NextToken
        await options.onProgress?.({ phase: 'securityHub', processed: findings.length })
        if (options.limit && findings.length >= options.limit) {
          return { records: findings.slice(0, options.limit), hasMore: Boolean(nextToken) || batch !== accountBatches.at(-1) }
        }

        logger.debug('[SecurityHub] Fetched findings page', {
          region,
          page: pageCount,
          batchSize: batch.length || 'all',
          findingsInPage: response.Findings?.length || 0,
          totalFindings: findings.length,
        })

      } while (nextToken && pageCount < maxPages)

      if (nextToken) {
        logger.warn('[SecurityHub] Exceeded max pages for region batch', {
          region,
          maxPages,
          batchSize: batch.length,
          totalFindings: findings.length,
        })
      }
    }

  } catch (error: any) {
    // Security Hub might not be enabled in Security Lake account/region
    if ((error instanceof Error ? error.name : "Error") === 'InvalidAccessException' || (error instanceof Error ? error.message : String(error))?.includes('not subscribed')) {
      logger.warn('[SecurityHub] Not enabled in Security Lake account/region', { region, environment })
    } else {
      logger.error('[SecurityHub] Failed to fetch findings', {
        region,
        environment,
        error: (error instanceof Error ? error.message : String(error)),
      })
      throw error
    }
  }

  return { records: findings, hasMore: false }
}

/**
 * Main function: Get Security Hub findings for dataset reports
 *
 * @param accountIds - List of account IDs to query (empty = all accounts)
 * @param filters - Filter options for findings
 * @returns Normalized Security Hub finding records
 */
export async function getSecurityHubFindings(
  accountIds: string[],
  filters: SecurityHubDatasetFilters = {},
  options: DatasetQueryOptions = {}
): Promise<SecurityHubFindingRecord[]> {
  return (await querySecurityHubFindings(accountIds, filters, options)).records
}

export async function querySecurityHubFindings(
  accountIds: string[],
  filters: SecurityHubDatasetFilters = {},
  options: DatasetQueryOptions = {}
): Promise<DatasetQueryResult<SecurityHubFindingRecord>> {
  const startTime = Date.now()

  // Determine environment and appropriate regions
  const environment = (process.env.AWS_SECURITYHUB_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
  const regions = filters.regions && filters.regions.length > 0
    ? filters.regions
    : getDefaultRegions(environment)

  logger.info('[SecurityHub] Fetching findings', {
    accountCount: accountIds.length || 'all',
    regions,
    filters,
  })

  try {
    // Get all accounts for name mapping
    const allAccounts = await getAllAccountsUnified()
    const accountsWithIds = allAccounts.filter(
      (account): account is typeof account & { accountId: string } => Boolean(account.accountId)
    )

    // Build account maps for both Commercial and GovCloud IDs
    const commercialAccountMap = new Map(
      accountsWithIds.map(acc => [acc.accountId, acc.accountName || acc.projectName || acc.accountId])
    )
    // Determine which accounts to query - use correct IDs for the environment
    let targetAccounts: Array<{ accountId: string; accountName: string }> = []
    if (accountIds.length === 0) {
      // Empty array = all accounts
      if (environment === 'govcloud') {
        targetAccounts = allAccounts
          .filter(acc => acc.awsGovCloudAccountID)
          .map(acc => ({
            accountId: acc.awsGovCloudAccountID!,
            accountName: acc.accountName || acc.projectName || acc.accountId || acc.awsGovCloudAccountID!
          }))
      } else {
        targetAccounts = accountsWithIds.map(acc => ({
          accountId: acc.accountId,
          accountName: acc.accountName || acc.projectName || acc.accountId
        }))
      }
    } else {
      // User selected specific accounts (by commercial ID)
      // Need to map to the correct environment's account IDs
      if (environment === 'govcloud') {
        targetAccounts = accountIds
          .map(commercialId => {
            const account = allAccounts.find(acc => acc.accountId === commercialId)
            if (!account?.awsGovCloudAccountID) return null
            return {
              accountId: account.awsGovCloudAccountID,
              accountName: account.accountName || account.projectName || commercialId
            }
          })
          .filter((acc): acc is { accountId: string; accountName: string } => acc !== null)
      } else {
        targetAccounts = accountIds
          .map(id => {
            const name = commercialAccountMap.get(id)
            if (!name) return null
            return { accountId: id, accountName: name }
          })
          .filter((acc): acc is { accountId: string; accountName: string } => acc !== null)
      }
    }

    if (targetAccounts.length < accountIds.length && accountIds.length > 0) {
      logger.warn('[SecurityHub] Some accounts not found in environment', {
        environment,
        requestedCount: accountIds.length,
        validCount: targetAccounts.length
      })
    }

    const validAccounts = targetAccounts

    // Build account name map for all target accounts
    const accountNameMap = new Map(
      validAccounts.map(acc => [acc.accountId, acc.accountName])
    )

    // Extract just the account IDs
    const targetAccountIds = validAccounts.map(acc => acc.accountId)

    logger.info('[SecurityHub] Querying Security Lake aggregation account', {
      environment,
      accountsToFilter: targetAccountIds.length,
      regions: regions.length
    })

    // Fetch findings from all regions
    // Query the centralized Security Lake account which has all findings
    const allFindings: SecurityHubFindingRecord[] = []

    let hasMore = false
    for (let index = 0; index < regions.length; index++) {
      const region = regions[index]
      if (!region) continue
      const remaining = options.limit ? options.limit - allFindings.length : undefined
      if (remaining !== undefined && remaining <= 0) {
        hasMore = true
        break
      }
      const result = await fetchFindingsForRegion(targetAccountIds, accountNameMap, region, filters, environment, { ...options, limit: remaining })
      allFindings.push(...result.records)
      hasMore ||= result.hasMore || (Boolean(options.limit) && allFindings.length >= options.limit! && index < regions.length - 1)
    }

    logger.info('[SecurityHub] All regions completed', {
      totalFindings: allFindings.length,
      regionsQueried: regions.length
    })

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

    const records = options.limit ? allFindings.slice(0, options.limit) : allFindings
    return { records, sampleCount: records.length, hasMore, truncated: hasMore }

  } catch (error) {
    logger.error('[SecurityHub] Failed to fetch findings', { error })
    throw new Error(`Failed to fetch Security Hub findings: ${(error instanceof Error ? error.message : String(error))}`, { cause: error })
  }
}

/**
 * Get Security Hub findings summary
 *
 * Returns aggregated statistics about findings.
 */
export async function getSecurityHubFindingsSummary(
  accountIds: string[],
  filters: SecurityHubDatasetFilters = {}
): Promise<{
  totalFindings: number
  findingsBySeverity: Record<FindingSeverity, number>
  findingsByStatus: Record<WorkflowStatus, number>
  findingsByProduct: Record<string, number>
  findingsByResourceType: Record<string, number>
}> {
  const findings = await getSecurityHubFindings(accountIds, filters)

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
  limit: number = 10
): Promise<SecurityHubFindingRecord[]> {
  // Modify filters to only include CRITICAL and HIGH
  const criticalFilters: SecurityHubDatasetFilters = {
    ...filters,
    severities: ['CRITICAL', 'HIGH'],
    statuses: filters.statuses || ['NEW', 'NOTIFIED'],  // Exclude resolved/suppressed
  }

  const findings = await getSecurityHubFindings(accountIds, criticalFilters)

  // Return top N findings (already sorted by severity)
  return findings.slice(0, limit)
}
