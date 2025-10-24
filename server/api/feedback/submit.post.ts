import { sendSuccess, errors } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { logger } from '../../utils/logger'

const region = 'us-gov-west-1'
const deploymentAccountId = '461760157232'
const tableName = 'ghost_feedback'

// Register OpenAPI documentation
registerEndpoint('/api/feedback/submit', 'POST', {
  summary: 'Submit feedback',
  description: 'Adds a new issue report or feature request to the `ghost_feedback` DynamoDB table in the GHOST deployment account.',
  tags: ['Feedback'],

  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['type', 'description', 'reporter_email'],
          properties: {
            type: {
              type: 'string',
              enum: ['Issue', 'Feature Request'],
              description: 'Type of feedback being reported.'
            },
            description: {
              type: 'string',
              description: 'Detailed description of the issue or feature request.'
            },
            reporter_email: {
              type: 'string',
              format: 'email',
              description: 'Email address of the user submitting the report.'
            }
          }
        }
      }
    }
  },

  responses: {
    200: {
      description: 'Issue successfully recorded in DynamoDB.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              id: {
                type: 'string',
                example: '1728394729374',
                description: 'Unique ID of the created issue record.'
              }
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

  const body = await readBody<{
    type: 'Issue' | 'Feature Request'
    description: string
    reporter_email: string
  }>(event)

  const { type, description, reporter_email } = body

  // Basic validation
  if (!type || !description || !reporter_email) {
    return errors.serverError(event, 'Missing fields.')
  }

  try {
    const now = new Date()
    const date_utc = now.toISOString().split('T')[0]
    const time_utc = now.toISOString().split('T')[1].slice(0, 5)

    const creds = await assumeChildAccountRole('govcloud', deploymentAccountId)

    const ddbClient = new DynamoDBClient({
      region,
      credentials: creds
    })

    const docClient = DynamoDBDocumentClient.from(ddbClient)

    logger.info("Host:", event.node.req.headers.host)
    let environment = 'prod'
    if (event.node.req.headers.host?.includes('dev')) {
      environment = 'dev'
    } else if (event.node.req.headers.host?.includes('localhost')) {
      environment = 'local'
    }

    const item = {
      id: Date.now().toString(),
      type,
      description,
      reporter_email,
      resolved: false,
      environment,
      date_utc,
      time_utc
    }

    const cmd = new PutCommand({
      TableName: tableName,
      Item: item
    })

    await docClient.send(cmd)

    const metadata = { responseTimeMs: Date.now() - startTime }
    
    return sendSuccess(event, item.id, metadata)
  } catch (err) {
    logger.error('Error submitting feedback:', err)
    return errors.serverError(event, 'Failed to store feedback')
  }
})