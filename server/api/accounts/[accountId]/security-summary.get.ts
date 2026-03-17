/**
 * GET /api/accounts/:accountId/security-summary
 * Account-level security summary with risk scoring, severity breakdown, and compliance stats.
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { getSecurityHubFindings } from '../../../utils/security-hub-data'
import { lookupAccountUnified } from '../../../utils/accounts-consolidated'
import { logger } from '../../../utils/logger'
import { registerEndpoint } from '../../../plugins/swagger'
import type { AccountSecuritySummary, SecurityFindingSummary } from '../../../../shared/types/security-dashboard'
import type { FindingSeverity } from '../../../../shared/types/security-hub'

registerEndpoint('/api/accounts/{accountId}/security-summary', 'GET', {
  summary: 'Get account security summary',
  description: 'Security Hub findings with risk scoring, severity breakdown, compliance stats, and recommendations for a specific account',
  tags: ['Accounts', 'Security'],
  parameters: [
    {
      name: 'accountId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'AWS account ID'
    }
  ],
  responses: {
    200: {
      description: 'Account security summary',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const accountId = getRouterParam(event, 'accountId')

  if (!accountId) {
    return errors.badRequest(event, 'Account ID is required')
  }

  // Lookup account to get name and environment
  const account = await lookupAccountUnified({ accountId })
  if (!account) {
    return errors.notFound(event, `Account ${accountId} not found`)
  }

  const accountName = account.name || account.projectName || accountId
  // Determine environment from account data; default to govcloud for security data
  const environment = (account as any).environment || 'govcloud'

  logger.info(`[Security Summary] Fetching security data for account ${accountId}`)

  const findings = await getSecurityHubFindings([accountId], { activeOnly: true, lookbackDays: 90 })

  // Build severity breakdown
  const severityBreakdown: Record<FindingSeverity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFORMATIONAL: 0
  }

  const findingsByProduct: Record<string, number> = {}
  const complianceCounts = { passed: 0, failed: 0, warning: 0, notAvailable: 0 }

  for (const f of findings) {
    // Severity counts
    const sev = f.severity as FindingSeverity
    if (sev in severityBreakdown) severityBreakdown[sev]++

    // Product counts
    findingsByProduct[f.productName] = (findingsByProduct[f.productName] || 0) + 1

    // Compliance counts (only findings that have a compliance status)
    if (f.complianceStatus) {
      switch (f.complianceStatus) {
        case 'PASSED': complianceCounts.passed++; break
        case 'FAILED': complianceCounts.failed++; break
        case 'WARNING': complianceCounts.warning++; break
        case 'NOT_AVAILABLE': complianceCounts.notAvailable++; break
      }
    }
  }

  // Risk score formula: CRITICAL*20 + HIGH*10 + MEDIUM*3 + LOW*1, capped at 100
  const riskScore = Math.min(100,
    severityBreakdown.CRITICAL * 20 +
    severityBreakdown.HIGH * 10 +
    severityBreakdown.MEDIUM * 3 +
    severityBreakdown.LOW * 1
  )

  // Determine risk level
  let riskLevel: AccountSecuritySummary['riskLevel'] = 'MINIMAL'
  if (severityBreakdown.CRITICAL > 0) riskLevel = 'CRITICAL'
  else if (severityBreakdown.HIGH > 0) riskLevel = 'HIGH'
  else if (severityBreakdown.MEDIUM > 5) riskLevel = 'MEDIUM'
  else if (severityBreakdown.MEDIUM > 0 || severityBreakdown.LOW > 10) riskLevel = 'LOW'

  // Compliance pass rate (only count findings that have a compliance status)
  const totalCompliance = complianceCounts.passed + complianceCounts.failed + complianceCounts.warning + complianceCounts.notAvailable
  const passRate = totalCompliance > 0 ? Math.round((complianceCounts.passed / totalCompliance) * 100) : 100

  // Top findings (first 25, already sorted by severity from the utility)
  const topFindings: SecurityFindingSummary[] = findings.slice(0, 25).map(f => ({
    id: f.findingId,
    title: f.title,
    severity: f.severity as FindingSeverity,
    workflowStatus: f.workflowStatus as any,
    productName: f.productName,
    resourceType: f.resourceType,
    resourceId: f.resourceId,
    accountId: f.accountId,
    accountName: f.accountName,
    region: f.region,
    complianceStatus: f.complianceStatus as any,
    recommendation: f.remediationRecommendation,
    remediationUrl: f.remediationUrl,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt
  }))

  // Generate actionable recommendations
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
  if (passRate < 70 && totalCompliance > 0) {
    recommendations.push(`Compliance pass rate is ${passRate}% - review failed controls to improve posture`)
  }
  if (recommendations.length === 0) {
    recommendations.push('Security posture is healthy - continue monitoring for new findings')
  }

  const summary: AccountSecuritySummary = {
    accountId,
    accountName,
    environment,
    riskScore,
    riskLevel,
    totalFindings: findings.length,
    severityBreakdown,
    findingsByProduct,
    compliance: {
      ...complianceCounts,
      passRate
    },
    topFindings,
    recommendations,
    lastUpdated: new Date().toISOString()
  }

  logger.info(`[Security Summary] Account ${accountId}: ${findings.length} findings, risk ${riskLevel} (${riskScore})`)

  return sendSuccess(event, summary)
}))
