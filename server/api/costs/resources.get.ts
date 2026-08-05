/**
 * GET /api/costs/resources
 * Get resource-level cost breakdown for a specific service + tag combination
 */

import { defineEventHandler, getQuery } from 'h3'
import {
  GetResourcesCommand
} from '@aws-sdk/client-resource-groups-tagging-api'
import type { Expression } from '@aws-sdk/client-cost-explorer'
import { getCostAndUsageWithResources } from '../../utils/cost-explorer'
import { getResourceGroupsTaggingClient } from '../../lib/aws-client-factory'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { costCache, CacheTags } from '../../utils/cache-manager'
import { validateDateParams, type RelativePeriod } from '../../utils/date-helpers'
import { logger } from '../../utils/logger'
import { getCostTagFilterCacheKey, parseQueryValues } from '../../utils/cost-tag-filters'

registerEndpoint('/api/costs/resources', 'GET', {
  summary: 'Get resource-level cost breakdown',
  description: 'Retrieve individual resource costs for a specific service and tag value combination',
  tags: ['Costs'],
  parameters: [
    { name: 'accountId', in: 'query', required: true, schema: { type: 'string' }, description: 'AWS account ID' },
    { name: 'service', in: 'query', required: true, schema: { type: 'string' }, description: 'AWS service name (e.g., "Amazon Elastic Compute Cloud - Compute")' },
    { name: 'tagKey', in: 'query', required: true, schema: { type: 'string' }, description: 'Tag key to filter by' },
    { name: 'tagValue', in: 'query', required: false, schema: { type: 'string' }, description: 'Single tag value to filter by (legacy)' },
    { name: 'tagValues', in: 'query', required: false, schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true, description: 'One or more tag values matched with OR semantics' },
    { name: 'period', in: 'query', required: false, schema: { type: 'string', default: 'last90days' }, description: 'Relative date period' },
    { name: 'top', in: 'query', required: false, schema: { type: 'integer', default: 15 }, description: 'Number of top resources to return' },
    { $ref: '#/components/parameters/Environment' }
  ],
  responses: {
    '200': { description: 'Resource-level cost breakdown' }
  }
})

// Noise resource prefixes to filter out
const NOISE_PREFIXES = ['eni-', 'sg-', 'subnet-', 'rtb-', 'igw-', 'acl-', 'dopt-', 'pcx-', 'vpce-']

// Name tag priority (from instance-enrichment.ts pattern)
const NAME_TAG_KEYS = ['Name', 'InstanceName', 'instance-name', 'ResourceName', 'hostname', 'Hostname']

// Friendly resource type labels based on ID prefix or ARN service/type
const RESOURCE_TYPE_MAP: Record<string, string> = {
  'i-': 'EC2 Instance',
  'vol-': 'EBS Volume',
  'nat-': 'NAT Gateway',
  'snap-': 'EBS Snapshot',
  'db-': 'RDS Instance',
  'func-': 'Lambda Function',
  'table/': 'DynamoDB Table',
  'bucket/': 'S3 Bucket',
  'cluster/': 'ECS/EKS Cluster',
  'loadbalancer/': 'Load Balancer',
  'targetgroup/': 'Target Group',
  'filesystem/': 'EFS File System',
  'distribution/': 'CloudFront Distribution',
  'queue/': 'SQS Queue',
  'topic/': 'SNS Topic',
  'secret:': 'Secrets Manager Secret',
  'log-group:': 'CloudWatch Log Group',
  'alarm:': 'CloudWatch Alarm',
  'stack/': 'CloudFormation Stack',
  'trail/': 'CloudTrail Trail',
  'vpn-': 'VPN Connection',
  'tgw-': 'Transit Gateway',
  'eip-': 'Elastic IP'
}

// Map ARN service segment to friendly service label
const ARN_SERVICE_MAP: Record<string, string> = {
  'ec2': 'EC2',
  's3': 'S3',
  'rds': 'RDS',
  'lambda': 'Lambda',
  'dynamodb': 'DynamoDB',
  'elasticloadbalancing': 'ELB',
  'ecs': 'ECS',
  'eks': 'EKS',
  'elasticfilesystem': 'EFS',
  'cloudfront': 'CloudFront',
  'sqs': 'SQS',
  'sns': 'SNS',
  'secretsmanager': 'Secrets Manager',
  'logs': 'CloudWatch Logs',
  'cloudwatch': 'CloudWatch',
  'cloudformation': 'CloudFormation',
  'cloudtrail': 'CloudTrail',
  'kms': 'KMS',
  'redshift': 'Redshift'
}

function isNoiseResource(resourceId: string): boolean {
  if (resourceId === 'NoResourceId') return true
  const lower = resourceId.toLowerCase()
  // Check the raw ID and also the last segment of an ARN
  const lastSegment = resourceId.includes(':') ? resourceId.split(':').pop() || '' : resourceId
  return NOISE_PREFIXES.some(prefix => lastSegment.startsWith(prefix) || lower.endsWith('/' + prefix))
}

function parseResourceType(resourceId: string): string {
  // ARN format: arn:partition:service:region:account:resourcetype/id
  if (resourceId.startsWith('arn:')) {
    const parts = resourceId.split(':')
    const service = parts[2] || ''
    const resourcePart = parts.slice(5).join(':')

    // Check specific resource type patterns
    for (const [pattern, label] of Object.entries(RESOURCE_TYPE_MAP)) {
      if (resourcePart.includes(pattern)) return label
    }

    // Check ID prefix patterns in the resource part
    for (const [prefix, label] of Object.entries(RESOURCE_TYPE_MAP)) {
      if (prefix.endsWith('-') && resourcePart.includes(prefix)) return label
    }

    const friendlyService = ARN_SERVICE_MAP[service] || service
    // Try to extract type from resource part (e.g., "instance/i-abc" -> "Instance")
    const typePart = resourcePart.split('/')[0]
    if (typePart && typePart !== resourcePart) {
      return `${friendlyService} ${typePart.charAt(0).toUpperCase() + typePart.slice(1)}`
    }
    return friendlyService + ' Resource'
  }

  // Bare ID prefixes
  for (const [prefix, label] of Object.entries(RESOURCE_TYPE_MAP)) {
    if (resourceId.startsWith(prefix)) return label
  }

  return 'Resource'
}

function extractShortId(resourceId: string): string {
  if (resourceId.startsWith('arn:')) {
    const parts = resourceId.split(':')
    const resourcePart = parts.slice(5).join(':')
    // Get last meaningful segment
    const segments = resourcePart.split('/')
    return segments[segments.length - 1] || resourcePart
  }
  return resourceId
}

function extractRegionFromArn(arn: string): string | null {
  if (!arn.startsWith('arn:')) return null
  const parts = arn.split(':')
  return parts[3] || null
}

async function resolveResourceNames(
  arns: string[],
  environment: 'commercial' | 'govcloud',
  accountId: string
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>()
  if (arns.length === 0) return nameMap

  // Group ARNs by region
  const byRegion = new Map<string, string[]>()
  for (const arn of arns) {
    const region = extractRegionFromArn(arn)
    if (!region) continue
    const list = byRegion.get(region) || []
    list.push(arn)
    byRegion.set(region, list)
  }

  // Resolve names per region in parallel
  const _results = await Promise.allSettled(
    Array.from(byRegion.entries()).map(async ([region, regionArns]) => {
      try {
        const client = await getResourceGroupsTaggingClient(environment, region, accountId)
        // GetResources supports up to 100 ARNs per call
        for (let i = 0; i < regionArns.length; i += 100) {
          const batch = regionArns.slice(i, i + 100)
          const command = new GetResourcesCommand({
            ResourceARNList: batch,
            ResourcesPerPage: 100
          })
          const response = await client.send(command)
          for (const resource of response.ResourceTagMappingList ?? []) {
            const arn = resource.ResourceARN
            if (!arn) continue
            // Find name tag using priority list
            for (const nameKey of NAME_TAG_KEYS) {
              const tag = resource.Tags?.find(t => t.Key === nameKey)
              if (tag?.Value) {
                nameMap.set(arn, tag.Value)
                break
              }
            }
          }
        }
      } catch (err) {
        logger.warn(`Failed to resolve resource names in region ${region}:`, err)
      }
    })
  )

  return nameMap
}

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const accountId = query.accountId as string
  const service = query.service as string
  const tagKey = query.tagKey as string
  const tagValues = parseQueryValues(query.tagValues)
  if (tagValues.length === 0 && query.tagValue) tagValues.push(String(query.tagValue))
  const period = (query.period as string) || 'last90days'
  const top = parseInt(query.top as string) || 15
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'

  if (!accountId || !service || !tagKey || tagValues.length === 0) {
    return errors.badRequest(event, 'accountId, service, tagKey, and at least one tag value are required')
  }

  // Check cache
  const tagFilterKey = getCostTagFilterCacheKey({ key: tagKey, values: tagValues })
  const cacheKey = `costs:resources:${accountId}:${service}:${tagFilterKey}:${period}:${top}`
  const cached = await costCache.get(cacheKey)
  if (cached) return sendSuccess(event, cached, { source: 'cache' })

  // Resolve date range — GetCostAndUsageWithResources has a hard 14-day lookback limit
  const dateRange = validateDateParams({ period: period as RelativePeriod })
  const endDate = dateRange.endDate
  const maxLookbackMs = 14 * 24 * 60 * 60 * 1000
  const endMs = new Date(endDate).getTime()
  const earliestStart = new Date(endMs - maxLookbackMs).toISOString().split('T')[0]
  const startDate = dateRange.startDate > earliestStart ? dateRange.startDate : earliestStart

  // Build filter: account + service + tag
  const filter: Expression = {
    And: [
      { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [accountId] } },
      { Dimensions: { Key: 'SERVICE', Values: [service] } },
      { Tags: { Key: tagKey, Values: tagValues } }
    ]
  }

  let resultsByTime: any[]
  try {
    const result = await getCostAndUsageWithResources(
      {
        startDate,
        endDate,
        granularity: 'DAILY',
        metrics: ['UnblendedCost'],
        filter
      },
      environment,
      environment === 'commercial' ? process.env.AWS_MASTER_ACCOUNT_ID || '205950196477' : undefined
    )
    resultsByTime = result.resultsByTime
  } catch (err: any) {
    const errName = err.name || err.Code || ''
    const errMsg = err.message || ''
    logger.error('GetCostAndUsageWithResources failed:', {
      name: errName,
      code: err.$metadata?.httpStatusCode,
      message: errMsg,
      accountId,
      service,
      tagKey,
      tagValuesCount: tagValues.length,
      startDate,
      endDate
    })
    // DataUnavailableException / BillExpirationException = resource data not enabled or not yet available.
    // Also catch AccessDenied since the API may not be available in Billing Conductor / proforma contexts.
    if (errName === 'DataUnavailableException' || errName === 'BillExpirationException' ||
        errName === 'AccessDeniedException' ||
        errMsg.includes('not available') || errMsg.includes('not enabled') ||
        errMsg.includes('RESOURCES') || errMsg.includes('You haven\'t enabled')) {
      return errors.badRequest(event, 'Resource-level cost data is not available. Ensure "Hourly and Resource Level Data" is enabled in the management (payer) account\'s Cost Explorer Preferences. Note: this setting is managed at the organization level and may take up to 24 hours to take effect.')
    }
    throw err
  }

  // Aggregate costs per resource ID
  const resourceCosts = new Map<string, number>()
  for (const period of resultsByTime) {
    for (const group of (period.Groups || [])) {
      const resourceId = group.Keys?.[0] || ''
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      if (cost > 0) {
        resourceCosts.set(resourceId, (resourceCosts.get(resourceId) || 0) + cost)
      }
    }
  }

  // Filter noise and trivial costs
  const filtered = Array.from(resourceCosts.entries())
    .filter(([id, cost]) => cost >= 0.01 && !isNoiseResource(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)

  const totalCost = filtered.reduce((sum, [, cost]) => sum + cost, 0)

  // Resolve friendly names for ARNs
  const arns = filtered.map(([id]) => id).filter(id => id.startsWith('arn:'))
  const nameMap = await resolveResourceNames(arns, environment, accountId)

  const resources = filtered.map(([resourceId, cost]) => ({
    resourceId,
    displayName: nameMap.get(resourceId) || extractShortId(resourceId),
    resourceType: parseResourceType(resourceId),
    cost: Math.round(cost * 100) / 100,
    percentage: totalCost > 0 ? Math.round((cost / totalCost) * 1000) / 10 : 0
  }))

  const wasCapped = dateRange.startDate !== startDate
  const responseData = {
    resources,
    dateRange: { startDate, endDate },
    billingDomain: 'billable' as const,
    metric: 'UnblendedCost' as const,
    exact: true,
    // Let the frontend know the range was limited
    ...(wasCapped && { notice: `Resource-level data is limited to the last 14 days (${startDate} to ${endDate})` })
  }

  await costCache.set(cacheKey, responseData, { ttl: 900, tags: [CacheTags.COSTS] })

  return sendSuccess(event, responseData)
}))
