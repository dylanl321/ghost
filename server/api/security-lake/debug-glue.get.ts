/**
 * GET /api/security-lake/debug-glue
 * 
 * Debug Glue catalog to find available databases and tables
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getAthenaClient } from '../../lib/aws-client-factory'
import { getEnvironmentConfig } from '../../utils/security-lake'
import { logger } from '../../utils/logger'

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'
  
  try {
    const config = getEnvironmentConfig(environment)
    const athenaClient = await getAthenaClient(environment, config.region, config.monitoringAccountId)
    
    const { StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = await import('@aws-sdk/client-athena')
    
    // Execute multiple queries to debug
    const queries = [
      { name: 'databases', sql: 'SHOW DATABASES' },
      { name: 'current_database_tables', sql: `SHOW TABLES IN ${config.database}` },
      { name: 'all_security_tables', sql: 'SHOW TABLES' }
    ]
    
    const results: any = {}
    
    for (const testQuery of queries) {
      try {
        // Start query
        const startResponse = await athenaClient.send(new StartQueryExecutionCommand({
          QueryString: testQuery.sql,
          WorkGroup: 'primary',
          ResultConfiguration: {
            OutputLocation: `s3://${config.athenaResultsBucket}/debug/`
          }
        }))
        
        if (!startResponse.QueryExecutionId) {
          results[testQuery.name] = { error: 'Failed to start query' }
          continue
        }
        
        // Wait for completion
        let status = 'RUNNING'
        let attempts = 0
        while (status === 'RUNNING' || status === 'QUEUED') {
          if (attempts > 15) {
            results[testQuery.name] = { error: 'Query timeout' }
            break
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const statusResponse = await athenaClient.send(new GetQueryExecutionCommand({
            QueryExecutionId: startResponse.QueryExecutionId
          }))
          
          status = statusResponse.QueryExecution?.Status?.State || 'UNKNOWN'
          attempts++
        }
        
        if (status === 'FAILED') {
          const statusResponse = await athenaClient.send(new GetQueryExecutionCommand({
            QueryExecutionId: startResponse.QueryExecutionId
          }))
          results[testQuery.name] = { 
            error: statusResponse.QueryExecution?.Status?.StateChangeReason || 'Query failed'
          }
          continue
        }
        
        if (status === 'SUCCEEDED') {
          // Get results
          const resultsResponse = await athenaClient.send(new GetQueryResultsCommand({
            QueryExecutionId: startResponse.QueryExecutionId
          }))
          
          const rows = resultsResponse.ResultSet?.Rows?.slice(1)?.map(row => 
            row.Data?.[0]?.VarCharValue
          ).filter(Boolean) || []
          
          results[testQuery.name] = { success: true, count: rows.length, items: rows }
        }
        
      } catch (error) {
        results[testQuery.name] = { 
          error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error' 
        }
      }
    }
    
    return sendSuccess(event, {
      environment,
      config: {
        database: config.database,
        region: config.region,
        monitoringAccountId: config.monitoringAccountId,
        athenaResultsBucket: config.athenaResultsBucket
      },
      debug: results
    })
    
  } catch (error) {
    logger.error('[Security Lake] Debug failed:', error)
    return errors.serverError(event, error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Debug failed')
  }
}))