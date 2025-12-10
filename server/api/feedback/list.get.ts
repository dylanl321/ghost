import { sendSuccess, errors } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { logger } from '../../utils/logger'

const region = 'us-gov-west-1'
const deploymentAccountId = '461760157232'
const tableName = 'ghost_feedback'

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
  const startTime = Date.now()

  try {
    const creds = await assumeChildAccountRole('govcloud', deploymentAccountId)

    const ddbClient = new DynamoDBClient({
      region,
      credentials: creds
    })
    const docClient = DynamoDBDocumentClient.from(ddbClient)

    const data = await docClient.send(
      new ScanCommand({
        TableName: tableName
      })
    )

    const metadata = { responseTimeMs: Date.now() - startTime }
    return sendSuccess(event, { items: data.Items ?? [] }, metadata)
  } catch (err) {
    logger.error('Error listing feedback:', err)
    return errors.serverError(event, 'Failed to list feedback')
  }
})
