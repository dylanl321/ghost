import { createError, defineEventHandler, getQuery } from 'h3'
import { requireScope } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import { sendSuccess } from '../../../utils/api-response'
import { buildSecuritySummaryViaAthena } from '../../../utils/security-hub-athena'
import { getSecurityHubFindingsSummary } from '../../../utils/security-hub-data'
import {
  hasIntegrationAccountSelector,
  integrationAccountParameters,
  resolveIntegrationAccountScope
} from '../../../utils/integration-account-scope'
import { sanitizeProviderError } from '../../../utils/security-api-pagination'

registerEndpoint('/api/v1/security/summary', 'GET', {
  summary: 'Get organization or selected-account security summary',
  description: 'Returns the same summary envelope for organization-wide and selected-account requests. Organization scope uses exact Athena aggregation when available. A provider fallback is explicitly marked as partial with totalIsExact=false and truncated=true.',
  tags: ['Security'],
  security: [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
  parameters: integrationAccountParameters,
  responses: {
    200: {
      description: 'Security summary with source, asOf, totalIsExact, and truncated metadata.',
      content: {
        'application/json': {
          example: {
            success: true,
            data: { totalFindings: 1250, findingsBySeverity: { CRITICAL: 10, HIGH: 80 } },
            metadata: { scope: 'organization', source: 'athena', asOf: '2026-09-03T12:00:00.000Z', totalIsExact: true, truncated: false }
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

export default defineEventHandler(async (event) => {
  await requireScope(event, 'security:read')
  const query = getQuery(event)
  const accountScope = await resolveIntegrationAccountScope(event, query, {
    required: hasIntegrationAccountSelector(query)
  })
  const asOf = new Date().toISOString()

  if (!accountScope) {
    try {
      const summary = await buildSecuritySummaryViaAthena(undefined, { allowFallback: false })
      return sendSuccess(event, summary, {
        scope: 'organization',
        source: 'athena',
        asOf: summary.lastUpdated || asOf,
        totalIsExact: true,
        truncated: false
      })
    } catch {
      try {
        const partial = await getSecurityHubFindingsSummary([])
        return sendSuccess(event, {
          totalFindings: partial.totalFindings,
          severityBreakdown: partial.findingsBySeverity,
          findingsByStatus: partial.findingsByStatus,
          findingsByProduct: partial.findingsByProduct,
          findingsByResourceType: partial.findingsByResourceType,
          lastUpdated: asOf
        }, {
          scope: 'organization',
          source: 'securityhub-partial-fallback',
          asOf,
          totalIsExact: false,
          truncated: true
        })
      } catch (error) {
        sanitizeProviderError('AWS Security Hub', error)
      }
    }
  }

  try {
    const environment = (process.env.AWS_SECURITYHUB_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
    const environmentIds = environment === 'commercial'
      ? accountScope.commercialAccountIds
      : accountScope.govCloudAccountIds
    if (environmentIds.length !== accountScope.accounts.length) {
      throw createError({
        statusCode: 400,
        statusMessage: `Every selected account must have a ${environment} account ID.`
      })
    }
    const partial = await getSecurityHubFindingsSummary(accountScope.commercialAccountIds)
    return sendSuccess(event, {
      totalFindings: partial.totalFindings,
      severityBreakdown: partial.findingsBySeverity,
      findingsByStatus: partial.findingsByStatus,
      findingsByProduct: partial.findingsByProduct,
      findingsByResourceType: partial.findingsByResourceType,
      lastUpdated: asOf
    }, {
      scope: 'selected-accounts',
      accounts: accountScope.commercialAccountIds,
      source: 'securityhub-partial-fallback',
      asOf,
      totalIsExact: false,
      truncated: true
    })
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 400) throw error
    sanitizeProviderError('AWS Security Hub', error)
  }
})
