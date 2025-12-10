/**
 * Get execution details for a dataset report
 * GET /api/dataset-reports/:reportId/executions/:executionId
 * Returns full execution metadata including error details and email delivery status
 */

import { getTableConfig } from '../../../../../lib/dynamodb-config'
import type { ReportExecution } from '../../../../../../shared/types/scheduled-reports'
import { logger } from '../../../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const reportId = getRouterParam(event, 'reportId')
    const executionId = getRouterParam(event, 'executionId')

    if (!reportId || !executionId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing reportId or executionId parameter'
      })
    }

    logger.info(`Fetching execution details: ${reportId} / ${executionId}`)

    const tableConfig = await getTableConfig('reportExecutions')

    // Get the execution record
    const execution = await getItem(
      tableConfig.tableName,
      { reportId, executionId },
      tableConfig.environment,
      tableConfig.accountId
    ) as ReportExecution | null

    if (!execution) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Execution not found'
      })
    }

    logger.info(`  → Found execution (status: ${execution.status})`)

    // Return full execution details
    return execution
  } catch (error: any) {
    logger.error('Error fetching execution details:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch execution details'
    })
  }
})
