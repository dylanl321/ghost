/**
 * Admin API: List Async Chat Jobs
 * GET /api/admin/chat/async-jobs
 * Returns async job status across all users (admin only)
 */

import type { AdminAsyncJobSummary } from '~/shared/types/chat-threads'
import { getTableName, getTableEnvironment, getTableAccountId } from '../../../lib/dynamodb-config'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  // Get query parameters
  const query = getQuery(event)
  const userId = query.userId as string | undefined
  const status = query.status as string | undefined
  const startDate = query.startDate as string | undefined
  const endDate = query.endDate as string | undefined
  const limit = parseInt((query.limit as string) || '100')

  // Get table configuration
  const tableName = await getTableName('asyncChatJobs')
  const environment = await getTableEnvironment('asyncChatJobs')
  const tableAccountId = await getTableAccountId('asyncChatJobs')

  try {
    // Build filter expression
    const filterParts: string[] = []
    const expressionAttributeNames: Record<string, string> = {}
    const expressionAttributeValues: Record<string, any> = {}

    if (userId) {
      filterParts.push('#userId = :userId')
      expressionAttributeNames['#userId'] = 'userId'
      expressionAttributeValues[':userId'] = userId
    }

    if (status) {
      filterParts.push('#status = :status')
      expressionAttributeNames['#status'] = 'status'
      expressionAttributeValues[':status'] = status
    }

    if (startDate) {
      filterParts.push('#createdAt >= :startDate')
      expressionAttributeNames['#createdAt'] = 'createdAt'
      expressionAttributeValues[':startDate'] = startDate
    }

    if (endDate) {
      filterParts.push('#createdAt <= :endDate')
      expressionAttributeNames['#createdAt'] = 'createdAt'
      expressionAttributeValues[':endDate'] = endDate
    }

    const result = await scanItems(
      tableName,
      filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
      limit,
      undefined,  // nextToken
      environment,
      Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
      tableAccountId
    )

    // Map to AdminAsyncJobSummary format
    const jobs: AdminAsyncJobSummary[] = result.items.map((item: any) => ({
      jobId: item.jobId,
      userId: item.userId,
      threadId: item.threadId,
      status: item.status,
      progress: item.currentStep,
      progressPercent: item.progressPercent,
      currentStep: item.currentStep,
      toolsCalled: item.toolsCalled || [],
      createdAt: item.createdAt,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      duration: item.startedAt && item.completedAt
        ? (new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime()) / 1000
        : undefined,
      error: item.errorMessage
    }))

    // Sort by createdAt descending
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    logger.info(`[Admin] Fetched ${jobs.length} async jobs${userId ? ` for user ${userId}` : ''}`)

    return {
      jobs,
      totalCount: result.count
    }

  } catch (error: any) {
    logger.error('[Admin] Error fetching async jobs:', error)

    // Handle table not found
    if (error.name === 'ResourceNotFoundException' || error.message?.includes('Requested resource not found')) {
      return {
        jobs: [],
        totalCount: 0
      }
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch async jobs'
    })
  }
})

// TODO: Future - Add pagination support with nextToken
// TODO: Future - Add filtering by duration range
// TODO: Future - Add export functionality
