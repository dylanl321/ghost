import { sendSuccess, errors } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import { logger } from '../../utils/logger'

const region = 'us-gov-west-1'
const deploymentAccountId = '461760157232'
const tableName = 'ghost_feedback'

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
  const startTime = Date.now()
  const body = await readBody<{ id: string; resolved: boolean }>(event)
  const { id, resolved } = body

  if (!id || typeof resolved !== 'boolean') {
    return errors.serverError(event, 'Missing or invalid fields.')
  }

  try {
    const creds = await assumeChildAccountRole('govcloud', deploymentAccountId)

    const ddbClient = new DynamoDBClient({
      region,
      credentials: creds
    })

    const docClient = DynamoDBDocumentClient.from(ddbClient)

    const cmd = new UpdateCommand({
      TableName: tableName,
      Key: { id },
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
    logger.error('Error updating feedback:', err)
    return errors.serverError(event, 'Failed to update feedback.')
  }
})
