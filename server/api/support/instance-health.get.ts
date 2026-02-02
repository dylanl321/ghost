/**
 * GET /api/support/instance-health
 * Comprehensive instance health dashboard aggregating multiple AWS services
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { queryResources } from '../../utils/config-service'
import { getInstancePatchStatus, type PatchComplianceStatus } from '../../utils/ssm-patch-compliance'
import { getInstanceVulnerabilities, type VulnerabilitySeverity } from '../../utils/inspector-findings'
import { getInstanceAlarms } from '../../utils/cloudwatch-alarms'
import { getSecurityHubFindings } from '../../utils/security-hub-data'
import { lookupAccountUnified } from '../../utils/accounts-consolidated'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'
import type { FindingSeverity } from '../../../shared/types/security-hub'

interface InstanceHealthResponse {
  instanceId: string
  instanceName?: string
  accountId: string
  accountName?: string
  environment: AWSEnvironmentType
  region: string
  instanceType?: string
  state?: string
  privateIp?: string
  publicIp?: string

  // Health components
  patchCompliance: {
    success: boolean
    status: PatchComplianceStatus
    installedCount: number
    missingCount: number
    failedCount: number
    lastPatchTime?: string
    error?: string
  }

  securityFindings: {
    success: boolean
    critical: number
    high: number
    medium: number
    low: number
    findings: Array<{
      id: string
      title: string
      severity: FindingSeverity
      productName: string
    }>
    error?: string
  }

  vulnerabilities: {
    success: boolean
    critical: number
    high: number
    medium: number
    findings: Array<{
      id: string
      title: string
      severity: VulnerabilitySeverity
      cveIds: string[]
      packageName?: string
    }>
    error?: string
  }

  alarms: {
    success: boolean
    inAlarm: number
    ok: number
    alarms: Array<{
      name: string
      state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA'
      metricName: string
    }>
    error?: string
  }

  // Overall health
  healthScore: number
  healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN'
  recommendations: string[]
  partialData: boolean
  lastUpdated: string
}

registerEndpoint('/api/support/instance-health', 'GET', {
  summary: 'Get comprehensive instance health',
  description: 'Aggregated health view combining patches, security findings, vulnerabilities, and alarms',
  tags: ['Support Tools', 'Health'],
  parameters: [
    {
      name: 'instanceId',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'EC2 instance ID'
    },
    {
      name: 'accountId',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'AWS account ID (commercial account ID)'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment (default: govcloud)'
    },
    {
      name: 'region',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'AWS region (default: based on environment)'
    }
  ],
  responses: {
    200: {
      description: 'Instance health dashboard',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  instanceId: { type: 'string' },
                  healthScore: { type: 'number' },
                  healthStatus: { type: 'string' },
                  patchCompliance: { type: 'object' },
                  securityFindings: { type: 'object' },
                  vulnerabilities: { type: 'object' },
                  alarms: { type: 'object' },
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

/**
 * Calculate health score based on findings
 */
function calculateHealthScore(
  patches: { status: PatchComplianceStatus; missingCount: number },
  security: { critical: number; high: number; medium: number },
  vulnerabilities: { critical: number; high: number; medium: number },
  alarms: { inAlarm: number }
): number {
  let score = 100

  // Patch deductions
  if (patches.status === 'NON_COMPLIANT') score -= 20
  if (patches.status === 'FAILED') score -= 30
  score -= Math.min(10, patches.missingCount * 2)

  // Security finding deductions
  score -= security.critical * 15
  score -= security.high * 10
  score -= Math.min(10, security.medium * 3)

  // Vulnerability deductions
  score -= vulnerabilities.critical * 15
  score -= vulnerabilities.high * 10
  score -= Math.min(10, vulnerabilities.medium * 3)

  // Alarm deductions
  score -= alarms.inAlarm * 10

  return Math.max(0, Math.min(100, score))
}

export default defineEventHandler(handleAsync(async (event) => {
  const queryParams = getQuery(event)
  const instanceId = queryParams.instanceId as string
  const accountId = queryParams.accountId as string
  const environment = (queryParams.environment as AWSEnvironmentType) || 'govcloud'
  const region = queryParams.region as string | undefined

  // Validate required parameters
  if (!instanceId) {
    return errors.badRequest(event, 'instanceId is required')
  }

  if (!accountId) {
    return errors.badRequest(event, 'accountId is required')
  }

  if (!instanceId.startsWith('i-')) {
    return errors.badRequest(event, 'Invalid instance ID format (should start with i-)')
  }

  // Validate environment
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  // Get account info
  const account = await lookupAccountUnified({ accountId })
  const accountName = account?.name || account?.projectName

  // Use GovCloud account ID if querying govcloud environment
  const targetAccountId = environment === 'govcloud' && account?.govCloudAccountId
    ? account.govCloudAccountId
    : accountId

  const targetRegion = region || (environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1')

  logger.info(`[Instance Health] Instance: ${instanceId}, Account: ${accountId}, Environment: ${environment}`)

  // Initialize response
  const response: InstanceHealthResponse = {
    instanceId,
    accountId,
    accountName,
    environment,
    region: targetRegion,
    patchCompliance: {
      success: false,
      status: 'UNKNOWN',
      installedCount: 0,
      missingCount: 0,
      failedCount: 0
    },
    securityFindings: {
      success: false,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      findings: []
    },
    vulnerabilities: {
      success: false,
      critical: 0,
      high: 0,
      medium: 0,
      findings: []
    },
    alarms: {
      success: false,
      inAlarm: 0,
      ok: 0,
      alarms: []
    },
    healthScore: 0,
    healthStatus: 'UNKNOWN',
    recommendations: [],
    partialData: false,
    lastUpdated: new Date().toISOString()
  }

  // Fetch instance details from Config (optional, for metadata)
  try {
    const aggregatorName = environment === 'commercial'
      ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'CommercialAggregator')
      : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')

    const instanceQuery = `
      SELECT
        resourceId,
        resourceName,
        configuration,
        tags
      WHERE resourceType = 'AWS::EC2::Instance'
        AND resourceId = '${instanceId}'
    `.trim()

    const configResults = await queryResources(aggregatorName, instanceQuery, environment)

    if (configResults.results.length > 0) {
      const parsed = JSON.parse(configResults.results[0])
      const config = typeof parsed.configuration === 'string'
        ? JSON.parse(parsed.configuration)
        : parsed.configuration
      const tags = typeof parsed.tags === 'string'
        ? JSON.parse(parsed.tags)
        : parsed.tags

      const tagsObj: Record<string, string> = {}
      if (Array.isArray(tags)) {
        tags.forEach((tag: any) => {
          if (tag.key && tag.value !== undefined) {
            tagsObj[tag.key] = tag.value
          }
        })
      }

      response.instanceName = tagsObj.Name || parsed.resourceName
      response.instanceType = config?.instanceType
      response.state = config?.state?.name || config?.state
      response.privateIp = config?.privateIpAddress
      response.publicIp = config?.publicIpAddress
    }
  } catch (error: any) {
    logger.warn(`[Instance Health] Failed to get instance details: ${error.message}`)
  }

  // Fetch all health data in parallel using Promise.allSettled
  const [patchResult, securityResult, vulnResult, alarmResult] = await Promise.allSettled([
    // Patch compliance
    getInstancePatchStatus(instanceId, targetAccountId, environment, targetRegion),

    // Security Hub findings for this instance
    getSecurityHubFindings([accountId], {
      activeOnly: true,
      lookbackDays: 30
    }).then(findings => findings.filter(f =>
      f.resourceId.includes(instanceId)
    )),

    // Inspector vulnerabilities
    getInstanceVulnerabilities(instanceId, targetAccountId, environment, targetRegion),

    // CloudWatch alarms
    getInstanceAlarms(instanceId, targetAccountId, environment, targetRegion)
  ])

  // Process patch compliance result
  if (patchResult.status === 'fulfilled' && patchResult.value) {
    const patch = patchResult.value
    response.patchCompliance = {
      success: true,
      status: patch.status,
      installedCount: patch.installedCount,
      missingCount: patch.missingCount,
      failedCount: patch.failedCount,
      lastPatchTime: patch.operationEndTime?.toISOString()
    }
  } else {
    response.patchCompliance.error = patchResult.status === 'rejected'
      ? patchResult.reason?.message || 'Failed to get patch status'
      : 'No patch data available (SSM may not be enabled)'
    response.partialData = true
  }

  // Process security findings result
  if (securityResult.status === 'fulfilled') {
    const findings = securityResult.value
    response.securityFindings = {
      success: true,
      critical: findings.filter(f => f.severity === 'CRITICAL').length,
      high: findings.filter(f => f.severity === 'HIGH').length,
      medium: findings.filter(f => f.severity === 'MEDIUM').length,
      low: findings.filter(f => f.severity === 'LOW').length,
      findings: findings.slice(0, 10).map(f => ({
        id: f.findingId,
        title: f.title,
        severity: f.severity,
        productName: f.productName
      }))
    }
  } else {
    response.securityFindings.error = securityResult.reason?.message || 'Failed to get security findings'
    response.partialData = true
  }

  // Process vulnerability result
  if (vulnResult.status === 'fulfilled') {
    const vulns = vulnResult.value
    response.vulnerabilities = {
      success: true,
      critical: vulns.critical,
      high: vulns.high,
      medium: vulns.medium,
      findings: vulns.findings.slice(0, 10).map(f => ({
        id: f.findingArn,
        title: f.title,
        severity: f.severity,
        cveIds: f.cveIds,
        packageName: f.packageName
      }))
    }
  } else {
    response.vulnerabilities.error = vulnResult.reason?.message || 'Failed to get vulnerabilities'
    response.partialData = true
  }

  // Process alarm result
  if (alarmResult.status === 'fulfilled') {
    const alarms = alarmResult.value
    response.alarms = {
      success: true,
      inAlarm: alarms.inAlarm,
      ok: alarms.ok,
      alarms: alarms.alarms.slice(0, 10).map(a => ({
        name: a.alarmName,
        state: a.state,
        metricName: a.metricName
      }))
    }
  } else {
    response.alarms.error = alarmResult.reason?.message || 'Failed to get alarms'
    response.partialData = true
  }

  // Calculate health score
  response.healthScore = calculateHealthScore(
    {
      status: response.patchCompliance.status,
      missingCount: response.patchCompliance.missingCount
    },
    response.securityFindings,
    response.vulnerabilities,
    response.alarms
  )

  // Determine health status
  if (response.healthScore >= 90) {
    response.healthStatus = 'HEALTHY'
  } else if (response.healthScore >= 70) {
    response.healthStatus = 'WARNING'
  } else if (response.healthScore >= 0) {
    response.healthStatus = 'CRITICAL'
  } else {
    response.healthStatus = 'UNKNOWN'
  }

  // Generate recommendations
  if (response.patchCompliance.missingCount > 0) {
    response.recommendations.push(`${response.patchCompliance.missingCount} patches are missing - schedule patching`)
  }

  if (response.patchCompliance.failedCount > 0) {
    response.recommendations.push(`${response.patchCompliance.failedCount} patch installations failed - check SSM agent`)
  }

  if (response.securityFindings.critical > 0) {
    response.recommendations.push(`${response.securityFindings.critical} critical security finding(s) - remediate immediately`)
  }

  if (response.securityFindings.high > 0) {
    response.recommendations.push(`${response.securityFindings.high} high severity security finding(s) - review and remediate`)
  }

  if (response.vulnerabilities.critical > 0) {
    response.recommendations.push(`${response.vulnerabilities.critical} critical vulnerability(ies) - update affected packages`)
  }

  if (response.vulnerabilities.high > 0) {
    response.recommendations.push(`${response.vulnerabilities.high} high severity vulnerability(ies) - plan remediation`)
  }

  if (response.alarms.inAlarm > 0) {
    response.recommendations.push(`${response.alarms.inAlarm} CloudWatch alarm(s) in ALARM state - investigate metrics`)
  }

  if (response.recommendations.length === 0 && !response.partialData) {
    response.recommendations.push('Instance health is good - continue monitoring')
  }

  if (response.partialData) {
    response.recommendations.push('Some health data unavailable - verify SSM, Inspector, and Security Hub are enabled')
  }

  logger.info(`[Instance Health] Instance ${instanceId}: Score ${response.healthScore}, Status ${response.healthStatus}`)

  return sendSuccess(event, response)
}))
