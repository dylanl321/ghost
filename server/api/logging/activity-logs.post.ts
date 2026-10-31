import { sendSuccess, errors } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getUserEmail } from '../../utils/user-roles'
import { logMessage } from '../../utils/log-manager'
import { normalizeActivityMessage } from '../../utils/activity-message'

// Register OpenAPI documentation
registerEndpoint('/api/logging/activity-logs', 'POST', {
  summary: 'Create a log entry',
  description: 'Saves a single log message.',
  tags: ['Logging'],

  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Navigation - ENV:dev USER:john, PATH:/dashboard',
            },
          },
          required: ['message'],
        },
      },
    },
  },

  responses: {
    200: {
      description: 'Log successfully created.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string', example: 'Log sent successfully' },
            },
          },
        },
      },
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' },
  },
})

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  try {
    const email = getUserEmail(event)
    if (!email) {
      return errors.unauthorized(event, 'Authentication required')
    }

    const body = await readBody<{ message?: string }>(event)
    const message = typeof body?.message === 'string' ? body.message : ''

    if (!message.trim()) {
      return errors.badRequest(event, 'Message is required')
    }

    const normalized = normalizeActivityMessage(message, email.split('@')[0] || 'UnknownUser')
    if (!normalized) {
      return errors.badRequest(event, 'Message must include a USER field')
    }

    await logMessage(normalized)

    const metadata = { responseTimeMs: Date.now() - startTime }
    return sendSuccess(event, { message: 'Log sent successfully' }, metadata)
  } catch (err) {
    logger.error('Error logging message:', err)
    return errors.serverError(event, 'Error logging message')
  }
})
