import { defineEventHandler, readBody } from 'h3'
import { collectAIUsage } from '../../utils/ai-usage-collector'
import { sendSuccess } from '../../utils/api-response'
import { requireAdmin } from '../../utils/user-roles'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const body = await readBody<{ backfillDays?: number }>(event)
  const result = await collectAIUsage({ backfillDays: body?.backfillDays })
  return sendSuccess(event, result)
})
