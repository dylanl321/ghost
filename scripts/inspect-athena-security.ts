/**
 * Diagnostic script: Inspect Athena security_hub database in the GovCloud monitoring account (083876038518)
 *
 * Usage:
 *   npx tsx scripts/inspect-athena-security.ts
 */

import { config } from 'dotenv'
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'
import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from '@aws-sdk/client-athena'

config() // load .env

// ---------- Config ----------
const GOVCLOUD_ACCESS_KEY = process.env.AWS_GOVCLOUD_ACCESS_KEY_ID!
const GOVCLOUD_SECRET_KEY = process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY!
const REGION = process.env.AWS_GOVCLOUD_SECURITY_LAKE_REGION || 'us-gov-west-1'
const MONITORING_ACCOUNT_ID = process.env.AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT || '083876038518'
const ROLE_NAME = process.env.AWS_ASSUME_ROLE_NAME || 'GDMSOrganizationsRole'
const ATHENA_OUTPUT = `s3://${process.env.AWS_GOVCLOUD_ATHENA_RESULTS_BUCKET || 'aws-athena-query-results-us-gov-west-1-083876038518'}/diag/`

// The database the user wants to inspect
const TARGET_DB = 'security_hub'

// The database the code currently uses
const CURRENT_DB = 'amazon_security_lake_glue_db_us_gov_west_1'

async function assumeRole() {
  const sts = new STSClient({
    region: REGION,
    credentials: {
      accessKeyId: GOVCLOUD_ACCESS_KEY,
      secretAccessKey: GOVCLOUD_SECRET_KEY,
    },
  })

  const roleArn = `arn:aws-us-gov:iam::${MONITORING_ACCOUNT_ID}:role/${ROLE_NAME}`
  console.log(`\nAssuming role: ${roleArn}`)

  const resp = await sts.send(new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: 'ghost-athena-diag',
    DurationSeconds: 3600,
  }))

  const creds = resp.Credentials!
  return {
    accessKeyId: creds.AccessKeyId!,
    secretAccessKey: creds.SecretAccessKey!,
    sessionToken: creds.SessionToken!,
  }
}

function getAthena(credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string }) {
  return new AthenaClient({ region: REGION, credentials })
}

async function runQuery(athena: AthenaClient, sql: string, description: string): Promise<Record<string, string>[]> {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`  ${description}`)
  console.log(`  SQL: ${sql.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()}`)
  console.log('='.repeat(80))

  const start = Date.now()
  const startResp = await athena.send(new StartQueryExecutionCommand({
    QueryString: sql,
    WorkGroup: 'primary',
    ResultConfiguration: { OutputLocation: ATHENA_OUTPUT },
  }))

  const queryId = startResp.QueryExecutionId!

  // Poll
  let state = 'RUNNING'
  while (state === 'RUNNING' || state === 'QUEUED') {
    await new Promise(r => setTimeout(r, 1500))
    const statusResp = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: queryId }))
    state = statusResp.QueryExecution?.Status?.State || 'UNKNOWN'

    if (state === 'FAILED') {
      const reason = statusResp.QueryExecution?.Status?.StateChangeReason || 'unknown'
      console.error(`  FAILED: ${reason}`)
      return []
    }
    if (state === 'CANCELLED') {
      console.error(`  CANCELLED`)
      return []
    }
  }

  const elapsed = Date.now() - start

  // Fetch results
  const resultsResp = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: queryId, MaxResults: 200 }))
  const rows = resultsResp.ResultSet?.Rows || []
  const columns = rows[0]?.Data?.map(c => c.VarCharValue || '') || []

  const data = rows.slice(1).map(row => {
    const record: Record<string, string> = {}
    row.Data?.forEach((cell, i) => {
      record[columns[i]] = cell.VarCharValue || ''
    })
    return record
  })

  console.log(`  Completed in ${elapsed}ms — ${data.length} row(s)\n`)

  // Pretty-print as a table
  if (data.length > 0) {
    console.table(data)
  } else {
    console.log('  (no rows)')
  }

  return data
}

async function main() {
  console.log('Athena Security Hub Database Inspector')
  console.log(`Target monitoring account: ${MONITORING_ACCOUNT_ID}`)
  console.log(`Region: ${REGION}`)
  console.log(`Target database: ${TARGET_DB}`)
  console.log(`Current code database: ${CURRENT_DB}`)

  const credentials = await assumeRole()
  console.log('Role assumed successfully.\n')

  const athena = getAthena(credentials)

  // 1. List all databases
  await runQuery(athena, 'SHOW DATABASES', '1. All Databases in Glue Catalog')

  // 2. Show tables in the user-specified security_hub database
  await runQuery(athena, `SHOW TABLES IN ${TARGET_DB}`, `2. Tables in "${TARGET_DB}" database`)

  // 3. Show tables in the currently-used Security Lake database
  await runQuery(athena, `SHOW TABLES IN ${CURRENT_DB}`, `3. Tables in "${CURRENT_DB}" database (current code uses this)`)

  // 4. If security_hub DB exists, peek at its tables' schemas
  console.log('\n--- Inspecting security_hub tables ---\n')
  const tables = await runQuery(athena, `SHOW TABLES IN ${TARGET_DB}`, `4. Re-listing ${TARGET_DB} tables for iteration`)

  for (const row of tables.slice(0, 15)) {
    const tableName = Object.values(row)[0]
    if (!tableName) continue

    // Quote hyphenated table names
    const quotedTable = tableName.includes('-') ? `"${tableName}"` : tableName

    // Show columns
    await runQuery(athena, `DESCRIBE ${TARGET_DB}.${quotedTable}`, `Schema of ${TARGET_DB}.${tableName}`)

    // Sample 5 rows
    await runQuery(athena, `SELECT * FROM ${TARGET_DB}.${quotedTable} LIMIT 5`, `Sample data from ${TARGET_DB}.${tableName}`)
  }

  // 5. Also peek at the sh_findings table the code currently queries
  const currentTable = `${CURRENT_DB}.amazon_security_lake_table_${REGION.replace(/-/g, '_')}_sh_findings_2_0`
  console.log(`\n--- Current code queries: ${currentTable} ---\n`)

  try {
    await runQuery(athena, `DESCRIBE ${currentTable}`, `Schema of ${currentTable}`)
    await runQuery(athena, `SELECT * FROM ${currentTable} LIMIT 5`, `Sample data from ${currentTable}`)

    // Count + severity breakdown
    await runQuery(
      athena,
      `SELECT severity, status, COUNT(*) as cnt FROM ${currentTable} WHERE time_dt >= date_add('day', -90, current_timestamp) GROUP BY severity, status ORDER BY cnt DESC LIMIT 20`,
      `Severity/status breakdown in ${currentTable} (last 90 days)`
    )
  } catch (err: any) {
    console.error(`  Error querying ${currentTable}: ${err.message}`)
  }

  console.log('\n\nDone.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
