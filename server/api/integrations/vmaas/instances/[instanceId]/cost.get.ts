import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireScope } from '../../../../../middleware/entra-auth'
import { registerEndpoint } from '../../../../../plugins/swagger'
import { sendSuccess } from '../../../../../utils/api-response'
import { getVmaasInstanceCost } from '../../../../../utils/vmaas-costs'

registerEndpoint('/api/integrations/vmaas/instances/{instanceId}/cost', 'GET', {
  summary: 'Get one VMaaS server cost projection',
  description: 'Returns an on-demand projection only after fixed-account VMaaS ownership tags are verified.',
  tags: ['Integrations'],
  parameters: [{ name: 'instanceId', in: 'path', required: true, schema: { type: 'string' } }],
  responses: { 200: { description: 'VMaaS server projection' }, 404: { description: 'Managed VMaaS server not found' } }
})

export default defineEventHandler(async event => {
  await requireScope(event, 'vmaas:costs:read')
  const instanceId = getRouterParam(event, 'instanceId') || ''
  const projection = await getVmaasInstanceCost(instanceId)
  if (!projection) throw createError({ statusCode: 404, statusMessage: 'Managed VMaaS server not found' })
  return sendSuccess(event, projection)
})
