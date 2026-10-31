/**
 * GET /api/security/org-summary
 * Organization-level security health summary across all accounts.
 *
 * Three-tier data access:
 *   L1: in-memory cache (5 min TTL)
 *   L2: DynamoDB pre-computed summary (36 hr TTL, populated by nightly job)
 *   L3: Athena on-demand computation (rare, first load before nightly job runs)
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { getOrgSecuritySummary } from '../../utils/security-summary-store'
import { registerEndpoint } from '../../plugins/swagger'

registerEndpoint('/api/security/org-summary', 'GET', {
  summary: 'Get organization security health summary',
  description: 'Aggregated Security Hub findings across all accounts with per-account risk ranking. Uses DynamoDB-cached data pre-computed nightly via Athena.',
  tags: ['Security'],
  responses: {
    200: {
      description: 'Organization security summary',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' }
            }
          }
        }
      }
    },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const { summary } = await getOrgSecuritySummary()
  return sendSuccess(event, summary)
}))
