/**
 * GET /api/config/resources
 * 
 * Query AWS resources using Config aggregator with optimization insights
 * 
 * FEATURES:
 * - Resource discovery across accounts using AWS Config aggregator
 * - Tag-based filtering and advanced query capabilities
 * - Integration with Compute Optimizer for cost recommendations
 * - AI-powered analysis using Bedrock (optional)
 * - Multi-environment support (Commercial and GovCloud)
 * - Comprehensive caching for performance
 * - Batch processing for large resource sets
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, sendApiError, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { parseAndValidateAccountFilters, filterAccounts } from '../../utils/account-filters'
import { lookupAccountOptimized } from '../../utils/account-lookup-optimized'
import { invokeBedrock, type BedrockModel } from '../../utils/bedrock-client'
import { extractInstanceName, batchEnrichInstances } from '../../utils/instance-enrichment'
import {
  listAggregateResources,
  batchGetResourceConfigs,
  filterResourcesByTags,
  calculateResourceStats,
  type ResourceDetail,
  type ResourceFilter
} from '../../utils/config-service'
import {
  getBatchOptimizationRecommendations,
  generateOptimizationSummaryText,
  type ResourceType as OptimizerResourceType
} from '../../utils/compute-optimizer'
import type { AWSEnvironmentType } from '../../types'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/config/resources', 'GET', {
  summary: 'Get AWS resources',
  description: 'Retrieve AWS resources using Config aggregator with optional optimization recommendations',
  tags: ['Resources'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'resourceType',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: [
          'AWS::EC2::Instance',
          'AWS::EC2::Volume',
          'AWS::EC2::SecurityGroup',
          'AWS::EC2::VPC',
          'AWS::EC2::Subnet',
          'AWS::S3::Bucket',
          'AWS::Lambda::Function',
          'AWS::RDS::DBInstance',
          'AWS::RDS::DBCluster',
          'AWS::IAM::Role',
          'AWS::IAM::User',
          'AWS::IAM::Policy',
          'AWS::DynamoDB::Table',
          'AWS::CloudFormation::Stack',
          'AWS::AutoScaling::AutoScalingGroup',
          'AWS::ECS::Service',
          'AWS::ECS::Cluster'
        ]
      },
      description: 'AWS resource type to filter'
    },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of account identifiers (12-digit ID, email, or request ID)'
    },
    {
      name: 'linesOfBusiness',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of lines of business'
    },
    {
      name: 'departments',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of department numbers'
    },
    {
      name: 'includeDecommissioned',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include decommissioned accounts'
    },
    {
      name: 'region',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'AWS region'
    },
    {
      name: 'tags',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Tag filters (key1=value1,key2=value2)'
    },
    {
      name: 'resourceName',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Resource name filter'
    },
    {
      name: 'responseDetail',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['simple', 'partial', 'full'],
        default: 'simple'
      },
      description: 'Response detail level (simple=IDs only, partial=basic info, full=complete details)'
    },
    {
      name: 'includeOptimization',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include optimization recommendations'
    },
    {
      name: 'includeAiAnalysis',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include AI analysis via Bedrock'
    },
    {
      name: 'aiModel',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['nova-pro', 'claude-sonnet'],
        default: 'claude-sonnet'
      },
      description: 'Bedrock model for analysis'
    },
    { $ref: '#/components/parameters/Limit' },
    { $ref: '#/components/parameters/NextToken' },
    {
      name: 'runningTotal',
      in: 'query',
      required: false,
      schema: { 
        type: 'integer',
        default: 0
      },
      description: 'Running total count from previous pages (automatically calculated during pagination)'
    }
  ],
  responses: {
    200: {
      description: 'Successfully retrieved resources',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  resources: {
                    type: 'array',
                    description: 'List of discovered resources with detailed configuration',
                    items: {
                      type: 'object',
                      properties: {
                        resourceId: { 
                          type: 'string',
                          description: 'Unique resource identifier',
                          example: 'i-1234567890abcdef0'
                        },
                        resourceType: { 
                          type: 'string',
                          description: 'AWS resource type',
                          example: 'AWS::EC2::Instance'
                        },
                        resourceName: { 
                          type: 'string',
                          description: 'Human-readable resource name',
                          example: 'web-server-01'
                        },
                        accountId: { 
                          type: 'string',
                          description: 'AWS Account ID owning the resource',
                          example: '123456789012'
                        },
                        accountName: { 
                          type: 'string',
                          description: 'Human-readable account name',
                          example: 'Production Account'
                        },
                        region: { 
                          type: 'string',
                          description: 'AWS region where resource is located',
                          example: 'us-east-1'
                        },
                        arn: { 
                          type: 'string',
                          description: 'Amazon Resource Name',
                          example: 'arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0'
                        },
                        creationTime: { 
                          type: 'string',
                          format: 'date-time',
                          description: 'When the resource was created'
                        },
                        tags: { 
                          type: 'object',
                          additionalProperties: { type: 'string' },
                          description: 'Resource tags as key-value pairs',
                          example: { 'Environment': 'Production', 'Owner': 'TeamA' }
                        },
                        configuration: { 
                          type: 'object',
                          description: 'Full AWS Config resource configuration'
                        },
                        optimization: {
                          type: 'object',
                          description: 'Compute Optimizer recommendations (if includeOptimization=true)',
                          properties: {
                            finding: { 
                              type: 'string',
                              enum: ['OPTIMIZED', 'UNDER_PROVISIONED', 'OVER_PROVISIONED', 'NOT_OPTIMIZED'],
                              description: 'Optimization finding from Compute Optimizer'
                            },
                            findingReasonCodes: { 
                              type: 'array',
                              items: { type: 'string' },
                              description: 'Detailed reason codes for the finding'
                            },
                            estimatedMonthlySavings: { 
                              type: 'number',
                              description: 'Estimated monthly cost savings in USD'
                            },
                            recommendations: { 
                              type: 'array',
                              description: 'List of optimization recommendations'
                            }
                          }
                        }
                      },
                      required: ['resourceId', 'resourceType', 'accountId', 'region']
                    }
                  },
                  summary: {
                    type: 'object',
                    description: 'Aggregated statistics and insights',
                    properties: {
                      totalResources: { 
                        type: 'integer',
                        description: 'Total number of resources found'
                      },
                      byAccount: { 
                        type: 'object',
                        additionalProperties: { type: 'integer' },
                        description: 'Resource count by account name'
                      },
                      byRegion: { 
                        type: 'object',
                        additionalProperties: { type: 'integer' },
                        description: 'Resource count by AWS region'
                      },
                      byType: { 
                        type: 'object',
                        additionalProperties: { type: 'integer' },
                        description: 'Resource count by resource type'
                      },
                      tagCoverage: { 
                        type: 'integer',
                        description: 'Percentage of resources with tags (0-100)'
                      },
                      oldestResource: { 
                        type: 'string',
                        format: 'date-time',
                        description: 'Creation time of oldest resource'
                      },
                      newestResource: { 
                        type: 'string',
                        format: 'date-time',
                        description: 'Creation time of newest resource'
                      },
                      optimizationSummary: {
                        type: 'object',
                        description: 'Optimization summary (if includeOptimization=true)',
                        properties: {
                          optimizedPercentage: { 
                            type: 'number',
                            description: 'Percentage of resources that are optimized'
                          },
                          totalSavingsOpportunity: { 
                            type: 'number',
                            description: 'Total potential monthly savings in USD'
                          },
                          underProvisioned: { 
                            type: 'integer',
                            description: 'Number of under-provisioned resources'
                          },
                          overProvisioned: { 
                            type: 'integer',
                            description: 'Number of over-provisioned resources'
                          },
                          optimized: { 
                            type: 'integer',
                            description: 'Number of optimized resources'
                          }
                        }
                      }
                    }
                  },
                  aiAnalysis: {
                    type: 'object',
                    description: 'AI-powered insights (if includeAiAnalysis=true)',
                    properties: {
                      summary: { 
                        type: 'string',
                        description: 'Executive summary of resource utilization'
                      },
                      recommendations: { 
                        type: 'array',
                        items: { type: 'string' },
                        description: 'AI-generated optimization recommendations'
                      },
                      riskFactors: { 
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Identified risk factors'
                      }
                    }
                  },
                  pagination: {
                    type: 'object',
                    properties: {
                      nextToken: { 
                        type: 'string',
                        description: 'Token for retrieving next page of results'
                      },
                      hasMore: { 
                        type: 'boolean',
                        description: 'Whether more results are available'
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
    400: {
      description: 'Bad request - invalid parameters',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    401: {
      description: 'Unauthorized - missing or invalid API key',
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

// Map Config resource types to Optimizer resource types
const RESOURCE_TYPE_MAPPING: Record<string, OptimizerResourceType> = {
  'AWS::EC2::Instance': 'EC2_INSTANCE',
  'AWS::EC2::Volume': 'EBS_VOLUME',
  'AWS::Lambda::Function': 'LAMBDA_FUNCTION',
  'AWS::AutoScaling::AutoScalingGroup': 'AUTO_SCALING_GROUP',
  'AWS::ECS::Service': 'ECS_SERVICE'
}

/**
 * Parse tag filters from query string
 */
function parseTagFilters(tagString?: string): Record<string, string> | undefined {
  if (!tagString) return undefined
  
  const tags: Record<string, string> = {}
  const tagPairs = tagString.split(',')
  
  for (const pair of tagPairs) {
    const [key, value] = pair.split('=')
    if (key && value) {
      tags[key.trim()] = value.trim()
    }
  }
  
  return Object.keys(tags).length > 0 ? tags : undefined
}

/**
 * Convert resource details to optimizer format
 */
function prepareResourcesForOptimizer(
  resources: ResourceDetail[],
  environment: AWSEnvironmentType
): Array<{ arn: string; type: OptimizerResourceType }> {
  const optimizerResources: Array<{ arn: string; type: OptimizerResourceType }> = []
  const partition = environment === 'govcloud' ? 'aws-us-gov' : 'aws'
  
  for (const resource of resources) {
    const optimizerType = RESOURCE_TYPE_MAPPING[resource.resourceType]
    if (!optimizerType) continue
    
    // Build ARN if not present
    let arn = resource.arn
    if (!arn) {
      const service = resource.resourceType.split('::')[1]?.toLowerCase()
      const resourceTypeShort = resource.resourceType.split('::')[2]?.toLowerCase()
      arn = `arn:${partition}:${service}:${resource.region}:${resource.accountId}:${resourceTypeShort}/${resource.resourceId}`
    }
    
    optimizerResources.push({ arn, type: optimizerType })
  }
  
  return optimizerResources
}

/**
 * Generate AI analysis of resources
 */
async function generateAiAnalysis(
  resources: ResourceDetail[],
  summary: any,
  model: BedrockModel
): Promise<any> {
  const prompt = `Analyze these AWS resources and provide optimization insights:

Resource Summary:
- Total Resources: ${summary.totalResources}
- Resource Types: ${Object.keys(summary.byType).join(', ')}
- Accounts: ${Object.keys(summary.byAccount).length}
- Regions: ${Object.keys(summary.byRegion).join(', ')}
- Tag Coverage: ${summary.tagCoverage}%

${summary.optimizationSummary ? `
Optimization Summary:
- Optimized: ${summary.optimizationSummary.optimized} (${summary.optimizationSummary.optimizedPercentage}%)
- Under-provisioned: ${summary.optimizationSummary.underProvisioned}
- Over-provisioned: ${summary.optimizationSummary.overProvisioned}
- Potential Monthly Savings: $${summary.optimizationSummary.totalSavingsOpportunity?.toFixed(2) || 0}
` : ''}

Provide actionable insights in the following format:
1. Executive summary (2-3 sentences)
2. Top 3-5 optimization recommendations
3. Risk factors to consider
4. Best practices for resource management

Keep response concise and practical.`

  try {
    const response = await invokeBedrock({
      prompt,
      model,
      temperature: 0.3,
      maxTokens: 1500
    })
    
    if (response.success && response.content) {
      // Try to parse structured response, fallback to plain text
      try {
        return JSON.parse(response.content)
      } catch {
        // Parse plain text into structure
        const lines = response.content.split('\n').filter(line => line.trim())
        return {
          summary: lines[0] || 'Analysis completed',
          recommendations: lines.filter(line => line.match(/^\d+\./)).slice(0, 5),
          riskFactors: lines.filter(line => line.toLowerCase().includes('risk')).slice(0, 3)
        }
      }
    }
  } catch (error) {
    logger.error('AI analysis failed:', error)
  }
  
  return {
    summary: 'AI analysis unavailable',
    recommendations: [],
    riskFactors: []
  }
}

export default defineEventHandler(handleAsync(async (event) => {
    try {
      const query = getQuery(event)
    
    // Parse other query parameters first to get environment
    const environment = (query.environment as AWSEnvironmentType) || 'commercial'
    
    // Parse account filters WITHOUT validation first (to allow for identifier resolution)
    const { parseAccountFilters } = await import('../../utils/account-filters')
    const accountFilters = parseAccountFilters(query)
    
    // Store resolved account objects for name mapping
    const resolvedAccountObjects: any[] = []
    
    // Resolve account identifiers if provided (using the standard lookup pattern)
    if (accountFilters.accountIds && accountFilters.accountIds.length > 0) {
      const resolvedAccountIds: string[] = []
      const resolveErrors: string[] = []
      
      for (const identifier of accountFilters.accountIds) {
        try {
          // Use the standardized account lookup pattern
          const lookupResult = await lookupAccountOptimized(event, identifier, {
            includeDecommissioned: accountFilters.includeDecommissioned || false
          })
          
          // Store the account object for name mapping later
          resolvedAccountObjects.push(lookupResult.account)
          
          // Choose the appropriate account ID based on the environment
          let fullAccountId: string | undefined
          if (environment === 'govcloud') {
            fullAccountId = lookupResult.account.govCloudAccountId || lookupResult.account.awsGovCloudAccountID || lookupResult.account.primaryAccountID
          } else {
            fullAccountId = lookupResult.account.accountId || lookupResult.account.awsStandardAccountID || lookupResult.account.id
          }
          
          if (fullAccountId) {
            resolvedAccountIds.push(fullAccountId)
          } else {
            resolveErrors.push(`Account found for identifier ${identifier} but missing ${environment} account ID`)
          }
        } catch (error) {
          resolveErrors.push(`No account found for identifier: ${identifier}`)
        }
      }
      
      if (resolveErrors.length > 0) {
        return errors.validationError(event, resolveErrors)
      }
      
      // Update criteria with resolved account IDs
      accountFilters.accountIds = resolvedAccountIds
    }
    
    // Now validate the criteria with resolved account IDs
    const { validateAccountFilters } = await import('../../utils/account-filters')
    const filterErrors = validateAccountFilters(accountFilters)
    
    if (filterErrors.length > 0) {
      return errors.validationError(event, filterErrors)
    }
    
    // Parse other query parameters
    const resourceType = query.resourceType as string | undefined
    const responseDetail = (query.responseDetail as 'simple' | 'partial' | 'full') || 'simple'
    const region = query.region as string | undefined
    
    // Use environment-specific aggregator names
    const aggregatorName = environment === 'commercial' 
      ? (process.env.AWS_COMMERCIAL_CONFIG_AGGREGATOR || 'CommercialAggregator')
      : (process.env.AWS_GOVCLOUD_CONFIG_AGGREGATOR || 'GDMSAggregator')
    const tags = parseTagFilters(query.tags as string | undefined)
    const resourceName = query.resourceName as string | undefined
    const includeOptimization = query.includeOptimization === 'true'
    const includeAiAnalysis = query.includeAiAnalysis === 'true'
    const aiModel = (query.aiModel as BedrockModel) || 'claude-sonnet'
    const limit = Math.min(parseInt(query.limit as string) || 100, 1000)
    const nextToken = query.nextToken as string | undefined
    const runningTotal = parseInt(query.runningTotal as string) || 0
    
    logger.info(`[Config API] Querying resources: type=${resourceType}, filters=${JSON.stringify(accountFilters)}, env=${environment}`)
    
    // Filter accounts using the standard filtering system
    const filteredAccounts = await filterAccounts(accountFilters)
    
    // Extract the appropriate account IDs based on the environment
    const targetAccountIds = filteredAccounts.map(acc => {
      if (environment === 'govcloud') {
        return acc.govCloudAccountId || acc.awsGovCloudAccountID || acc.govId
      } else {
        return acc.accountId || acc.awsStandardAccountID || acc.id
      }
    }).filter(Boolean)
    
    logger.info(`[Config API] Resolved account IDs: ${accountFilters.accountIds?.join(', ') || 'none'}`)
    logger.debug(`[Config API] Found ${targetAccountIds.length} accounts after filtering: ${targetAccountIds.join(', ')}`)
    
    if (targetAccountIds.length === 0 && (accountFilters.accountIds || accountFilters.linesOfBusiness || accountFilters.departments)) {
      return sendSuccess(event, {
        resources: [],
        summary: { totalResources: 0, byAccount: {}, byRegion: {}, byType: {} },
        pagination: { hasMore: false }
      }, { message: 'No resources found for specified account criteria' })
    }
    
    // Build resource filter for Config API
    const filter: ResourceFilter = {
      limit,
      nextToken
    }
    
    if (resourceType) {
      filter.resourceType = resourceType
    }
    
    if (targetAccountIds.length > 0) {
      filter.accountIds = targetAccountIds
    }
    
    if (resourceName) {
      filter.resourceNames = [resourceName]
    }
    
    // Get default region for environment
    const targetRegion = region || 
      (environment === 'commercial' 
        ? process.env.AWS_COMMERCIAL_REGION || 'us-east-1'
        : process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')
    
    // Fetch resources from Config
    logger.info(`[Config API] Fetching from aggregator: ${aggregatorName}`)
    logger.info(`[Config API] Filter being passed: ${JSON.stringify(filter)}`)
    const { resources: resourceIdentifiers, nextToken: newNextToken } = await listAggregateResources(
      aggregatorName,
      filter,
      environment,
      targetRegion
    )
    
    logger.debug(`[Config API] Found ${resourceIdentifiers.length} resource identifiers`)
    
    // Handle response based on detail level
    let resourceDetails: any[] = []
    let failed: any[] = []
    
    if (responseDetail === 'simple') {
      // Simple: Return identifiers with enriched instance names for EC2 instances
      // For EC2 instances, we need to fetch minimal config to get the Name tag
      const ec2Instances = resourceIdentifiers.filter(r => r.ResourceType === 'AWS::EC2::Instance')
      const nonEc2Resources = resourceIdentifiers.filter(r => r.ResourceType !== 'AWS::EC2::Instance')
      
      // Get basic config for EC2 instances to extract names
      let ec2Details: any[] = []
      if (ec2Instances.length > 0) {
        try {
          const ec2BatchResult = await batchGetResourceConfigs(
            aggregatorName,
            ec2Instances.map(r => ({
              SourceAccountId: r.SourceAccountId!,
              SourceRegion: r.SourceRegion!,
              ResourceId: r.ResourceId!,
              ResourceType: r.ResourceType!,
              ResourceName: r.ResourceName
            })),
            environment,
            targetRegion
          )
          
          ec2Details = ec2BatchResult.successful.map(r => {
            // Convert tags from config format if needed (defensive check)
            let tags = r.tags || {}
            if (r.configuration?.tags && Array.isArray(r.configuration.tags)) {
              tags = {}
              for (const tag of r.configuration.tags) {
                if (tag.key && tag.value !== undefined) {
                  tags[tag.key] = tag.value
                }
              }
            }
            
            return {
              resourceId: r.resourceId,
              resourceType: r.resourceType,
              accountId: r.accountId,
              region: r.region,
              instanceName: extractInstanceName(tags),
              instanceType: r.configuration?.instanceType,
              instanceState: r.configuration?.state?.name
            }
          })
        } catch (error) {
          logger.warn('[Config API] Failed to enrich EC2 instances:', error)
          // Fall back to basic data without names
          ec2Details = ec2Instances.map(r => ({
            resourceId: r.ResourceId,
            resourceType: r.ResourceType,
            accountId: r.SourceAccountId,
            region: r.SourceRegion
          }))
        }
      }
      
      // Non-EC2 resources get basic treatment
      const nonEc2Details = nonEc2Resources.map(r => ({
        resourceId: r.ResourceId,
        resourceType: r.ResourceType,
        accountId: r.SourceAccountId,
        region: r.SourceRegion
      }))
      
      resourceDetails = [...ec2Details, ...nonEc2Details]
    } else {
      // Partial or Full: Get detailed configurations
      const batchResult = await batchGetResourceConfigs(
        aggregatorName,
        resourceIdentifiers.map(r => ({
          SourceAccountId: r.SourceAccountId!,
          SourceRegion: r.SourceRegion!,
          ResourceId: r.ResourceId!,
          ResourceType: r.ResourceType!,
          ResourceName: r.ResourceName
        })),
        environment,
        targetRegion
      )
      
      failed = batchResult.failed
      
      if (responseDetail === 'partial') {
        // Partial: Return basic info without full configuration
        resourceDetails = batchResult.successful.map(r => ({
          resourceId: r.resourceId,
          resourceType: r.resourceType,
          resourceName: r.resourceName,
          accountId: r.accountId,
          region: r.region,
          arn: r.arn,
          creationTime: r.creationTime,
          tags: r.tags
        }))
      } else {
        // Full: Return everything
        resourceDetails = batchResult.successful
      }
    }
    
    logger.info(`[Config API] Processed ${resourceDetails.length} resources with detail level: ${responseDetail}`)
    
    // Create account name mapping from resolved accounts and filtered accounts
    const accountNamesMap = new Map<string, string>()
    
    // Add resolved account objects (from specific lookups)
    resolvedAccountObjects.forEach(acc => {
      const commAccountId = acc.accountId || acc.awsStandardAccountID
      const govAccountId = acc.govCloudAccountId || acc.awsGovCloudAccountID || acc.primaryAccountID
      const accountName = acc.name || acc.projectName || acc.accountName
      
      if (commAccountId && accountName) {
        accountNamesMap.set(commAccountId, accountName)
      }
      if (govAccountId && accountName) {
        accountNamesMap.set(govAccountId, accountName)
      }
    })
    
    // Add filtered accounts (from general filters like LOB, departments)
    if (filteredAccounts.length > 0) {
      filteredAccounts.forEach(acc => {
        const commAccountId = acc.accountId || acc.awsStandardAccountID
        const govAccountId = acc.govCloudAccountId || acc.awsGovCloudAccountID
        const accountName = acc.name || acc.projectName || acc.accountName
        
        if (commAccountId && accountName) {
          accountNamesMap.set(commAccountId, accountName)
        }
        if (govAccountId && accountName) {
          accountNamesMap.set(govAccountId, accountName)
        }
      })
    }
    
    // Add account names to resources
    resourceDetails.forEach(resource => {
      if (resource.accountId) {
        resource.accountName = accountNamesMap.get(resource.accountId) || resource.accountId
      }
    })
    
    // Apply tag filtering if specified
    let filteredResources = resourceDetails
    if (tags) {
      filteredResources = filterResourcesByTags(resourceDetails, tags)
      logger.info(`[Config API] After tag filtering: ${filteredResources.length} resources`)
    }
    
    // Enrich with account names from the filtered accounts
    const accountMap = new Map<string, string>()
    filteredAccounts.forEach(acc => {
      if (acc.id && acc.name) {
        accountMap.set(acc.id, acc.name)
      }
    })
    
    filteredResources.forEach(r => {
      r.accountName = accountMap.get(r.accountId) || r.accountId
    })
    
    // Get optimization recommendations if requested
    let optimizationResults = null
    if (includeOptimization && filteredResources.length > 0) {
      const optimizableResources = prepareResourcesForOptimizer(filteredResources, environment)
      
      if (optimizableResources.length > 0) {
        logger.info(`[Config API] Fetching optimization for ${optimizableResources.length} resources`)
        try {
          optimizationResults = await getBatchOptimizationRecommendations(
            optimizableResources,
            environment
          )
          
          // Map optimization results back to resources
          const optimizationMap = new Map<string, any>()
          optimizationResults.recommendations.forEach(rec => {
            optimizationMap.set(rec.resourceId, {
              finding: rec.finding,
              findingReasonCodes: rec.findingReasonCodes,
              estimatedMonthlySavings: rec.estimatedMonthlySavings,
              recommendations: rec.recommendationOptions
            })
          })
          
          filteredResources.forEach(r => {
            if (optimizationMap.has(r.resourceId)) {
              r.optimization = optimizationMap.get(r.resourceId)
            }
          })
        } catch (error) {
          logger.error('Optimization analysis failed:', error)
        }
      }
    }
    
    // Calculate summary statistics
    const stats = calculateResourceStats(filteredResources)
    const summary: any = {
      totalResources: stats.total,
      byAccount: stats.byAccount,
      byRegion: stats.byRegion,
      byType: stats.byType,
      tagCoverage: stats.tagCoverage,
      oldestResource: stats.oldestResource?.toISOString(),
      newestResource: stats.newestResource?.toISOString()
    }
    
    // Add optimization summary if available
    if (optimizationResults) {
      const optSummary = optimizationResults.summary
      summary.optimizationSummary = {
        optimizedPercentage: optSummary.optimizedPercentage,
        totalSavingsOpportunity: optSummary.totalMonthlySavings,
        underProvisioned: optSummary.underProvisioned,
        overProvisioned: optSummary.overProvisioned,
        optimized: optSummary.optimized
      }
    }
    
    // Generate AI analysis if requested
    let aiAnalysis = null
    if (includeAiAnalysis && filteredResources.length > 0) {
      logger.info('[Config API] Generating AI analysis')
      aiAnalysis = await generateAiAnalysis(filteredResources, summary, aiModel)
    }
    
    // Calculate running total for pagination
    const newRunningTotal = runningTotal + filteredResources.length
    
    // Prepare response
    const response = {
      resources: filteredResources,
      summary,
      ...(aiAnalysis && { aiAnalysis }),
      pagination: {
        nextToken: newNextToken,
        hasMore: !!newNextToken,
        currentPageSize: filteredResources.length,
        runningTotal: newRunningTotal,
        // For next request, include this in the URL
        ...(newNextToken && { nextRunningTotal: newRunningTotal })
      }
    }
    
    logger.info(`[Config API] Returning ${filteredResources.length} resources with ${Object.keys(summary.byType).length} types`)
    
    return sendSuccess(event, response, { message: 'Resources fetched successfully' })
  } catch (error) {
    logger.error('[Config API] Unexpected error:', error)
    return errors.serverError(event, `Configuration service error: ${error.message}`)
  }
}))