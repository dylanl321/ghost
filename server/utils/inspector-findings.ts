/**
 * AWS Inspector2 Findings Utility
 *
 * Retrieves vulnerability findings from AWS Inspector2
 */

import {
  ListFindingsCommand,
  type Finding,
  type FilterCriteria
} from '@aws-sdk/client-inspector2'
import { getInspector2Client } from '../lib/aws-client-factory'
import { logger } from './logger'
import type { AWSEnvironmentType } from '../types'

export type VulnerabilitySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL' | 'UNTRIAGED'

export interface VulnerabilityFinding {
  findingArn: string
  instanceId?: string
  accountId: string
  region: string
  severity: VulnerabilitySeverity
  title: string
  description?: string
  type: string
  status: 'ACTIVE' | 'SUPPRESSED' | 'CLOSED'
  vulnerabilityId?: string
  cveIds: string[]
  cvssScore?: number
  packageName?: string
  packageVersion?: string
  fixedVersion?: string
  remediation?: string
  firstObservedAt?: string
  lastObservedAt?: string
  updatedAt?: string
  resourceArn?: string
  imageDigest?: string
  repository?: string
  lambdaArn?: string
  workload?: string
}

export interface InstanceVulnerabilitySummary {
  instanceId: string
  accountId: string
  environment: AWSEnvironmentType
  region: string
  critical: number
  high: number
  medium: number
  low: number
  informational: number
  total: number
  /** True when the finding cap was reached, so the counts are lower bounds */
  truncated: boolean
  findings: VulnerabilityFinding[]
}

const INSTANCE_FINDING_CAP = 500
const ACCOUNT_FINDING_CAP = 1000

/**
 * Parse Inspector finding to our format
 */
function parseFinding(finding: Finding): VulnerabilityFinding {
  const cveIds: string[] = []

  // Extract CVE IDs from vulnerability info
  if (finding.packageVulnerabilityDetails?.vulnerabilityId) {
    cveIds.push(finding.packageVulnerabilityDetails.vulnerabilityId)
  }

  // Also check for related vulnerabilities
  if (finding.packageVulnerabilityDetails?.relatedVulnerabilities) {
    cveIds.push(...finding.packageVulnerabilityDetails.relatedVulnerabilities)
  }

  const resource: any = finding.resources?.[0]
  const details: any = resource?.details || {}
  const image = details.awsEcrContainerImage || details.awsEcsContainer || details.awsEksCluster || {}
  const lambda = details.awsLambdaFunction || {}
  return {
    findingArn: finding.findingArn || '',
    instanceId: finding.resources?.[0]?.id,
    accountId: finding.awsAccountId || '',
    region: finding.resources?.[0]?.region || '',
    severity: (finding.severity || 'UNTRIAGED') as VulnerabilitySeverity,
    title: finding.title || 'Unknown Vulnerability',
    description: finding.description,
    type: finding.type || 'UNKNOWN',
    status: (finding.status || 'ACTIVE') as 'ACTIVE' | 'SUPPRESSED' | 'CLOSED',
    vulnerabilityId: finding.packageVulnerabilityDetails?.vulnerabilityId,
    cveIds,
    cvssScore: finding.packageVulnerabilityDetails?.cvss?.[0]?.baseScore,
    packageName: finding.packageVulnerabilityDetails?.vulnerablePackages?.[0]?.name,
    packageVersion: finding.packageVulnerabilityDetails?.vulnerablePackages?.[0]?.version,
    fixedVersion: finding.packageVulnerabilityDetails?.vulnerablePackages?.[0]?.fixedInVersion,
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

/**
 * Get vulnerability findings for a specific instance
 */
export async function getInstanceVulnerabilities(
  instanceId: string,
  accountId: string,
  environment: AWSEnvironmentType = 'govcloud',
  region?: string
): Promise<InstanceVulnerabilitySummary> {
  const targetRegion = region || (environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1')

  const summary: InstanceVulnerabilitySummary = {
    instanceId,
    accountId,
    environment,
    region: targetRegion,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
    total: 0,
    truncated: false,
    findings: []
  }

  try {
    // Try to get client from delegated admin/security account first
    const securityAccount = environment === 'govcloud'
      ? process.env.AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT
      : process.env.AWS_COMMERCIAL_SECURITY_LAKE_ACCOUNT

    const client = await getInspector2Client(environment, targetRegion, securityAccount || accountId)

    // Build filter for the specific instance
    const filterCriteria: FilterCriteria = {
      resourceId: [
        {
          comparison: 'EQUALS',
          value: instanceId
        }
      ],
      findingStatus: [
        {
          comparison: 'EQUALS',
          value: 'ACTIVE'
        }
      ]
    }

    // Also filter by account if querying from delegated admin
    if (securityAccount) {
      filterCriteria.awsAccountId = [
        {
          comparison: 'EQUALS',
          value: accountId
        }
      ]
    }

    let nextToken: string | undefined
    const allFindings: VulnerabilityFinding[] = []

    do {
      const command = new ListFindingsCommand({
        filterCriteria,
        maxResults: 100,
        nextToken
      })

      const response = await client.send(command)

      if (response.findings) {
        for (const finding of response.findings) {
          const parsed = parseFinding(finding)
          allFindings.push(parsed)

          // Count by severity
          switch (parsed.severity) {
            case 'CRITICAL':
              summary.critical++
              break
            case 'HIGH':
              summary.high++
              break
            case 'MEDIUM':
              summary.medium++
              break
            case 'LOW':
              summary.low++
              break
            case 'INFORMATIONAL':
              summary.informational++
              break
          }
        }
      }

      nextToken = response.nextToken
    } while (nextToken && allFindings.length < INSTANCE_FINDING_CAP)
    summary.truncated = !!nextToken

    // Sort findings by severity
    const severityOrder: Record<VulnerabilitySeverity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFORMATIONAL: 4,
      UNTRIAGED: 5
    }

    allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    summary.findings = allFindings
    summary.total = allFindings.length

    logger.info(`[Inspector] Instance ${instanceId}: ${summary.total} findings (${summary.critical} critical, ${summary.high} high)`)

    return summary

  } catch (error: any) {
    // An empty summary would read as "no vulnerabilities"; callers report
    // the source as unavailable instead.
    logger.error(`[Inspector] Failed to get vulnerabilities for ${instanceId}:`, error.message)
    throw inspectorError(error, accountId)
  }
}

/**
 * Get vulnerability findings for an account
 */
export async function getAccountVulnerabilities(
  accountId: string,
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  severities?: VulnerabilitySeverity[]
): Promise<{
  accountId: string
  environment: AWSEnvironmentType
  region: string
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    total: number
  }
  /** True when the finding cap was reached, so the counts are lower bounds */
  truncated: boolean
  findings: VulnerabilityFinding[]
}> {
  const targetRegion = region || (environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1')

  const result = {
    accountId,
    environment,
    region: targetRegion,
    summary: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      total: 0
    },
    truncated: false,
    findings: [] as VulnerabilityFinding[]
  }

  try {
    const securityAccount = environment === 'govcloud'
      ? process.env.AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT
      : process.env.AWS_COMMERCIAL_SECURITY_LAKE_ACCOUNT

    const client = await getInspector2Client(environment, targetRegion, securityAccount || accountId)

    const filterCriteria: FilterCriteria = {
      findingStatus: [
        {
          comparison: 'EQUALS',
          value: 'ACTIVE'
        }
      ]
    }

    // Filter by account
    if (securityAccount) {
      filterCriteria.awsAccountId = [
        {
          comparison: 'EQUALS',
          value: accountId
        }
      ]
    }

    // Filter by severities if specified
    if (severities && severities.length > 0) {
      filterCriteria.severity = severities.map(s => ({
        comparison: 'EQUALS' as const,
        value: s
      }))
    }

    let nextToken: string | undefined

    do {
      const command = new ListFindingsCommand({
        filterCriteria,
        maxResults: 100,
        nextToken
      })

      const response = await client.send(command)

      if (response.findings) {
        for (const finding of response.findings) {
          const parsed = parseFinding(finding)
          result.findings.push(parsed)

          switch (parsed.severity) {
            case 'CRITICAL':
              result.summary.critical++
              break
            case 'HIGH':
              result.summary.high++
              break
            case 'MEDIUM':
              result.summary.medium++
              break
            case 'LOW':
              result.summary.low++
              break
          }
        }
      }

      nextToken = response.nextToken
    } while (nextToken && result.findings.length < ACCOUNT_FINDING_CAP)
    result.truncated = !!nextToken

    result.summary.total = result.findings.length

    logger.info(`[Inspector] Account ${accountId}: ${result.summary.total} findings`)

    return result

  } catch (error: any) {
    logger.error(`[Inspector] Failed to get account vulnerabilities for ${accountId}:`, error.message)
    throw inspectorError(error, accountId)
  }
}

function inspectorError(error: any, accountId: string): Error {
  const notAvailable = error?.name === 'AccessDeniedException' || error?.name === 'ResourceNotFoundException'
  return Object.assign(
    new Error(notAvailable
      ? `Inspector is not enabled or not accessible for account ${accountId}: ${error.message}`
      : `Inspector query failed for account ${accountId}: ${error?.message || String(error)}`),
    { name: error?.name || 'InspectorError', cause: error }
  )
}
