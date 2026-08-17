import { DescribeAggregateComplianceByConfigRulesCommand, type ConfigServiceClient } from '@aws-sdk/client-config-service'
import { getConfigServiceClient } from '../lib/aws-client-factory'
import { getAccountVulnerabilities } from '../utils/inspector-findings'
import { getAggregatorName } from '../utils/config-service'
import { querySecurityHubFindings } from '../utils/security-hub-data'
import { getAccountPatchCompliance } from '../utils/ssm-patch-compliance'

export type GhostDomainStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

export interface ComplianceDomain<T = unknown> {
  status: GhostDomainStatus
  evidence: T
  source: string
  queriedAt: string
  observedAt?: string
  coverageGaps: string[]
}

export function statusForFindings(summary: { critical: number; high: number; medium: number }): GhostDomainStatus {
  if (summary.critical > 0) return 'critical'
  if (summary.high > 0 || summary.medium > 0) return 'warning'
  return 'healthy'
}

async function configRuleCompliance(accountId: string, environment: 'commercial' | 'govcloud') {
  const region = environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'
  const client: ConfigServiceClient = await getConfigServiceClient(environment, region)
  const counts = { compliant: 0, nonCompliant: 0, notApplicable: 0, insufficientData: 0, total: 0 }
  const records: Array<{ ruleName?: string; complianceType?: string; region?: string }> = []
  let nextToken: string | undefined
  do {
    const response = await client.send(new DescribeAggregateComplianceByConfigRulesCommand({
      ConfigurationAggregatorName: getAggregatorName(environment), NextToken: nextToken, Limit: 100
    }))
    for (const rule of response.AggregateComplianceByConfigRules || []) {
      if (rule.AccountId !== accountId) continue
      records.push({ ruleName: rule.ConfigRuleName, complianceType: rule.Compliance?.ComplianceType, region: rule.AwsRegion })
      counts.total++
      if (rule.Compliance?.ComplianceType === 'COMPLIANT') counts.compliant++
      else if (rule.Compliance?.ComplianceType === 'NON_COMPLIANT') counts.nonCompliant++
      else if (rule.Compliance?.ComplianceType === 'NOT_APPLICABLE') counts.notApplicable++
      else counts.insufficientData++
    }
    nextToken = response.NextToken
  } while (nextToken)
  return { counts, records }
}

export async function collectCompliance(accountId: string, environment: 'commercial' | 'govcloud' = 'govcloud', securityHubAccountId = accountId, detailLevel: 'summary' | 'detailed' = 'summary', lookbackDays = 90) {
  const queriedAt = new Date().toISOString()
  const [inspector, securityHub, config, patch] = await Promise.allSettled([
    getAccountVulnerabilities(accountId, environment),
    querySecurityHubFindings([securityHubAccountId], { activeOnly: true, lookbackDays }),
    configRuleCompliance(accountId, environment),
    getAccountPatchCompliance(accountId, environment)
  ])
  const failed = (source: string, reason: unknown): ComplianceDomain => ({ status: 'unknown', evidence: null, source, queriedAt, coverageGaps: [reason instanceof Error ? reason.message : String(reason)] })
  const vulnerability = inspector.status === 'fulfilled'
    ? { status: statusForFindings(inspector.value.summary), evidence: { ...inspector.value.summary, ...(detailLevel === 'detailed' ? { details: inspector.value.findings.slice(0, 25), truncated: inspector.value.findings.length > 25 } : {}) }, source: 'AWS Inspector', queriedAt, observedAt: inspector.value.findings.map(f => f.updatedAt).filter(Boolean).sort().at(-1), coverageGaps: [] } satisfies ComplianceDomain
    : failed('AWS Inspector', inspector.reason)
  const controlRecords = securityHub.status === 'fulfilled' ? securityHub.value.records.filter(record => Boolean(record.complianceStatus)) : []
  const failedControls = controlRecords.filter(record => record.complianceStatus === 'FAILED')
  const controls = securityHub.status === 'fulfilled'
    ? { status: failedControls.some(record => record.severity === 'CRITICAL') ? 'critical' : failedControls.length || controlRecords.some(record => record.complianceStatus === 'WARNING') ? 'warning' : 'healthy', evidence: { total: controlRecords.length, failed: failedControls.length, warning: controlRecords.filter(record => record.complianceStatus === 'WARNING').length, passed: controlRecords.filter(record => record.complianceStatus === 'PASSED').length, ...(detailLevel === 'detailed' ? { details: controlRecords.slice(0, 25), truncated: controlRecords.length > 25 } : {}) }, source: 'AWS Security Hub', queriedAt, observedAt: controlRecords.map(record => record.updatedAt).filter(Boolean).sort().at(-1), coverageGaps: controlRecords.length ? [] : ['No Security Hub control evidence was returned.'] } satisfies ComplianceDomain
    : failed('AWS Security Hub', securityHub.reason)
  const configDomain = config.status === 'fulfilled'
    ? { status: config.value.counts.total === 0 || config.value.counts.insufficientData > 0 ? 'unknown' : config.value.counts.nonCompliant ? 'warning' : 'healthy', evidence: { ...config.value.counts, ...(detailLevel === 'detailed' ? { details: config.value.records.slice(0, 25), truncated: config.value.records.length > 25 } : {}) }, source: 'AWS Config', queriedAt, coverageGaps: config.value.counts.total === 0 ? ['No Config rule evidence was returned.'] : config.value.counts.insufficientData ? ['One or more Config rules reported insufficient data.'] : [] } satisfies ComplianceDomain
    : failed('AWS Config', config.reason)
  const latestPatch = patch.status === 'fulfilled'
    ? patch.value.instances.map(instance => instance.operationEndTime || instance.operationStartTime).filter((value): value is Date => Boolean(value)).sort((left, right) => right.getTime() - left.getTime())[0]
    : undefined
  const patchAgeDays = latestPatch ? (Date.now() - +new Date(latestPatch)) / 86_400_000 : undefined
  const patchDomain = patch.status === 'fulfilled'
    ? { status: patch.value.totalInstances === 0 ? 'unknown' : patch.value.totalFailedPatches > 0 || (patchAgeDays !== undefined && patchAgeDays > 30) ? 'critical' : patch.value.nonCompliantInstances > 0 || patch.value.pendingInstances > 0 || (patchAgeDays !== undefined && patchAgeDays > 14) ? 'warning' : 'healthy', evidence: { ...patch.value, ...(detailLevel === 'detailed' ? { instances: patch.value.instances.slice(0, 25), truncated: patch.value.instances.length > 25 } : { instances: undefined }) }, source: 'AWS Systems Manager', queriedAt, observedAt: latestPatch?.toISOString(), coverageGaps: patch.value.totalInstances === 0 ? ['No SSM managed-instance patch coverage was returned.'] : [] } satisfies ComplianceDomain
    : failed('AWS Systems Manager', patch.reason)
  return { vulnerability, securityHubControls: controls, config: configDomain, patch: patchDomain }
}
