/**
 * Instance Enrichment Utilities
 * 
 * Helper functions for enriching EC2 instance data with tags, scheduling info,
 * cost optimization analysis, and management metadata
 */

import type { ResourceDetail } from './config-service'
import type { AWSEnvironmentType } from '../types/aws'
import { logger } from './logger'

// Common tag keys for instance naming
const INSTANCE_NAME_TAGS = [
  'Name',
  'InstanceName',
  'instance-name',
  'ResourceName',
  'hostname',
  'Hostname'
]

// GDMS-specific tag schema
const GDMS_TAG_SCHEMA = {
  management: {
    managed: 'GDMS_Managed', // True/False - indicates if instance is managed by GDMS
  },
  scheduling: {
    schedule: 'Schedule', // String containing schedule name (e.g., "extended-east-working-hours")
    scheduleMessage: 'ScheduleMessage', // Status message from AWS Instance Scheduler
  },
  patching: {
    patchGroup: 'Patch Group', // Patch group (e.g., "Aggressive")
    patchingAutomation: 'PatchingAutomation', // Patching schedule (e.g., "sun")
  }
}

// Cache for instance type information from AWS EC2 API
let instanceTypeCache: Map<string, any> = new Map()
let instanceTypeCacheExpiry = 0
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

export interface EnrichedInstanceData {
  resourceId: string
  resourceType: string
  accountId: string
  region: string
  accountName?: string

  // Enhanced fields
  instanceName?: string
  instanceType?: string
  instanceState?: string
  launchTime?: string

  // Network information
  networkInfo?: {
    privateIpAddress?: string
    publicIpAddress?: string
    vpcId?: string
    subnetId?: string
  }

  // Storage information
  storageInfo?: {
    rootVolumeSize?: number
    totalVolumeSize?: number
    volumeCount?: number
    volumes?: Array<{
      deviceName: string
      volumeSize?: number
      volumeType?: string
    }>
  }

  // Pricing information
  pricingInfo?: {
    hourlyRate?: number
    monthlyEstimate?: number
    currency?: string
    pricingRegion?: string
  }

  // GDMS Management and Scheduling
  managementInfo?: {
    isGDMSManaged: boolean
    gdmsManagedValue?: string
  }

  schedulingInfo?: {
    hasSchedule: boolean
    scheduleName?: string
    lastScheduleMessage?: string
    scheduleStatus?: 'running' | 'stopped' | 'unknown'
  }

  patchingInfo?: {
    patchGroup?: string
    patchingAutomation?: string
  }

  // Metadata
  metadata?: {
    environment?: string
    project?: string
    costCenter?: string
    owner?: string
    tags: Record<string, string>
  }

  // AWS-powered optimization insights (when available)
  awsOptimizationInsights?: {
    family: string
    generation: string
    processorInfo?: string
    vcpus?: number
    memoryMb?: number
    networkPerformance?: string
    generalRecommendations: string[]
  }
}

/**
 * Extract instance name from tags using common naming conventions
 */
export function extractInstanceName(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined
  
  // Try common name tag keys in order of preference
  for (const nameTag of INSTANCE_NAME_TAGS) {
    if (tags[nameTag] && tags[nameTag].trim()) {
      return tags[nameTag].trim()
    }
  }
  
  return undefined
}

/**
 * Analyze GDMS management tags
 */
export function analyzeGDMSManagementTags(tags: Record<string, string> | undefined): {
  isGDMSManaged: boolean
  gdmsManagedValue?: string
} {
  const result: {
    isGDMSManaged: boolean
    gdmsManagedValue?: string
  } = {
    isGDMSManaged: false
  }
  
  if (!tags) return result
  
  const gdmsTag = tags[GDMS_TAG_SCHEMA.management.managed]
  if (gdmsTag) {
    result.gdmsManagedValue = gdmsTag
    result.isGDMSManaged = gdmsTag.toLowerCase() === 'true'
  }
  
  return result
}

/**
 * Analyze GDMS scheduling tags
 */
export function analyzeGDMSSchedulingTags(tags: Record<string, string> | undefined): {
  hasSchedule: boolean
  scheduleName?: string
  lastScheduleMessage?: string
  scheduleStatus?: 'running' | 'stopped' | 'unknown'
} {
  const result: {
    hasSchedule: boolean
    scheduleName?: string
    lastScheduleMessage?: string
    scheduleStatus?: 'running' | 'stopped' | 'unknown'
  } = {
    hasSchedule: false
  }
  
  if (!tags) return result
  
  const scheduleName = tags[GDMS_TAG_SCHEMA.scheduling.schedule]
  const scheduleMessage = tags[GDMS_TAG_SCHEMA.scheduling.scheduleMessage]
  
  if (scheduleName) {
    result.hasSchedule = true
    result.scheduleName = scheduleName
  }
  
  if (scheduleMessage) {
    result.lastScheduleMessage = scheduleMessage
    
    // Parse schedule status from message
    if (scheduleMessage.toLowerCase().includes('started')) {
      result.scheduleStatus = 'running'
    } else if (scheduleMessage.toLowerCase().includes('stopped')) {
      result.scheduleStatus = 'stopped'
    } else {
      result.scheduleStatus = 'unknown'
    }
  }
  
  return result
}

/**
 * Analyze GDMS patching tags
 */
export function analyzeGDMSPatchingTags(tags: Record<string, string> | undefined): {
  patchGroup?: string
  patchingAutomation?: string
} {
  const result: {
    patchGroup?: string
    patchingAutomation?: string
  } = {}
  
  if (!tags) return result
  
  const patchGroup = tags[GDMS_TAG_SCHEMA.patching.patchGroup]
  const patchingAutomation = tags[GDMS_TAG_SCHEMA.patching.patchingAutomation]
  
  if (patchGroup) {
    result.patchGroup = patchGroup
  }
  
  if (patchingAutomation) {
    result.patchingAutomation = patchingAutomation
  }
  
  return result
}

/**
 * Extract metadata from tags using common tag patterns
 */
export function extractInstanceMetadata(tags: Record<string, string> | undefined): {
  environment?: string
  project?: string
  costCenter?: string
  owner?: string
  tags: Record<string, string>
} {
  const metadata: {
    environment?: string
    project?: string
    costCenter?: string
    owner?: string
    tags: Record<string, string>
  } = {
    tags: tags || {}
  }
  
  if (!tags) return metadata
  
  // Extract environment (common patterns)
  const envTags = ['Environment', 'environment', 'Env', 'env', 'Stage', 'stage']
  for (const envTag of envTags) {
    if (tags[envTag]) {
      metadata.environment = tags[envTag]
      break
    }
  }
  
  // Extract project (common patterns)
  const projTags = ['Project', 'project', 'ProjectName', 'project-name', 'Application', 'application']
  for (const projTag of projTags) {
    if (tags[projTag]) {
      metadata.project = tags[projTag]
      break
    }
  }
  
  // Extract cost center (common patterns)
  const ccTags = ['CostCenter', 'cost-center', 'CostCentre', 'cost-centre', 'BillTo', 'bill-to']
  for (const ccTag of ccTags) {
    if (tags[ccTag]) {
      metadata.costCenter = tags[ccTag]
      break
    }
  }
  
  // Extract owner (common patterns)
  const ownerTags = ['Owner', 'owner', 'ManagedBy', 'managed-by', 'Team', 'Department']
  for (const ownerTag of ownerTags) {
    if (tags[ownerTag]) {
      metadata.owner = tags[ownerTag]
      break
    }
  }
  
  return metadata
}

/**
 * Get instance type information from AWS EC2 API (with caching)
 */
async function getInstanceTypeInfo(instanceType: string, environment: AWSEnvironmentType = 'commercial'): Promise<any | null> {
  try {
    // Check cache first
    const now = Date.now()
    if (instanceTypeCache.has(instanceType) && now < instanceTypeCacheExpiry) {
      return instanceTypeCache.get(instanceType)
    }
    
    // Import EC2 client and command
    const { getEC2Client } = await import('../lib/aws-client-factory')
    const { DescribeInstanceTypesCommand } = await import('@aws-sdk/client-ec2')
    
    const ec2Client = await getEC2Client(environment)
    const command = new DescribeInstanceTypesCommand({
      InstanceTypes: [instanceType]
    })
    
    const response = await ec2Client.send(command)
    const instanceTypeInfo = response.InstanceTypes?.[0] || null
    
    // Cache the result
    if (instanceTypeInfo) {
      instanceTypeCache.set(instanceType, instanceTypeInfo)
      instanceTypeCacheExpiry = now + CACHE_TTL
    }
    
    return instanceTypeInfo
  } catch (error) {
    logger.warn(`[Instance Enrichment] Failed to get instance type info for ${instanceType}:`, (error instanceof Error ? error.message : String(error)))
    return null
  }
}

/**
 * Generate optimization insights using AWS data when available
 */
export async function generateOptimizationInsights(
  instanceType?: string, 
  instanceState?: string, 
  environment: AWSEnvironmentType = 'commercial'
): Promise<{
  family: string
  generation: string
  processorInfo?: string
  vcpus?: number
  memoryMb?: number
  networkPerformance?: string
  generalRecommendations: string[]
}> {
  const result = {
    family: 'unknown',
    generation: 'unknown',
    generalRecommendations: [] as string[]
  }
  
  if (!instanceType) {
    result.generalRecommendations.push('Instance type information not available')
    return result
  }
  
  // Try to get AWS instance type information
  const instanceTypeInfo = await getInstanceTypeInfo(instanceType, environment)
  
  if (instanceTypeInfo) {
    // Extract information from AWS API
    result.family = instanceTypeInfo.InstanceType?.match(/^[a-z]+/)?.[0] || 'unknown'
    result.generation = instanceTypeInfo.InstanceType?.match(/\d+/)?.[0] || 'unknown'
    
    if (instanceTypeInfo.ProcessorInfo?.SustainedClockSpeedInGhz) {
      result.processorInfo = `${instanceTypeInfo.ProcessorInfo.SustainedClockSpeedInGhz}GHz`
    }
    
    if (instanceTypeInfo.VCpuInfo?.DefaultVCpus) {
      result.vcpus = instanceTypeInfo.VCpuInfo.DefaultVCpus
    }
    
    if (instanceTypeInfo.MemoryInfo?.SizeInMiB) {
      result.memoryMb = instanceTypeInfo.MemoryInfo.SizeInMiB
    }
    
    if (instanceTypeInfo.NetworkInfo?.NetworkPerformance) {
      result.networkPerformance = instanceTypeInfo.NetworkInfo.NetworkPerformance
    }
    
    // Generate smarter recommendations based on AWS data
    if (instanceTypeInfo.CurrentGeneration === false) {
      result.generalRecommendations.push('This is a previous generation instance type - consider upgrading to current generation for better price/performance')
    }
    
    if (instanceTypeInfo.BurstablePerformanceSupported && instanceState === 'running') {
      result.generalRecommendations.push('Monitor CPU credit usage for burstable performance instances')
    }
    
    if (instanceTypeInfo.InstanceStorageSupported && instanceTypeInfo.InstanceStorageInfo?.TotalSizeInGB) {
      result.generalRecommendations.push('Verify instance store usage - data is lost on stop/terminate')
    }
    
    // Size-based recommendations
    if (result.vcpus && result.vcpus >= 16) {
      result.generalRecommendations.push('Large instance detected - analyze workload patterns to ensure all resources are utilized')
    }
    
    if (result.memoryMb && result.memoryMb >= 32 * 1024) { // 32GB+
      result.generalRecommendations.push('High memory instance - ensure memory-intensive workloads justify the cost')
    }
  } else {
    // Fallback to basic parsing when AWS API isn't available
    const match = instanceType.match(/^([a-z]+)(\d+)([a-z]*)\./i)
    if (match) {
      const [, familyPrefix, gen] = match
      result.family = familyPrefix
      result.generation = gen
      
      result.generalRecommendations.push('Limited analysis - AWS instance type data not available')
      result.generalRecommendations.push('Consider checking AWS EC2 console for detailed instance specifications')
    }
  }
  
  // Always add the key recommendation
  result.generalRecommendations.push('Use AWS Compute Optimizer for detailed rightsizing recommendations')
  
  return result
}

/**
 * Enrich basic resource data with instance-specific information
 */
export async function enrichInstanceData(
  resource: ResourceDetail & { accountName?: string }, 
  environment: AWSEnvironmentType = 'commercial'
): Promise<EnrichedInstanceData> {
  // Convert tags from config format if needed (defensive check)
  let tags = resource.tags || {}
  if (resource.configuration?.tags && Array.isArray(resource.configuration.tags)) {
    tags = {}
    for (const tag of resource.configuration.tags) {
      if (tag.key && tag.value !== undefined) {
        tags[tag.key] = tag.value
      }
    }
  }
  
  const enriched: EnrichedInstanceData = {
    resourceId: resource.resourceId,
    resourceType: resource.resourceType,
    accountId: resource.accountId,
    region: resource.region,
    accountName: resource.accountName
  }
  
  // Extract instance name
  enriched.instanceName = extractInstanceName(tags)

  // For EC2 instances, extract additional details from configuration
  if (resource.resourceType === 'AWS::EC2::Instance' && resource.configuration) {
    enriched.instanceType = resource.configuration.instanceType
    enriched.instanceState = resource.configuration.state?.name
    enriched.launchTime = resource.configuration.launchTime

    // Extract network information
    enriched.networkInfo = {
      privateIpAddress: resource.configuration.privateIpAddress,
      publicIpAddress: resource.configuration.publicIpAddress,
      vpcId: resource.configuration.vpcId,
      subnetId: resource.configuration.subnetId
    }

    // Extract storage information from block device mappings
    // Note: AWS Config may not include volume sizes in blockDeviceMappings
    if (resource.configuration.blockDeviceMappings && Array.isArray(resource.configuration.blockDeviceMappings)) {
      const volumes = resource.configuration.blockDeviceMappings
        .filter((device: any) => device.ebs || device.Ebs)
        .map((device: any) => {
          const ebs = device.ebs || device.Ebs || {}
          return {
            deviceName: device.deviceName || device.DeviceName,
            volumeSize: ebs.volumeSize || ebs.VolumeSize,
            volumeType: ebs.volumeType || ebs.VolumeType
          }
        })

      const totalSize = volumes.reduce((sum: number, vol: any) => sum + (vol.volumeSize || 0), 0)
      const rootDevice = resource.configuration.blockDeviceMappings.find(
        (device: any) => (device.deviceName || device.DeviceName) === resource.configuration.rootDeviceName
      )
      const rootEbs = rootDevice?.ebs || rootDevice?.Ebs

      enriched.storageInfo = {
        rootVolumeSize: rootEbs?.volumeSize || rootEbs?.VolumeSize,
        totalVolumeSize: totalSize,
        volumeCount: volumes.length,
        volumes
      }
    }
  }

  // Analyze GDMS management
  enriched.managementInfo = analyzeGDMSManagementTags(tags)

  // Analyze GDMS scheduling
  enriched.schedulingInfo = analyzeGDMSSchedulingTags(tags)

  // Analyze GDMS patching
  enriched.patchingInfo = analyzeGDMSPatchingTags(tags)

  // Extract metadata
  enriched.metadata = extractInstanceMetadata(tags)

  // Generate AWS-powered optimization insights
  if (enriched.instanceType) {
    enriched.awsOptimizationInsights = await generateOptimizationInsights(
      enriched.instanceType,
      enriched.instanceState,
      environment
    )
  }

  return enriched
}

/**
 * Batch enrich multiple instances
 */
export async function batchEnrichInstances(
  resources: (ResourceDetail & { accountName?: string })[],
  environment: AWSEnvironmentType = 'commercial'
): Promise<EnrichedInstanceData[]> {
  const instances = resources.filter(resource => resource.resourceType === 'AWS::EC2::Instance')
  
  // For batch operations, limit AWS API calls by pre-populating cache for unique instance types
  const uniqueInstanceTypes = [...new Set(
    instances
      .map(i => i.configuration?.instanceType)
      .filter(Boolean)
  )]
  
  logger.info(`[Instance Enrichment] Pre-loading ${uniqueInstanceTypes.length} unique instance types`)
  
  // Pre-populate cache for unique instance types (parallel but limited)
  await Promise.all(
    uniqueInstanceTypes.slice(0, 10).map(instanceType => // Limit to first 10 types to avoid API limits
      getInstanceTypeInfo(instanceType, environment).catch(err => {
        logger.warn(`[Instance Enrichment] Failed to pre-load ${instanceType}:`, err.message)
        return null
      })
    )
  )
  
  // Now enrich all instances (cache hits will be fast)
  const enrichedInstances = await Promise.all(
    instances.map(instance => enrichInstanceData(instance, environment))
  )
  
  return enrichedInstances
}

/**
 * Generate tag update suggestions based on analysis using GDMS schema
 */
export function generateTagSuggestions(instance: EnrichedInstanceData): {
  missing: Array<{key: string, suggestion: string, reason: string}>
  improvements: Array<{key: string, currentValue: string, suggestion: string, reason: string}>
} {
  const suggestions = {
    missing: [] as Array<{key: string, suggestion: string, reason: string}>,
    improvements: [] as Array<{key: string, currentValue: string, suggestion: string, reason: string}>
  }

  // Check for missing name tag
  if (!instance.instanceName) {
    suggestions.missing.push({
      key: 'Name',
      suggestion: `${instance.resourceId}-instance`,
      reason: 'Instance name helps with identification and management'
    })
  }
  
  // Check for missing environment tag
  if (!instance.metadata?.environment) {
    suggestions.missing.push({
      key: 'Environment',
      suggestion: 'production|staging|development',
      reason: 'Environment tag helps with cost allocation and access control'
    })
  }
  
  // Check for missing owner/team tag
  if (!instance.metadata?.owner) {
    suggestions.missing.push({
      key: 'Owner',
      suggestion: 'team-name or email@domain.com',
      reason: 'Owner tag helps with accountability and contact for issues'
    })
  }
  
  // GDMS-specific suggestions
  
  // Check for GDMS_Managed tag
  if (!instance.managementInfo?.gdmsManagedValue) {
    suggestions.missing.push({
      key: GDMS_TAG_SCHEMA.management.managed,
      suggestion: 'True|False',
      reason: 'GDMS_Managed tag indicates whether this instance is managed by GDMS'
    })
  }
  
  // If GDMS managed but no schedule, suggest scheduling
  if (instance.managementInfo?.isGDMSManaged && !instance.schedulingInfo?.hasSchedule && instance.instanceState === 'running') {
    suggestions.missing.push({
      key: GDMS_TAG_SCHEMA.scheduling.schedule,
      suggestion: 'extended-east-working-hours|business-hours|always-on|weekdays-only',
      reason: 'GDMS-managed instances should have a schedule to optimize costs'
    })
  }
  
  // Check for patching configuration on managed instances
  if (instance.managementInfo?.isGDMSManaged && !instance.patchingInfo?.patchGroup) {
    suggestions.missing.push({
      key: GDMS_TAG_SCHEMA.patching.patchGroup,
      suggestion: 'Aggressive|Standard|Conservative',
      reason: 'GDMS-managed instances should have a patch group for automated patching'
    })
  }
  
  // Check for patching automation schedule
  if (instance.managementInfo?.isGDMSManaged && !instance.patchingInfo?.patchingAutomation) {
    suggestions.missing.push({
      key: GDMS_TAG_SCHEMA.patching.patchingAutomation,
      suggestion: 'sun|mon|tue|wed|thu|fri|sat',
      reason: 'GDMS-managed instances should have a patching schedule'
    })
  }
  
  // Improvement suggestions for existing tags
  
  // If GDMS_Managed is not properly formatted
  if (instance.managementInfo?.gdmsManagedValue && 
      !['True', 'False'].includes(instance.managementInfo.gdmsManagedValue)) {
    suggestions.improvements.push({
      key: GDMS_TAG_SCHEMA.management.managed,
      currentValue: instance.managementInfo.gdmsManagedValue,
      suggestion: instance.managementInfo.gdmsManagedValue.toLowerCase() === 'true' ? 'True' : 'False',
      reason: 'GDMS_Managed should be exactly "True" or "False" (capitalized)'
    })
  }
  
  // If there's a schedule but no schedule message, it might indicate an issue
  if (instance.schedulingInfo?.hasSchedule && !instance.schedulingInfo?.lastScheduleMessage) {
    suggestions.missing.push({
      key: GDMS_TAG_SCHEMA.scheduling.scheduleMessage,
      suggestion: '(auto-populated by AWS Instance Scheduler)',
      reason: 'ScheduleMessage provides status of last schedule operation'
    })
  }
  
  return suggestions
}

/**
 * GDMS management tag templates
 */
export const MANAGEMENT_TAG_TEMPLATES = {
  development: {
    Environment: 'development',
    [GDMS_TAG_SCHEMA.management.managed]: 'True',
    [GDMS_TAG_SCHEMA.scheduling.schedule]: 'weekdays-only',
    [GDMS_TAG_SCHEMA.patching.patchGroup]: 'Aggressive',
    [GDMS_TAG_SCHEMA.patching.patchingAutomation]: 'sun'
  },
  staging: {
    Environment: 'staging',
    [GDMS_TAG_SCHEMA.management.managed]: 'True',
    [GDMS_TAG_SCHEMA.scheduling.schedule]: 'business-hours',
    [GDMS_TAG_SCHEMA.patching.patchGroup]: 'Standard',
    [GDMS_TAG_SCHEMA.patching.patchingAutomation]: 'sat'
  },
  production: {
    Environment: 'production',
    [GDMS_TAG_SCHEMA.management.managed]: 'True',
    [GDMS_TAG_SCHEMA.scheduling.schedule]: 'always-on',
    [GDMS_TAG_SCHEMA.patching.patchGroup]: 'Conservative',
    [GDMS_TAG_SCHEMA.patching.patchingAutomation]: 'sun'
  },
  testing: {
    Environment: 'testing',
    [GDMS_TAG_SCHEMA.management.managed]: 'True',
    [GDMS_TAG_SCHEMA.scheduling.schedule]: 'on-demand',
    [GDMS_TAG_SCHEMA.patching.patchGroup]: 'Aggressive',
    [GDMS_TAG_SCHEMA.patching.patchingAutomation]: 'fri'
  }
}