import { sendSuccess, errors } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { UpdateCommand } from "@aws-sdk/lib-dynamodb"
import { logger } from '../../utils/logger'
import { requirePermission } from '../../utils/user-roles'
import { FEEDBACK_TABLE, getFeedbackClient } from '../../utils/feedback-store'

// Register OpenAPI documentation
registerEndpoint('/api/feedback/update', 'POST', {
  summary: 'Update feedback resolution status',
  description: 'Sets the `resolved` field for a feedback item by ID.',
  tags: ['Feedback'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['id', 'resolved'],
          properties: {
            id: { type: 'string', description: 'ID of the feedback item.' },
            resolved: { type: 'boolean', description: 'Whether the issue is resolved.' }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Feedback updated successfully.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              id: { type: 'string', example: '1728394729374' }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.issues')

  const startTime = Date.now()
  const body = await readBody<{ id: string; resolved: boolean }>(event)
  const { id, resolved } = body

  if (!id || typeof id !== 'string' || typeof resolved !== 'boolean') {
    return errors.badRequest(event, 'id and a boolean resolved are required.')
  }

  try {
    const docClient = await getFeedbackClient()

    const cmd = new UpdateCommand({
      TableName: FEEDBACK_TABLE,
      Key: { id },
      // Without the condition an unknown id would create a new, empty item
      ConditionExpression: 'attribute_exists(id)',
      UpdateExpression: 'SET resolved = :r',
      ExpressionAttributeValues: {
        ':r': resolved
      },
      ReturnValues: 'UPDATED_NEW'
    })

    await docClient.send(cmd)

    const metadata = { responseTimeMs: Date.now() - startTime }
    return sendSuccess(event, id, metadata)
  } catch (err) {
    if ((err as any)?.name === 'ConditionalCheckFailedException') {
      return errors.notFound(event, 'Feedback item')
    }
    logger.error('Error updating feedback:', err)
    return errors.serverError(event, 'Failed to update feedback.')
  }
})
