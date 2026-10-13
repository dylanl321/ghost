import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getBudgetAlertRecipientView } from '../../../../utils/budget-alert-recipient-service'

export default defineEventHandler(async (event) => {
  const accountId = getRouterParam(event, 'accountId')
  if (!accountId || !/^\d{12}$/.test(accountId)) {
    throw createError({ statusCode: 400, message: 'A valid 12-digit AWS account ID is required' })
  }

  if (process.env.DEV_AUTH_ENABLED === 'true' && process.env.DEV_MOCK_BUDGET_RECIPIENTS === 'true') {
    return {
      success: true,
      data: {
        accountId,
        canManage: true,
        defaultRecipients: [
          { email: 'primary.admin@gd-ms.com', role: 'Primary account admin', source: 'PEP', note: 'Default recipient for applicable alerts' },
          { email: 'cost.manager@gd-ms.com', role: 'Cost manager', source: 'PEP', note: 'PEP role used by the budget-alert recipient rules' }
        ],
        manualRecipients: [
          { email: 'manual.user@gd-ms.com', addedBy: 'garrett.hutson@gd-ms.com', addedAt: '2026-08-06T12:00:00.000Z', auditable: true }
        ]
      }
    }
  }

  return {
    success: true,
    data: await getBudgetAlertRecipientView(event, accountId)
  }
})
