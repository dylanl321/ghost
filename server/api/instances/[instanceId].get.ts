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
  type ResourceDetail
} from '../../utils/config-service'
import {
  getBatchOptimizationRecommendations,
  generateOptimizationSummaryText
} from '../../utils/compute-optimizer'
import { parseAndValidateAccountFilters, filterAccounts } from '../../utils/account-filters'
import type { AWSEnvironmentType } from '../../types'

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

export default defineEventHandler(handleAsync(async (event) => {
  try {
    const instanceId = getRouterParam(event, 'instanceId')
    const query = getQuery(event)
    
    if (!instanceId) {
      return errors.badRequest(event, 'Instance ID is required')
    }
    
    // Validate instance ID format
    if (!instanceId.match(/^i-[a-f0-9]{17}$/)) {
      return errors.badRequest(event, 'Invalid instance ID format')
    }
    
    const { environment } = parseQueryParams(event)
    const includeOptimization = query.includeOptimization !== 'false'
    const includeTagSuggestions = query.includeTagSuggestions !== 'false'
    const specificAccountId = query.accountId as string | undefined
    
    console.log(`[Instance Details] Looking for instance ${instanceId} in ${environment}`)
    
    // Get environment-specific aggregator and region
    const aggregatorName = environment === 'commercial' 
      ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'CommercialAggregator')
      : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')
      
    const region = environment === 'commercial'
      ? (process.env.AWS_COMMERCIAL_REGION || 'us-east-1')
      : (process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')
    
    // If no specific account provided, we need to search across accounts
    let accountIds: string[] = []
    if (specificAccountId) {
      accountIds = [specificAccountId]
    } else {
      // Get all accounts for this environment to search
      const allAccounts = await filterAccounts({})
      accountIds = allAccounts.map(acc => {
        if (environment === 'govcloud') {
          return acc.govCloudAccountId || acc.awsGovCloudAccountID || acc.govId
        } else {
          return acc.accountId || acc.awsStandardAccountID || acc.id
        }
      }).filter(Boolean)
      
      console.log(`[Instance Details] Searching across ${accountIds.length} accounts`)
    }
    
    // Search for the instance across accounts
    let instanceResource: ResourceDetail | null = null
    let foundInAccount: string | undefined
    
    for (const accountId of accountIds) {
      try {
        const resourceIdentifier = {
          SourceAccountId: accountId,
          SourceRegion: region,
          ResourceId: instanceId,
          ResourceType: 'AWS::EC2::Instance'
        }
        
        const resource = await getResourceConfig(
          aggregatorName,
          resourceIdentifier,
          environment,
          region
        )
        
        if (resource) {
          instanceResource = resource
          foundInAccount = accountId
          console.log(`[Instance Details] Found instance in account ${accountId}`)
          break
        }
      } catch (error) {
        // Continue searching in other accounts
        console.log(`[Instance Details] Instance not found in account ${accountId}`)
      }
    }
    
    if (!instanceResource) {
      return errors.notFound(event, `EC2 instance ${instanceId}`)
    }
    
    // Enrich the instance data
    const enrichedInstance = await enrichInstanceData(instanceResource, environment)
    
    console.log(`[Instance Details] Enriched instance: ${enrichedInstance.instanceName || instanceId}`)
    
    // Prepare response data
    const responseData: any = {
      instance: enrichedInstance
    }
    
    // Get optimization recommendations if requested
    if (includeOptimization) {
      try {
        console.log('[Instance Details] Fetching optimization recommendations')
        
        const partition = environment === 'govcloud' ? 'aws-us-gov' : 'aws'
        const arn = `arn:${partition}:ec2:${instanceResource.region}:${foundInAccount}:instance/${instanceId}`
        
        const optimizationResults = await getBatchOptimizationRecommendations(
          [{ arn, type: 'EC2_INSTANCE' }],
          environment
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
        console.warn('[Instance Details] Optimization analysis failed:', error)
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
      environment
    })
    
  } catch (error) {
    console.error('[Instance Details] Unexpected error:', error)
    return errors.serverError(event, `Failed to get instance details: ${error.message}`)
  }
}))