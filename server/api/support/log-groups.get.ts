/**
 * GET /api/support/log-groups
 * List CloudWatch log groups for a specific account
 */

import { defineEventHandler, getQuery } from 'h3'
import { DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getChildAccountLogsClient, defaultLogsRegion } from '../../utils/cloudwatch-logs-client'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'

export interface LogGroupInfo {
  name: string
  storedBytes?: number
  retentionDays?: number
  createdAt?: number
}

registerEndpoint('/api/support/log-groups', 'GET', {
  summary: 'List CloudWatch log groups',
  description: 'List CloudWatch log groups in a specific account',
  tags: ['Support Tools'],
  parameters: [
    {
      name: 'accountId',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'AWS account ID'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment (default: govcloud)'
    },
    {
      name: 'region',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'AWS region (default: us-gov-west-1 for govcloud, us-east-1 for commercial)'
    },
    {
      name: 'prefix',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Log group name prefix filter'
    }
  ],
  responses: {
    200: {
      description: 'List of CloudWatch log groups',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  logGroups: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        storedBytes: { type: 'number' },
                        retentionDays: { type: 'number' },
                        createdAt: { type: 'number' }
                      }
                    }
                  },
                  accountId: { type: 'string' },
                  environment: { type: 'string' },
                  region: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)

  const accountId = query.accountId as string
  if (!accountId || !/^\d{12}$/.test(accountId)) {
    return errors.badRequest(event, 'accountId must be a 12-digit AWS account ID')
  }

  const environment = (query.environment as AWSEnvironmentType) || 'govcloud'
  const region = (query.region as string) || defaultLogsRegion(environment)
  const prefix = query.prefix as string | undefined

  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  logger.info(`[Log Groups] Listing log groups for ${accountId} in ${environment}/${region}`)

  try {
    const client = await getChildAccountLogsClient(environment, accountId, region)

    const allLogGroups: LogGroupInfo[] = []
    let nextToken: string | undefined

    // Paginate through all log groups (up to 500)
    do {
      const command = new DescribeLogGroupsCommand({
        logGroupNamePrefix: prefix,
        limit: 50,
        nextToken
      })

      const response = await client.send(command)

      const groups = (response.logGroups || []).map(lg => ({
        name: lg.logGroupName || '',
        storedBytes: lg.storedBytes,
        retentionDays: lg.retentionInDays,
        createdAt: lg.creationTime
      }))

      allLogGroups.push(...groups)
      nextToken = response.nextToken

      // Safety limit
      if (allLogGroups.length >= 500) {
        break
      }
    } while (nextToken)

    logger.info(`[Log Groups] Found ${allLogGroups.length} log groups`)

    return sendSuccess(event, {
      logGroups: allLogGroups,
      accountId,
      environment,
      region,
      totalCount: allLogGroups.length
    })

  } catch (error: any) {
    logger.error(`[Log Groups] Error listing log groups:`, error)

    if ((error instanceof Error ? error.name : "Error") === 'AccessDeniedException') {
      return errors.forbidden(event, `Access denied to list log groups in account ${accountId}`)
    }

    return errors.awsError(event, error)
  }
}))
