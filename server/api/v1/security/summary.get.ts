import { defineEventHandler, getQuery } from 'h3'
import legacyHandler from '../../security/org-summary.get'
import { requireScope } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import { sendSuccess } from '../../../utils/api-response'
import { integrationAccountParameters, resolveIntegrationAccountScope } from '../../../utils/integration-account-scope'
import { getSecurityHubFindingsSummary } from '../../../utils/security-hub-data'

registerEndpoint('/api/v1/security/summary', 'GET', {
  summary: 'Get organization or selected-account security summary',
  description: 'Returns the organization summary by default, or a Security Hub aggregate for accounts resolved through canonical account selectors.',
  tags: ['Security'],
  security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
  parameters: integrationAccountParameters,
  responses: {
    200: { description: 'Security summary' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(async (event) => {
  await requireScope(event, 'security:read')
  const accountScope = await resolveIntegrationAccountScope(event, getQuery(event))
  if (!accountScope) return legacyHandler(event)

  const summary = await getSecurityHubFindingsSummary(accountScope.commercialAccountIds)
  return sendSuccess(event, summary, {
    scope: 'selected-accounts',
    accounts: accountScope.commercialAccountIds
  })
})
