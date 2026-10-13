/**
 * List user's shared reports
 * GET /api/reports/shared-reports/list
 */

import type { SharedReport } from '../../../../shared/types/shared-reports'
import { getTableConfig } from '../../../lib/dynamodb-config'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Get authenticated user
    const session = await requireUserSession(event)
    const userEmail = session.user?.email

    if (!userEmail) {
      return {
        success: false,
        error: 'User not authenticated',
        data: []
      }
    }

    logger.info(`Fetching shared reports for user: ${userEmail}`)

    const tableConfig = await getTableConfig('sharedReports')

    // Query by userId using GSI
    const result = await queryItems(
      {
        tableName: tableConfig.tableName,
        indexName: 'UserIdIndex',
        queryExpression: 'userId = :userId',
        expressionAttributeValues: {
          ':userId': userEmail
        },
        scanIndexForward: false // Most recent first
      },
      tableConfig.environment,
      tableConfig.accountId
    )

    const reports = result.items as SharedReport[]

    logger.debug(`  → Found ${reports.length} shared reports`)

    return {
      success: true,
      data: reports
    }
  } catch (error: any) {
    logger.error('Error fetching shared reports:', error)
    return {
      success: false,
      error: error.message || 'Failed to fetch shared reports',
      data: []
    }
  }
})
