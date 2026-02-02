import { sendSuccess, errors } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { requireAdmin } from '../../utils/user-roles'
import { getLogs } from '../../utils/log-manager'

// Register OpenAPI documentation
registerEndpoint('/api/logging/activity-logs', 'GET', {
  summary: 'Retrieve activity logs',
  description: 'Fetches recent activity logs for the given duration.',
  tags: ['Logging'],

  parameters: [
    {
      name: 'durationInSeconds',
      in: 'query',
      required: false,
      schema: { type: 'number' },
      description: 'Time duration for which to fetch logs in seconds.'
    }
  ],

  responses: {
    200: {
      description: 'Logs successfully retrieved.',
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
                    eventId: { type: 'string', example: 'abcd1234' },
                    ingestionTime: { type: 'number', example: 1697330241000 },
                    logStreamName: { type: 'string', example: 'app-log-stream' },
                    message: { type: 'string', example: 'User logged in' },
                    timestamp: { type: 'number', example: 1697330240000 }
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
  await requireAdmin(event)
  const startTime = Date.now()

  try {
    const query = getQuery(event)
    const durationInSeconds = Number(query.durationInSeconds ?? 3600);
    const logs = await getLogs(durationInSeconds)

    const metadata = { responseTimeMs: Date.now() - startTime }
    return sendSuccess(event, logs, metadata)
  } catch (err) {
    logger.error('Error fetching activity logs:', err)
    return errors.serverError(event, 'Failed to fetch activity logs')
  }
})
