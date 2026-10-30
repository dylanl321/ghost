import { getQuery } from 'h3'
import { requireScope } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import { sendSuccess } from '../../../utils/api-response'
import { querySecurityHubApi } from '../../../utils/security-hub-api'
import { parseSecurityHubQuery, securityHubParameters } from '../../../utils/security-api-parameters'
import { hasIntegrationAccountSelector, resolveIntegrationAccountScope } from '../../../utils/integration-account-scope'
import { withV1Errors } from '../../../utils/v1-errors'

registerEndpoint('/api/v1/security/findings', 'GET', {
  summary: 'List Security Hub findings',
  description: 'Lists current or historical Security Hub findings across an optional organization-wide or selected-account scope. Results are globally sorted across account/region streams. Cursors are forward-only and do not provide snapshot isolation while AWS findings change. Security Hub does not expose an exact GetFindings total, so total is null. The default date range is the last 30 days by firstObservedAt.',
  tags: ['Security'],
  security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
  parameters: securityHubParameters,
  responses: {
    200: {
      description: 'A cursor page of normalized findings or raw ASFF records.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  oneOf: [
                    { $ref: '#/components/schemas/NormalizedSecurityHubFinding' },
                    { type: 'object', description: 'Raw AWS Security Finding Format when format=asff.', additionalProperties: true }
                  ]
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  pagination: { $ref: '#/components/schemas/PaginationInfo' },
                  format: { type: 'string', enum: ['normalized', 'asff'] },
                  accounts: { type: 'array', items: { type: 'string' } },
                  environment: { $ref: '#/components/schemas/AWSEnvironment' },
                  errors: { type: 'array', items: { $ref: '#/components/schemas/SecurityAccountError' } }
                }
              }
            }
          },
          examples: {
            multiAccount: {
              summary: 'Globally sorted selected-account findings',
              value: { success: true, data: [], metadata: { pagination: { limit: 100, returned: 0, hasMore: false, nextCursor: null, total: null, totalIsExact: false }, format: 'normalized', errors: [] } }
            },
            missingGovCloudAccount: {
              summary: 'Selected account missing a GovCloud ID',
              value: {
                success: true,
                data: [],
                metadata: {
                  pagination: { limit: 100, returned: 0, hasMore: false, nextCursor: null, total: null, totalIsExact: false },
                  errors: [{
                    code: 'MISSING_ENVIRONMENT_ACCOUNT_ID',
                    environment: 'govcloud',
                    account: { accountId: '111111111111', accountName: 'Example Commercial Account' },
                    message: 'Example Commercial Account does not have a govcloud account ID.'
                  }]
                }
              }
            },
            rawAsff: {
              summary: 'Raw AWS Security Finding Format',
              value: { success: true, data: [{ SchemaVersion: '2018-10-08', Id: 'example-finding' }], metadata: { format: 'asff' } }
            },
            nextCursor: {
              summary: 'Follow nextCursor',
              value: { success: true, data: [], metadata: { pagination: { limit: 100, returned: 100, hasMore: true, nextCursor: 'opaque.signed-cursor', total: null, totalIsExact: false } } }
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
  const query = parseSecurityHubQuery(rawQuery)
  const accountScope = await resolveIntegrationAccountScope(event, rawQuery, {
    required: hasIntegrationAccountSelector(rawQuery)
  })
  const ghostRequestId = typeof event.context.requestId === 'string' ? event.context.requestId : undefined
  const result = await querySecurityHubApi(accountScope?.accounts, query, { requestId: ghostRequestId })
  return sendSuccess(event, result.records, {
    pagination: result.pagination,
    format: result.format,
    accounts: result.accounts,
    environment: result.environment,
    errors: result.errors
  })
})
