/**
 * GET /api/security-lake/find-tables
 * 
 * Search all databases for Security Lake tables
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getAthenaClient } from '../../lib/aws-client-factory'
import { getEnvironmentConfig } from '../../utils/security-lake'

async function executeQuery(athenaClient: any, sql: string, outputLocation: string): Promise<any> {
  const { StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = await import('@aws-sdk/client-athena')
  
  const startResponse = await athenaClient.send(new StartQueryExecutionCommand({
    QueryString: sql,
    WorkGroup: 'primary',
    ResultConfiguration: { OutputLocation: outputLocation }
  }))
  
  if (!startResponse.QueryExecutionId) throw new Error('Failed to start query')
  
  // Wait for completion
  let status = 'RUNNING'
  let attempts = 0
  while ((status === 'RUNNING' || status === 'QUEUED') && attempts < 20) {
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
    throw new Error(statusResponse.QueryExecution?.Status?.StateChangeReason || 'Query failed')
  }
  
  if (status !== 'SUCCEEDED') {
    throw new Error('Query timeout or failed')
  }
  
  const resultsResponse = await athenaClient.send(new GetQueryResultsCommand({
    QueryExecutionId: startResponse.QueryExecutionId
  }))
  
  return resultsResponse.ResultSet?.Rows?.slice(1)?.map(row => 
    row.Data?.[0]?.VarCharValue
  ).filter(Boolean) || []
}

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'
  
  try {
    const config = getEnvironmentConfig(environment)
    const athenaClient = await getAthenaClient(environment, config.region)
    const outputLocation = `s3://${config.athenaResultsBucket}/find-tables/`
    
    // Get all databases
    const databases = await executeQuery(athenaClient, 'SHOW DATABASES', outputLocation)
    
    console.log('Found databases:', databases)
    
    const results: any = {}
    
    // Search each database for Security Lake tables
    for (const database of databases) {
      try {
        const tables = await executeQuery(
          athenaClient, 
          `SHOW TABLES IN ${database}`, 
          outputLocation
        )
        
        // Filter for Security Lake tables
        const securityLakeTables = tables.filter((table: string) => 
          table.includes('amazon_security_lake') || 
          table.includes('security_lake') ||
          table.includes('sh_findings') ||
          table.includes('vpc_flow') ||
          table.includes('route53')
        )
        
        if (securityLakeTables.length > 0) {
          results[database] = securityLakeTables
        }
        
      } catch (error) {
        results[database] = { error: error instanceof Error ? error.message : 'Failed to query database' }
      }
    }
    
    return sendSuccess(event, {
      environment,
      totalDatabases: databases.length,
      databases,
      securityLakeTables: results
    })
    
  } catch (error) {
    console.error('[Security Lake] Find tables failed:', error)
    return errors.serverError(event, error instanceof Error ? error.message : 'Search failed')
  }
}))