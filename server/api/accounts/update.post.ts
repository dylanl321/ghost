/**
 * POST /api/accounts/update
 * Update account metadata in DynamoDB
 */

import { defineEventHandler, readBody } from 'h3'
import { updateAccountMetadata } from '../../utils/accounts-consolidated'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { accountCache, organizationCache, CacheTags } from '../../utils/cache-manager'
import { logger } from '../../utils/logger'
import { requirePermission } from '../../utils/user-roles'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/update', 'POST', {
  summary: 'Update account metadata',
  description: 'Update metadata fields for an account in DynamoDB (GovCloud)',
  tags: ['Accounts'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            accountId: { 
              type: 'string', 
              description: 'Commercial account ID',
              pattern: '^[0-9]{12}$'
            },
            metadata: {
              type: 'object',
              description: 'Metadata fields to update',
              properties: {
                govCloudAccountId: { type: 'string', pattern: '^[0-9]{12}$' },
                requestID: { type: 'string', description: 'Request/ticket ID' },
                projectCode: { type: 'string', description: 'Project code' },
                costCenter: { type: 'string', description: 'Cost center' },
                technicalContact: { type: 'string', description: 'Technical contact email' },
                businessContact: { type: 'string', description: 'Business contact email' },
                environment: { 
                  type: 'string', 
                  enum: ['dev', 'test', 'stage', 'prod', 'sandbox'],
                  description: 'Environment type'
                },
                tags: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                  description: 'Custom tags'
                }
              }
            }
          },
          required: ['accountId', 'metadata']
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Account metadata updated successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  accountName: { type: 'string' },
                  accountEmail: { type: 'string' },
                  accountType: { type: 'string', enum: ['commercial-only', 'govcloud-paired'] },
                  hasGovCloud: { type: 'boolean' },
                  govCloudAccountId: { type: 'string' },
                  requestID: { type: 'string' },
                  projectCode: { type: 'string' },
                  environment: { type: 'string' },
                  modifiedDate: { type: 'string' }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  fieldsUpdated: { type: 'array', items: { type: 'string' } },
                  updatedAt: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'accounts.edit')

  const body = await readBody(event)
  
  if (!body || !body.accountId || !body.metadata) {
    return errors.badRequest(event, 'accountId and metadata are required')
  }
  
  const { accountId, metadata } = body
  
  // Validate account ID format
  if (!/^[0-9]{12}$/.test(accountId)) {
    return errors.badRequest(event, 'accountId must be a 12-digit AWS account ID')
  }
  
  // Validate metadata is an object
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return errors.badRequest(event, 'metadata must be an object')
  }
  
  // Validate GovCloud account ID if provided
  if (metadata.govCloudAccountId && !/^[0-9]{12}$/.test(metadata.govCloudAccountId)) {
    return errors.badRequest(event, 'govCloudAccountId must be a 12-digit AWS account ID')
  }
  
  try {
    logger.info(`Updating metadata for account ${accountId}:`, Object.keys(metadata))
    const updatedAccount = await updateAccountMetadata(accountId, metadata)
    
    if (!updatedAccount) {
      return errors.notFound(event, 'Account')
    }
    
    // Invalidate related caches after successful update
    logger.info('Invalidating caches after account metadata update...')
    const [accountsInvalidated, organizationInvalidated] = await Promise.all([
      accountCache.invalidateByTags([CacheTags.ACCOUNTS]),
      organizationCache.invalidateByTags([CacheTags.ACCOUNTS]) // Organization cache depends on account data
    ])
    
    logger.debug(`Cache invalidation complete: ${accountsInvalidated + organizationInvalidated} entries cleared`)
    
    return sendSuccess(event, updatedAccount, {
      fieldsUpdated: Object.keys(metadata),
      updatedAt: new Date().toISOString(),
      cache: {
        invalidated: {
          accounts: accountsInvalidated,
          organization: organizationInvalidated,
          total: accountsInvalidated + organizationInvalidated
        }
      }
    })
  } catch (error: any) {
    logger.error('Error updating account metadata:', error)
    
    if (error.message?.includes('credentials required')) {
      return errors.badRequest(event, error.message)
    }
    
    return errors.serverError(event, 'Failed to update account metadata')
  }
}))