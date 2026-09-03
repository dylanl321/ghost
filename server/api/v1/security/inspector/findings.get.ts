import { createError, defineEventHandler, getQuery } from 'h3'
import { requireScope } from '../../../../middleware/entra-auth'
import { registerEndpoint } from '../../../../plugins/swagger'
import { sendSuccess } from '../../../../utils/api-response'
import {
  integrationAccountParameters,
  resolveIntegrationAccountScope
} from '../../../../utils/integration-account-scope'
import {
  getAccountVulnerabilities,
  type VulnerabilitySeverity
} from '../../../../utils/inspector-findings'

const split = (value: unknown): string[] =>
  typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : []

registerEndpoint('/api/v1/security/inspector/findings', 'GET', {
  summary: 'List Amazon Inspector vulnerability findings',
  description: 'Inspector-specific findings filtered by canonical account selectors, EC2 instance IDs, CVEs, finding ARNs, packages, severity, environment, and region.',
  tags: ['Security'],
  security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
  parameters: [
    ...integrationAccountParameters,
    { name: 'instanceIds', in: 'query', schema: { type: 'string' }, description: 'Comma-separated EC2 instance IDs' },
    { name: 'cveIds', in: 'query', schema: { type: 'string' }, description: 'Comma-separated CVE or vulnerability IDs' },
    { name: 'findingArns', in: 'query', schema: { type: 'string' }, description: 'Comma-separated Inspector finding ARNs' },
    { name: 'packageNames', in: 'query', schema: { type: 'string' }, description: 'Comma-separated vulnerable package names' },
    { name: 'severity', in: 'query', schema: { type: 'string' }, description: 'Comma-separated CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL, or UNTRIAGED values' },
    { name: 'environment', in: 'query', schema: { type: 'string', enum: ['commercial', 'govcloud'], default: 'govcloud' } },
    { name: 'region', in: 'query', schema: { type: 'string' } },
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }
  ],
  responses: {
    200: { description: 'A bounded page of normalized Inspector findings' },
    400: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(async (event) => {
  await requireScope(event, 'security:read')
  const query = getQuery(event)
  const accountScope = await resolveIntegrationAccountScope(event, query, { required: true })
  const environment = query.environment === 'commercial' ? 'commercial' : 'govcloud'
  const region = typeof query.region === 'string' ? query.region : undefined
  const severities = split(query.severity).map(value => value.toUpperCase()) as VulnerabilitySeverity[]
  const instanceIds = new Set(split(query.instanceIds))
  const cveIds = new Set(split(query.cveIds).map(value => value.toUpperCase()))
  const findingArns = new Set(split(query.findingArns))
  const packageNames = new Set(split(query.packageNames).map(value => value.toLowerCase()))
  const accountIds = environment === 'commercial'
    ? accountScope!.commercialAccountIds
    : accountScope!.govCloudAccountIds

  if (accountIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: `No selected accounts have a ${environment} account ID.` })
  }
  if (accountIds.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Inspector queries are limited to 50 resolved accounts.' })
  }

  const findings = []
  for (const accountId of accountIds) {
    const result = await getAccountVulnerabilities(
      accountId,
      environment,
      region,
      severities.length > 0 ? severities : undefined
    )
    findings.push(...result.findings)
  }

  const filtered = findings.filter(finding =>
    (instanceIds.size === 0 || (finding.instanceId && instanceIds.has(finding.instanceId))) &&
    (cveIds.size === 0 || finding.cveIds.some(cve => cveIds.has(cve.toUpperCase())) ||
      (finding.vulnerabilityId && cveIds.has(finding.vulnerabilityId.toUpperCase()))) &&
    (findingArns.size === 0 || findingArns.has(finding.findingArn)) &&
    (packageNames.size === 0 || (finding.packageName && packageNames.has(finding.packageName.toLowerCase())))
  )
  const page = Math.min(20, Math.max(1, Number(query.page) || 1))
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  const start = (page - 1) * limit

  return sendSuccess(event, filtered.slice(start, start + limit), {
    pagination: { page, limit, total: filtered.length, hasMore: filtered.length > start + limit },
    accounts: accountIds,
    environment
  })
})
