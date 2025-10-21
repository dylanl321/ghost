/**
 * List user's shared reports
 * GET /api/reports/shared-reports/list
 */

import type { SharedReport } from '~/shared/types/shared-reports'
import { getTableName, getTableEnvironment } from '../../../lib/dynamodb-config'

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

    console.log(`Fetching shared reports for user: ${userEmail}`)

    const tableName = await getTableName('shared-reports')
    const environment = await getTableEnvironment('shared-reports')

    // Query by userId using GSI
    const reports = await queryItems(
      tableName,
      {
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userEmail
        },
        ScanIndexForward: false // Most recent first
      },
      environment
    ) as SharedReport[]

    console.log(`  → Found ${reports.length} shared reports`)

    return {
      success: true,
      data: reports
    }
  } catch (error: any) {
    console.error('Error fetching shared reports:', error)
    return {
      success: false,
      error: error.message || 'Failed to fetch shared reports',
      data: []
    }
  }
})
