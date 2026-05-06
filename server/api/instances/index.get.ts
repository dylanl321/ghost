/**
 * GET /api/instances
 * 
 * List EC2 instances with enriched information including names, scheduling,
 * optimization hints, and management metadata
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync, parseQueryParams } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { 
  batchEnrichInstances,
  analyzeSchedulingTags,
  extractInstanceName,
  type EnrichedInstanceData 
} from '../../utils/instance-enrichment'
import {
  listAggregateResources,
  batchGetResourceConfigs,
  filterResourcesByTags,
  calculateResourceStats,
  getAggregatorName
} from '../../utils/config-service'
import { parseAndValidateAccountFilters, filterAccounts } from '../../utils/account-filters'
import { lookupAccountOptimized } from '../../utils/account-lookup-optimized'
import type { AWSEnvironmentType } from '../../types'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/instances', 'GET', {
  summary: 'List EC2 instances with enriched data',
  description: 'Retrieve EC2 instances with names, scheduling info, optimization hints, and management metadata',
  tags: ['Resources'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of account identifiers (12-digit ID, email, or request ID)'
    },
    {
      name: 'regions',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of regions'
    },
    {
      name: 'instanceStates',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        example: 'running,stopped'
      },
      description: 'Comma-separated list of instance states (running, stopped, terminated, etc.)'
    },
    {
      name: 'schedulingFilter',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['scheduled', 'unscheduled', 'all'],
        default: 'all'
      },
      description: 'Filter by scheduling status'
    },
    {
      name: 'managedBy',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by management team/owner'
    },
    {
      name: 'environmentTag',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by environment tag (production, staging, etc.)'
    },
    {
      name: 'includeOptimizationHints',
      in: 'query',
      required: false,
      schema: {
        type: 'boolean',
        default: true
      },
      description: 'Include basic optimization hints'
    },
    {
      name: 'includePricing',
      in: 'query',
      required: false,
      schema: {
        type: 'boolean',
        default: false
      },
      description: 'Include AWS pricing data (may slow down response)'
    },
    { $ref: '#/components/parameters/Limit' },
    { $ref: '#/components/parameters/NextToken' }
  ],
  responses: {
    200: {
      description: 'Instances retrieved successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  instances: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        resourceId: { type: 'string', example: 'i-1234567890abcdef0' },
                        instanceName: { type: 'string', example: 'web-server-01' },
                        instanceType: { type: 'string', example: 't3.medium' },
                        instanceState: { type: 'string', example: 'running' },
                        accountId: { type: 'string' },
                        region: { type: 'string' },
                        schedulingInfo: {
                          type: 'object',
                          properties: {
                            isScheduled: { type: 'boolean' },
                            managedBy: { type: 'string' }
                          }
                        },
                        metadata: {
                          type: 'object',
                          properties: {
                            environment: { type: 'string' },
                            project: { type: 'string' },
                            owner: { type: 'string' }
                          }
                        }
                      }
                    }
                  },
                  summary: {
                    type: 'object',
                    properties: {
                      totalInstances: { type: 'integer' },
                      byState: { type: 'object' },
                      byType: { type: 'object' },
                      byScheduling: { type: 'object' },
                      byEnvironment: { type: 'object' }
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
})

export default defineEventHandler(handleAsync(async (event) => {
  try {
    const query = getQuery(event)
    const { environment, limit: defaultLimit, nextToken: defaultNextToken } = parseQueryParams(event)
    
    // Parse filters
    const regions = query.regions ? (query.regions as string).split(',').map(r => r.trim()) : undefined
    const instanceStates = query.instanceStates ? (query.instanceStates as string).split(',').map(s => s.trim()) : undefined
    const schedulingFilter = (query.schedulingFilter as string) || 'all'
    const managedByFilter = query.managedBy as string | undefined
    const environmentFilter = query.environmentTag as string | undefined
    const includeOptimizationHints = query.includeOptimizationHints !== 'false'
    const includePricing = query.includePricing === 'true'
    const limit = Math.min(parseInt(query.limit as string) || defaultLimit, 200)
    const nextToken = (query.nextToken as string) || defaultNextToken
    
    logger.info(`[Instances API] Listing instances in ${environment} with filters:`, {
      regions: regions?.length || 'all',
      states: instanceStates?.length || 'all',
      scheduling: schedulingFilter,
      limit
    })
    
    // Parse account filters WITHOUT validation first (to allow for identifier resolution)
    const { parseAccountFilters } = await import('../../utils/account-filters')
    const accountFilters = parseAccountFilters(query)
    
    // Store resolved account objects for name mapping
    const resolvedAccountObjects: any[] = []
    
    // Resolve account identifiers if provided (using the same pattern as resources API)
    let targetAccountIds: string[] = []
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
        logger.warn(`[Instances API] Account resolution errors:`, resolveErrors)
      }
      
      targetAccountIds = resolvedAccountIds
    } else {
      // If no specific accounts requested, use standard filtering
      const filteredAccounts = await filterAccounts(accountFilters)
      targetAccountIds = filteredAccounts.map(acc => {
        if (environment === 'govcloud') {
          return acc.govCloudAccountId || acc.awsGovCloudAccountID || acc.govId
        } else {
          return acc.accountId || acc.awsStandardAccountID || acc.id
        }
      }).filter(Boolean)
    }
    
    // Get environment-specific configuration
    const aggregatorName = getAggregatorName(environment)
      
    const region = environment === 'commercial'
      ? (process.env.AWS_COMMERCIAL_REGION || 'us-east-1')
      : (process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')
    
    // Build resource filter
    const resourceFilter = {
      resourceType: 'AWS::EC2::Instance',
      accountIds: targetAccountIds.length > 0 ? targetAccountIds : undefined,
      regions: regions,
      limit,
      nextToken
    }
    
    // Get EC2 instances from Config
    const { resources: instanceIdentifiers, nextToken: newNextToken } = await listAggregateResources(
      aggregatorName,
      resourceFilter,
      environment,
      region
    )
    
    logger.debug(`[Instances API] Found ${instanceIdentifiers.length} instance identifiers`)
    
    // Get detailed configurations for instances
    const batchResult = await batchGetResourceConfigs(
      aggregatorName,
      instanceIdentifiers.map(r => ({
        SourceAccountId: r.SourceAccountId!,
        SourceRegion: r.SourceRegion!,
        ResourceId: r.ResourceId!,
        ResourceType: r.ResourceType!,
        ResourceName: r.ResourceName
      })),
      environment,
      region
    )
    
    logger.info(`[Instances API] Retrieved configs for ${batchResult.successful.length} instances`)
    
    // Enrich instance data (skip AWS API calls for list operations to improve performance)
    let enrichedInstances: any[] = []
    
    if (includeOptimizationHints) {
      // Full enrichment with AWS API calls
      enrichedInstances = await batchEnrichInstances(batchResult.successful, environment)
    } else {
      // Fast enrichment without AWS API calls
      enrichedInstances = batchResult.successful
        .filter(resource => resource.resourceType === 'AWS::EC2::Instance')
        .map(resource => {
          // Convert tags from config format if needed (already handled by parseConfigurationItem but being defensive)
          let tags = resource.tags || {}
          if (resource.configuration?.tags && Array.isArray(resource.configuration.tags)) {
            tags = {}
            for (const tag of resource.configuration.tags) {
              if (tag.key && tag.value !== undefined) {
                tags[tag.key] = tag.value
              }
            }
          }
          
          return {
            resourceId: resource.resourceId,
            resourceType: resource.resourceType,
            accountId: resource.accountId,
            region: resource.region,
            accountName: resource.accountName,
            instanceName: tags.Name || tags.name,
            instanceType: resource.configuration?.instanceType,
            instanceState: resource.configuration?.state?.name,
            launchTime: resource.configuration?.launchTime,
            configurationItemCaptureTime: resource.creationTime, // When Config last detected a change
            networkInfo: {
              privateIpAddress: resource.configuration?.privateIpAddress,
              publicIpAddress: resource.configuration?.publicIpAddress,
              vpcId: resource.configuration?.vpcId,
              subnetId: resource.configuration?.subnetId
            },
            managementInfo: {
              isGDMSManaged: tags.GDMS_Managed?.toLowerCase() === 'true',
              gdmsManagedValue: tags.GDMS_Managed
            },
            schedulingInfo: {
              hasSchedule: !!tags.Schedule,
              scheduleName: tags.Schedule,
              lastScheduleMessage: tags.ScheduleMessage,
              scheduleStatus: tags.ScheduleMessage?.toLowerCase().includes('started') ? 'running' as const :
                             tags.ScheduleMessage?.toLowerCase().includes('stopped') ? 'stopped' as const : 'unknown' as const
            },
            patchingInfo: {
              patchGroup: tags['Patch Group'],
              patchingAutomation: tags.PatchingAutomation
            },
            metadata: {
              environment: tags.Environment || tags.environment || tags.Env,
              project: tags.Project || tags.project || tags.Application,
              owner: tags.Owner || tags.owner,
              tags: tags
            }
          }
        })
    }
    
    // Enrich with account names from the resolved account objects
    const accountMap = new Map<string, string>()
    resolvedAccountObjects.forEach(acc => {
      const accountId = environment === 'govcloud' 
        ? (acc.govCloudAccountId || acc.awsGovCloudAccountID || acc.primaryAccountID)
        : (acc.accountId || acc.awsStandardAccountID || acc.id)
      
      if (accountId && (acc.name || acc.accountName)) {
        accountMap.set(accountId, acc.name || acc.accountName)
      }
    })
    
    // Apply account names to instances
    enrichedInstances.forEach(instance => {
      if (!instance.accountName && accountMap.has(instance.accountId)) {
        instance.accountName = accountMap.get(instance.accountId)
      }
    })
    
    // Apply filters on enriched data
    if (instanceStates && instanceStates.length > 0) {
      enrichedInstances = enrichedInstances.filter(instance => 
        instance.instanceState && instanceStates.includes(instance.instanceState)
      )
    }
    
    if (schedulingFilter !== 'all') {
      enrichedInstances = enrichedInstances.filter(instance => {
        const isScheduled = instance.schedulingInfo?.isScheduled || false
        return schedulingFilter === 'scheduled' ? isScheduled : !isScheduled
      })
    }
    
    if (managedByFilter) {
      enrichedInstances = enrichedInstances.filter(instance =>
        instance.schedulingInfo?.managedBy?.toLowerCase().includes(managedByFilter.toLowerCase()) ||
        instance.metadata?.owner?.toLowerCase().includes(managedByFilter.toLowerCase())
      )
    }
    
    if (environmentFilter) {
      enrichedInstances = enrichedInstances.filter(instance =>
        instance.metadata?.environment?.toLowerCase() === environmentFilter.toLowerCase()
      )
    }
    
    logger.info(`[Instances API] After filtering: ${enrichedInstances.length} instances`)

    // Fetch pricing data if requested
    if (includePricing && enrichedInstances.length > 0) {
      try {
        logger.info('[Instances API] Fetching pricing data...')
        const { batchGetEC2InstancePricing } = await import('../../utils/aws-pricing')

        // Prepare instance types and regions for pricing lookup
        const pricingRequests = enrichedInstances
          .filter(instance => instance.instanceType && instance.region)
          .map(instance => ({
            instanceType: instance.instanceType!,
            region: instance.region
          }))

        const pricingMap = await batchGetEC2InstancePricing(pricingRequests, environment)

        // Add pricing info to each instance
        enrichedInstances.forEach(instance => {
          if (instance.instanceType && instance.region) {
            const pricingKey = `${instance.region}-${instance.instanceType}`
            const pricing = pricingMap.get(pricingKey)

            if (pricing) {
              instance.pricingInfo = pricing
            }
          }
        })

        logger.info(`[Instances API] Added pricing data to ${pricingMap.size} instances`)
      } catch (error) {
        logger.error('[Instances API] Failed to fetch pricing data:', error.message)
        // Continue without pricing data
      }
    }

    // Remove optimization hints if not requested to reduce response size
    if (!includeOptimizationHints) {
      enrichedInstances.forEach(instance => {
        delete instance.awsOptimizationInsights
      })
    }

    // Calculate summary statistics
    const summary = {
      totalInstances: enrichedInstances.length,
      byState: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byScheduling: {
        scheduled: 0,
        unscheduled: 0
      },
      byManagement: {
        gdmsManaged: 0,
        notManaged: 0,
        unknown: 0
      },
      byEnvironment: {} as Record<string, number>,
      byAccount: {} as Record<string, number>,
      totalPricing: includePricing ? {
        totalHourlyRate: 0,
        totalMonthlyEstimate: 0,
        currency: 'USD',
        instancesWithPricing: 0
      } : undefined
    }
    
    enrichedInstances.forEach(instance => {
      // By state
      const state = instance.instanceState || 'unknown'
      summary.byState[state] = (summary.byState[state] || 0) + 1
      
      // By type
      const type = instance.instanceType || 'unknown'
      summary.byType[type] = (summary.byType[type] || 0) + 1
      
      // By scheduling - use hasSchedule properly
      if (instance.schedulingInfo?.hasSchedule) {
        summary.byScheduling.scheduled++
      } else {
        summary.byScheduling.unscheduled++
      }
      
      // By GDMS management
      if (instance.managementInfo?.isGDMSManaged === true) {
        summary.byManagement.gdmsManaged++
      } else if (instance.managementInfo?.gdmsManagedValue !== undefined) {
        // Has GDMS tag but value is not "True"
        summary.byManagement.notManaged++
      } else {
        // No GDMS tag at all
        summary.byManagement.unknown++
      }
      
      // By environment
      const env = instance.metadata?.environment || 'unknown'
      summary.byEnvironment[env] = (summary.byEnvironment[env] || 0) + 1
      
      // By account
      const accountName = instance.accountName || instance.accountId
      summary.byAccount[accountName] = (summary.byAccount[accountName] || 0) + 1

      // Accumulate pricing if available
      if (includePricing && instance.pricingInfo && summary.totalPricing) {
        summary.totalPricing.totalHourlyRate += instance.pricingInfo.hourlyRate || 0
        summary.totalPricing.totalMonthlyEstimate += instance.pricingInfo.monthlyEstimate || 0
        summary.totalPricing.instancesWithPricing++
      }
    })
    
    const response = {
      instances: enrichedInstances,
      summary,
      pagination: {
        nextToken: newNextToken,
        hasMore: !!newNextToken,
        currentPageSize: enrichedInstances.length
      },
      filters: {
        environment,
        regions,
        instanceStates,
        schedulingFilter,
        managedBy: managedByFilter,
        environmentTag: environmentFilter
      }
    }
    
    return sendSuccess(event, response, {
      message: `Found ${enrichedInstances.length} EC2 instances`,
      environment
    })
    
  } catch (error) {
    logger.error('[Instances API] Unexpected error:', error)
    return errors.serverError(event, `Failed to list instances: ${error.message}`)
  }
}))