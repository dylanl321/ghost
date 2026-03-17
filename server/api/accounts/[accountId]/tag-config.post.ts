/**
 * POST /api/accounts/:accountId/tag-config
 * Update the tag configuration for a specific account
 */

import { defineEventHandler, readBody, getRouterParam } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { scanItems, updateItem } from '../../../utils/dynamodb'
import { logger } from '../../../utils/logger'
import type { AccountCostTagConfig } from '../../../../shared/types/cost-tags'

const TABLE_NAME = process.env.AWS_ACCOUNTS_TABLE_NAME || 'gdms_aws_accounts-master'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/{accountId}/tag-config', 'POST', {
  summary: 'Update account tag configuration',
  description: 'Save the cost tag configuration for a specific account',
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
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['importantTags'],
          properties: {
            importantTags: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of tag keys considered important for this account'
            },
            defaultGroupByTag: {
              type: 'string',
              description: 'Default tag key to group costs by on this account'
            },
            tagDescriptions: {
              type: 'object',
              description: 'Human-readable descriptions for tag keys'
            },
            tagValueAliases: {
              type: 'object',
              description: 'Friendly names for tag values. Key format: "TagKey::tagValue"'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Updated account tag configuration',
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

  const body = await readBody(event)
  if (!body) {
    return errors.badRequest(event, 'Request body is required')
  }

  // Validate importantTags
  if (!Array.isArray(body.importantTags)) {
    return errors.badRequest(event, 'importantTags must be an array of strings')
  }
  if (body.importantTags.some((t: any) => typeof t !== 'string')) {
    return errors.badRequest(event, 'importantTags must contain only strings')
  }

  // accountId is not the primary key — scan and match against both commercial and govcloud IDs
  const scanResult = await scanItems(
    TABLE_NAME,
    'awsStandardAccountID = :aid OR awsGovCloudAccountID = :aid',
    undefined,
    undefined,
    'govcloud',
    undefined,
    { ':aid': accountId }
  )

  const record = scanResult.items[0]
  if (!record) {
    return errors.notFound(event, `Account ${accountId} not found`)
  }

  // Build the config to persist, adding audit fields
  const tagConfig: AccountCostTagConfig = {
    importantTags: body.importantTags,
    defaultGroupByTag: body.defaultGroupByTag || undefined,
    tagDescriptions: body.tagDescriptions || {},
    tagValueAliases: body.tagValueAliases || {},
    updatedAt: new Date().toISOString(),
    updatedBy: (event.context.user?.email as string) || (event.context.user?.name as string) || 'unknown'
  }

  logger.info(`[TagConfig] Updating tag config for account ${accountId}`, {
    importantTagsCount: tagConfig.importantTags.length,
    defaultGroupByTag: tagConfig.defaultGroupByTag
  })

  // Use the actual primary key (requestID) for the update
  await updateItem(TABLE_NAME, { requestID: record.requestID }, { costTagConfig: tagConfig })

  return sendSuccess(event, tagConfig, {
    message: `Tag configuration updated for account ${accountId}`
  })
}))
