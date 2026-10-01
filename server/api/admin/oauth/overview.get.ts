/**
 * GET /api/admin/oauth/overview
 *
 * Returns INDEPENDENT per-stage OAuth health observations for the current
 * deployment over a bounded recent window (design "Proposed API contract" —
 * `GET /overview`; Requirements 1.1, 1.2, 2.1, 17.5). Each observation carries
 * its source, timestamp, safe outcome, and availability/freshness/coverage;
 * missing/stale/unavailable evidence is surfaced explicitly and is never
 * reported as a healthy stage.
 *
 * Capability: `oauth.configuration.view`. The access gate applies
 * `requireAdmin`, the capability check, and `Cache-Control: no-store`.
 */

import { defineEventHandler, getQuery } from 'h3'
import { registerEndpoint } from '../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../utils/api-response'
import { requireOAuthAdminCapability, oauthAdminErrors } from '../../../mcp/oauth/admin/access-service'
import { getOAuthQueryService } from '../../../mcp/oauth/admin/query-service'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'

/**
 * The allowlisted Overview window tokens mapped to their bounded window in
 * milliseconds (Requirement 4.1). `24h` is the default when `window` is absent.
 * Any value outside this allowlist is rejected with `400 BAD_REQUEST`
 * (Requirement 4.2); the mapped ms is passed to `overview()` via
 * `OverviewOptions.windowMs`, from which the freshness horizon is derived so it
 * never exceeds the selected window (Requirement 4.3).
 */
const OVERVIEW_WINDOWS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
} as const

type OverviewWindowToken = keyof typeof OVERVIEW_WINDOWS

const OVERVIEW_WINDOW_TOKENS = Object.keys(OVERVIEW_WINDOWS) as OverviewWindowToken[]

const DEFAULT_OVERVIEW_WINDOW_TOKEN: OverviewWindowToken = '24h'

/**
 * Resolve the allowlisted `window` query value to its bounded window in ms.
 * Absent → default `24h`; any non-allowlisted value → `400 BAD_REQUEST`
 * listing the allowed values (Requirements 4.1, 4.2).
 */
function resolveWindowMs(event: Parameters<typeof getQuery>[0]): number {
  const raw = getQuery(event).window
  if (raw === undefined) {
    return OVERVIEW_WINDOWS[DEFAULT_OVERVIEW_WINDOW_TOKEN]
  }
  const token = Array.isArray(raw) ? raw[0] : raw
  if (typeof token === 'string' && Object.prototype.hasOwnProperty.call(OVERVIEW_WINDOWS, token)) {
    return OVERVIEW_WINDOWS[token as OverviewWindowToken]
  }
  throw oauthAdminErrors.badRequest({
    message: `Invalid window value. Allowed values: ${OVERVIEW_WINDOW_TOKENS.join(', ')}.`,
    data: { field: 'window', allowed: OVERVIEW_WINDOW_TOKENS }
  })
}

registerEndpoint('/api/admin/oauth/overview', 'GET', {
  summary: 'Get independent OAuth stage health observations',
  description:
    'Returns independent per-stage health observations for the current server deployment. Capability: oauth.configuration.view. Each observation includes its source, timestamp, safe outcome, next action, and availability/freshness/coverage; a succeeding stage never implies success elsewhere, and missing/stale/unavailable evidence is reported explicitly rather than as healthy or zero failures. Cache-Control: no-store. Sensitive-field exclusions: no tokens, codes, cookies, raw bodies, authorization URLs, raw exceptions, or raw network addresses are ever included.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [
    {
      name: 'window',
      in: 'query',
      required: false,
      description: 'Allowlisted observation window bounding both the recent-event window and the derived freshness horizon. Defaults to 24h when absent; any other value is rejected with 400 BAD_REQUEST.',
      schema: { type: 'string', enum: ['1h', '24h', '7d'], default: '24h' }
    }
  ],
  responses: {
    200: {
      description: 'A list of independent per-stage health observations with deployment and observation time.',
      content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { type: 'object' } } } } } }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.CONFIGURATION_VIEW)
  const windowMs = resolveWindowMs(event)
  const observations = await getOAuthQueryService().overview(access, { windowMs })
  return sendSuccess(event, observations, {
    deployment: access.deployment.environment,
    observedAt: new Date().toISOString()
  })
}))
