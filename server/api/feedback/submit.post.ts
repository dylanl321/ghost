import { sendSuccess, errors } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { logger } from '../../utils/logger'
import { sendAdminNotification, NotificationType } from '../../utils/admin-notifications'
import { sendUserNotification } from '../../utils/notification-service'

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
              enum: ['Issue', 'Feature Request', 'General Feedback'],
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
            },
            source: {
              type: 'string',
              enum: ['mcp-connections'],
              description: 'Optional product surface that opened the feedback form.'
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
    type: 'Issue' | 'Feature Request' | 'General Feedback'
    description: string
    reporter_email: string
    source?: 'mcp-connections'
  }>(event)

  const { type, description, reporter_email, source } = body

  // Basic validation
  if (!type || !description || !reporter_email) {
    return errors.serverError(event, 'Missing fields.')
  }
  if (source && source !== 'mcp-connections') {
    return errors.badRequest(event, 'Invalid feedback source.')
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
      ...(source ? { source } : {}),
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

    // Send admin notification (don't fail the request if notification fails)
    try {
      await sendAdminNotification({
        type: NotificationType.FEEDBACK,
        subject: `[GHOST Feedback] New ${type} from ${environment}`,
        data: {
          ...item,
          timestamp: now.toISOString()
        },
        metadata: {
          trigger: 'feedback_submission',
          environment,
          submittedAt: now.toISOString()
        }
      })
    } catch (notificationError: any) {
      // Log error but don't fail the feedback submission
      logger.error('Failed to send admin notification for feedback:', notificationError)
    }

    // Send confirmation notification to the user
    sendUserNotification({
      userId: reporter_email,
      category: 'SYSTEM',
      title: 'Feedback received',
      body: `Your ${type.toLowerCase()} has been submitted. Thank you!`,
      severity: 'info'
    }).catch(() => {})

    const metadata = { responseTimeMs: Date.now() - startTime }

    return sendSuccess(event, item.id, metadata)
  } catch (err) {
    logger.error('Error submitting feedback:', err)
    return errors.serverError(event, 'Failed to store feedback')
  }
})
