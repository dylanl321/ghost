import type { UnifiedAccount } from './accounts-consolidated'
import { queryConfigResources } from './aws-config-data'
import { getInstanceAlarms } from './cloudwatch-alarms'
import { getInstanceVulnerabilities } from './inspector-findings'
import { getSecurityHubFindings } from './security-hub-data'
import { getInstancePatchStatus, type PatchComplianceStatus } from './ssm-patch-compliance'

export function calculateInstanceHealthScore(
  patches: { status: PatchComplianceStatus; missingCount: number },
  security: { critical: number; high: number; medium: number },
  vulnerabilities: { critical: number; high: number; medium: number },
  alarms: { inAlarm: number }
): number {
  let score = 100
  if (patches.status === 'NON_COMPLIANT') score -= 20
  if (patches.status === 'FAILED') score -= 30
  score -= Math.min(10, patches.missingCount * 2)
  score -= security.critical * 15 + security.high * 10 + Math.min(10, security.medium * 3)
  score -= vulnerabilities.critical * 15 + vulnerabilities.high * 10 + Math.min(10, vulnerabilities.medium * 3)
  score -= alarms.inAlarm * 10
  return Math.max(0, Math.min(100, score))
}

export async function buildInstanceHealth(input: {
  instanceId: string
  account: UnifiedAccount
  environment: 'commercial' | 'govcloud'
  region?: string
  limit?: number
  lookbackDays?: number
}) {
  const commercialId = input.account.accountId || input.account.awsStandardAccountID
  const operationalId = input.environment === 'govcloud'
    ? input.account.govCloudAccountId || input.account.awsGovCloudAccountID
    : commercialId
  if (!operationalId) throw Object.assign(new Error(`Account has no ${input.environment} identifier.`), { code: 'ACCOUNT_ENVIRONMENT_MISSING' })
  const region = input.region || (input.environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1')
  const limit = Math.max(1, Math.min(input.limit || 10, 25))
  const lookbackDays = Math.max(1, Math.min(input.lookbackDays || 30, 90))
  const resources = await queryConfigResources([operationalId], { resourceTypes: ['AWS::EC2::Instance'], resourceId: input.instanceId }, { environment: input.environment, mode: 'preview', limit: 1 })
  const resource = resources.records[0]
  if (!resource) throw Object.assign(new Error('EC2 instance was not found in AWS Config.'), { code: 'INSTANCE_NOT_FOUND' })

  const [patchResult, securityResult, vulnerabilityResult, alarmResult] = await Promise.allSettled([
    getInstancePatchStatus(input.instanceId, operationalId, input.environment, region),
    commercialId ? getSecurityHubFindings([commercialId], { activeOnly: true, lookbackDays, resourceId: input.instanceId }) : Promise.reject(new Error('Commercial account ID unavailable for centralized Security Hub lookup.')),
    getInstanceVulnerabilities(input.instanceId, operationalId, input.environment, region),
    getInstanceAlarms(input.instanceId, operationalId, input.environment, region)
  ])
  const patch = patchResult.status === 'fulfilled' ? {
    success: true,
    status: patchResult.value.status,
    installedCount: patchResult.value.installedCount,
    missingCount: patchResult.value.missingCount,
    failedCount: patchResult.value.failedCount,
    lastPatchTime: patchResult.value.operationEndTime?.toISOString()
  } : { success: false, status: 'UNKNOWN' as PatchComplianceStatus, installedCount: 0, missingCount: 0, failedCount: 0, error: String(patchResult.reason) }
  const securityRecords = securityResult.status === 'fulfilled' ? securityResult.value : []
  const security = {
    success: securityResult.status === 'fulfilled',
    critical: securityRecords.filter(finding => finding.severity === 'CRITICAL').length,
    high: securityRecords.filter(finding => finding.severity === 'HIGH').length,
    medium: securityRecords.filter(finding => finding.severity === 'MEDIUM').length,
    low: securityRecords.filter(finding => finding.severity === 'LOW').length,
    findings: securityRecords.slice(0, limit).map(finding => ({ id: finding.findingId, title: finding.title, severity: finding.severity, productName: finding.productName })),
    truncated: securityRecords.length > limit,
    ...(securityResult.status === 'rejected' ? { error: String(securityResult.reason) } : {})
  }
  const vulnerabilities = vulnerabilityResult.status === 'fulfilled' ? {
    success: true,
    critical: vulnerabilityResult.value.critical,
    high: vulnerabilityResult.value.high,
    medium: vulnerabilityResult.value.medium,
    findings: vulnerabilityResult.value.findings.slice(0, limit).map(finding => ({ id: finding.findingArn, title: finding.title, severity: finding.severity, cveIds: finding.cveIds, packageName: finding.packageName })),
    truncated: vulnerabilityResult.value.findings.length > limit
  } : { success: false, critical: 0, high: 0, medium: 0, findings: [], truncated: false, error: String(vulnerabilityResult.reason) }
  const alarms = alarmResult.status === 'fulfilled' ? {
    success: true,
    inAlarm: alarmResult.value.inAlarm,
    ok: alarmResult.value.ok,
    alarms: alarmResult.value.alarms.slice(0, limit).map(alarm => ({ name: alarm.alarmName, state: alarm.state, metricName: alarm.metricName })),
    truncated: alarmResult.value.alarms.length > limit
  } : { success: false, inAlarm: 0, ok: 0, alarms: [], truncated: false, error: String(alarmResult.reason) }
  const successfulDomains = [patch.success, security.success, vulnerabilities.success, alarms.success].filter(Boolean).length
  const healthScore = successfulDomains ? calculateInstanceHealthScore(patch, security, vulnerabilities, alarms) : 0
  const partialData = [patch.success, security.success, vulnerabilities.success, alarms.success].some(success => !success)
  const recommendations: string[] = []
  if (patch.missingCount) recommendations.push(`${patch.missingCount} patches are missing.`)
  if (patch.failedCount) recommendations.push(`${patch.failedCount} patch installations failed.`)
  if (security.critical) recommendations.push(`${security.critical} critical security finding(s) require remediation.`)
  if (security.high) recommendations.push(`${security.high} high security finding(s) should be reviewed.`)
  if (vulnerabilities.critical) recommendations.push(`${vulnerabilities.critical} critical vulnerability(ies) require package updates.`)
  if (vulnerabilities.high) recommendations.push(`${vulnerabilities.high} high vulnerability(ies) should be planned for remediation.`)
  if (alarms.inAlarm) recommendations.push(`${alarms.inAlarm} CloudWatch alarm(s) are in ALARM state.`)
  if (partialData) recommendations.push('Some health domains are unavailable; verify service coverage and permissions.')
  if (!recommendations.length) recommendations.push('No actionable instance health issues were found in the returned evidence.')
  return {
    instanceId: input.instanceId,
    instanceName: resource.tags?.Name || resource.resourceName,
    accountId: operationalId,
    commercialAccountId: commercialId,
    accountName: resource.accountName,
    environment: input.environment,
    region: resource.region || region,
    instanceType: resource.configuration?.instanceType,
    state: resource.configuration?.state?.name || resource.configuration?.state,
    privateIp: resource.configuration?.privateIpAddress,
    publicIp: resource.configuration?.publicIpAddress,
    patchCompliance: { ...patch, window: { type: 'snapshot', observedAt: patch.lastPatchTime } },
    securityFindings: { ...security, window: { type: 'lookback', days: lookbackDays } },
    vulnerabilities: { ...vulnerabilities, window: { type: 'snapshot' } },
    alarms: { ...alarms, window: { type: 'snapshot' } },
    healthScore,
    healthStatus: successfulDomains === 0 ? 'UNKNOWN' : healthScore >= 90 ? 'HEALTHY' : healthScore >= 70 ? 'WARNING' : 'CRITICAL',
    recommendations,
    partialData,
    lastUpdated: new Date().toISOString()
  }
}
