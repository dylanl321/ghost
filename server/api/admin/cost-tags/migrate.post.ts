/**
 * POST /api/admin/cost-tags/migrate
 * Migrate costTagConfig data from gdms_aws_accounts-master to ghost-cost-tag-config table.
 * Idempotent — safe to re-run. Does not delete source data.
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { requireAdmin } from '../../../utils/user-roles'
import { scanItems, putItem } from '../../../utils/dynamodb'
import { getTableConfig } from '../../../lib/dynamodb-config'
import { logger } from '../../../utils/logger'

export default defineEventHandler(handleAsync(async (event) => {
  await requireAdmin(event)

  const sourceConfig = await getTableConfig('externalAccounts')
  const targetConfig = await getTableConfig('costTagConfig')

  let totalScanned = 0
  let totalMigrated = 0
  const migrationErrors: string[] = []
  let nextToken: string | undefined

  // Paginated scan of master table for records with costTagConfig
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

    totalScanned += scanResult.items.length
    nextToken = scanResult.nextToken

    for (const record of scanResult.items) {
      const costTagConfig = record.costTagConfig
      if (!costTagConfig) continue

      // Write a row for each account ID that exists on the record
      const accountIds: string[] = []
      if (record.awsStandardAccountID) accountIds.push(record.awsStandardAccountID)
      if (record.awsGovCloudAccountID) accountIds.push(record.awsGovCloudAccountID)

      for (const accountId of accountIds) {
        try {
          await putItem(
            targetConfig.tableName,
            { accountId, ...costTagConfig },
            targetConfig.environment,
            targetConfig.accountId
          )
          totalMigrated++
        } catch (err: any) {
          const msg = `Failed to migrate account ${accountId}: ${err.message}`
          logger.error(`[CostTagMigration] ${msg}`)
          migrationErrors.push(msg)
        }
      }
    }
  } while (nextToken)

  logger.info(`[CostTagMigration] Complete: ${totalScanned} source records scanned, ${totalMigrated} rows written`)

  return sendSuccess(event, {
    totalScanned,
    totalMigrated,
    errors: migrationErrors
  })
}))
