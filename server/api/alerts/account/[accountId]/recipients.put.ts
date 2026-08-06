import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { updateBudgetAlertRecipient } from '../../../../utils/budget-alert-recipient-service'

interface RecipientUpdateRequest {
  action: 'add' | 'remove'
  email: string
}

export default defineEventHandler(async (event) => {
  const accountId = getRouterParam(event, 'accountId')
  if (!accountId || !/^\d{12}$/.test(accountId)) {
    throw createError({ statusCode: 400, message: 'A valid 12-digit AWS account ID is required' })
  }

  const body = await readBody<RecipientUpdateRequest>(event)
  if (!body || !['add', 'remove'].includes(body.action) || typeof body.email !== 'string') {
    throw createError({ statusCode: 400, message: 'Action and email are required' })
  }

  return {
    success: true,
    data: await updateBudgetAlertRecipient(event, accountId, body.action, body.email),
    message: body.action === 'add' ? 'Recipient added' : 'Recipient removed'
  }
})
