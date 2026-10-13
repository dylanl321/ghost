import { defineEventHandler, getQuery } from 'h3'
import { requireScope } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import { sendSuccess } from '../../../utils/api-response'
import { getVmaasCostReport, VMAAS_ACCOUNT_ID } from '../../../utils/vmaas-costs'

registerEndpoint('/api/integrations/vmaas/costs', 'GET', {
  summary: 'Get VMaaS fleet costs',
  description: `Returns actuals and projections for the fixed GovCloud VMaaS account ${VMAAS_ACCOUNT_ID}.`,
  tags: ['Integrations'],
  responses: { 200: { description: 'VMaaS fleet costs' }, 403: { description: 'Missing VMaaS cost scope' } }
})

export default defineEventHandler(async event => {
  await requireScope(event, 'vmaas:costs:read')
  const month = String(getQuery(event).month || '') || undefined
  return sendSuccess(event, await getVmaasCostReport(month))
})
