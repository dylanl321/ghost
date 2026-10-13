/**
 * GET /api/admin/oauth/issues/:id/export
 *
 * Streams a bounded, redacted, NON-CACHEABLE JSON attachment for a single issue
 * investigation (design "Proposed API contract" — `GET /issues/:id/export`;
 * `OAuthIssueExport`; Requirement 14). The document contains issue metadata,
 * safe stage outcomes, HTTP/error codes, release references, and relevant
 * configuration NAMES with explicit truncation/observation-window metadata; it
 * EXCLUDES credentials, raw request/response bodies, secret/profile documents,
 * authorization URLs, raw network addresses, and identity details (the redactor
 * enforces this over the whole export).
 *
 * Capability: `oauth.activity.view` (per the design contract — the same read
 * capability that gates identity-bearing issue detail).
 *
 * Fail-closed audit ordering (Requirement 13.6 / 14.4): the export access audit
 * intent is written with `referenceKind: 'export'` BEFORE any attachment is
 * produced. If that durable intent write FAILS, the route throws and NO
 * attachment is produced — an export is never emitted without a durable audit
 * record of the access (design "Export audit failure").
 *
 * Response shape: this route returns a RAW JSON attachment (Content-Disposition
 * attachment, Cache-Control: no-store, X-Content-Type-Options nosniff), NOT the
 * standard success envelope. That is intentional and acceptable for a download —
 * the body is the serialized redacted `OAuthIssueExport`, so a support engineer
 * downloads exactly the evidence document (Requirement 14.4 / 17.5).
 */

import { createHash } from 'node:crypto'
import { defineEventHandler, getRouterParam, setResponseHeaders, send } from 'h3'
import { registerEndpoint } from '../../../../../plugins/swagger'
import { handleAsync } from '../../../../../utils/api-response'
import { oauthAdminErrors, requireOAuthAdminCapability } from '../../../../../mcp/oauth/admin/access-service'
import { getOAuthAdminRepository } from '../../../../../mcp/oauth/admin/index'
import { getOAuthIssueExportService } from '../../../../../mcp/oauth/admin/issue-export-service'
import { logicalExpiryFor } from '../../../../../mcp/oauth/admin/repository-support'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import type { OAuthAuditRecord } from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext } from '../../../../../mcp/oauth/admin/types'

registerEndpoint('/api/admin/oauth/issues/{id}/export', 'GET', {
  summary: 'Export a bounded, redacted OAuth issue as a non-cacheable JSON attachment',
  description:
    'Returns a bounded, redacted support export for a single issue investigation as a downloadable JSON attachment (Content-Disposition: attachment; Cache-Control: no-store; X-Content-Type-Options: nosniff). The document contains issue metadata, safe stage outcomes, HTTP/error codes, release references, and relevant configuration names, plus explicit truncation and observation-window metadata when events exceed the export bound. It EXCLUDES credentials, tokens, cookies, raw request/response bodies, authorization URLs/query strings, raw exceptions, raw network addresses, private JWK parameters, secret/profile documents, and user identity details. Capability: oauth.activity.view. An export access audit record (referenceKind: export) is written BEFORE the attachment; if that audit intent cannot be persisted, no attachment is produced (fail closed). A guessed or unknown group id returns 404 without bypassing authorization. NOTE: unlike other admin routes, this route returns a RAW JSON attachment body, not the standard success envelope.',
  tags: ['OAuth Administration'],
  security: [{ OIDCAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Opaque issue group id.' }],
  responses: {
    200: {
      description: 'A bounded, redacted issue export as a JSON attachment.',
      headers: {
        'Content-Disposition': { schema: { type: 'string' }, description: 'attachment; filename="oauth-issue-<id>-export.json"' },
        'Cache-Control': { schema: { type: 'string' }, description: 'no-store' },
        'X-Content-Type-Options': { schema: { type: 'string' }, description: 'nosniff' }
      },
      content: {
        'application/json': {
          schema: {
            type: 'object',
            description: 'Redacted OAuthIssueExport document.',
            properties: {
              issue: { type: 'object' },
              events: { type: 'array', items: { type: 'object' } },
              configurationNames: { type: 'array', items: { type: 'string' } },
              releaseEvidence: { type: 'object' },
              truncated: { type: 'boolean' },
              windowStart: { type: 'string', format: 'date-time' },
              windowEnd: { type: 'string', format: 'date-time' },
              metadata: { type: 'object' }
            },
            required: ['issue', 'events', 'configurationNames', 'truncated', 'windowStart', 'windowEnd', 'metadata']
          }
        }
      }
    },
    401: { $ref: '#/components/schemas/Error' },
    403: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

/**
 * Sanitize an opaque group id into a filename-safe token so the id can never
 * inject header content or path characters into the `Content-Disposition`
 * filename. Opaque references are already `[A-Za-z0-9_-]`, but this is defensive.
 */
function safeFilenameToken(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
  return cleaned || 'unknown'
}

/**
 * Write the export access audit intent BEFORE the attachment (Requirement 13.6 /
 * 14.4). A stable, deployment/actor/issue-scoped audit id keeps a repeated
 * export of the same issue idempotent in the audit stream. Unlike a restricted
 * READ audit (which is best-effort), this write is REQUIRED: a failure
 * propagates so the caller blocks the attachment (fail closed).
 */
async function writeExportAuditIntent(access: OAuthAdminAccessContext, groupId: string): Promise<void> {
  const repository = getOAuthAdminRepository()
  const timestamp = new Date().toISOString()
  const referenceId = `export:issue:${groupId}`
  const idHash = createHash('sha256')
  idHash.update(access.deployment.deploymentId)
  idHash.update('\u0000')
  idHash.update(access.actor)
  idHash.update('\u0000')
  idHash.update(referenceId)
  idHash.update('\u0000')
  idHash.update(timestamp)
  const record: OAuthAuditRecord = {
    auditId: `aud_${idHash.digest('base64url').slice(0, 24)}`,
    timestamp,
    deployment: access.deployment.environment,
    actor: access.actor,
    // Record the capability that authorized the export access.
    capability: OAUTH_CAPABILITIES.ACTIVITY_VIEW,
    referenceKind: 'export',
    referenceId,
    // The export access itself is a completed access.
    outcome: 'success',
    evidence: { resource: 'issue-export', groupId },
    ...logicalExpiryFor(timestamp)
  }
  // No try/catch: a failure to persist the durable intent MUST propagate so the
  // attachment is not produced (Requirement 13.6 / 14.4, design "Export audit
  // failure").
  await repository.putAuditRecord(access.deployment, record)
}

export default defineEventHandler(handleAsync(async (event) => {
  const access = await requireOAuthAdminCapability(event, OAUTH_CAPABILITIES.ACTIVITY_VIEW)

  const groupId = getRouterParam(event, 'id')
  if (!groupId) throw oauthAdminErrors.notFound({ message: 'Issue not found in this deployment' })

  // 1. Persist the export audit intent BEFORE producing the attachment. A
  //    failure here throws and blocks the attachment (fail closed).
  await writeExportAuditIntent(access, groupId)

  // 2. Build the bounded, redacted export. A missing/guessed id is a 404.
  const exportDocument = await getOAuthIssueExportService().buildExport(access, groupId)

  // 3. Return a NON-CACHEABLE JSON attachment (Requirement 14.4 / 17.5).
  //    `requireOAuthAdminCapability` already applied Cache-Control: no-store; it
  //    is set again here alongside the attachment headers so the download is
  //    unambiguously non-cacheable and non-sniffable even if the body renders
  //    inline in a browser.
  const body = JSON.stringify(exportDocument)
  setResponseHeaders(event, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="oauth-issue-${safeFilenameToken(groupId)}-export.json"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  })
  return send(event, body, 'application/json')
}))
