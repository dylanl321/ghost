/**
 * GET /api/instances/[instanceId]
 * 
 * Get detailed information about a specific EC2 instance including:
 * - Basic instance configuration and state
 * - Cost optimization recommendations
 * - Scheduling and management tag analysis
 * - Tag update suggestions
 * - Resource utilization insights
 */

import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync, parseQueryParams } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import {
  enrichInstanceData,
  generateTagSuggestions,
  type EnrichedInstanceData
} from '../../utils/instance-enrichment'
import {
  getResourceConfig,
  queryResources,
  type ResourceDetail
} from '../../utils/config-service'
import {
  getBatchOptimizationRecommendations,
  generateOptimizationSummaryText
} from '../../utils/compute-optimizer'
import type { AWSEnvironmentType } from '../../types'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/instances/[instanceId]', 'GET', {
  summary: 'Get detailed EC2 instance information',
  description: 'Retrieve comprehensive details about a specific EC2 instance including configuration, optimization recommendations, scheduling info, and management metadata',
  tags: ['Resources'],
  parameters: [
    {
      name: 'instanceId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'EC2 instance ID (e.g., i-1234567890abcdef0)'
    },
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'includeOptimization',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: true
      },
      description: 'Include cost optimization recommendations'
    },
    {
      name: 'includeTagSuggestions',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: true
      },
      description: 'Include tag improvement suggestions'
    },
    {
      name: 'accountId',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Account identifier - can be 12-digit account ID, email, or request ID (improves performance)'
    }
  ],
  responses: {
    200: {
      description: 'Instance details retrieved successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  instance: {
                    type: 'object',
                    properties: {
                      resourceId: { type: 'string', example: 'i-1234567890abcdef0' },
                      instanceName: { type: 'string', example: 'web-server-01' },
                      instanceType: { type: 'string', example: 't3.medium' },
                      instanceState: { type: 'string', example: 'running' },
                      accountId: { type: 'string', example: '123456789012' },
                      region: { type: 'string', example: 'us-east-1' },
                      
                      schedulingInfo: {
                        type: 'object',
                        properties: {
                          isScheduled: { type: 'boolean' },
                          startupSchedule: { type: 'string' },
                          shutdownSchedule: { type: 'string' },
                          managedBy: { type: 'string' },
                          managementTags: { type: 'object' }
                        }
                      },
                      
                      metadata: {
                        type: 'object',
                        properties: {
                          environment: { type: 'string', example: 'production' },
                          project: { type: 'string', example: 'web-app' },
                          costCenter: { type: 'string' },
                          owner: { type: 'string' },
                          tags: { type: 'object' }
                        }
                      },
                      
                      configuration: {
                        type: 'object',
                        description: 'Full AWS Config resource configuration'
                      }
                    }
                  },
                  
                  optimization: {
                    type: 'object',
                    properties: {
                      sizeCategory: { type: 'string', example: 'medium' },
                      potentialSavings: { type: 'string', example: 'Medium' },
                      recommendations: {
                        type: 'array',
                        items: { type: 'string' }
                      },
                      computeOptimizerRecommendations: {
                        type: 'object',
                        description: 'AWS Compute Optimizer findings'
                      }
                    }
                  },
                  
                  tagSuggestions: {
                    type: 'object',
                    properties: {
                      missing: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            key: { type: 'string' },
                            suggestion: { type: 'string' },
                            reason: { type: 'string' }
                          }
                        }
                      },
                      improvements: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            key: { type: 'string' },
                            currentValue: { type: 'string' },
                            suggestion: { type: 'string' },
                            reason: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    404: {
      description: 'Instance not found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    }
  }
})

/**
 * Search for an instance in a specific environment using Config aggregator
 */
async function searchInstanceInEnvironment(
  instanceId: string,
  env: AWSEnvironmentType,
  specificAccountId?: string
): Promise<{ resource: ResourceDetail | null; accountId?: string; environment: AWSEnvironmentType }> {
  const aggregatorName = env === 'commercial'
    ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'CommercialAggregator')
    : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')

  const region = env === 'commercial'
    ? (process.env.AWS_COMMERCIAL_REGION || 'us-east-1')
    : (process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')

  if (specificAccountId) {
    // Direct lookup if account ID is provided
    const resourceIdentifier = {
      SourceAccountId: specificAccountId,
      SourceRegion: region,
      ResourceId: instanceId,
      ResourceType: 'AWS::EC2::Instance'
    }

    const resource = await getResourceConfig(aggregatorName, resourceIdentifier, env, region)
    return { resource, accountId: specificAccountId, environment: env }
  }

  // Use SQL query to search across all accounts
  const sqlQuery = `SELECT resourceId, resourceType, resourceName, accountId, awsRegion, arn, resourceCreationTime, tags, configuration WHERE resourceType = 'AWS::EC2::Instance' AND resourceId = '${instanceId}'`

  try {
    const queryResult = await queryResources(aggregatorName, sqlQuery, env, region, 1)

    if (queryResult.results && queryResult.results.length > 0) {
      const rawResult = typeof queryResult.results[0] === 'string'
        ? JSON.parse(queryResult.results[0])
        : queryResult.results[0]

      // Parse configuration
      let configuration = {}
      if (rawResult.configuration) {
        try {
          configuration = typeof rawResult.configuration === 'string'
            ? JSON.parse(rawResult.configuration)
            : rawResult.configuration
        } catch {
          configuration = rawResult.configuration
        }
      }

      // Convert tags from Config format if needed
      let tags: Record<string, string> = {}
      if (rawResult.tags) {
        if (Array.isArray(rawResult.tags)) {
          for (const tag of rawResult.tags) {
            if (tag.key && tag.value !== undefined) {
              tags[tag.key] = tag.value
            }
          }
        } else if (typeof rawResult.tags === 'object') {
          tags = rawResult.tags
        }
      }

      return {
        resource: {
          resourceId: rawResult.resourceId,
          resourceType: rawResult.resourceType,
          resourceName: rawResult.resourceName,
          accountId: rawResult.accountId,
          region: rawResult.awsRegion,
          arn: rawResult.arn,
          resourceCreationTime: rawResult.resourceCreationTime,
          tags,
          configuration
        },
        accountId: rawResult.accountId,
        environment: env
      }
    }
  } catch (error) {
    logger.debug(`[Instance Details] Search in ${env} failed: ${error.message}`)
  }

  return { resource: null, environment: env }
}

export default defineEventHandler(handleAsync(async (event) => {
  try {
    const instanceId = getRouterParam(event, 'instanceId')
    const query = getQuery(event)

    if (!instanceId) {
      return errors.badRequest(event, 'Instance ID is required')
    }

    // Validate instance ID format (8 or 17 hex chars after i-)
    if (!instanceId.match(/^i-[a-f0-9]{8,17}$/)) {
      return errors.badRequest(event, 'Invalid instance ID format')
    }

    const { environment: requestedEnv } = parseQueryParams(event)
    const includeOptimization = query.includeOptimization !== 'false'
    const includeTagSuggestions = query.includeTagSuggestions !== 'false'
    const specificAccountId = query.accountId as string | undefined

    logger.info(`[Instance Details] Looking for instance ${instanceId}`)

    let instanceResource: ResourceDetail | null = null
    let foundInAccount: string | undefined
    let actualEnvironment: AWSEnvironmentType = requestedEnv

    // If specific environment requested, search only there
    if (query.environment) {
      const result = await searchInstanceInEnvironment(instanceId, requestedEnv, specificAccountId)
      instanceResource = result.resource
      foundInAccount = result.accountId
      actualEnvironment = result.environment
    } else {
      // Try GovCloud first (more likely for this org), then commercial
      logger.info(`[Instance Details] Searching GovCloud first...`)
      let result = await searchInstanceInEnvironment(instanceId, 'govcloud', specificAccountId)

      if (!result.resource) {
        logger.info(`[Instance Details] Not found in GovCloud, trying commercial...`)
        result = await searchInstanceInEnvironment(instanceId, 'commercial', specificAccountId)
      }

      instanceResource = result.resource
      foundInAccount = result.accountId
      actualEnvironment = result.environment

      if (instanceResource) {
        logger.info(`[Instance Details] Found instance in ${actualEnvironment} account ${foundInAccount}`)
      }
    }

    if (!instanceResource) {
      return errors.notFound(event, `EC2 instance ${instanceId}`)
    }

    // Enrich the instance data
    const enrichedInstance = await enrichInstanceData(instanceResource, actualEnvironment)
    
    logger.info(`[Instance Details] Enriched instance: ${enrichedInstance.instanceName || instanceId}`)
    
    // Prepare response data
    const responseData: any = {
      instance: enrichedInstance
    }
    
    // Get optimization recommendations if requested
    if (includeOptimization) {
      try {
        logger.info('[Instance Details] Fetching optimization recommendations')

        const partition = actualEnvironment === 'govcloud' ? 'aws-us-gov' : 'aws'
        const arn = `arn:${partition}:ec2:${instanceResource.region}:${foundInAccount}:instance/${instanceId}`

        const optimizationResults = await getBatchOptimizationRecommendations(
          [{ arn, type: 'EC2_INSTANCE' }],
          actualEnvironment
        )
        
        if (optimizationResults.recommendations.length > 0) {
          const recommendation = optimizationResults.recommendations[0]
          responseData.optimization = {
            // AWS Compute Optimizer provides the authoritative recommendations
            source: 'AWS Compute Optimizer',
            finding: recommendation.finding,
            findingReasonCodes: recommendation.findingReasonCodes,
            estimatedMonthlySavings: recommendation.estimatedMonthlySavings,
            recommendationOptions: recommendation.recommendationOptions,
            // Include AWS insights as supplementary info
            awsInsights: enrichedInstance.awsOptimizationInsights
          }
        } else {
          responseData.optimization = {
            source: 'AWS Instance Type Analysis (Compute Optimizer data not available)',
            message: 'For detailed rightsizing recommendations, ensure AWS Compute Optimizer is enabled and has sufficient data',
            awsInsights: enrichedInstance.awsOptimizationInsights
          }
        }
      } catch (error) {
        logger.warn('[Instance Details] Optimization analysis failed:', error)
        responseData.optimization = {
          source: 'Limited Analysis (AWS services unavailable)',
          message: `AWS service error: ${error.message}`,
          awsInsights: enrichedInstance.awsOptimizationInsights
        }
      }
    }
    
    // Generate tag suggestions if requested
    if (includeTagSuggestions) {
      responseData.tagSuggestions = generateTagSuggestions(enrichedInstance)
    }
    
    return sendSuccess(event, responseData, {
      message: `Instance details for ${enrichedInstance.instanceName || instanceId}`,
      foundInAccount,
      environment: actualEnvironment
    })
    
  } catch (error) {
    logger.error('[Instance Details] Unexpected error:', error)
    return errors.serverError(event, `Failed to get instance details: ${error.message}`)
  }
}))