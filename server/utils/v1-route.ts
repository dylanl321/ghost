import type { EventHandler, H3Event } from 'h3'
import { defineEventHandler } from 'h3'
import { requireScope } from '../middleware/entra-auth'
import { registerEndpoint } from '../plugins/swagger'
import { integrationAccountParameters, resolveIntegrationAccountScope } from './integration-account-scope'

export function defineV1Alias(
  path: string,
  scope: string,
  summary: string,
  legacyHandler: EventHandler,
  parameters: any[] = [],
  accountScoped = false
) {
  const tag = path.includes('/costs/')
    ? 'Costs'
    : path.includes('/forecasts/')
      ? 'Forecasts'
      : path.includes('/security/')
        ? 'Security'
        : 'Accounts'
  registerEndpoint(path, 'GET', {
    summary,
    description: 'Supported GHOST integration API.',
    tags: [tag],
    security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
    parameters: accountScoped ? [...integrationAccountParameters, ...parameters] : parameters,
    responses: {
      200: { description: 'Successful response' },
      400: { $ref: '#/components/schemas/Error' },
      401: { $ref: '#/components/schemas/Error' },
      403: { $ref: '#/components/schemas/Error' },
      500: { $ref: '#/components/schemas/Error' }
    }
  })

  return defineEventHandler(async (event: H3Event) => {
    await requireScope(event, scope)
    if (accountScoped) {
      const url = new URL(event.node.req.url || path, 'http://localhost')
      const accountScope = await resolveIntegrationAccountScope(event, Object.fromEntries(url.searchParams))
      if (accountScope) {
        url.searchParams.set('accountIds', accountScope.commercialAccountIds.join(','))
        url.searchParams.delete('accountIdentifiers')
        url.searchParams.delete('adminOf')
        url.searchParams.delete('ownedBy')
        event.node.req.url = `${url.pathname}${url.search}`
      }
    }
    return legacyHandler(event)
  })
}
