import { defineEventHandler, getQuery } from 'h3'
import type { SecurityHubDatasetFilters } from '../../../../shared/types/dataset-reports'
import { requireScope } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import { sendSuccess } from '../../../utils/api-response'
import { querySecurityHubFindings } from '../../../utils/security-hub-data'
import { integrationAccountParameters, resolveIntegrationAccountScope } from '../../../utils/integration-account-scope'

registerEndpoint('/api/v1/security/findings', 'GET', {
  summary: 'List Security Hub findings',
  description: 'Returns bounded pages of normalized findings or raw AWS Security Finding Format (ASFF).',
  tags: ['Integrations v1'],
  security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
  parameters: [
    ...integrationAccountParameters,
    { name: 'severity', in: 'query', schema: { type: 'string' }, description: 'Comma-separated severity labels' },
    { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Comma-separated workflow statuses' },
    { name: 'product', in: 'query', schema: { type: 'string' }, description: 'Comma-separated product names' },
    { name: 'region', in: 'query', schema: { type: 'string' }, description: 'Comma-separated AWS regions' },
    { name: 'resourceId', in: 'query', schema: { type: 'string' } },
    { name: 'instanceIds', in: 'query', schema: { type: 'string' }, description: 'Comma-separated EC2 instance IDs' },
    { name: 'findingIds', in: 'query', schema: { type: 'string' }, description: 'Comma-separated ASFF finding IDs' },
    { name: 'lookbackDays', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 365, default: 30 } },
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
    { name: 'format', in: 'query', schema: { type: 'string', enum: ['normalized', 'asff'], default: 'normalized' } }
  ],
  responses: {
    200: { description: 'A page of Security Hub findings' },
    400: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

const split = (value: unknown) => typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : undefined

export default defineEventHandler(async (event) => {
  await requireScope(event, 'security:read')
  const query = getQuery(event)
  const page = Math.min(20, Math.max(1, Number(query.page) || 1))
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  const format = query.format === 'asff' ? 'asff' : 'normalized'
  const filters: SecurityHubDatasetFilters = {
    severities: split(query.severity) as SecurityHubDatasetFilters['severities'],
    statuses: split(query.status) as SecurityHubDatasetFilters['statuses'],
    products: split(query.product),
    regions: split(query.region),
    resourceId: typeof query.resourceId === 'string' ? query.resourceId : undefined,
    resourceIds: split(query.instanceIds),
    findingIds: split(query.findingIds),
    lookbackDays: Math.min(365, Math.max(1, Number(query.lookbackDays) || 30)),
    activeOnly: query.activeOnly !== 'false'
  }

  const accountScope = await resolveIntegrationAccountScope(event, query)
  const result = await querySecurityHubFindings(accountScope?.commercialAccountIds || [], filters, {
    limit: page * limit + 1,
    format
  })
  const start = (page - 1) * limit
  const records = result.records.slice(start, start + limit)
  return sendSuccess(event, records, {
    pagination: {
      page,
      limit,
      hasMore: result.records.length > start + limit || result.hasMore
    },
    format
  })
})
