/**
 * GET /api/admin/notifications/list
 * List all admin notifications with filtering and pagination
 */

import { getDynamoDBClient } from '../../../lib/aws-client-factory'
import { ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { NotificationRecord, NotificationType } from '../../../utils/admin-notifications'

const DEPLOYMENT_ACCOUNT_ID = '461760157232' // GovCloud deployment account
const REGION = 'us-gov-west-1'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)

    // Parse query parameters
    const type = query.type as NotificationType | undefined
    const status = query.status as string | undefined
    const limit = Math.min(parseInt(query.limit as string) || 50, 100)
    const lastKey = query.lastKey as string | undefined

    const tableName = process.env.NOTIFICATIONS_TABLE_NAME || 'ghost_admin_notifications'
    const client = await getDynamoDBClient('govcloud', REGION, DEPLOYMENT_ACCOUNT_ID)

    let result

    // Use GSI if filtering by type or status
    if (type) {
      result = await client.send(new QueryCommand({
        TableName: tableName,
        IndexName: 'type-timestamp-index',
        KeyConditionExpression: '#type = :type',
        ExpressionAttributeNames: {
          '#type': 'type'
        },
        ExpressionAttributeValues: marshall({
          ':type': type
        }),
        ScanIndexForward: false, // Most recent first
        Limit: limit,
        ExclusiveStartKey: lastKey ? JSON.parse(Buffer.from(lastKey, 'base64').toString()) : undefined
      }))
    } else if (status) {
      result = await client.send(new QueryCommand({
        TableName: tableName,
        IndexName: 'status-timestamp-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: marshall({
          ':status': status
        }),
        ScanIndexForward: false, // Most recent first
        Limit: limit,
        ExclusiveStartKey: lastKey ? JSON.parse(Buffer.from(lastKey, 'base64').toString()) : undefined
      }))
    } else {
      // Scan all notifications (no filter)
      result = await client.send(new ScanCommand({
        TableName: tableName,
        Limit: limit,
        ExclusiveStartKey: lastKey ? JSON.parse(Buffer.from(lastKey, 'base64').toString()) : undefined
      }))
    }

    const items = result.Items?.map(item => {
      const notification = unmarshall(item) as NotificationRecord
      // Don't include full content in list view
      return {
        ...notification,
        full_content: undefined
      }
    }) || []

    // Encode LastEvaluatedKey for pagination
    const nextKey = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null

    return {
      success: true,
      data: {
        notifications: items,
        nextKey,
        hasMore: !!result.LastEvaluatedKey
      }
    }
  } catch (error: any) {
    logger.error('Error listing notifications:', error)
    return {
      success: false,
      error: error.message
    }
  }
})
