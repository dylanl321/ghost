import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { collectAIUsage } from '../../../utils/ai-usage-collector'
import { errors, sendSuccess } from '../../../utils/api-response'
import { claimExecutionLock, releaseExecutionLock } from '../../../utils/execution-locks'
import { logger } from '../../../utils/logger'
import { requireAdmin } from '../../../utils/user-roles'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const body = await readBody<{ backfillDays?: number }>(event)
  const backfillDays = Math.min(400, Math.max(1, Number(body?.backfillDays) || 3))
  const hourKey = new Date().toISOString().substring(0, 13)
  const locked = await claimExecutionLock('ai-usage-collector', hourKey)
  if (!locked) return errors.conflict(event, 'AI usage collection is already running')

  void collectAIUsage({ backfillDays })
    .catch(error => logger.error('[AI Usage] Manual collection failed:', error))
    .finally(() => releaseExecutionLock('ai-usage-collector', hourKey).catch(() => {}))

  const response = sendSuccess(event, { accepted: true, backfillDays })
  setResponseStatus(event, 202)
  return response
})
