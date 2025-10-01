/**
 * GET /api/security-lake/health
 * 
 * Health check for Security Lake system including AWS connectivity
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getEnvironmentConfig } from '../../utils/security-lake'
import { getAthenaClient } from '../../lib/aws-client-factory'

export default defineEventHandler(handleAsync(async (event) => {
  const checks: any = {}
  
  try {
    // Check configuration
    const commercialConfig = getEnvironmentConfig('commercial')
    const govcloudConfig = getEnvironmentConfig('govcloud')
    
    checks.config = {
      commercial: {
        region: commercialConfig.region,
        database: commercialConfig.database,
        athenaResultsBucket: commercialConfig.athenaResultsBucket,
        hasMonitoringAccount: !!commercialConfig.monitoringAccountId
      },
      govcloud: {
        region: govcloudConfig.region,
        database: govcloudConfig.database,
        athenaResultsBucket: govcloudConfig.athenaResultsBucket,
        hasMonitoringAccount: !!govcloudConfig.monitoringAccountId
      }
    }
    
    // Test AWS connectivity
    try {
      const athenaClient = await getAthenaClient('commercial', commercialConfig.region, commercialConfig.monitoringAccountId)
      const { ListWorkGroupsCommand } = await import('@aws-sdk/client-athena')
      await athenaClient.send(new ListWorkGroupsCommand({ MaxResults: 1 }))
      checks.aws = { commercial: 'connected' }
    } catch (error) {
      checks.aws = { 
        commercial: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
    
    return sendSuccess(event, {
      status: 'healthy',
      checks
    })
    
  } catch (error) {
    return errors.serverError(event, error instanceof Error ? error.message : 'Health check failed')
  }
}))