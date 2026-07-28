import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors } from '../../utils/api-response'
import { interpretDatasetRequest } from '../../utils/dataset-report-interpreter'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    if (!event.context.auth?.isAuthenticated) return errors.unauthorized(event, 'Authentication required')
    const body = await readBody<{ prompt?: string }>(event)
    if (typeof body?.prompt !== 'string') return errors.badRequest(event, 'Prompt is required')
    if (!body.prompt.trim() || body.prompt.length > 500) return errors.badRequest(event, 'Prompt must be between 1 and 500 characters')
    return sendSuccess(event, await interpretDatasetRequest(body.prompt))
  } catch (error: any) {
    logger.error('[Dataset Interpreter] Failed', error)
    if (/bedrock|model|interpretation failed/i.test(error.message || '')) return errors.serverError(event, 'AI interpretation is temporarily unavailable')
    return errors.badRequest(event, error.message || 'Failed to interpret request')
  }
})
