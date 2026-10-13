/**
 * OAuth Administration — stage instrumentation.
 *
 * The thin, SAFE bridge between the live OAuth request/provider boundaries and
 * the fire-and-forget {@link OAuthEventCollector} (task 2.1). Every OAuth stage
 * GHOST actually observes calls one of the helpers here; the helper extracts
 * ONLY explicitly allowlisted, non-secret references from the `oidc-provider`
 * context / H3 request and hands them to `collector.collect()` (Requirements
 * 2.3, 4.1, 4.6, 4.7, 16.4, 18.3; design "Observation and query flow").
 *
 * BEHAVIOURAL CONTRACT (must never regress OAuth traffic):
 *   - Instrumentation is FIRE-AND-FORGET. `collect()` returns synchronously and
 *     schedules its own background write; nothing here is `await`ed on the hot
 *     path and every helper is wrapped so a telemetry defect can never throw
 *     into, delay, or fail OAuth traffic (2.3, 4.6, 18.3).
 *   - Callers hand this module a raw `oidc-provider` ctx or H3 event, but only
 *     an explicitly constructed allowlist ({@link OAuthEventInput}) ever reaches
 *     the collector. Raw headers, cookies, authorization query strings, tokens,
 *     provider payloads, and raw exceptions never leave a request path.
 *   - Pre-login stages (discovery, registration, authorization before a subject
 *     exists) leave subject/client references ABSENT — never fabricated (4.4).
 *   - A raw network address is passed as `rawNetworkAddress` ONLY where a real
 *     network boundary is observed (public discovery/registration entry). The
 *     collector pseudonymizes it and discards the raw value (16.4).
 *   - Refresh compatibility: the existing refresh alarm (`recordRefreshEvent`)
 *     keeps its own counting untouched. This module emits a SEPARATE admin
 *     event; it never reads, writes, or duplicates the alarm's counter (4.7).
 */

import type {
  OAuthDeploymentContext,
  OAuthOutcome,
  OAuthStage,
  OpaqueReference
} from '#shared/types/oauth-administration'
import { getOAuthEventCollector, type OAuthEventInput } from './event-collector'
import { resolveOAuthAdminDeploymentContext } from './deployment-context'
import { logger } from '../../../utils/logger'

/**
 * A minimal, defensive view of the `oidc-provider` koa-style context. Every
 * field is optional and read defensively — the provider's internal shape is not
 * a stable contract, and a telemetry read must never assume a field exists.
 */
interface ProviderCtxLike {
  status?: number
  method?: string
  oidc?: {
    route?: string
    params?: Record<string, unknown>
    client?: { clientId?: string }
    entities?: Record<string, unknown>
    error?: string
  }
}

/** A safe error-like shape emitted by the provider (never a raw Error object). */
interface ProviderErrorLike {
  error?: unknown
  error_description?: unknown
  message?: unknown
  statusCode?: unknown
}

/** A raw network-address carrier (an H3 node request), read defensively. */
interface RequestLike {
  headers?: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}

/**
 * Run a telemetry side effect with a hard guarantee it can never throw into the
 * OAuth request path. Any defect is logged as a warning (a collection gap, not
 * an OAuth failure) and swallowed.
 */
function safely(run: () => void): void {
  try {
    run()
  } catch (error) {
    // Never surface a telemetry defect to OAuth traffic; record it as a gap.
    logger.warn('[oauth-admin] stage instrumentation skipped', {
      code: (error as { code?: string; name?: string })?.code
        || (error as { name?: string })?.name
        || 'INSTRUMENTATION_ERROR'
    })
  }
}

/** Resolve the deployment context defensively; telemetry is optional. */
function contextOrUndefined(): OAuthDeploymentContext | undefined {
  try {
    return resolveOAuthAdminDeploymentContext()
  } catch {
    return undefined
  }
}

/**
 * Extract a raw network address from an H3 node request at a genuine network
 * boundary. Mirrors the derivation the registration routes already use. The raw
 * value is handed to the collector, which pseudonymizes and discards it; it is
 * never returned to a caller or persisted here (16.4).
 */
export function readRawNetworkAddress(req: RequestLike | undefined): string | undefined {
  if (!req) return undefined
  const forwarded = req.headers?.['x-forwarded-for']
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const raw = String(header || req.socket?.remoteAddress || '').split(',')[0]?.trim()
  return raw || undefined
}

/**
 * Derive a safe, non-secret error code from a provider error-like object. Uses
 * the OAuth `error` field (e.g. `invalid_grant`, `access_denied`) or a bounded
 * sanitized `message`; NEVER the raw exception, stack, or description (which can
 * embed request detail). Returns undefined when no safe code is available.
 */
export function safeProviderErrorCode(error: ProviderErrorLike | undefined): string | undefined {
  if (!error) return undefined
  const candidate = typeof error.error === 'string' && error.error
    ? error.error
    : typeof error.message === 'string'
      ? error.message
      : ''
  const code = String(candidate).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64)
  return code || undefined
}

/** Derive a safe HTTP status from a ctx/error, when present and plausible. */
function safeHttpStatus(status: unknown): number | undefined {
  const value = Number(status)
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined
}

/** The opaque client reference from a provider ctx, when a client is bound. */
function clientReferenceFromCtx(ctx: ProviderCtxLike | undefined): OpaqueReference | undefined {
  const fromClient = ctx?.oidc?.client?.clientId
  if (typeof fromClient === 'string' && fromClient) return fromClient
  const fromParams = ctx?.oidc?.params?.client_id
  return typeof fromParams === 'string' && fromParams ? fromParams : undefined
}

/** The requested resource reference from a provider ctx, when present. */
function resourceReferenceFromCtx(ctx: ProviderCtxLike | undefined): OpaqueReference | undefined {
  const resource = ctx?.oidc?.params?.resource
  const value = Array.isArray(resource) ? resource[0] : resource
  return typeof value === 'string' && value ? value : undefined
}

/**
 * The single instrumentation surface used across request/provider paths. Holds
 * no state beyond the shared collector; every method is fire-and-forget and
 * self-guarding.
 */
export class OAuthStageInstrumentation {
  constructor(
    private readonly collector = getOAuthEventCollector()
  ) {}

  /**
   * Emit an event for a stage, given an already-safe allowlisted input. The
   * deployment context is resolved here (server-authoritative) so callers never
   * pass it. Fire-and-forget and self-guarding.
   */
  record(input: OAuthEventInput, ctx?: OAuthDeploymentContext): void {
    safely(() => {
      const deployment = ctx ?? contextOrUndefined()
      if (!deployment) return
      this.collector.collect(deployment, input)
    })
  }

  /**
   * Observe a provider event (`authorization.*`, `grant.*`, `registration_*.*`,
   * `revocation.error`, discovery, etc.) whose payload is an `oidc-provider`
   * ctx and (for `.error`) a provider error. Extracts only safe references.
   *
   * `subjectReference`/`clientReference` are supplied only where the caller
   * confirms they are post-login and safe; discovery/registration/authorization
   * before a subject leave them absent.
   */
  recordProviderEvent(
    stage: OAuthStage,
    outcome: OAuthOutcome,
    ctx: ProviderCtxLike | undefined,
    options: {
      error?: ProviderErrorLike
      /** Include the client reference (omit for a genuinely pre-login stage). */
      includeClient?: boolean
      /** Include the requested resource reference. */
      includeResource?: boolean
      /** Extra safe references observed by the caller. */
      extra?: Partial<OAuthEventInput>
    } = {}
  ): void {
    safely(() => {
      const deployment = contextOrUndefined()
      if (!deployment) return
      const input: OAuthEventInput = {
        stage,
        outcome,
        httpStatus: safeHttpStatus(options.error?.statusCode) ?? safeHttpStatus(ctx?.status),
        errorCode: outcome === 'success' ? undefined : safeProviderErrorCode(options.error),
        clientReference: options.includeClient ? clientReferenceFromCtx(ctx) : undefined,
        resourceReference: options.includeResource ? resourceReferenceFromCtx(ctx) : undefined,
        ...options.extra
      }
      this.collector.collect(deployment, input)
    })
  }
}

/** Shared instrumentation instance for server request/provider paths. */
let sharedInstrumentation: OAuthStageInstrumentation | undefined

/** Resolve the shared {@link OAuthStageInstrumentation}. */
export function getOAuthStageInstrumentation(): OAuthStageInstrumentation {
  if (!sharedInstrumentation) sharedInstrumentation = new OAuthStageInstrumentation()
  return sharedInstrumentation
}
