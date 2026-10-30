import { getQuery } from 'h3'
import legacyHandler from '../../accounts/list.get'
import { requireScope } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import { integrationAccountParameters, resolveIntegrationAccountScope } from '../../../utils/integration-account-scope'
import { withV1Errors } from '../../../utils/v1-errors'

registerEndpoint('/api/v1/accounts', 'GET', {
  summary: 'List AWS accounts',
  description: 'Supported GHOST integration API with canonical account and person-based selectors.',
  tags: ['Accounts'],
  security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
  parameters: integrationAccountParameters,
  responses: { 200: { description: 'AWS accounts' }, 403: { $ref: '#/components/schemas/Error' } }
})

export default withV1Errors(async (event) => {
  await requireScope(event, 'accounts:read')
  const scope = await resolveIntegrationAccountScope(event, getQuery(event))
  const response: any = await legacyHandler(event)
  if (!scope || !response?.success || !Array.isArray(response.data)) return response

  const allowed = new Set([...scope.commercialAccountIds, ...scope.govCloudAccountIds])
  response.data = response.data.filter((account: any) =>
    allowed.has(account.accountId || account.id || account.awsStandardAccountID) ||
    allowed.has(account.govCloudAccountId || account.govId || account.awsGovCloudAccountID)
  )
  if (response.metadata) response.metadata.count = response.data.length
  return response
})
