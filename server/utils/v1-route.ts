import type { EventHandler, H3Event } from 'h3'
import { createError, getQuery } from 'h3'
import { requireScope } from '../middleware/entra-auth'
import { apiRegistry, registerEndpoint } from '../plugins/swagger'
import {
  getIntegrationAccountEnvironmentErrors,
  integrationAccountParameters,
  resolveIntegrationAccountScope,
  type IntegrationAccountEnvironmentError
} from './integration-account-scope'
import { withV1Errors } from './v1-errors'

interface V1AliasOptions {
  sourcePath?: string
  description?: string
  queryDefaults?: Record<string, string | boolean>
}

export function defineV1Alias(
  path: string,
  scope: string,
  summary: string,
  legacyHandler: EventHandler,
  parameters: any[] = [],
  accountScoped = false,
  options: V1AliasOptions = {}
) {
  const tag = path.includes('/costs/')
    ? 'Costs'
    : path.includes('/forecasts/')
      ? 'Forecasts'
      : path.includes('/security/')
        ? 'Security'
        : 'Accounts'
  const source = options.sourcePath ? apiRegistry.get(`GET ${options.sourcePath}`) : undefined
  if (options.sourcePath && !source) {
    throw new Error(`Missing API documentation for ${options.sourcePath}`)
  }
  const inheritedParameters = (source?.parameters || []).filter((parameter: any) =>
    !accountScoped || !['accountId', 'accountIds', 'accountIdentifiers', 'adminOf', 'ownedBy'].includes(parameter.name)
  )
  const routeParameters = [
    ...(accountScoped ? integrationAccountParameters : []),
    ...inheritedParameters,
    ...parameters
  ].map(parameter => options.queryDefaults?.[parameter.name] === undefined
    ? parameter
    : { ...parameter, schema: { ...parameter.schema, default: options.queryDefaults[parameter.name] } })

  registerEndpoint(path, 'GET', {
    summary,
    description: options.description || source?.description || 'Supported GHOST integration API.',
    tags: [tag],
    security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
    parameters: routeParameters,
    responses: {
      200: { description: 'Successful response' },
      400: { $ref: '#/components/schemas/Error' },
      401: { $ref: '#/components/schemas/Error' },
      403: { $ref: '#/components/schemas/Error' },
      500: { $ref: '#/components/schemas/Error' },
      503: { $ref: '#/components/schemas/Error' },
      ...source?.responses
    }
  })

  return withV1Errors(async (event: H3Event) => {
    await requireScope(event, scope)
    let skippedAccounts: IntegrationAccountEnvironmentError[] = []
    const url = new URL(event.path || path, 'http://localhost')
    for (const [name, value] of Object.entries(options.queryDefaults || {})) {
      if (!url.searchParams.has(name)) url.searchParams.set(name, String(value))
    }
    if (accountScoped) {
      const accountScope = await resolveIntegrationAccountScope(event, getQuery(event))
      if (accountScope) {
        // Cost Explorer uses commercial billing IDs even for paired GovCloud accounts.
        if (accountScope.commercialAccountIds.length === 0) {
          throw createError({ statusCode: 400, statusMessage: 'Selected accounts do not have commercial billing account IDs.' })
        }
        // GovCloud-only selections cannot be billed through Cost Explorer; say
        // so in the response instead of silently returning a smaller total.
        skippedAccounts = getIntegrationAccountEnvironmentErrors(accountScope.accounts, 'commercial')
        url.searchParams.set('accountIds', accountScope.commercialAccountIds.join(','))
        url.searchParams.delete('accountId')
        url.searchParams.delete('accountIdentifiers')
        url.searchParams.delete('adminOf')
        url.searchParams.delete('ownedBy')
      }
    }
    const originalUrl = event.node.req.url
    const originalPath = event._path
    // H3 reads its cached path in getQuery(), so both representations must agree.
    event._path = event.node.req.url = `${url.pathname}${url.search}`
    try {
      const result: any = await legacyHandler(event)
      if (skippedAccounts.length > 0 && result && typeof result === 'object' && result.success !== false) {
        const metadata = result.metadata || {}
        result.metadata = { ...metadata, errors: [...(metadata.errors || []), ...skippedAccounts] }
      }
      return result
    } finally {
      event.node.req.url = originalUrl
      event._path = originalPath
    }
  })
}
