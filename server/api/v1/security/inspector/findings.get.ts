import { createError, getQuery } from 'h3'
import { requireScope } from '../../../../middleware/entra-auth'
import { registerEndpoint } from '../../../../plugins/swagger'
import { sendSuccess } from '../../../../utils/api-response'
import { queryInspectorApi } from '../../../../utils/inspector-api'
import { resolveIntegrationAccountScope } from '../../../../utils/integration-account-scope'
import { inspectorParameters, parseInspectorQuery } from '../../../../utils/security-api-parameters'
import { withV1Errors } from '../../../../utils/v1-errors'

registerEndpoint('/api/v1/security/inspector/findings', 'GET', {
  summary: 'List Amazon Inspector findings',
  description: 'Lists current or historical Inspector findings with provider-side filters and globally stable account/region sorting. Cursors are forward-only and do not provide snapshot isolation while AWS findings change. At least one of accountIdentifiers, adminOf, or ownedBy is required. Inspector defaults to all ACTIVE findings with no date restriction. Exact totals are returned only for filters supported by Inspector account aggregation.',
  tags: ['Security'],
  security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
  parameters: inspectorParameters,
  responses: {
    200: {
      description: 'A cursor page of normalized Inspector findings.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: { $ref: '#/components/schemas/NormalizedInspectorFinding' }
              },
              metadata: {
                type: 'object',
                properties: {
                  pagination: { $ref: '#/components/schemas/PaginationInfo' },
                  accounts: { type: 'array', items: { type: 'string' } },
                  environment: { $ref: '#/components/schemas/AWSEnvironment' },
                  errors: { type: 'array', items: { $ref: '#/components/schemas/SecurityAccountError' } }
                }
              }
            }
          },
          examples: {
            historicalClosed: {
              summary: 'Historical closed findings',
              value: { success: true, data: [], metadata: { pagination: { limit: 100, returned: 0, hasMore: false, nextCursor: null, total: null, totalIsExact: false }, environment: 'govcloud' } }
            },
            dateFiltered: {
              summary: 'Inclusive date range',
              value: { success: true, data: [], metadata: { pagination: { limit: 100, returned: 0, hasMore: false, nextCursor: null, total: null, totalIsExact: false } } }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' },
    502: { $ref: '#/components/schemas/Error' }
  }
})

export default withV1Errors(async (event) => {
  await requireScope(event, 'security:read')
  const rawQuery = getQuery(event)
  const query = parseInspectorQuery(rawQuery)
  const accountScope = await resolveIntegrationAccountScope(event, rawQuery, { required: true })
  const accountIds = query.environment === 'commercial'
    ? accountScope!.commercialAccountIds
    : accountScope!.govCloudAccountIds
  if (accountIds.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Inspector queries are limited to 50 resolved accounts.' })
  }
  const result = await queryInspectorApi(accountScope!.accounts, query)
  return sendSuccess(event, result.records, {
    pagination: result.pagination,
    accounts: result.accounts,
    environment: result.environment,
    errors: result.errors
  })
})
