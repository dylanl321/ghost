import { sendSuccess, errors } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { logger } from '../../utils/logger'
import { requirePermission } from '../../utils/user-roles'
import { FEEDBACK_TABLE, getFeedbackClient } from '../../utils/feedback-store'

// Register OpenAPI documentation
registerEndpoint('/api/feedback/list', 'GET', {
  summary: 'List feedback items',
  description: 'Retrieves all feedback (issues and feature requests) from the `ghost_feedback` DynamoDB table.',
  tags: ['Feedback'],

  responses: {
    200: {
      description: 'List of feedback items successfully retrieved.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    description: { type: 'string' },
                    reporter_email: { type: 'string' },
                    source: { type: 'string', enum: ['mcp-connections'] },
                    resolved: { type: 'boolean' },
                    environment: { type: 'string' },
                    date_utc: { type: 'string' },
                    time_utc: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(async (event) => {
  // Every submitter's feedback and email: same permission as resolving it
  await requirePermission(event, 'admin.issues')
  const startTime = Date.now()

  try {
    const docClient = await getFeedbackClient()

    const items: Record<string, any>[] = []
    let startKey: Record<string, any> | undefined
    do {
      const data = await docClient.send(new ScanCommand({ TableName: FEEDBACK_TABLE, ExclusiveStartKey: startKey }))
      items.push(...(data.Items ?? []))
      startKey = data.LastEvaluatedKey
    } while (startKey)

    const metadata = { responseTimeMs: Date.now() - startTime }
    return sendSuccess(event, { items }, metadata)
  } catch (err) {
    logger.error('Error listing feedback:', err)
    return errors.serverError(event, 'Failed to list feedback')
  }
})
