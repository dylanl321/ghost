/**
 * OAuth Administration — issue-export service (task 12.2).
 *
 * Produces the bounded, redacted, support-safe {@link OAuthIssueExport} for a
 * single issue investigation (design "Proposed API contract" — `GET
 * /issues/:id/export`; the `OAuthIssueExport` data model; Requirement 14). The
 * export is authorized with `oauth.activity.view` at the route; this service
 * assembles and redacts the document.
 *
 * SAFETY / behavioural contract (Requirements 14.1–14.4, 13.6, 17.5):
 *   - Read the issue by group id; a missing/guessed id yields a typed 404 so a
 *     guessed reference cannot bypass authorization (Requirement 1.5).
 *   - Read a BOUNDED window of the issue's related events: the query is bound to
 *     the issue's observation window ([windowStart, windowEnd]) and, when the
 *     issue is scoped to a known client, that client. The repository additionally
 *     caps the window at 90 days and the page at 100; this service requests one
 *     row PAST the export event bound so it can detect truncation without
 *     returning more than the bound (Requirement 14.3).
 *   - Assemble ONLY safe fields: issue metadata, safe stage outcomes, HTTP/error
 *     codes, release references, and relevant configuration NAMES (scopes, grant
 *     types, client-auth methods, PKCE methods — never endpoint URLs or resource
 *     URLs) (Requirement 14.1).
 *   - Apply the redactor to the WHOLE export so credentials, raw request/response
 *     bodies, secret/profile documents, authorization URLs, raw network
 *     addresses, and identity details are stripped even if an adversarial event
 *     carried them (Requirement 14.2). The redactor's field-name denylist is the
 *     enforcement point; the DTOs already declare only safe fields.
 *   - When events exceed the export bound, set `truncated=true` and record the
 *     observation window in the coverage metadata so an export is never mistaken
 *     for a complete evidence set (Requirement 14.3, design "Export audit
 *     failure").
 *
 * This service does NOT write the audit intent or set the attachment headers —
 * the route owns audit-intent-before-attachment (fail closed) and the
 * non-cacheable attachment response (Requirement 13.6 / 14.4 / 17.5). Keeping
 * the assembly pure makes it directly testable against the in-memory fixture.
 */

import type {
  OAuthConfiguration,
  OAuthCoverageMetadata,
  OAuthEvent,
  OAuthIssue,
  OAuthIssueExport,
  OAuthListQuery,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRedactor, OAuthAdminRepository } from './types'
import { getOAuthAdminRepository } from './index'
import { oauthAdminRedactor } from './redactor'
import { oauthAdminErrors } from './access-service'
import { oauthConfigurationService, type OAuthConfigurationService } from './configuration-service'

/**
 * Maximum number of events an export may carry. Beyond this the export is
 * explicitly truncated (Requirement 14.3). Kept strictly BELOW the repository's
 * hard 100-row page cap so a single bounded query can fetch the bound PLUS one
 * truncation-probe row (`EXPORT_EVENT_BOUND + 1`) without being silently clamped
 * to the cap — the extra row is what lets the service detect (and report)
 * truncation rather than presenting a clamped page as complete.
 */
export const EXPORT_EVENT_BOUND = 99

/**
 * Assemble the bounded, redacted issue export document. Constructed with an
 * injected repository, redactor, configuration service, and clock so tests can
 * exercise it against the in-memory fixture with a deterministic time.
 */
export class OAuthIssueExportService {
  constructor(
    private readonly repository: OAuthAdminRepository = getOAuthAdminRepository(),
    private readonly redactor: OAuthAdminRedactor = oauthAdminRedactor,
    private readonly configurationService: OAuthConfigurationService = oauthConfigurationService,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Build the redacted export for an issue group. Throws a typed 404 when the
   * issue does not exist in the caller's (server-derived) deployment.
   */
  async buildExport(access: OAuthAdminAccessContext, groupId: OpaqueReference): Promise<OAuthIssueExport> {
    const ctx = access.deployment

    // 1. Read the issue; a missing/guessed group id is a 404 (Requirement 1.5).
    const issue = await this.repository.getIssue(ctx, groupId)
    if (!issue) {
      throw oauthAdminErrors.notFound({ message: 'Issue not found in this deployment' })
    }

    // 2. Read a BOUNDED window of the issue's related events. The query is bound
    //    to the issue's observation window and, when known, its client. Request
    //    one row past the bound so truncation is detectable without returning
    //    more than the bound (Requirement 14.3). The repository applies the
    //    90-day range cap and the 100-row page cap on top of this.
    const eventQuery: OAuthListQuery = {
      from: issue.windowStart,
      to: issue.windowEnd,
      order: 'asc',
      limit: EXPORT_EVENT_BOUND + 1
    }
    const clientReference = this.issueClientReference(issue)
    if (clientReference) eventQuery.clientId = clientReference

    let fetched: OAuthEvent[]
    let eventsAvailable: boolean
    try {
      const page = await this.repository.queryEvents(ctx, eventQuery)
      fetched = page.items
      // A partial/rebuilding/unavailable coverage means the event evidence is
      // not complete; surface it via the coverage metadata below rather than
      // presenting a truncated set as complete.
      eventsAvailable = page.page.coverage !== 'unavailable'
    } catch {
      // The events query failed: export the issue metadata with an explicit
      // unavailable event set rather than failing the whole export.
      fetched = []
      eventsAvailable = false
    }

    // 3. Detect truncation and trim to the bound (Requirement 14.3).
    const truncated = fetched.length > EXPORT_EVENT_BOUND
    const boundedEvents = truncated ? fetched.slice(0, EXPORT_EVENT_BOUND) : fetched

    // 4. Relevant configuration NAMES only — scopes, grant types, client-auth
    //    methods, and PKCE methods (short identifiers). Endpoint and resource
    //    URLs are intentionally excluded (Requirement 14.1 / 14.2).
    const configuration = await this.safeConfiguration(access)
    const configurationNames = configuration ? this.configurationNamesFrom(configuration) : []

    // 5. Assemble the export. Coverage metadata carries the observation window
    //    and an explicit availability so a consumer can see the export bound.
    const collectedAt = new Date(this.now()).toISOString()
    const metadata: OAuthCoverageMetadata = {
      // Truncated or unavailable event evidence is never `complete`.
      coverage: truncated ? 'partial' : (eventsAvailable ? 'complete' : 'partial'),
      freshness: 'fresh',
      availability: eventsAvailable ? 'available' : 'unavailable',
      collectedAt,
      windowStart: issue.windowStart,
      windowEnd: issue.windowEnd
    }

    const exportDocument: OAuthIssueExport = {
      issue,
      events: boundedEvents,
      configurationNames,
      releaseEvidence: configuration?.releaseEvidence,
      truncated,
      windowStart: issue.windowStart,
      windowEnd: issue.windowEnd,
      metadata
    }

    // 6. Redact the WHOLE export (defence in depth over the allowlisted DTOs):
    //    any credential, token, cookie, raw body, authorization URL/query, raw
    //    exception, raw network address, private JWK parameter, or secret/profile
    //    document that slipped into an event is stripped before the attachment is
    //    produced (Requirement 14.2, Property 2).
    return this.redactor.redact(exportDocument)
  }

  /**
   * The known client reference an issue is scoped to, if any. The aggregation
   * service builds a POSITIONAL group key
   * `deploymentId|stage|errorCode|clientReference|resourceReference|windowStart`
   * using a fixed `-` placeholder for an unobserved dimension. The client
   * reference is the 4th segment (index 3); a `-` there means the issue is
   * client-agnostic and the export covers the whole window without a client
   * filter.
   */
  private issueClientReference(issue: OAuthIssue): OpaqueReference | undefined {
    const segments = (issue.groupKey || '').split('|')
    const value = segments[3]?.trim()
    if (!value || value === '-') return undefined
    return value
  }

  /**
   * Read the safe effective configuration, swallowing a failure so a config
   * read problem never blocks the export (the export still carries the issue and
   * events). Returns `undefined` when unavailable.
   */
  private async safeConfiguration(access: OAuthAdminAccessContext): Promise<OAuthConfiguration | undefined> {
    try {
      return await this.configurationService.buildConfiguration(access.deployment, new Date(this.now()))
    } catch {
      return undefined
    }
  }

  /**
   * Derive relevant configuration NAMES from the safe configuration projection.
   * Only short identifier names are included — scopes, grant types, client-auth
   * methods, and PKCE methods. Endpoint URLs, resource URLs, issuer URLs, and
   * any URL-bearing values are deliberately excluded so the export never leaks
   * an authorization URL or address (Requirement 14.1 / 14.2). Values are
   * de-duplicated and sorted for a stable document.
   */
  private configurationNamesFrom(configuration: OAuthConfiguration): string[] {
    const names = new Set<string>()
    const add = (values: string[] | undefined) => {
      for (const value of values || []) {
        const name = String(value).trim()
        // Exclude anything that looks like a URL or a network address — only
        // safe short names belong in the export.
        if (!name || name.includes('://') || name.includes('/') || name.includes('@')) continue
        names.add(name)
      }
    }
    add(configuration.scopes?.effective ?? configuration.scopes?.configured)
    add(configuration.grantTypes?.effective ?? configuration.grantTypes?.configured)
    add(configuration.clientAuthMethods?.effective ?? configuration.clientAuthMethods?.configured)
    add(configuration.pkce?.effective ?? configuration.pkce?.configured)
    return [...names].sort()
  }
}

/**
 * Shared issue-export service for server request paths, constructed lazily so
 * the repository factory in `./index` is resolved on first use rather than at
 * module load (avoids an import cycle with the barrel).
 */
let sharedExportService: OAuthIssueExportService | undefined

/** Resolve the shared {@link OAuthIssueExportService} for the current deployment. */
export function getOAuthIssueExportService(): OAuthIssueExportService {
  if (!sharedExportService) sharedExportService = new OAuthIssueExportService()
  return sharedExportService
}
