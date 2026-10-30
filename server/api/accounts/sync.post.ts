/**
 * POST /api/accounts/sync
 * Sync account from Organizations to DynamoDB metadata
 */

import { defineEventHandler, readBody } from 'h3'
import { syncAccountFromOrganizations } from '../../utils/accounts-consolidated'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { accountCache, organizationCache, CacheTags } from '../../utils/cache-manager'
import { logger } from '../../utils/logger'
import { requirePermission } from '../../utils/user-roles'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/sync', 'POST', {
  summary: 'Sync account from Organizations to DynamoDB',
  description: 'Pull account data from Organizations (Commercial) and update DynamoDB metadata (GovCloud)',
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
              description: 'Commercial account ID to sync',
              pattern: '^[0-9]{12}$'
            }
          },
          required: ['accountId']
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Account synced successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accountId: { type: 'string', description: 'Commercial account ID' },
                  accountName: { type: 'string' },
                  accountEmail: { type: 'string' },
                  accountType: { type: 'string', enum: ['commercial-only', 'govcloud-paired'] },
                  hasGovCloud: { type: 'boolean' },
                  govCloudAccountId: { type: 'string' },
                  modifiedDate: { type: 'string' }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  operation: { type: 'string', enum: ['created', 'updated'] },
                  syncedFrom: { type: 'string', enum: ['organizations'] },
                  syncedAt: { type: 'string' }
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
  
  if (!body || !body.accountId) {
    return errors.badRequest(event, 'accountId is required')
  }
  
  const accountId = body.accountId
  
  // Validate account ID format
  if (!/^[0-9]{12}$/.test(accountId)) {
    return errors.badRequest(event, 'accountId must be a 12-digit AWS account ID')
  }
  
  try {
    logger.info(`Syncing account ${accountId} from Organizations to DynamoDB`)
    const syncedAccount = await syncAccountFromOrganizations(accountId)
    
    if (!syncedAccount) {
      return errors.notFound(event, 'Account')
    }
    
    // Invalidate related caches after successful sync
    logger.info('Invalidating caches after account sync...')
    const [accountsInvalidated, organizationInvalidated] = await Promise.all([
      accountCache.invalidateByTags([CacheTags.ACCOUNTS]),
      organizationCache.invalidateByTags([CacheTags.ACCOUNTS]) // Organization cache depends on account data
    ])
    
    logger.debug(`Cache invalidation complete: ${accountsInvalidated + organizationInvalidated} entries cleared`)
    
    return sendSuccess(event, syncedAccount, {
      operation: 'synced',
      syncedFrom: 'organizations',
      syncedAt: new Date().toISOString(),
      cache: {
        invalidated: {
          accounts: accountsInvalidated,
          organization: organizationInvalidated,
          total: accountsInvalidated + organizationInvalidated
        }
      }
    })
  } catch (error: any) {
    logger.error('Error syncing account:', error)
    
    if (error.message?.includes('not found in Organizations')) {
      return errors.notFound(event, 'Account in Organizations')
    }
    
    if (error.message?.includes('credentials required')) {
      return errors.badRequest(event, error.message)
    }
    
    return errors.serverError(event, 'Failed to sync account')
  }
}))