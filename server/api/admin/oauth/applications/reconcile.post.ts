/**
 * POST /api/admin/oauth/applications/reconcile
 *
 * Manual "Reconcile inventory now" control. Kicks ONE bounded, resumable
 * `backfill()` run with a small page budget and returns the resulting coverage
 * + counts immediately so an operator sees seeding progress rather than waiting
 * for the maintenance loop (design "A. Backfill wiring" — manual reconcile
 * control; Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 7.3, 7.7).
 *
 * Flow:
 *   1. `requireOAuthAdminCapability(event, 'oauth.applications.manage')` — the
 *      Administrator gate plus the applications-manage capability (reconcile is
 *      a maintenance action that writes projection rows, paired with the person
 *      who manages applications), bound to the server-derived deployment.
 *   2. `parseBrowserMutation(event, access)` — same-origin + session-bound CSRF
 *      (`X-CSRF-Token` header) + the safe envelope (`idempotencyKey`, `reason`).
 *      A missing/invalid CSRF token (or cross-origin request) is a 403.
 *   3. Kick one bounded `backfill()` run (a small page budget). The service
 *      resumes from its durable checkpoint, so a re-run is idempotent: it
 *      resumes/verifies the checkpoint and produces no duplicate provider
 *      effects beyond the existing observation-guarded upserts (Req 2.4).
 *   4. Read the durable checkpoint's `updatedAt` and return the
 *      {@link OAuthBackfillCoverage} body (coverage + counts + updatedAt).
 *
 * SAFETY: Reconcile is read-only against the PROVIDER (it only reads provider
 * artifacts and writes the administration PROJECTION + checkpoint), so it never
 * violates the "configuration is read-only" invariant and never registers,
 * consents, revokes, or mutates provider client policy. It is maintenance-only
 * and never runs on a request hot path. The per-detail single-client
 * `reconcileClient` allowance remains the only per-request provider read; this
 * route uses the bounded page-budgeted `backfill()` instead of a full scan.
 *
 * If the provider read is unavailable, `backfill()` returns `coverage:
 * 'unavailable'` rather than throwing, so this route returns `200` with that
 * coverage and OAuth traffic remains unaffected (Req 2.5). `Cache-Control:
 * no-store` is applied by the access service. The response carries only safe
 * metrics + coverage — no provider artifacts, tokens, secrets, or identity.
 */

import { defineEventHandler } from 'h3'
import { registerEndpoint } from '../../../../plugins/swagger'
import { handleAsync, sendSuccess } from '../../../../utils/api-response'
import { requireOAuthAdminCapability } from '../../../../mcp/oauth/admin/access-service'
import { parseBrowserMutation } from '../../../../mcp/oauth/admin/mutation-context'
import { getOAuthProjectionService } from '../../../../mcp/oauth/admin/projection-service'
import { getOAuthAdminRepository } from '../../../../mcp/oauth/admin/index'
import { OAUTH_CAPABILITIES, type OAuthBackfillCoverage } from '#shared/types/oauth-administration'

/** A small page budget for a single manual reconcile run (bounded, resumable). */
const RECONCILE_PAGE_SIZE = 100
/** Bounded number of pages read per manual reconcile invocation. */
const RECONCILE_MAX_PAGES = 5

registerEndpoint('/api/admin/oauth/applications/reconcile', 'POST', {
  summary: 'Reconcile OAuth application inventory now (bounded backfill run)',
  description:
    'Kicks one bounded, resumable backfill run that seeds existing provider Client and Grant artifacts into the administration projection, then returns the resulting coverage plus safe counts (processed, clientsProjected, grantsProjected), hasMore, highWaterMark, and the checkpoint updatedAt. Capability: oauth.applications.manage. Requires the X-CSRF-Token header (session-bound), a same-origin request, and an envelope with idempotencyKey + reason. A re-run is idempotent: it resumes/verifies the durable checkpoint and produces no duplicate provider effects beyond observation-guarded upserts. Reconcile only READS provider artifacts and writes the projection/checkpoint; it never registers, consents, revokes, or mutates provider client policy, and never runs on a request hot path. If the provider read is unavailable the route returns 200 with coverage: unavailable rather than erroring, and OAuth traffic is unaffected. Cache-Control: no-store. Sensitive-field exclusions: the response carries no provider artifacts, tokens, secrets, or identity detail.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [
    { name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' }, description: 'Session-bound CSRF token from GET /api/admin/oauth/csrf.' }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['idempotencyKey', 'reason'],
          properties: {
            idempotencyKey: { type: 'string', description: 'Client-generated idempotency key; a retry resumes/verifies the checkpoint.' },
            reason: { type: 'string', description: 'Required audited reason for reconciling inventory.' }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'The coverage and safe counts reached after the bounded backfill run.',
      content: {
        'application/json': {
          example: {
            success: true,
            data: {
              coverage: 'partial',
              processed: 42,
              clientsProjected: 3,
              grantsProjected: 39,
              hasMore: true,
              highWaterMark: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z'
            },
            metadata: { timestamp: '2026-01-01T00:00:00.000Z' }
          }
        }
      }
    },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // 1. Administrator + applications-manage capability, deployment-bound + no-store.
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.APPLICATIONS_MANAGE)

  // 2. Same-origin + session-bound CSRF + safe envelope (idempotencyKey/reason).
  //    A missing/invalid CSRF token or a cross-origin request is a 403.
  await parseBrowserMutation(event, access)

  // 3. Kick ONE bounded backfill run. The service resumes from its durable
  //    checkpoint, so a re-run is idempotent (no duplicate provider effects
  //    beyond observation-guarded upserts). A provider read failure surfaces as
  //    coverage: 'unavailable' from backfill() rather than throwing (Req 2.5).
  const result = await getOAuthProjectionService().backfill(access.deployment, {
    pageSize: RECONCILE_PAGE_SIZE,
    maxPages: RECONCILE_MAX_PAGES
  })

  // 4. Read the durable checkpoint for its updatedAt, then assemble the thin,
  //    redactor-safe reconcile body.
  const checkpoint = await getOAuthAdminRepository().getCheckpoint(access.deployment, 'checkpoints')
  const coverage: OAuthBackfillCoverage = {
    coverage: result.coverage,
    processed: result.processed,
    clientsProjected: result.clientsProjected,
    grantsProjected: result.grantsProjected,
    hasMore: result.hasMore,
    ...(result.highWaterMark ? { highWaterMark: result.highWaterMark } : {}),
    updatedAt: checkpoint?.updatedAt ?? new Date().toISOString()
  }

  return sendSuccess(event, coverage, {
    deployment: access.deployment.environment,
    observedAt: new Date().toISOString()
  })
}))
