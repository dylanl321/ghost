/**
 * GET /api/support/security-posture
 * Combined Security Hub + Inspector findings for security posture assessment
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getSecurityHubFindings } from '../../utils/security-hub-data'
import { lookupAccountUnified } from '../../utils/accounts-consolidated'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'
import type { FindingSeverity } from '../../../shared/types/security-hub'

interface SecurityPostureResponse {
  accountId?: string
  accountName?: string
  environment: AWSEnvironmentType
  summary: {
    totalFindings: number
    criticalFindings: number
    highFindings: number
    mediumFindings: number
    lowFindings: number
    informationalFindings: number
    overallRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL'
    riskScore: number
  }
  findingsByProduct: Record<string, number>
  findingsByResourceType: Record<string, number>
  topFindings: Array<{
    id: string
    title: string
    severity: FindingSeverity
    resourceType: string
    resourceId: string
    accountId: string
    region: string
    recommendation?: string
    remediationUrl?: string
    createdAt: string
  }>
  recommendations: string[]
  lastUpdated: string
}

registerEndpoint('/api/support/security-posture', 'GET', {
  summary: 'Get security posture assessment',
  description: 'Combined Security Hub and Inspector findings with severity breakdown and recommendations',
  tags: ['Support Tools', 'Security'],
  parameters: [
    {
      name: 'accountId',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by specific account ID (commercial account ID)'
    },
    {
      name: 'resourceId',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by specific resource ID'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment (default: govcloud)'
    },
    {
      name: 'severities',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of severities to include (CRITICAL,HIGH,MEDIUM,LOW,INFORMATIONAL)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100 },
      description: 'Maximum findings to return in topFindings (default: 20)'
    }
  ],
  responses: {
    200: {
      description: 'Security posture assessment',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  summary: { type: 'object' },
                  findingsByProduct: { type: 'object' },
                  topFindings: { type: 'array' },
                  recommendations: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const queryParams = getQuery(event)
  const accountId = queryParams.accountId as string | undefined
  const resourceId = queryParams.resourceId as string | undefined
  const environment = (queryParams.environment as AWSEnvironmentType) || 'govcloud'
  const severitiesParam = queryParams.severities as string | undefined
  const limit = Math.min(parseInt(queryParams.limit as string) || 20, 100)

  // Validate environment
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  // Parse severities filter
  const validSeverities: FindingSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL']
  let severities: FindingSeverity[] | undefined
  if (severitiesParam) {
    severities = severitiesParam
      .split(',')
      .map(s => s.trim().toUpperCase() as FindingSeverity)
      .filter(s => validSeverities.includes(s))
  }

  logger.info(`[Security Posture] AccountId: ${accountId || 'all'}, Environment: ${environment}`)

  try {
    // Get account info if accountId provided
    let accountName: string | undefined
    if (accountId) {
      const account = await lookupAccountUnified({ accountId })
      accountName = account?.name || account?.projectName
    }

    // Fetch Security Hub findings
    const filters: any = {
      activeOnly: true,
      lookbackDays: 90
    }

    if (severities) {
      filters.severities = severities
    }

    const accountIds = accountId ? [accountId] : []
    const findings = await getSecurityHubFindings(accountIds, filters)

    // Filter by resourceId if provided
    let filteredFindings = findings
    if (resourceId) {
      filteredFindings = findings.filter(f => f.resourceId.includes(resourceId))
    }

    // Calculate summary
    const summary = {
      totalFindings: filteredFindings.length,
      criticalFindings: 0,
      highFindings: 0,
      mediumFindings: 0,
      lowFindings: 0,
      informationalFindings: 0,
      overallRisk: 'MINIMAL' as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL',
      riskScore: 0
    }

    const findingsByProduct: Record<string, number> = {}
    const findingsByResourceType: Record<string, number> = {}

    for (const finding of filteredFindings) {
      // Count by severity
      switch (finding.severity) {
        case 'CRITICAL':
          summary.criticalFindings++
          break
        case 'HIGH':
          summary.highFindings++
          break
        case 'MEDIUM':
          summary.mediumFindings++
          break
        case 'LOW':
          summary.lowFindings++
          break
        case 'INFORMATIONAL':
          summary.informationalFindings++
          break
      }

      // Count by product
      findingsByProduct[finding.productName] = (findingsByProduct[finding.productName] || 0) + 1

      // Count by resource type
      findingsByResourceType[finding.resourceType] = (findingsByResourceType[finding.resourceType] || 0) + 1
    }

    // Calculate risk score (weighted)
    summary.riskScore = Math.min(100,
      summary.criticalFindings * 20 +
      summary.highFindings * 10 +
      summary.mediumFindings * 3 +
      summary.lowFindings * 1
    )

    // Determine overall risk level
    if (summary.criticalFindings > 0) {
      summary.overallRisk = 'CRITICAL'
    } else if (summary.highFindings > 0) {
      summary.overallRisk = 'HIGH'
    } else if (summary.mediumFindings > 5) {
      summary.overallRisk = 'MEDIUM'
    } else if (summary.mediumFindings > 0 || summary.lowFindings > 10) {
      summary.overallRisk = 'LOW'
    } else {
      summary.overallRisk = 'MINIMAL'
    }

    // Get top findings (already sorted by severity)
    const topFindings = filteredFindings.slice(0, limit).map(f => ({
      id: f.findingId,
      title: f.title,
      severity: f.severity,
      resourceType: f.resourceType,
      resourceId: f.resourceId,
      accountId: f.accountId,
      region: f.region,
      recommendation: f.remediationRecommendation,
      remediationUrl: f.remediationUrl,
      createdAt: f.createdAt
    }))

    // Generate recommendations based on findings
    const recommendations: string[] = []

    if (summary.criticalFindings > 0) {
      recommendations.push(`Address ${summary.criticalFindings} critical finding(s) immediately - these represent severe security risks`)
    }

    if (summary.highFindings > 0) {
      recommendations.push(`Review and remediate ${summary.highFindings} high severity finding(s) as soon as possible`)
    }

    // Product-specific recommendations
    if (findingsByProduct['Inspector']) {
      recommendations.push('Review Inspector vulnerability findings for outdated packages or known CVEs')
    }

    if (findingsByProduct['Security Hub']) {
      recommendations.push('Check Security Hub for compliance standard violations and misconfigurations')
    }

    // Resource-type specific recommendations
    if (findingsByResourceType['AwsEc2SecurityGroup'] > 3) {
      recommendations.push('Multiple security group issues found - review network access controls')
    }

    if (findingsByResourceType['AwsS3Bucket'] > 2) {
      recommendations.push('Multiple S3 bucket issues found - review bucket policies and encryption settings')
    }

    if (findingsByResourceType['AwsIamUser'] > 0) {
      recommendations.push('IAM user issues found - review access keys and permissions')
    }

    if (recommendations.length === 0) {
      recommendations.push('Security posture is healthy - continue monitoring for new findings')
    }

    const response: SecurityPostureResponse = {
      accountId,
      accountName,
      environment,
      summary,
      findingsByProduct,
      findingsByResourceType,
      topFindings,
      recommendations,
      lastUpdated: new Date().toISOString()
    }

    logger.info(`[Security Posture] Found ${summary.totalFindings} findings, risk level: ${summary.overallRisk}`)

    return sendSuccess(event, response)

  } catch (error: any) {
    logger.error('[Security Posture] Error:', error)

    // Handle common errors
    if (error.message?.includes('not subscribed') || error.message?.includes('not enabled')) {
      return errors.serverError(event, 'Security Hub is not enabled in this environment', {
        hint: 'Contact your AWS administrator to enable Security Hub'
      })
    }

    return errors.serverError(event, error.message || 'Failed to get security posture')
  }
}))
