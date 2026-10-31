#!/usr/bin/env tsx
/**
 * Move user preference rows stored under a mixed-case user id onto the
 * lower-cased key that notification and digest lookups use.
 *
 * Usage:
 *   tsx scripts/migrate-user-preference-keys.ts           # dry run, lists affected rows
 *   tsx scripts/migrate-user-preference-keys.ts --apply   # write merged rows, delete legacy rows
 *
 * getUserPreferences() also migrates a row lazily the first time it is read,
 * so this only needs to run once to cover users who have not signed in since.
 */

import { deleteItem, getItem, putItem, scanItems } from '../server/utils/dynamodb'
import { getTableAccountId, getTableEnvironment, getTableName } from '../server/lib/dynamodb-config'
import { mergeLegacyPreferences, normalizePreferencesUserId } from '../server/utils/user-preferences'
import type { UserPreferences } from '../shared/types/user-preferences'

async function main() {
  const apply = process.argv.includes('--apply')
  const tableName = await getTableName('userPreferences')
  const environment = await getTableEnvironment('userPreferences')
  const accountId = await getTableAccountId('userPreferences')

  const rows: UserPreferences[] = []
  let nextToken: string | undefined
  do {
    const page = await scanItems(tableName, undefined, undefined, nextToken, environment, undefined, undefined, accountId)
    rows.push(...page.items as UserPreferences[])
    nextToken = page.nextToken
  } while (nextToken)

  const legacy = rows.filter(row => row.userId !== normalizePreferencesUserId(row.userId))
  console.log(`${rows.length} rows scanned, ${legacy.length} stored under a non-normalized key${apply ? '' : ' (dry run)'}`)

  for (const row of legacy) {
    const userId = normalizePreferencesUserId(row.userId)
    console.log(`  ${row.userId} -> ${userId}`)
    if (!apply) continue
    const existing = await getItem(tableName, { userId }, environment, accountId) as UserPreferences | null
    await putItem(tableName, mergeLegacyPreferences(userId, existing, row), environment, accountId)
    await deleteItem(tableName, { userId: row.userId }, environment, accountId)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
