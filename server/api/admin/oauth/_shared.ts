/**
 * OAuth Administration routes — shared request parsing and Swagger helpers.
 *
 * These helpers keep every read-only `/api/admin/oauth` route consistent:
 *   - `parseOAuthListQuery(event)` reads ONLY the documented list filters from
 *     the query string and drops everything else. The query service and the
 *     repository apply the authoritative bounds (24h default, 90-day cap,
 *     `limit` cap of 100, identity-filter capability gating), so this parser is
 *     deliberately permissive on values and strict on which KEYS survive
 *     (design "Proposed API contract"; Requirements 5.1, 8.1, 17.4).
 *   - `oauthListQueryParameters` documents those same filters once for reuse in
 *     every list route's Swagger operation.
 *   - `oauthListResponses` / `oauthDetailResponses` document the shared status
 *     codes (401/403/404) and the paginated envelope using the existing
 *     `PaginationInfo` schema.
 *
 * SAFETY: The deployment and actor are NEVER parsed from the caller — they come
 * from the server-derived access context. This module only reads the
 * allowlisted filter keys, so an unknown or spoofed parameter cannot reach the
 * repository (Requirement 2.2 / 18.1).
 */

import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import type { OAuthListQuery, OAuthPageMetadata } from '#shared/types/oauth-administration'

/** Read the first value of a possibly-array query param as a trimmed string. */
function readString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === null) return undefined
  const text = String(raw).trim()
  return text.length > 0 ? text : undefined
}

/**
 * Parse the documented list filters from the request query string. Only these
 * keys are read: `from`, `to`, `clientId`, `subject`, `resource`, `outcome`,
 * `stage`, `diagnosticReference`, `limit`, `order`, `cursor`. Unknown params
 * are ignored. `limit` is coerced to a number (the service caps it at 100).
 * The query service further strips identity filters when the caller lacks the
 * activity capability, so passing `subject` here is safe.
 */
export function parseOAuthListQuery(event: H3Event): OAuthListQuery {
  const q = getQuery(event)
  const query: OAuthListQuery = {}

  const from = readString(q.from)
  const to = readString(q.to)
  const clientId = readString(q.clientId)
  const subject = readString(q.subject)
  const resource = readString(q.resource)
  const outcome = readString(q.outcome)
  const stage = readString(q.stage)
  const diagnosticReference = readString(q.diagnosticReference)
  const order = readString(q.order)
  const cursor = readString(q.cursor)
  const limitRaw = readString(q.limit)

  if (from) query.from = from
  if (to) query.to = to
  if (clientId) query.clientId = clientId
  if (subject) query.subject = subject
  if (resource) query.resource = resource
  // Outcome/stage are typed unions downstream; forward the raw value and let
  // the service/repository ignore anything it does not recognise.
  if (outcome) query.outcome = outcome as OAuthListQuery['outcome']
  if (stage) query.stage = stage as OAuthListQuery['stage']
  if (diagnosticReference) query.diagnosticReference = diagnosticReference
  if (order === 'asc' || order === 'desc') query.order = order
  if (cursor) query.cursor = cursor
  if (limitRaw !== undefined) {
    const limit = Number(limitRaw)
    if (Number.isFinite(limit)) query.limit = limit
  }

  return query
}

/**
 * The documented list-filter query parameters, shared by every list route's
 * Swagger operation. Ranges default to 24h and cap at 90 days; `limit` caps at
 * 100 (default 50); `cursor` is a signed, query-bound continuation token.
 */
export const oauthListQueryParameters = [
  { name: 'from', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Inclusive window start (ISO 8601). Defaults to 24h ago; range capped at 90 days.' },
  { name: 'to', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Inclusive window end (ISO 8601). Defaults to now.' },
  { name: 'clientId', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by opaque client reference.' },
  { name: 'subject', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by authorized subject reference. Honoured only with the oauth.activity.view capability; otherwise ignored.' },
  { name: 'resource', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by protected resource.' },
  { name: 'outcome', in: 'query', required: false, schema: { type: 'string', enum: ['success', 'failure', 'denied', 'unknown'] }, description: 'Filter by safe outcome.' },
  { name: 'stage', in: 'query', required: false, schema: { type: 'string', enum: ['website-session', 'protected-resource-discovery', 'authorization-server-discovery', 'registration', 'authorization', 'consent', 'token-exchange', 'refresh', 'revocation', 'provider-storage', 'protected-resource-verification', 'crew-profile-retrieval'] }, description: 'Filter by observed OAuth stage.' },
  { name: 'diagnosticReference', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by diagnostic reference.' },
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 }, description: 'Page size. Capped at 100 (default 50).' },
  { name: 'order', in: 'query', required: false, schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, description: 'Ordering direction.' },
  { name: 'cursor', in: 'query', required: false, schema: { type: 'string' }, description: 'Signed, query-bound continuation cursor from a prior page. Bound to deployment, actor/capability scope, query fingerprint, ordering, and expiry; a tampered or cross-query cursor is rejected.' }
]

/** Shared 401/403 error responses for capability-gated routes. */
const authErrorResponses = {
  401: { $ref: '#/components/schemas/Error' },
  403: { $ref: '#/components/schemas/Error' }
}

/**
 * Standard responses for a cursor-paginated list route. The 200 body uses the
 * success envelope with a `data.items` array and page metadata under
 * `metadata.page` referencing the shared `PaginationInfo` schema.
 */
export function oauthListResponses(description: string) {
  return {
    200: {
      description,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { type: 'object' } }
                },
                required: ['items']
              },
              metadata: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string', format: 'date-time' },
                  page: { $ref: '#/components/schemas/PaginationInfo' },
                  deployment: { type: 'string' },
                  observedAt: { type: 'string', format: 'date-time' },
                  coverage: { type: 'string' },
                  freshness: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    ...authErrorResponses
  }
}

/** Standard responses for a single-item detail/read route. */
export function oauthDetailResponses(description: string, includeNotFound = true) {
  return {
    200: {
      description,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object' },
              metadata: { type: 'object', properties: { timestamp: { type: 'string', format: 'date-time' } } }
            }
          }
        }
      }
    },
    ...authErrorResponses,
    ...(includeNotFound ? { 404: { $ref: '#/components/schemas/Error' } } : {})
  }
}

/**
 * Split an enriched paged result into the `sendSuccess(data, metadata)` shape:
 * the items become `data.items`; the page metadata (limit/returned/hasMore/
 * nextCursor/total/totalIsExact and coverage/freshness) becomes response
 * metadata so the panel can read pagination without an extra envelope layer.
 */
export function pagedMetadata(page: OAuthPageMetadata): Record<string, unknown> {
  return {
    page: {
      limit: page.limit,
      returned: page.returned,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      total: page.total,
      totalIsExact: page.totalIsExact
    },
    deployment: page.deployment,
    observedAt: page.observedAt,
    coverage: page.coverage,
    freshness: page.freshness
  }
}
