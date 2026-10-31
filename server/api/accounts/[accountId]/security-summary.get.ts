/**
 * GET /api/accounts/:accountId/security-summary
 * Account-level security summary with risk scoring, severity breakdown, and compliance stats.
 * Uses Athena queries against security_hub database, falls back to Security Hub API.
 */

import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { lookupAccountUnified } from '../../../utils/accounts-consolidated'
import { organizationCache, CacheTags } from '../../../utils/cache-manager'
import {
  buildAccountSecurityViaAthena,
  buildAccountRecommendations,
  computeRiskScore,
  getRiskLevel,
  getSecurityHubEnvironment
} from '../../../utils/security-hub-athena'
import { getSecurityHubFindings } from '../../../utils/security-hub-data'
import { logger } from '../../../utils/logger'
import { registerEndpoint } from '../../../plugins/swagger'
import type { AccountSecuritySummary, SecurityFindingSummary, SecuritySourceFilter } from '../../../../shared/types/security-dashboard'
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
    },
    {
      name: 'source',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['all', 'platform', 'os'] },
      description: 'Filter by finding source: all (default), platform (compliance + inspector), os (InSpec only)'
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

const CACHE_TTL_SECONDS = 300

export default defineEventHandler(handleAsync(async (event) => {
  const accountId = getRouterParam(event, 'accountId')

  if (!accountId || !/^\d{12}$/.test(accountId)) {
    return errors.badRequest(event, 'A 12-digit account ID is required')
  }

  const query = getQuery(event)
  const sourceFilter = (['all', 'platform', 'os'].includes(query.source as string)
    ? query.source
    : 'all') as SecuritySourceFilter

  const account = await lookupAccountUnified({ accountId })
  if (!account) {
    return errors.notFound(event, `Account ${accountId} not found`)
  }

  const accountName = account.name || account.projectName || accountId

  // Six Athena queries per load: share one result per account and source
  const summary = await organizationCache.getOrSet(
    `security:account-summary:${accountId}:${sourceFilter}`,
    () => buildAccountSummary(accountId, accountName, sourceFilter),
    { ttl: CACHE_TTL_SECONDS, tags: [CacheTags.SECURITY] }
  )
  return sendSuccess(event, summary)
}))

async function buildAccountSummary(
  accountId: string,
  accountName: string,
  sourceFilter: SecuritySourceFilter
): Promise<AccountSecuritySummary> {
  try {
    return await buildAccountSecurityViaAthena(accountId, accountName, sourceFilter)
  } catch (athenaErr: any) {
    logger.warn(`[Security Summary] Athena failed for ${accountId}, falling back to Security Hub API: ${athenaErr.message}`)
  }

  // Fallback: Security Hub API (no grouping fields, no source filter)
  const findings = await getSecurityHubFindings([accountId], { activeOnly: true, lookbackDays: 90 })

  const severityBreakdown: Record<FindingSeverity, number> = {
    CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0
  }
  const findingsByProduct: Record<string, number> = {}
  const complianceCounts = { passed: 0, failed: 0, warning: 0, notAvailable: 0, total: 0 }

  for (const f of findings) {
    const sev = f.severity as FindingSeverity
    if (sev in severityBreakdown) severityBreakdown[sev]++
    findingsByProduct[f.productName] = (findingsByProduct[f.productName] || 0) + 1
    switch (f.complianceStatus) {
      case 'PASSED': complianceCounts.passed++; complianceCounts.total++; break
      case 'FAILED': complianceCounts.failed++; complianceCounts.total++; break
      case 'WARNING': complianceCounts.warning++; complianceCounts.total++; break
      case 'NOT_AVAILABLE': complianceCounts.notAvailable++; complianceCounts.total++; break
    }
  }

  // Same scoring as the Athena path, so the level does not change with the source
  const riskScore = computeRiskScore(severityBreakdown.CRITICAL, severityBreakdown.HIGH, severityBreakdown.MEDIUM, severityBreakdown.LOW)
  const riskLevel = getRiskLevel(riskScore)
  const passRate = complianceCounts.total > 0 ? Math.round((complianceCounts.passed / complianceCounts.total) * 100) : 100

  const topFindings: SecurityFindingSummary[] = findings
    .filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH')
    .slice(0, 25)
    .map(f => ({
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

  logger.info(`[Security Summary] Account ${accountId} (fallback): ${findings.length} findings, risk ${riskLevel} (${riskScore})`)

  return {
    accountId,
    accountName,
    environment: getSecurityHubEnvironment(),
    riskScore,
    riskLevel,
    totalFindings: findings.length,
    severityBreakdown,
    findingsByProduct,
    compliance: { ...complianceCounts, passRate },
    topFindings,
    recommendations: buildAccountRecommendations(severityBreakdown, findingsByProduct, passRate, complianceCounts.total),
    lastUpdated: new Date().toISOString()
    // findingsByResource, findingsByTitle, findingsByCve are Athena-only
  }
}
