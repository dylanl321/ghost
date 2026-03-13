/**
 * GET /api/accounts/:accountId/tag-config
 * Retrieve the tag configuration for a specific account
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { getItem } from '../../../utils/dynamodb'
import { logger } from '../../../utils/logger'
import type { AccountCostTagConfig } from '../../../../shared/types/cost-tags'

const TABLE_NAME = process.env.AWS_ACCOUNTS_TABLE_NAME || 'gdms_aws_accounts-master'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/{accountId}/tag-config', 'GET', {
  summary: 'Get account tag configuration',
  description: 'Retrieve the cost tag configuration for a specific account',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'accountId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'The account ID'
    }
  ],
  responses: {
    200: {
      description: 'Account tag configuration',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  importantTags: { type: 'array', items: { type: 'string' } },
                  defaultGroupByTag: { type: 'string' },
                  tagDescriptions: { type: 'object' },
                  updatedBy: { type: 'string' },
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
  const accountId = getRouterParam(event, 'accountId')
  if (!accountId) {
    return errors.badRequest(event, 'Account ID is required')
  }

  logger.info(`[TagConfig] Fetching tag config for account ${accountId}`)

  const record = await getItem(TABLE_NAME, { accountId })

  if (!record) {
    return errors.notFound(event, `Account ${accountId} not found`)
  }

  // Return existing tag config or empty defaults
  const tagConfig: AccountCostTagConfig = record.costTagConfig || {
    importantTags: [],
    defaultGroupByTag: undefined,
    tagDescriptions: {}
  }

  return sendSuccess(event, tagConfig)
}))
