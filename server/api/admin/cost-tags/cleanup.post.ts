/**
 * POST /api/admin/cost-tags/cleanup
 * Remove costTagConfig attribute from gdms_aws_accounts-master records
 * after migration to the new ghost-cost-tag-config table is verified.
 *
 * Defaults to dryRun mode — pass { dryRun: false } in the body to execute.
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, handleAsync } from '../../../utils/api-response'
import { requireAdmin } from '../../../utils/user-roles'
import { scanItems } from '../../../utils/dynamodb'
import { getTableConfig } from '../../../lib/dynamodb-config'
import { getDynamoDBClient } from '../../../lib/aws-client-factory'
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { logger } from '../../../utils/logger'

export default defineEventHandler(handleAsync(async (event) => {
  await requireAdmin(event)

  const body = await readBody(event) || {}
  const dryRun = body.dryRun !== false // default true

  const sourceConfig = await getTableConfig('externalAccounts')

  let totalFound = 0
  let totalCleaned = 0
  const cleanupErrors: string[] = []
  let nextToken: string | undefined

  // Paginated scan for records with costTagConfig
  do {
    const scanResult = await scanItems(
      sourceConfig.tableName,
      'attribute_exists(costTagConfig)',
      undefined,
      nextToken,
      sourceConfig.environment,
      undefined,
      undefined,
      sourceConfig.accountId
    )

    totalFound += scanResult.items.length
    nextToken = scanResult.nextToken

    if (dryRun) continue

    // Remove costTagConfig attribute from each record
    const client = await getDynamoDBClient(sourceConfig.environment, undefined, sourceConfig.accountId)

    for (const record of scanResult.items) {
      try {
        await client.send(new UpdateItemCommand({
          TableName: sourceConfig.tableName,
          Key: marshall({ requestID: record.requestID }),
          UpdateExpression: 'REMOVE costTagConfig'
        }))
        totalCleaned++
      } catch (err: any) {
        const msg = `Failed to clean record ${record.requestID}: ${err.message}`
        logger.error(`[CostTagCleanup] ${msg}`)
        cleanupErrors.push(msg)
      }
    }
  } while (nextToken)

  logger.info(`[CostTagCleanup] ${dryRun ? 'DRY RUN' : 'Complete'}: ${totalFound} records found, ${totalCleaned} cleaned`)

  return sendSuccess(event, {
    dryRun,
    totalFound,
    totalCleaned,
    errors: cleanupErrors
  })
}))
