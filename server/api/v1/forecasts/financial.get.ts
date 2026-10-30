import { createError, getQuery } from 'h3'
import { requireScope } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import { sendSuccess } from '../../../utils/api-response'
import { queryItems, scanItems } from '../../../utils/dynamodb'
import { integrationAccountParameters, resolveIntegrationAccountScope } from '../../../utils/integration-account-scope'
import { withV1Errors } from '../../../utils/v1-errors'

// Uploaded Finance forecasts (Settings > Forecast upload) live in GovCloud.
const FORECAST_TABLE = 'ghost-dashboard-forecast-data'
const FORECAST_ENVIRONMENT = 'govcloud'
const MAX_RECORDS = 10_000
const INTERNAL_ATTRIBUTES = new Set(['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'])
const PERIOD_PATTERN = /^\d{4}-\d{2}$/

registerEndpoint('/api/v1/forecasts/financial', 'GET', {
  summary: 'Get GHOST financial forecasts',
  description: 'Returns the monthly Finance forecast uploaded to GHOST for each account (one record per account per upload). Selecting accounts matches either their commercial or GovCloud ID. Without selectors, every forecast record is returned. Use period to keep only records with a forecast for that month; `forecasts` stays keyed exactly as uploaded.',
  tags: ['Forecasts'],
  security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
  parameters: [
    ...integrationAccountParameters,
    {
      name: 'status',
      in: 'query',
      required: false,
      schema: { type: 'string', example: 'active' },
      description: 'Only records with this status. Uploads are stored as active.'
    },
    {
      name: 'period',
      in: 'query',
      required: false,
      schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$', example: '2026-11' },
      description: 'Only records with a forecast amount for this month (YYYY-MM).'
    }
  ],
  responses: {
    200: {
      description: 'Forecast records and how many were returned.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    accountId: { type: 'string', description: 'Account the forecast was uploaded for (commercial ID when known).' },
                    accountName: { type: 'string' },
                    comAccountId: { type: 'string', nullable: true },
                    govAccountId: { type: 'string', nullable: true },
                    enclaveId: { type: 'string' },
                    projectType: { type: 'string' },
                    lob: { type: 'string' },
                    deptNumber: { type: 'string' },
                    projNumber: { type: 'string' },
                    taskNumber: { type: 'string' },
                    forecasts: { type: 'object', additionalProperties: { type: 'number' }, description: 'Monthly amounts keyed by period.' },
                    totalAmount: { type: 'number' },
                    status: { type: 'string' },
                    source: { type: 'string' },
                    uploadedAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  count: { type: 'integer' },
                  scope: { type: 'string', enum: ['organization', 'selected-accounts'] },
                  truncated: { type: 'boolean', description: `True when more than ${MAX_RECORDS} records matched.` }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' },
    503: { $ref: '#/components/schemas/Error' }
  }
})

function forecastHasPeriod(forecasts: unknown, period: string): boolean {
  if (!forecasts || typeof forecasts !== 'object') return false
  return Object.keys(forecasts).some(key => key === period || key.startsWith(`${period}-`))
}

function toPublicRecord(item: Record<string, any>) {
  return Object.fromEntries(Object.entries(item).filter(([key]) => !INTERNAL_ATTRIBUTES.has(key)))
}

async function readAll(read: (nextToken?: string) => Promise<{ items: any[], nextToken?: string }>) {
  const items: any[] = []
  let nextToken: string | undefined
  do {
    const page = await read(nextToken)
    items.push(...page.items)
    nextToken = page.nextToken
  } while (nextToken && items.length <= MAX_RECORDS)
  return { items: items.slice(0, MAX_RECORDS), truncated: items.length > MAX_RECORDS || Boolean(nextToken) }
}

export default withV1Errors(async (event) => {
  await requireScope(event, 'forecast:read')
  const query = getQuery(event)
  const status = typeof query.status === 'string' && query.status.trim() ? query.status.trim() : undefined
  const period = typeof query.period === 'string' && query.period.trim() ? query.period.trim() : undefined
  if (period && !PERIOD_PATTERN.test(period)) {
    throw createError({ statusCode: 400, statusMessage: 'period must be YYYY-MM.' })
  }

  const scope = await resolveIntegrationAccountScope(event, query)
  let result: { items: any[], truncated: boolean }
  if (scope) {
    // Uploads key each record by its commercial ID, or the GovCloud ID when an
    // account has no commercial ID, so look up both.
    const ids = [...new Set([...scope.commercialAccountIds, ...scope.govCloudAccountIds])]
    const perAccount = await Promise.all(ids.map(id => readAll(nextToken => queryItems({
      tableName: FORECAST_TABLE,
      queryExpression: 'PK = :pk',
      expressionAttributeValues: { ':pk': `FORECAST#${id}` },
      nextToken
    }, FORECAST_ENVIRONMENT))))
    const byId = new Map(perAccount.flatMap(page => page.items).map(item => [item.id, item]))
    result = { items: [...byId.values()], truncated: perAccount.some(page => page.truncated) }
  } else {
    result = await readAll(nextToken => scanItems(FORECAST_TABLE, undefined, 1000, nextToken, FORECAST_ENVIRONMENT))
  }

  const records = result.items
    .filter(item => !status || item.status === status)
    .filter(item => !period || forecastHasPeriod(item.forecasts, period))
    .sort((left, right) => String(left.accountId).localeCompare(String(right.accountId)))
    .map(toPublicRecord)

  return sendSuccess(event, records, {
    count: records.length,
    scope: scope ? 'selected-accounts' : 'organization',
    ...(scope ? { accounts: scope.accounts.map(account => account.accountId || account.govCloudAccountId) } : {}),
    truncated: result.truncated
  })
})
