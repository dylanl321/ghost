/**
 * AWS Compute Optimizer Utilities
 * 
 * Reusable functions for getting optimization recommendations
 * Includes caching and batch operations
 */

import {
  GetEC2InstanceRecommendationsCommand,
  GetEBSVolumeRecommendationsCommand,
  GetLambdaFunctionRecommendationsCommand,
  GetAutoScalingGroupRecommendationsCommand,
  GetECSServiceRecommendationsCommand,
  type ComputeOptimizerClient,
  type InstanceRecommendation,
  type VolumeRecommendation,
  type LambdaFunctionRecommendation
} from '@aws-sdk/client-compute-optimizer'
import { getComputeOptimizerClient } from '../lib/aws-client-factory'
import { getCacheManager } from './cache-manager'
import type { AWSEnvironmentType } from '../types'
import { logger } from './logger'

// Cache configuration
const CACHE_TTL = {
  RECOMMENDATIONS: 3600, // 1 hour for recommendations
  SUMMARY: 1800, // 30 minutes for summaries
}

const CACHE_KEYS = {
  INSTANCE_REC: (accountId: string, instanceId: string) => 
    `optimizer:instance:${accountId}:${instanceId}`,
  VOLUME_REC: (accountId: string, volumeId: string) => 
    `optimizer:volume:${accountId}:${volumeId}`,
  LAMBDA_REC: (accountId: string, functionArn: string) => 
    `optimizer:lambda:${accountId}:${functionArn}`,
  SUMMARY: (accountId: string, resourceType: string) => 
    `optimizer:summary:${accountId}:${resourceType}`
}

export type ResourceType = 'EC2_INSTANCE' | 'EBS_VOLUME' | 'LAMBDA_FUNCTION' | 'AUTO_SCALING_GROUP' | 'ECS_SERVICE'
export type Finding = 'OPTIMIZED' | 'UNDER_PROVISIONED' | 'OVER_PROVISIONED' | 'NOT_OPTIMIZED'

export interface ComputeOptimizerRecommendation {
  resourceId: string
  resourceArn: string
  accountId: string
  region: string
  finding: Finding
  findingReasonCodes?: string[]
  utilizationMetrics?: any[]
  lookBackPeriodInDays?: number
  currentConfiguration?: any
  recommendationOptions?: RecommendationOption[]
  estimatedMonthlySavings?: number
  savingsOpportunityPercentage?: number
}

export interface RecommendationOption {
  configuration: any
  estimatedMonthlySavings?: number
  savingsOpportunityPercentage?: number
  performanceRisk?: number
  rank?: number
  migrationEffort?: string
}

export interface OptimizationSummary {
  accountId: string
  region?: string
  resourceType: ResourceType
  totalResources: number
  optimized: number
  underProvisioned: number
  overProvisioned: number
  notOptimized: number
  optimizedPercentage: number
  totalMonthlySavings: number
  avgSavingsPerResource: number
  topSavingsOpportunities: ComputeOptimizerRecommendation[]
}

export interface BatchOptimizationResult {
  recommendations: ComputeOptimizerRecommendation[]
  summary: OptimizationSummary
  errors: Array<{ resourceId: string; error: Error }>
}

/**
 * Get EC2 instance recommendations with caching
 */
export async function getEC2Recommendations(
  instanceArns: string[],
  environment: AWSEnvironmentType = 'commercial',
  region?: string
): Promise<ComputeOptimizerRecommendation[]> {
  if (instanceArns.length === 0) return []

  const cache = getCacheManager()
  const recommendations: ComputeOptimizerRecommendation[] = []
  const uncachedArns: string[] = []

  // Check cache for each instance
  for (const arn of instanceArns) {
    const parts = arn.split(':')
    const accountId = parts[4]
    const instanceId = arn.split('/').pop()!
    const cacheKey = CACHE_KEYS.INSTANCE_REC(accountId, instanceId)

    const cached = await cache.get<ComputeOptimizerRecommendation>(cacheKey)
    if (cached) {
      recommendations.push(cached)
    } else {
      uncachedArns.push(arn)
    }
  }
  
  if (uncachedArns.length === 0) {
    logger.info(`[Optimizer] All ${instanceArns.length} instances from cache`)
    return recommendations
  }
  
  logger.info(`[Optimizer] Fetching ${uncachedArns.length} instances, ${recommendations.length} from cache`)
  
  // Determine region from ARN if not provided
  const arnRegion = region || uncachedArns[0].split(':')[3]
  const client = await getComputeOptimizerClient(environment, arnRegion)
  
  // Batch fetch recommendations (max 20 per request)
  const chunks = chunkArray(uncachedArns, 20)
  
  for (const chunk of chunks) {
    try {
      const command = new GetEC2InstanceRecommendationsCommand({
        instanceArns: chunk
      })
      
      const response = await client.send(command)
      
      if (response.instanceRecommendations) {
        for (const rec of response.instanceRecommendations) {
          const recommendation = parseEC2Recommendation(rec)
          recommendations.push(recommendation)
          
          // Cache the recommendation
          const parts = rec.instanceArn!.split(':')
          const accountId = parts[4]
          const instanceId = rec.instanceArn!.split('/').pop()!
          const cacheKey = CACHE_KEYS.INSTANCE_REC(accountId, instanceId)
          await cache.set(cacheKey, recommendation, CACHE_TTL.RECOMMENDATIONS)
        }
      }
    } catch (error) {
      logger.error(`Error fetching EC2 recommendations:`, error)
    }
  }
  
  return recommendations
}

/**
 * Get EBS volume recommendations with caching
 */
export async function getEBSRecommendations(
  volumeArns: string[],
  environment: AWSEnvironmentType = 'commercial',
  region?: string
): Promise<ComputeOptimizerRecommendation[]> {
  if (volumeArns.length === 0) return []

  const cache = getCacheManager()
  const recommendations: ComputeOptimizerRecommendation[] = []
  const uncachedArns: string[] = []

  // Check cache
  for (const arn of volumeArns) {
    const parts = arn.split(':')
    const accountId = parts[4]
    const volumeId = arn.split('/').pop()!
    const cacheKey = CACHE_KEYS.VOLUME_REC(accountId, volumeId)

    const cached = await cache.get<ComputeOptimizerRecommendation>(cacheKey)
    if (cached) {
      recommendations.push(cached)
    } else {
      uncachedArns.push(arn)
    }
  }
  
  if (uncachedArns.length === 0) return recommendations
  
  const arnRegion = region || uncachedArns[0].split(':')[3]
  const client = await getComputeOptimizerClient(environment, arnRegion)
  
  // Batch fetch (max 20 per request)
  const chunks = chunkArray(uncachedArns, 20)
  
  for (const chunk of chunks) {
    try {
      const command = new GetEBSVolumeRecommendationsCommand({
        volumeArns: chunk
      })
      
      const response = await client.send(command)
      
      if (response.volumeRecommendations) {
        for (const rec of response.volumeRecommendations) {
          const recommendation = parseEBSRecommendation(rec)
          recommendations.push(recommendation)
          
          // Cache
          const parts = rec.volumeArn!.split(':')
          const accountId = parts[4]
          const volumeId = rec.volumeArn!.split('/').pop()!
          const cacheKey = CACHE_KEYS.VOLUME_REC(accountId, volumeId)
          await cache.set(cacheKey, recommendation, CACHE_TTL.RECOMMENDATIONS)
        }
      }
    } catch (error) {
      logger.error(`Error fetching EBS recommendations:`, error)
    }
  }
  
  return recommendations
}

/**
 * Get Lambda function recommendations with caching
 */
export async function getLambdaRecommendations(
  functionArns: string[],
  environment: AWSEnvironmentType = 'commercial',
  region?: string
): Promise<ComputeOptimizerRecommendation[]> {
  if (functionArns.length === 0) return []

  const cache = getCacheManager()
  const recommendations: ComputeOptimizerRecommendation[] = []
  const uncachedArns: string[] = []

  // Check cache
  for (const arn of functionArns) {
    const parts = arn.split(':')
    const accountId = parts[4]
    const cacheKey = CACHE_KEYS.LAMBDA_REC(accountId, arn)

    const cached = await cache.get<ComputeOptimizerRecommendation>(cacheKey)
    if (cached) {
      recommendations.push(cached)
    } else {
      uncachedArns.push(arn)
    }
  }
  
  if (uncachedArns.length === 0) return recommendations
  
  const arnRegion = region || uncachedArns[0].split(':')[3]
  const client = await getComputeOptimizerClient(environment, arnRegion)
  
  // Batch fetch (max 20 per request)
  const chunks = chunkArray(uncachedArns, 20)
  
  for (const chunk of chunks) {
    try {
      const command = new GetLambdaFunctionRecommendationsCommand({
        functionArns: chunk
      })
      
      const response = await client.send(command)
      
      if (response.lambdaFunctionRecommendations) {
        for (const rec of response.lambdaFunctionRecommendations) {
          const recommendation = parseLambdaRecommendation(rec)
          recommendations.push(recommendation)
          
          // Cache
          const parts = rec.functionArn!.split(':')
          const accountId = parts[4]
          const cacheKey = CACHE_KEYS.LAMBDA_REC(accountId, rec.functionArn!)
          await cache.set(cacheKey, recommendation, CACHE_TTL.RECOMMENDATIONS)
        }
      }
    } catch (error) {
      logger.error(`Error fetching Lambda recommendations:`, error)
    }
  }
  
  return recommendations
}

/**
 * Get optimization recommendations for multiple resource types
 */
export async function getBatchOptimizationRecommendations(
  resources: Array<{ arn: string; type: ResourceType }>,
  environment: AWSEnvironmentType = 'commercial'
): Promise<BatchOptimizationResult> {
  // Group resources by type and region
  const resourcesByTypeAndRegion = new Map<string, Array<{ arn: string; type: ResourceType }>>()
  
  for (const resource of resources) {
    const region = resource.arn.split(':')[3]
    const key = `${resource.type}:${region}`
    
    if (!resourcesByTypeAndRegion.has(key)) {
      resourcesByTypeAndRegion.set(key, [])
    }
    resourcesByTypeAndRegion.get(key)!.push(resource)
  }
  
  const allRecommendations: ComputeOptimizerRecommendation[] = []
  const errors: Array<{ resourceId: string; error: Error }> = []

  // Fetch recommendations for each type/region combination
  for (const [key, regionResources] of resourcesByTypeAndRegion) {
    const [resourceType, region] = key.split(':')
    const arns = regionResources.map(r => r.arn)

    try {
      let recommendations: ComputeOptimizerRecommendation[] = []
      
      switch (resourceType as ResourceType) {
        case 'EC2_INSTANCE':
          recommendations = await getEC2Recommendations(arns, environment, region)
          break
        case 'EBS_VOLUME':
          recommendations = await getEBSRecommendations(arns, environment, region)
          break
        case 'LAMBDA_FUNCTION':
          recommendations = await getLambdaRecommendations(arns, environment, region)
          break
        default:
          logger.warn(`Unsupported resource type for optimization: ${resourceType}`)
      }
      
      allRecommendations.push(...recommendations)
    } catch (error) {
      for (const resource of regionResources) {
        errors.push({
          resourceId: resource.arn.split('/').pop() || resource.arn,
          error: error as Error
        })
      }
    }
  }
  
  // Calculate summary
  const summary = calculateOptimizationSummary(allRecommendations, resources[0]?.arn.split(':')[4] || '')
  
  return {
    recommendations: allRecommendations,
    summary,
    errors
  }
}

/**
 * Calculate optimization summary from recommendations
 */
export function calculateOptimizationSummary(
  recommendations: ComputeOptimizerRecommendation[],
  accountId: string,
  resourceType?: ResourceType
): OptimizationSummary {
  const summary: OptimizationSummary = {
    accountId,
    resourceType: resourceType || 'EC2_INSTANCE',
    totalResources: recommendations.length,
    optimized: 0,
    underProvisioned: 0,
    overProvisioned: 0,
    notOptimized: 0,
    optimizedPercentage: 0,
    totalMonthlySavings: 0,
    avgSavingsPerResource: 0,
    topSavingsOpportunities: []
  }
  
  const savingsOpportunities: ComputeOptimizerRecommendation[] = []
  
  for (const rec of recommendations) {
    switch (rec.finding) {
      case 'OPTIMIZED':
        summary.optimized++
        break
      case 'UNDER_PROVISIONED':
        summary.underProvisioned++
        break
      case 'OVER_PROVISIONED':
        summary.overProvisioned++
        if (rec.estimatedMonthlySavings && rec.estimatedMonthlySavings > 0) {
          savingsOpportunities.push(rec)
        }
        break
      default:
        summary.notOptimized++
    }
    
    if (rec.estimatedMonthlySavings) {
      summary.totalMonthlySavings += rec.estimatedMonthlySavings
    }
  }
  
  summary.optimizedPercentage = summary.totalResources > 0
    ? Math.round((summary.optimized / summary.totalResources) * 100)
    : 100
  
  summary.avgSavingsPerResource = summary.totalResources > 0
    ? Math.round(summary.totalMonthlySavings / summary.totalResources)
    : 0
  
  // Get top 5 savings opportunities
  summary.topSavingsOpportunities = savingsOpportunities
    .sort((a, b) => (b.estimatedMonthlySavings || 0) - (a.estimatedMonthlySavings || 0))
    .slice(0, 5)
  
  return summary
}

/**
 * Generate optimization insights text
 */
export function generateOptimizationSummaryText(summary: OptimizationSummary): string {
  const insights: string[] = []
  
  insights.push(`Resource Optimization Analysis:`)
  insights.push(`• ${summary.optimizedPercentage}% of resources are optimized`)
  insights.push(`• Total potential monthly savings: $${summary.totalMonthlySavings.toFixed(2)}`)
  
  if (summary.underProvisioned > 0) {
    insights.push(`• ${summary.underProvisioned} resources are under-provisioned and may experience performance issues`)
  }
  
  if (summary.overProvisioned > 0) {
    insights.push(`• ${summary.overProvisioned} resources are over-provisioned and can be downsized`)
  }
  
  if (summary.topSavingsOpportunities.length > 0) {
    insights.push(`\nTop Savings Opportunities:`)
    summary.topSavingsOpportunities.forEach((opp, i) => {
      insights.push(`${i + 1}. ${opp.resourceId}: $${opp.estimatedMonthlySavings?.toFixed(2)}/month`)
    })
  }
  
  return insights.join('\n')
}

/**
 * Parse EC2 recommendation
 */
function parseEC2Recommendation(rec: InstanceRecommendation): ComputeOptimizerRecommendation {
  const parts = rec.instanceArn!.split(':')
  const accountId = parts[4]
  const region = parts[3]
  const instanceId = rec.instanceArn!.split('/').pop()!
  
  const firstOption = rec.recommendationOptions?.[0]
  
  return {
    resourceId: instanceId,
    resourceArn: rec.instanceArn!,
    accountId,
    region,
    finding: (rec.finding as Finding) || 'NOT_OPTIMIZED',
    findingReasonCodes: rec.findingReasonCodes,
    utilizationMetrics: rec.utilizationMetrics,
    lookBackPeriodInDays: rec.lookBackPeriodInDays,
    currentConfiguration: {
      instanceType: rec.currentInstanceType
    },
    recommendationOptions: rec.recommendationOptions?.map(opt => ({
      configuration: {
        instanceType: opt.instanceType
      },
      estimatedMonthlySavings: opt.savingsOpportunity?.estimatedMonthlySavings?.value,
      savingsOpportunityPercentage: opt.savingsOpportunity?.savingsOpportunityPercentage,
      performanceRisk: opt.performanceRisk,
      rank: opt.rank,
      migrationEffort: opt.migrationEffort
    })),
    estimatedMonthlySavings: firstOption?.savingsOpportunity?.estimatedMonthlySavings?.value,
    savingsOpportunityPercentage: firstOption?.savingsOpportunity?.savingsOpportunityPercentage
  }
}

/**
 * Parse EBS recommendation
 */
function parseEBSRecommendation(rec: VolumeRecommendation): ComputeOptimizerRecommendation {
  const parts = rec.volumeArn!.split(':')
  const accountId = parts[4]
  const region = parts[3]
  const volumeId = rec.volumeArn!.split('/').pop()!
  
  const firstOption = rec.volumeRecommendationOptions?.[0]
  
  return {
    resourceId: volumeId,
    resourceArn: rec.volumeArn!,
    accountId,
    region,
    finding: (rec.finding as Finding) || 'NOT_OPTIMIZED',
    findingReasonCodes: rec.findingReasonCodes,
    utilizationMetrics: rec.utilizationMetrics,
    lookBackPeriodInDays: rec.lookBackPeriodInDays,
    currentConfiguration: rec.currentConfiguration,
    recommendationOptions: rec.volumeRecommendationOptions?.map(opt => ({
      configuration: opt.configuration,
      estimatedMonthlySavings: opt.savingsOpportunity?.estimatedMonthlySavings?.value,
      savingsOpportunityPercentage: opt.savingsOpportunity?.savingsOpportunityPercentage,
      performanceRisk: opt.performanceRisk,
      rank: opt.rank
    })),
    estimatedMonthlySavings: firstOption?.savingsOpportunity?.estimatedMonthlySavings?.value,
    savingsOpportunityPercentage: firstOption?.savingsOpportunity?.savingsOpportunityPercentage
  }
}

/**
 * Parse Lambda recommendation
 */
function parseLambdaRecommendation(rec: LambdaFunctionRecommendation): ComputeOptimizerRecommendation {
  const parts = rec.functionArn!.split(':')
  const accountId = parts[4]
  const region = parts[3]
  
  const firstOption = rec.memorySizeRecommendationOptions?.[0]
  
  return {
    resourceId: rec.functionArn!,
    resourceArn: rec.functionArn!,
    accountId,
    region,
    finding: (rec.finding as Finding) || 'NOT_OPTIMIZED',
    findingReasonCodes: rec.findingReasonCodes,
    utilizationMetrics: rec.utilizationMetrics,
    lookBackPeriodInDays: rec.lookBackPeriodInDays,
    currentConfiguration: {
      memorySize: rec.currentMemorySize
    },
    recommendationOptions: rec.memorySizeRecommendationOptions?.map(opt => ({
      configuration: {
        memorySize: opt.memorySize
      },
      estimatedMonthlySavings: opt.savingsOpportunity?.estimatedMonthlySavings?.value,
      savingsOpportunityPercentage: opt.savingsOpportunity?.savingsOpportunityPercentage,
      rank: opt.rank
    })),
    estimatedMonthlySavings: firstOption?.savingsOpportunity?.estimatedMonthlySavings?.value,
    savingsOpportunityPercentage: firstOption?.savingsOpportunity?.savingsOpportunityPercentage
  }
}

/**
 * Chunk array helper
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Clear optimization cache
 */
export async function clearOptimizerCache(pattern?: string): Promise<void> {
  const cache = getCacheManager()
  const prefix = pattern || 'optimizer:'
  await cache.clearPattern(prefix)
  logger.info(`[Optimizer] Cleared cache with pattern: ${prefix}`)
}