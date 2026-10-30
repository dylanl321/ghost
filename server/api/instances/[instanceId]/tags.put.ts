/**
 * PUT /api/instances/[instanceId]/tags
 * 
 * Update tags for a specific EC2 instance with validation and templates
 * Supports adding, updating, and removing tags with built-in templates
 * for common management scenarios
 */

import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { sendSuccess, errors, handleAsync, parseQueryParams } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { 
  MANAGEMENT_TAG_TEMPLATES,
  generateTagSuggestions,
  enrichInstanceData
} from '../../../utils/instance-enrichment'
import { getResourceConfig, getAggregatorName } from '../../../utils/config-service'
import { getEC2Client } from '../../../lib/aws-client-factory'
import type { AWSEnvironmentType } from '../../../types'
import { logger } from '../../../utils/logger'
import { requireAdmin } from '../../../utils/user-roles'

// Register OpenAPI documentation
registerEndpoint('/api/instances/[instanceId]/tags', 'PUT', {
  summary: 'Update EC2 instance tags',
  description: 'Add, update, or remove tags for an EC2 instance with validation and management templates',
  tags: ['Resources'],
  parameters: [
    {
      name: 'instanceId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'EC2 instance ID (e.g., i-1234567890abcdef0)'
    },
    { $ref: '#/components/parameters/Environment' }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['add', 'update', 'remove', 'apply-template'],
              description: 'Tag operation to perform'
            },
            tags: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Tags to add/update (key-value pairs)'
            },
            tagKeys: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tag keys to remove (for remove action)'
            },
            template: {
              type: 'string',
              enum: ['development', 'staging', 'production', 'testing'],
              description: 'Management template to apply (for apply-template action)'
            },
            accountId: {
              type: 'string',
              description: 'Account identifier - can be 12-digit account ID, email, or request ID (improves performance)'
            },
            dryRun: {
              type: 'boolean',
              default: false,
              description: 'Preview changes without applying them'
            }
          },
          required: ['action'],
          examples: {
            addTags: {
              summary: 'Add new tags',
              value: {
                action: 'add',
                tags: {
                  'Name': 'web-server-01',
                  'Environment': 'production',
                  'Owner': 'team@company.com'
                }
              }
            },
            applyTemplate: {
              summary: 'Apply management template',
              value: {
                action: 'apply-template',
                template: 'development'
              }
            },
            removeTags: {
              summary: 'Remove specific tags',
              value: {
                action: 'remove',
                tagKeys: ['OldTag', 'UnusedTag']
              }
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Tags updated successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  instanceId: { type: 'string' },
                  action: { type: 'string' },
                  appliedTags: { type: 'object' },
                  removedTags: { type: 'array', items: { type: 'string' } },
                  previousTags: { type: 'object' },
                  newTags: { type: 'object' },
                  dryRun: { type: 'boolean' },
                  suggestions: {
                    type: 'object',
                    description: 'Additional tag suggestions based on new configuration'
                  }
                }
              }
            }
          }
        }
      }
    },
    400: {
      description: 'Bad request - invalid parameters or tags',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
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
  await requireAdmin(event)

  try {
    const instanceId = getRouterParam(event, 'instanceId')
    const body = await readBody(event)
    
    if (!instanceId) {
      return errors.badRequest(event, 'Instance ID is required')
    }
    
    // Validate instance ID format
    if (!instanceId.match(/^i-[a-f0-9]{8,17}$/)) {
      return errors.badRequest(event, 'Invalid instance ID format')
    }
    
    const { action, tags, tagKeys, template, accountId, dryRun = false, environment: bodyEnvironment, region: bodyRegion } = body ?? {}
    if (bodyEnvironment && bodyEnvironment !== 'commercial' && bodyEnvironment !== 'govcloud') {
      return errors.badRequest(event, 'environment must be "commercial" or "govcloud"')
    }
    const environment = (bodyEnvironment as AWSEnvironmentType) || 'commercial'
    
    if (!action) {
      return errors.badRequest(event, 'Action is required')
    }
    
    logger.info(`[Tag Management] ${action} tags for instance ${instanceId} in ${environment}`)
    
    // Get environment-specific configuration
    const aggregatorName = getAggregatorName(environment)
      
    const aggregatorRegion = environment === 'commercial'
      ? (process.env.AWS_COMMERCIAL_REGION || 'us-east-1')
      : (process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')
    // The instance's own region; the Config aggregator lives in the default one.
    const region = typeof bodyRegion === 'string' && bodyRegion ? bodyRegion : aggregatorRegion
    
    // Find the instance to get current tags and account info
    let instanceResource
    let foundInAccount = accountId
    
    if (accountId && !/^\d{12}$/.test(String(accountId))) {
      return errors.badRequest(event, 'accountId must be a 12-digit AWS account ID')
    }

    if (accountId) {
      // Use provided account ID
      try {
        instanceResource = await getResourceConfig(
          aggregatorName,
          {
            SourceAccountId: accountId,
            SourceRegion: region,
            ResourceId: instanceId,
            ResourceType: 'AWS::EC2::Instance'
          },
          environment,
          aggregatorRegion
        )
      } catch (error) {
        return errors.notFound(event, `EC2 instance ${instanceId} in account ${accountId}`)
      }
    } else {
      // Search across accounts (this is expensive, prefer providing accountId)
      return errors.badRequest(event, 'Account ID is required for tag operations')
    }
    
    if (!instanceResource) {
      return errors.notFound(event, `EC2 instance ${instanceId}`)
    }
    
    const currentTags = instanceResource.tags || {}
    let tagsToApply: Record<string, string> = {}
    let tagsToRemove: string[] = []
    
    // Prepare tag changes based on action
    switch (action) {
      case 'add':
      case 'update':
        if (!tags || typeof tags !== 'object' || Array.isArray(tags) || Object.keys(tags).length === 0) {
          return errors.badRequest(event, 'Tags are required for add/update action')
        }
        if (Object.values(tags).some(value => typeof value !== 'string')) {
          return errors.badRequest(event, 'Tag values must be strings')
        }
        tagsToApply = tags
        break
        
      case 'remove':
        if (!Array.isArray(tagKeys) || tagKeys.length === 0 || tagKeys.some(key => typeof key !== 'string')) {
          return errors.badRequest(event, 'Tag keys are required for remove action')
        }
        tagsToRemove = tagKeys
        break
        
      case 'apply-template':
        if (!template) {
          return errors.badRequest(event, 'Template name is required for apply-template action')
        }
        
        const templateTags = MANAGEMENT_TAG_TEMPLATES[template]
        if (!templateTags) {
          return errors.badRequest(event, `Unknown template: ${template}. Available: ${Object.keys(MANAGEMENT_TAG_TEMPLATES).join(', ')}`)
        }
        
        tagsToApply = templateTags
        break
        
      default:
        return errors.badRequest(event, `Unknown action: ${action}. Supported: add, update, remove, apply-template`)
    }
    
    // Validate tag names and values
    if (Object.keys(tagsToApply).length > 0) {
      for (const [key, value] of Object.entries(tagsToApply)) {
        if (!key.trim()) {
          return errors.badRequest(event, 'Tag keys cannot be empty')
        }
        if (key.length > 127) {
          return errors.badRequest(event, `Tag key '${key}' exceeds 127 characters`)
        }
        if (value && value.length > 255) {
          return errors.badRequest(event, `Tag value for '${key}' exceeds 255 characters`)
        }
        if (key.startsWith('aws:')) {
          return errors.badRequest(event, `Tag key '${key}' uses reserved 'aws:' prefix`)
        }
      }
    }
    
    // Calculate final tag state
    const newTags = { ...currentTags }
    
    // Apply new/updated tags
    Object.assign(newTags, tagsToApply)
    
    // Remove specified tags
    for (const keyToRemove of tagsToRemove) {
      delete newTags[keyToRemove]
    }
    
    logger.info(`[Tag Management] Current tags: ${Object.keys(currentTags).length}, New tags: ${Object.keys(newTags).length}`)
    
    const responseData = {
      instanceId,
      action,
      appliedTags: tagsToApply,
      removedTags: tagsToRemove,
      previousTags: currentTags,
      newTags,
      dryRun,
      template: template || undefined
    }
    
    // Perform actual tag updates if not dry run
    if (!dryRun) {
      try {
        // Tag in the instance's own account: without the account ID the client
        // would use the base credentials and the instance would not be found.
        const ec2Client = await getEC2Client(environment, region, accountId)
        
        // Apply new tags
        if (Object.keys(tagsToApply).length > 0) {
          const { CreateTagsCommand } = await import('@aws-sdk/client-ec2')
          const createTagsCommand = new CreateTagsCommand({
            Resources: [instanceId],
            Tags: Object.entries(tagsToApply).map(([Key, Value]) => ({ Key, Value }))
          })
          await ec2Client.send(createTagsCommand)
          logger.info(`[Tag Management] Applied ${Object.keys(tagsToApply).length} tags to ${instanceId}`)
        }
        
        // Remove tags
        if (tagsToRemove.length > 0) {
          const { DeleteTagsCommand } = await import('@aws-sdk/client-ec2')
          const deleteTagsCommand = new DeleteTagsCommand({
            Resources: [instanceId],
            Tags: tagsToRemove.map(Key => ({ Key }))
          })
          await ec2Client.send(deleteTagsCommand)
          logger.info(`[Tag Management] Removed ${tagsToRemove.length} tags from ${instanceId}`)
        }
      } catch (error) {
        logger.error('[Tag Management] Failed to update tags:', error)
        return errors.serverError(event, `Failed to update tags: ${(error instanceof Error ? error.message : String(error))}`)
      }
    }
    
    // Generate suggestions based on new tag configuration
    const enrichedInstance = await enrichInstanceData({
      ...instanceResource,
      tags: newTags
    }, environment)
    const suggestions = generateTagSuggestions(enrichedInstance)
    responseData.suggestions = suggestions
    
    const message = dryRun 
      ? `Preview: ${action} operation for instance ${instanceId}`
      : `Successfully ${action === 'apply-template' ? `applied ${template} template` : `${action}ed tags`} for instance ${instanceId}`
    
    return sendSuccess(event, responseData, { 
      message,
      environment,
      foundInAccount 
    })
    
  } catch (error) {
    logger.error('[Tag Management] Unexpected error:', error)
    return errors.serverError(event, `Failed to manage tags: ${(error instanceof Error ? error.message : String(error))}`)
  }
}))