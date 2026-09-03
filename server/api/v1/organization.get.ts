import { defineEventHandler, getQuery } from 'h3'
import legacyHandler from '../organization/structure.get'
import { requireScope } from '../../middleware/entra-auth'
import { registerEndpoint } from '../../plugins/swagger'
import { integrationAccountParameters, resolveIntegrationAccountScope } from '../../utils/integration-account-scope'

registerEndpoint('/api/v1/organization', 'GET', {
  summary: 'Get organization structure',
  description: 'Returns the full organization or the branches containing accounts resolved by canonical selectors.',
  tags: ['Accounts'],
  security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
  parameters: integrationAccountParameters,
  responses: { 200: { description: 'Organization structure' }, 403: { $ref: '#/components/schemas/Error' } }
})

const filterTree = (node: any, allowed: Set<string>): any | null => {
  if (!node || typeof node !== 'object') return null
  const accounts = Array.isArray(node.accounts)
    ? node.accounts.filter((account: any) =>
        allowed.has(account.accountId || account.id || account.awsStandardAccountID) ||
        allowed.has(account.govCloudAccountId || account.govId || account.awsGovCloudAccountID)
      )
    : []
  const children = Array.isArray(node.children)
    ? node.children.map((child: any) => filterTree(child, allowed)).filter(Boolean)
    : []
  return accounts.length > 0 || children.length > 0 ? { ...node, accounts, children } : null
}

export default defineEventHandler(async (event) => {
  await requireScope(event, 'accounts:read')
  const scope = await resolveIntegrationAccountScope(event, getQuery(event))
  const response: any = await legacyHandler(event)
  if (!scope || !response?.success || !response.data?.tree) return response

  const allowed = new Set([...scope.commercialAccountIds, ...scope.govCloudAccountIds])
  response.data.tree = filterTree(response.data.tree, allowed) || {
    ...response.data.tree,
    accounts: [],
    children: []
  }
  response.metadata = {
    ...response.metadata,
    scope: 'selected-accounts',
    accounts: scope.commercialAccountIds
  }
  return response
})
