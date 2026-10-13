/**
 * GET /api/admin/oauth/diagnostics/:id
 *
 * Returns the current safe state of a durable diagnostic job for the current
 * deployment so the panel can poll it to a terminal state (design "Proposed API
 * contract" — `GET /diagnostics/:id`; the UI polls visible jobs every two
 * seconds). Requirements 11.1, 11.5, 17.6.
 *
 * Capability: `oauth.operations.manage`. The deployment is server-derived, so a
 * guessed job id from another deployment cannot be read. A missing/unknown job
 * id yields a typed 404.
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { oauthAdminErrors, requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { OAuthDiagnosticService } from '../../../../mcp/oauth/admin/diagnostic-service'
import { getOAuthAdminRepository } from '../../../../mcp/oauth/admin/index'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import { oauthDetailResponses } from '../_shared'

registerEndpoint('/api/admin/oauth/diagnostics/{id}', 'GET', {
  summary: 'Poll a diagnostic job',
  description:
    'Returns the current safe state of a durable diagnostic job (state, per-check safe results, cancellation flag, deadline, observation/verification time). Capability: oauth.operations.manage. The deployment is server-derived; a guessed id from another deployment cannot be read. A guessed or unknown job id returns 404. Cache-Control: no-store. Sensitive-field exclusions: per-check results carry only bounded safe summaries, never raw response bodies.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Opaque diagnostic job id.' }],
  responses: oauthDetailResponses('The current safe diagnostic job state.')
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.OPERATIONS_MANAGE)
  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw oauthAdminErrors.notFound({ message: 'Diagnostic job not found in this deployment.' })
  const service = new OAuthDiagnosticService(getOAuthAdminRepository())
  const job = await service.get(access, jobId)
  if (!job) throw oauthAdminErrors.notFound({ message: 'Diagnostic job not found in this deployment.' })
  return sendSuccess(event, job, { deployment: access.deployment.environment })
}))
