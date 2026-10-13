/**
 * useOAuthAdministration
 *
 * In-memory request orchestration for the read-only OAuth administration panel
 * (`/admin/oauth`). This composable is the single source of fetch state for
 * every panel view; it deliberately keeps ALL data in component-scoped refs so
 * restricted OAuth administration data is never written to localStorage, a
 * persisted Pinia store, or the URL (Requirement 17.5).
 *
 * Responsibilities (design "Client components and interaction contracts"):
 * - Route-query-driven view selection + filters (`?view=...&from=...&clientId=...`).
 *   The selected view and the allowlisted filter keys live in the URL so a view
 *   is shareable/deep-linkable, but never restricted detail values.
 * - One `AbortController` per in-flight request per view. Changing the view,
 *   the filters, or the capability set aborts the outstanding request so a
 *   superseded call cannot land in the current view (Requirement 17.6).
 * - A monotonic request-generation guard per view: every response is compared
 *   to the generation that was current when it was issued, so a slow/aborted
 *   response can never overwrite a newer one (Requirement 17.6).
 * - Cursor navigation: the server returns `metadata.page.nextCursor`; we send
 *   it straight back as `?cursor=` on the next page request. Cursors stay in
 *   composable memory, never in the shareable URL.
 * - Per-view derived state: loading / empty / unavailable / partial / stale /
 *   conflict / error, so each panel can render the right explicit state
 *   (Requirements 2.5, 2.6, 17.2).
 *
 * Mutation helpers (task 7.3) live alongside the read loaders but keep the same
 * in-memory-only discipline: a session-bound CSRF token is fetched once and
 * cached in composable memory (never localStorage — Requirement 17.5), the
 * create/preview calls send it in the `X-CSRF-Token` header on a same-origin
 * request, and the operation poller is abortable + generation-guarded like the
 * loaders. The development sign-in test reuses the CREATED client in a normal,
 * human-driven consent flow opened in a new browser context; it uses no secret,
 * registration token, or credential (Requirements 6.6, 6.7).
 */

import { computed, reactive, ref } from 'vue'
import type {
  OAuthAdminOperation,
  OAuthApplicationDetail,
  OAuthApplicationStatus,
  OAuthApplicationSummary,
  OAuthBackfillCoverage,
  OAuthConfiguration,
  OAuthCoverageState,
  OAuthDiagnosticCheck,
  OAuthDiagnosticJob,
  OAuthEvent,
  OAuthFreshness,
  OAuthGrantSummary,
  OAuthIssue,
  OAuthListQuery,
  OAuthObservation,
  OAuthQuotaObservation
} from '#shared/types/oauth-administration'

/**
 * The non-secret create result surfaced to the wizard. Mirrors the server
 * `CreateApplicationResult` shape but is intentionally structural (the server
 * type lives in a server-only module). It NEVER carries a secret or token.
 */
export interface OAuthCreateApplicationResult {
  clientId: string
  clientRegistration?: {
    type: string
    authMethod: string
    grantTypes?: string[]
    responseTypes?: string[]
    pkce?: string
    refreshRotation?: boolean
  }
  redirectUris: string[]
  permittedResources: string[]
  permittedScopes: string[]
  instructions?: {
    clientId: string
    authorizeUrl: string
    exchangeUrl: string
    redirectUris: string[]
    usePkce: boolean
    pkceMethod: string
    authMethod: string
    scopes: string[]
    resources: string[]
    notes: string[]
  }
}

/** The normalized preview + form options returned by the preview route. */
export interface OAuthApplicationPreview {
  preview: {
    name: string
    ownership: { owner?: string, team?: string, purpose?: string }
    clientType: string
    authMethod: string
    grantTypes: string[]
    responseTypes: string[]
    pkce: string
    refreshRotation: boolean
    redirectUris: string[]
    permittedResources: string[]
    permittedScopes: string[]
    allowsLoopback: boolean
  }
  options: { resources: string[], scopes: string[] }
}

/** The create-form fields the wizard collects (no envelope). */
export interface OAuthCreateApplicationForm {
  name: string
  ownership: { owner: string, team?: string, purpose?: string }
  redirectUris: string[]
  permittedResources: string[]
  permittedScopes: string[]
}

/** The route-query-driven panel views. */
export type OAuthAdminView =
  | 'overview'
  | 'configuration'
  | 'applications'
  | 'activity'
  | 'issues'
  | 'diagnostics'
  | 'limits'
  | 'audit'

/** Ordered list of views used for tab rendering and query validation. */
export const OAUTH_ADMIN_VIEWS: OAuthAdminView[] = [
  'overview',
  'configuration',
  'applications',
  'activity',
  'issues',
  'diagnostics',
  'limits',
  'audit'
]

/**
 * The allowlisted filter keys the panel mirrors into the URL. Restricted values
 * (subject identity references) are intentionally excluded from the sharable
 * query; the activity view carries `subject` only in composable memory.
 */
export interface OAuthAdminFilters {
  from?: string
  to?: string
  clientId?: string
  resource?: string
  outcome?: string
  stage?: string
  diagnosticReference?: string
  order?: 'asc' | 'desc'
}

/** The success envelope every OAuth admin route returns. */
interface OAuthEnvelope<T> {
  success: boolean
  data: T
  metadata?: OAuthResponseMetadata
}

/** Response metadata carried alongside every projection-backed response. */
interface OAuthResponseMetadata {
  timestamp?: string
  deployment?: string
  observedAt?: string
  coverage?: OAuthCoverageState
  freshness?: OAuthFreshness
  page?: OAuthResponsePage
}

/** Cursor-pagination metadata mirrored from `metadata.page`. */
interface OAuthResponsePage {
  limit: number
  returned: number
  hasMore: boolean
  nextCursor: string | null
  total: number | null
  totalIsExact: boolean
}

/**
 * Per-view request state. Everything the panels need to render loading/empty/
 * unavailable/partial/stale/conflict/error lives here and only here.
 */
interface OAuthViewState<T> {
  /** The most recent successful payload for this view (in-memory only). */
  data: T | null
  /** True while a request is in flight. */
  loading: boolean
  /** Populated when the last request failed with a non-auth error. */
  error: string | null
  /** True when the last failure was a 401/403 (access denied / session lost). */
  unavailable: boolean
  /** True when the last failure was a 409 optimistic-concurrency conflict. */
  conflict: boolean
  /** Coverage of the last successful response (partial/rebuilding/unavailable). */
  coverage: OAuthCoverageState | null
  /** Freshness of the last successful response (stale => show explicitly). */
  freshness: OAuthFreshness | null
  /** Server deployment label from the last response. */
  deployment: string | null
  /** Observation time from the last response. */
  observedAt: string | null
  /** Cursor to fetch the next page, when the view is paginated. */
  nextCursor: string | null
  /** Whether more pages exist. */
  hasMore: boolean
  /** Nullable, never-invented total for paginated views. */
  total: number | null
  /** Whether the reported total is exact. */
  totalIsExact: boolean
  /** True once at least one response (success or failure) has resolved. */
  loaded: boolean
}

function createViewState<T>(): OAuthViewState<T> {
  return {
    data: null,
    loading: false,
    error: null,
    unavailable: false,
    conflict: false,
    coverage: null,
    freshness: null,
    deployment: null,
    observedAt: null,
    nextCursor: null,
    hasMore: false,
    total: null,
    totalIsExact: false,
    loaded: false
  }
}

/** Read an error status code from a `$fetch`/`ofetch` rejection. */
function errorStatus(cause: unknown): number | undefined {
  if (cause && typeof cause === 'object') {
    const record = cause as Record<string, unknown>
    const status = record.statusCode ?? record.status
    if (typeof status === 'number') return status
  }
  return undefined
}

/** Human-safe message from a rejection, without leaking raw internals. */
function errorMessage(cause: unknown, fallback: string): string {
  if (cause && typeof cause === 'object') {
    const record = cause as Record<string, unknown>
    const data = record.data as Record<string, unknown> | undefined
    const nested = data?.error as Record<string, unknown> | undefined
    const message = nested?.message ?? data?.message ?? record.message
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  return fallback
}

export function useOAuthAdministration() {
  const route = useRoute()
  const router = useRouter()

  // --- Route-query-driven view + filters -----------------------------------

  const selectedView = computed<OAuthAdminView>(() => {
    const raw = route.query.view
    const value = Array.isArray(raw) ? raw[0] : raw
    return OAUTH_ADMIN_VIEWS.includes(value as OAuthAdminView)
      ? (value as OAuthAdminView)
      : 'overview'
  })

  const filters = computed<OAuthAdminFilters>(() => {
    const read = (key: string): string | undefined => {
      const raw = route.query[key]
      const value = Array.isArray(raw) ? raw[0] : raw
      const text = value === undefined || value === null ? '' : String(value).trim()
      return text.length > 0 ? text : undefined
    }
    const order = read('order')
    return {
      from: read('from'),
      to: read('to'),
      clientId: read('clientId'),
      resource: read('resource'),
      outcome: read('outcome'),
      stage: read('stage'),
      diagnosticReference: read('diagnosticReference'),
      order: order === 'asc' || order === 'desc' ? order : undefined
    }
  })

  /**
   * Navigate to a view, preserving no cross-view filter leakage: switching view
   * clears list filters/cursors (they are view-specific) unless explicitly
   * carried. This also aborts the outstanding request for the previous view via
   * the caller re-running its load.
   */
  function setView(view: OAuthAdminView) {
    if (view === selectedView.value) return
    void router.replace({ query: { view } })
  }

  /** Merge allowlisted filter changes into the URL query for the current view. */
  function setFilters(next: Partial<OAuthAdminFilters>) {
    const query: Record<string, string> = { view: selectedView.value }
    const merged: OAuthAdminFilters = { ...filters.value, ...next }
    for (const [key, value] of Object.entries(merged)) {
      if (typeof value === 'string' && value.trim().length > 0) query[key] = value
    }
    void router.replace({ query })
  }

  // --- Per-view request state (in-memory only) ------------------------------

  const overview = reactive(createViewState<OAuthObservation[]>()) as OAuthViewState<OAuthObservation[]>
  const configuration = reactive(createViewState<OAuthConfiguration>()) as OAuthViewState<OAuthConfiguration>
  const applications = reactive(createViewState<OAuthApplicationSummary[]>()) as OAuthViewState<OAuthApplicationSummary[]>
  const applicationsHealth = reactive(createViewState<OAuthApplicationStatus[]>()) as OAuthViewState<OAuthApplicationStatus[]>
  const applicationDetail = reactive(createViewState<OAuthApplicationDetail>()) as OAuthViewState<OAuthApplicationDetail>
  const attempts = reactive(createViewState<OAuthEvent[][]>()) as OAuthViewState<OAuthEvent[][]>
  const grants = reactive(createViewState<OAuthGrantSummary[]>()) as OAuthViewState<OAuthGrantSummary[]>
  const issues = reactive(createViewState<OAuthIssue[]>()) as OAuthViewState<OAuthIssue[]>
  const issueDetail = reactive(createViewState<OAuthIssue>()) as OAuthViewState<OAuthIssue>
  const limits = reactive(createViewState<OAuthQuotaObservation>()) as OAuthViewState<OAuthQuotaObservation>
  const audit = reactive(createViewState<Record<string, unknown>[]>()) as OAuthViewState<Record<string, unknown>[]>

  /** Abort controllers keyed by a stable request slot name. */
  const controllers = new Map<string, AbortController>()
  /** Monotonic request generations keyed by the same slot name. */
  const generations = reactive<Record<string, number>>({})

  /** Abort the outstanding request for a slot and bump its generation. */
  function supersede(slot: string): number {
    const existing = controllers.get(slot)
    if (existing) existing.abort()
    const next = (generations[slot] ?? 0) + 1
    generations[slot] = next
    return next
  }

  /**
   * Core fetch runner. Applies the generation guard so only the latest response
   * for a slot updates its view state; aborted/superseded responses are dropped.
   */
  async function run<T>(
    slot: string,
    state: OAuthViewState<T>,
    url: string,
    query: Record<string, string | number | undefined>,
    map: (data: unknown) => T,
    fallbackMessage: string
  ): Promise<void> {
    const generation = supersede(slot)
    const controller = new AbortController()
    controllers.set(slot, controller)

    state.loading = true
    state.error = null
    state.unavailable = false
    state.conflict = false

    try {
      const response = await $fetch<OAuthEnvelope<unknown>>(url, {
        query,
        signal: controller.signal
      })

      // Generation guard: a newer request has since been issued for this slot.
      if (generations[slot] !== generation) return

      state.data = map(response.data)
      const meta = response.metadata
      state.coverage = meta?.coverage ?? null
      state.freshness = meta?.freshness ?? null
      state.deployment = meta?.deployment ?? null
      state.observedAt = meta?.observedAt ?? meta?.timestamp ?? null
      if (meta?.page) {
        state.nextCursor = meta.page.nextCursor
        state.hasMore = meta.page.hasMore
        state.total = meta.page.total
        state.totalIsExact = meta.page.totalIsExact
      }
    } catch (cause: unknown) {
      // Ignore aborts (the request was intentionally superseded/cancelled).
      if (controller.signal.aborted || (cause as Error)?.name === 'AbortError') return
      if (generations[slot] !== generation) return

      const status = errorStatus(cause)
      if (status === 401 || status === 403) {
        // Access denied or session lost: discard restricted results and surface
        // the unavailable state (Requirements 1.5, 17.6).
        state.data = null
        state.unavailable = true
      } else if (status === 409) {
        state.conflict = true
        state.error = errorMessage(cause, 'This view changed since it was loaded.')
      } else if (status === 404) {
        state.data = null
        state.error = null
      } else {
        state.error = errorMessage(cause, fallbackMessage)
      }
    } finally {
      if (generations[slot] === generation) {
        state.loading = false
        state.loaded = true
      }
      if (controllers.get(slot) === controller) controllers.delete(slot)
    }
  }

  /** Build the documented list query from the current filters + optional cursor. */
  function listQuery(cursor?: string, extra?: Partial<OAuthListQuery>): Record<string, string | number | undefined> {
    const current = filters.value
    return {
      from: current.from,
      to: current.to,
      clientId: current.clientId,
      resource: current.resource,
      outcome: current.outcome,
      stage: current.stage,
      diagnosticReference: current.diagnosticReference,
      order: current.order,
      cursor,
      ...extra
    }
  }

  /** Allowlisted Overview time windows the panel can request. */
  const OAUTH_OVERVIEW_WINDOWS = ['1h', '24h', '7d'] as const
  type OAuthOverviewWindow = typeof OAUTH_OVERVIEW_WINDOWS[number]

  /**
   * The selected Overview window, kept in composable memory only (never in the
   * URL or a persisted store) so a page can bind a selector to it. `null` means
   * "no explicit window" and the server default (24h) applies.
   */
  const overviewWindow = ref<OAuthOverviewWindow | null>(null)

  // --- Loaders (one per view) ----------------------------------------------

  /**
   * Load the Overview health observations. Accepts an optional bounded `window`
   * (`1h`/`24h`/`7d`); when provided it is stored in composable memory and sent
   * as the `window` query so the server aligns its freshness horizon. When
   * omitted, the last selected window (if any) is reused; when neither is set,
   * the server default (24h) applies.
   */
  function loadOverview(window?: OAuthOverviewWindow) {
    if (window && OAUTH_OVERVIEW_WINDOWS.includes(window)) overviewWindow.value = window
    return run(
      'overview',
      overview,
      '/api/admin/oauth/overview',
      { window: overviewWindow.value ?? undefined },
      data => (Array.isArray(data) ? (data as OAuthObservation[]) : []),
      'OAuth health observations could not be loaded.'
    )
  }

  function loadConfiguration() {
    return run(
      'configuration',
      configuration,
      '/api/admin/oauth/configuration',
      {},
      data => data as OAuthConfiguration,
      'OAuth configuration could not be loaded.'
    )
  }

  function loadApplications(cursor?: string) {
    return run(
      'applications',
      applications,
      '/api/admin/oauth/applications',
      listQuery(cursor),
      data => (data as { items?: OAuthApplicationSummary[] })?.items ?? [],
      'The application inventory could not be loaded.'
    )
  }

  /**
   * Load the always-present MCP + Kiro Crew application status list from
   * `GET /applications/health`. Follows the same abortable, generation-guarded
   * per-view pattern as the other loaders (slot `applications-health`) and keeps
   * the result in composable memory only.
   */
  function loadApplicationsHealth() {
    return run(
      'applications-health',
      applicationsHealth,
      '/api/admin/oauth/applications/health',
      {},
      data => (Array.isArray(data) ? (data as OAuthApplicationStatus[]) : []),
      'Application health could not be loaded.'
    )
  }

  function loadApplicationDetail(clientId: string) {
    return run(
      'application-detail',
      applicationDetail,
      `/api/admin/oauth/applications/${encodeURIComponent(clientId)}`,
      {},
      data => data as OAuthApplicationDetail,
      'Application detail could not be loaded.'
    )
  }

  function loadAttempts(cursor?: string) {
    return run(
      'attempts',
      attempts,
      '/api/admin/oauth/attempts',
      listQuery(cursor),
      data => (data as { items?: OAuthEvent[][] })?.items ?? [],
      'OAuth activity could not be loaded.'
    )
  }

  function loadGrants(cursor?: string) {
    return run(
      'grants',
      grants,
      '/api/admin/oauth/grants',
      listQuery(cursor),
      data => (data as { items?: OAuthGrantSummary[] })?.items ?? [],
      'OAuth grants could not be loaded.'
    )
  }

  function loadIssues(cursor?: string) {
    return run(
      'issues',
      issues,
      '/api/admin/oauth/issues',
      listQuery(cursor),
      data => (data as { items?: OAuthIssue[] })?.items ?? [],
      'OAuth issues could not be loaded.'
    )
  }

  function loadIssueDetail(groupId: string) {
    return run(
      'issue-detail',
      issueDetail,
      `/api/admin/oauth/issues/${encodeURIComponent(groupId)}`,
      {},
      data => data as OAuthIssue,
      'Issue detail could not be loaded.'
    )
  }

  function loadLimits() {
    return run(
      'limits',
      limits,
      '/api/admin/oauth/limits',
      {},
      data => data as OAuthQuotaObservation,
      'Quota observations could not be loaded.'
    )
  }

  function loadAudit(cursor?: string) {
    return run(
      'audit',
      audit,
      '/api/admin/oauth/audit',
      listQuery(cursor),
      data => (data as { items?: Record<string, unknown>[] })?.items ?? [],
      'Audit history could not be loaded.'
    )
  }

  // --- Lifecycle helpers ----------------------------------------------------

  /**
   * Abort every outstanding request and bump all generations so no in-flight
   * response can land after teardown or a capability change. Data refs are left
   * intact for restricted-state handling to null them where appropriate; call
   * `discardRestricted()` to clear them on authorization loss.
   */
  function cancelAll() {
    for (const slot of controllers.keys()) supersede(slot)
    controllers.clear()
  }

  /**
   * Discard restricted results and pending actions on authorization loss or
   * navigation away (Requirements 1.5, 17.6).
   */
  function discardRestricted() {
    cancelAll()
    for (const state of [
      overview,
      configuration,
      applications,
      applicationsHealth,
      applicationDetail,
      attempts,
      grants,
      issues,
      issueDetail,
      limits,
      audit
    ]) {
      state.data = null
      state.loading = false
    }
    // Clear the diagnostics control's in-memory job on authorization loss so a
    // restricted job reference is not retained after teardown (Req 1.5/17.6).
    diagnostics.job = null
    diagnostics.polling = false
    diagnostics.creating = false
    // Drop any retained reconcile result on authorization loss (Req 1.5/17.6).
    reconcile.coverage = null
    reconcile.loading = false
  }

  /** Whether a view state represents an empty (loaded, no data) result. */
  function isEmpty(state: OAuthViewState<unknown>): boolean {
    if (!state.loaded || state.loading || state.unavailable || state.error) return false
    if (state.data === null || state.data === undefined) return true
    if (Array.isArray(state.data)) return state.data.length === 0
    return false
  }

  // --- Application creation flow (task 7.3) ---------------------------------

  /**
   * Session-bound CSRF token, cached in composable memory only. Fetched lazily
   * from `GET /csrf` before the first mutation and reused for the session; it is
   * NEVER written to localStorage/Pinia/the URL (Requirement 17.5).
   */
  const csrfToken = ref<string | null>(null)

  /** In-memory state for the create wizard. */
  const creation = reactive({
    /** True while a preview request is in flight. */
    previewing: false,
    /** The latest normalized preview + form options. */
    preview: null as OAuthApplicationPreview | null,
    /** True while the create operation is submitting. */
    submitting: false,
    /** True while polling the created operation to a terminal state. */
    polling: false,
    /** The accepted operation reference (populated once created). */
    operation: null as Pick<OAuthAdminOperation, 'operationId' | 'state'> | null,
    /** The full operation once polling resolves. */
    operationDetail: null as OAuthAdminOperation | null,
    /** The non-secret creation result on success. */
    result: null as OAuthCreateApplicationResult | null,
    /** A safe error message when a step fails. */
    error: null as string | null,
    /** True when the last failure was a 409 idempotency/revision conflict. */
    conflict: false
  })

  /**
   * Fetch (once) and cache the session-bound CSRF token. Returns the cached
   * value on subsequent calls so a single token is reused for the session.
   */
  async function getCsrfToken(): Promise<string> {
    if (csrfToken.value) return csrfToken.value
    const response = await $fetch<OAuthEnvelope<{ csrfToken: string }>>('/api/admin/oauth/csrf')
    csrfToken.value = response.data.csrfToken
    return csrfToken.value
  }

  /** Reset the wizard state (called when opening/closing the wizard). */
  function resetCreation() {
    supersede('operation-poll')
    creation.previewing = false
    creation.preview = null
    creation.submitting = false
    creation.polling = false
    creation.operation = null
    creation.operationDetail = null
    creation.result = null
    creation.error = null
    creation.conflict = false
  }

  /**
   * Validate a proposed application server-side and cache the normalized
   * preview + form options. Sends the CSRF header on a same-origin POST; nothing
   * is created (Req 6.4).
   */
  async function previewApplication(form: OAuthCreateApplicationForm): Promise<OAuthApplicationPreview | null> {
    creation.previewing = true
    creation.error = null
    creation.conflict = false
    try {
      const token = await getCsrfToken()
      const response = await $fetch<OAuthEnvelope<OAuthApplicationPreview>>(
        '/api/admin/oauth/applications/preview',
        {
          method: 'POST',
          headers: { 'X-CSRF-Token': token },
          body: {
            name: form.name,
            ownership: form.ownership,
            redirectUris: form.redirectUris,
            permittedResources: form.permittedResources,
            permittedScopes: form.permittedScopes
          }
        }
      )
      creation.preview = response.data
      return response.data
    } catch (cause: unknown) {
      creation.preview = null
      creation.error = errorMessage(cause, 'The application could not be validated.')
      return null
    } finally {
      creation.previewing = false
    }
  }

  /**
   * Fetch the deployment's supported resources/scopes for the create wizard's
   * multiselects. This is a non-validating, non-mutating GET
   * (`/api/admin/oauth/applications/options`) so it needs no CSRF token and can
   * populate the dropdowns before the form is otherwise valid (design "D.
   * Create-form options fix"; Requirement 5.1). Returns the `{ resources, scopes }`
   * payload, or `null` on error so the caller can leave the multiselects empty.
   */
  async function fetchApplicationOptions(): Promise<{ resources: string[], scopes: string[] } | null> {
    try {
      const response = await $fetch<OAuthEnvelope<{ resources: string[], scopes: string[] }>>(
        '/api/admin/oauth/applications/options'
      )
      return response.data
    } catch {
      return null
    }
  }

  /**
   * One-shot fetch of the always-present MCP + Kiro Crew application status list
   * (`GET /applications/health`). This is a non-mutating GET so it needs no CSRF
   * token. Unlike `loadApplicationsHealth()` (which drives the reactive
   * `applicationsHealth` view-state), this returns the `OAuthApplicationStatus[]`
   * payload directly, or `null` on error, for callers that only need the value.
   */
  async function fetchApplicationsHealth(): Promise<OAuthApplicationStatus[] | null> {
    try {
      const response = await $fetch<OAuthEnvelope<unknown>>(
        '/api/admin/oauth/applications/health'
      )
      return Array.isArray(response.data) ? (response.data as OAuthApplicationStatus[]) : []
    } catch {
      return null
    }
  }

  // --- Inventory reconcile flow (task 6.1) ----------------------------------

  /**
   * In-memory state for the "Reconcile inventory now" control. Mirrors the
   * `creation`/`diagnostics` mutation-state discipline: nothing is persisted to
   * localStorage/Pinia/the URL. `coverage` holds the most recent reconcile
   * result so the Applications tab can show progress + a "last reconciled" time.
   */
  const reconcile = reactive({
    /** True while a reconcile run is in flight. */
    loading: false,
    /** The most recent bounded reconcile result (coverage + counts + updatedAt). */
    coverage: null as OAuthBackfillCoverage | null,
    /** A safe error message when the reconcile fails. */
    error: null as string | null,
    /** True when the last failure was a 401/403 (access denied / session lost). */
    unavailable: false
  })

  /**
   * Kick one bounded projection backfill via `POST /applications/reconcile` and
   * return the resulting coverage body (coverage/processed/clientsProjected/
   * grantsProjected/hasMore/highWaterMark/updatedAt), or `null` on error. It is a
   * mutation-shaped maintenance action, so it sends the session CSRF token in the
   * `X-CSRF-Token` header, a fresh idempotency key, and a reason on a same-origin
   * POST. The result is kept in composable memory only.
   */
  async function reconcileInventory(reason = 'Manual reconcile requested'): Promise<OAuthBackfillCoverage | null> {
    reconcile.loading = true
    reconcile.error = null
    reconcile.unavailable = false
    try {
      const token = await getCsrfToken()
      const idempotencyKey = crypto.randomUUID()
      const response = await $fetch<OAuthEnvelope<OAuthBackfillCoverage>>(
        '/api/admin/oauth/applications/reconcile',
        {
          method: 'POST',
          headers: { 'X-CSRF-Token': token },
          body: { idempotencyKey, reason }
        }
      )
      reconcile.coverage = response.data
      return response.data
    } catch (cause: unknown) {
      const status = errorStatus(cause)
      if (status === 401 || status === 403) {
        reconcile.unavailable = true
      } else {
        reconcile.error = errorMessage(cause, 'The inventory could not be reconciled.')
      }
      return null
    } finally {
      reconcile.loading = false
    }
  }

  /**
   * Submit the create operation with a freshly generated idempotency key and the
   * CSRF header, then poll the returned operation to a terminal state. Keeps the
   * non-secret result in memory only. A 409 (idempotency-key/input mismatch or
   * revision conflict) surfaces the conflict state.
   */
  async function createApplication(
    form: OAuthCreateApplicationForm,
    reason: string
  ): Promise<OAuthCreateApplicationResult | null> {
    creation.submitting = true
    creation.error = null
    creation.conflict = false
    creation.result = null
    try {
      const token = await getCsrfToken()
      const idempotencyKey = crypto.randomUUID()
      const response = await $fetch<OAuthEnvelope<{
        operationId: string
        state: OAuthAdminOperation['state']
        result?: OAuthCreateApplicationResult
      }>>('/api/admin/oauth/applications', {
        method: 'POST',
        headers: { 'X-CSRF-Token': token },
        body: {
          idempotencyKey,
          reason,
          name: form.name,
          ownership: form.ownership,
          redirectUris: form.redirectUris,
          permittedResources: form.permittedResources,
          permittedScopes: form.permittedScopes
        }
      })
      creation.operation = { operationId: response.data.operationId, state: response.data.state }
      // A synchronous completion already carries the result; otherwise poll.
      if (response.data.result) creation.result = response.data.result
      const operation = await pollOperation(response.data.operationId)
      creation.operationDetail = operation
      if (operation?.result && !creation.result) {
        creation.result = operation.result as unknown as OAuthCreateApplicationResult
      }
      if (operation?.state === 'failed') {
        creation.error = operation.error?.message ?? 'The creation operation failed.'
      }
      return creation.result
    } catch (cause: unknown) {
      const status = errorStatus(cause)
      if (status === 409) {
        creation.conflict = true
        creation.error = errorMessage(cause, 'This creation conflicts with a previous submission.')
      } else {
        creation.error = errorMessage(cause, 'The application could not be created.')
      }
      return null
    } finally {
      creation.submitting = false
    }
  }

  /**
   * Poll `GET /operations/:id` until the operation reaches a terminal state
   * (`completed` / `failed` / `verified`). Abortable + generation-guarded via the
   * `operation-poll` slot so a superseded poll cannot land. Bounded to avoid an
   * unbounded loop.
   */
  async function pollOperation(operationId: string): Promise<OAuthAdminOperation | null> {
    const slot = 'operation-poll'
    const generation = supersede(slot)
    const controller = new AbortController()
    controllers.set(slot, controller)
    creation.polling = true
    const terminal = new Set(['completed', 'failed', 'verified'])
    const maxAttempts = 30
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (generations[slot] !== generation) return null
        try {
          const response = await $fetch<OAuthEnvelope<OAuthAdminOperation>>(
            `/api/admin/oauth/operations/${encodeURIComponent(operationId)}`,
            { signal: controller.signal }
          )
          if (generations[slot] !== generation) return null
          const operation = response.data
          if (terminal.has(operation.state)) return operation
        } catch (cause: unknown) {
          if (controller.signal.aborted || (cause as Error)?.name === 'AbortError') return null
          if (generations[slot] !== generation) return null
          // A 404 immediately after acceptance can be a brief propagation gap;
          // retry a couple of times before surfacing it.
          if (errorStatus(cause) !== 404 || attempt >= 2) throw cause
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      return null
    } finally {
      if (generations[slot] === generation) creation.polling = false
      if (controllers.get(slot) === controller) controllers.delete(slot)
    }
  }

  /**
   * Open an explicit, human-driven normal-consent flow for the CREATED client
   * (Req 6.7). Builds a standard authorization-code + S256 PKCE authorize URL for
   * the created client id and its registered redirect URI, then opens it in a new
   * browser context. A human completes the consent; GHOST mints no session and
   * uses no secret/registration token/credential. The generated PKCE verifier is
   * discarded on unload — it is only needed by whatever local tool receives the
   * redirect, so this test exercises the authorize/consent stages end-to-end.
   */
  async function devSignInTest(result: OAuthCreateApplicationResult): Promise<void> {
    const instructions = result.instructions
    if (!instructions) return
    const redirectUri = instructions.redirectUris[0] ?? result.redirectUris[0]
    if (!redirectUri) return

    // Generate a PKCE code challenge (S256) for the human-driven test. The
    // verifier is never persisted; it lives only for this authorize request.
    const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    const challenge = base64UrlEncode(new Uint8Array(digest))
    const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)))

    const url = new URL(instructions.authorizeUrl)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', result.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', (instructions.scopes.length ? instructions.scopes : result.permittedScopes).join(' '))
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('state', state)
    const resource = instructions.resources[0] ?? result.permittedResources[0]
    if (resource) url.searchParams.set('resource', resource)

    // Open the normal consent flow in a new context. No secret is used.
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  }

  /** URL-safe base64 without padding, for PKCE verifier/challenge and state. */
  function base64UrlEncode(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  // --- Diagnostics operation flow (task 11.2) -------------------------------

  /** In-memory state for the diagnostics operation control. */
  const diagnostics = reactive({
    /** True while creating a job. */
    creating: false,
    /** True while polling a job to a terminal state. */
    polling: false,
    /** The current job (updated as polling progresses); in memory only. */
    job: null as OAuthDiagnosticJob | null,
    /** A safe error message when a step fails. */
    error: null as string | null,
    /** True when the last failure was a 401/403 (access denied / session lost). */
    unavailable: false
  })

  /** Terminal diagnostic job states (no further polling needed). */
  const DIAGNOSTIC_TERMINAL = new Set([
    'completed',
    'failed',
    'cancelled',
    'interrupted',
    'unknown'
  ])

  /**
   * Create a diagnostic job for the named checks, then poll it to a terminal
   * state. Sends the CSRF header + a fresh idempotency key on a same-origin
   * POST. In-memory only; a 409/403 surfaces the appropriate state.
   */
  async function createDiagnostic(checks: OAuthDiagnosticCheck[], reason: string): Promise<OAuthDiagnosticJob | null> {
    diagnostics.creating = true
    diagnostics.error = null
    diagnostics.unavailable = false
    diagnostics.job = null
    try {
      const token = await getCsrfToken()
      const idempotencyKey = crypto.randomUUID()
      const response = await $fetch<OAuthEnvelope<{ jobId: string, state: OAuthDiagnosticJob['state'] }>>(
        '/api/admin/oauth/diagnostics',
        {
          method: 'POST',
          headers: { 'X-CSRF-Token': token },
          body: { idempotencyKey, reason, checks }
        }
      )
      // Seed a minimal job so the UI can render immediately, then poll.
      diagnostics.job = {
        jobId: response.data.jobId,
        checks: [...checks],
        actor: '',
        deployment: 'unknown',
        state: response.data.state,
        cancellationRequested: false,
        results: []
      }
      return await pollDiagnostic(response.data.jobId)
    } catch (cause: unknown) {
      const status = errorStatus(cause)
      if (status === 401 || status === 403) {
        diagnostics.unavailable = true
        diagnostics.job = null
      } else {
        diagnostics.error = errorMessage(cause, 'The diagnostic could not be started.')
      }
      return null
    } finally {
      diagnostics.creating = false
    }
  }

  /**
   * Poll `GET /diagnostics/:id` roughly every two seconds until the job reaches
   * a terminal state (design: UI polls visible jobs every 2s). Abortable +
   * generation-guarded via the `diagnostic-poll` slot so a superseded poll (a
   * new run, a cancel, teardown) cannot land. Bounded to avoid an unbounded loop.
   */
  async function pollDiagnostic(jobId: string): Promise<OAuthDiagnosticJob | null> {
    const slot = 'diagnostic-poll'
    const generation = supersede(slot)
    const controller = new AbortController()
    controllers.set(slot, controller)
    diagnostics.polling = true
    const maxAttempts = 30
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (generations[slot] !== generation) return null
        try {
          const response = await $fetch<OAuthEnvelope<OAuthDiagnosticJob>>(
            `/api/admin/oauth/diagnostics/${encodeURIComponent(jobId)}`,
            { signal: controller.signal }
          )
          if (generations[slot] !== generation) return null
          const job = response.data
          diagnostics.job = job
          if (DIAGNOSTIC_TERMINAL.has(job.state)) return job
        } catch (cause: unknown) {
          if (controller.signal.aborted || (cause as Error)?.name === 'AbortError') return null
          if (generations[slot] !== generation) return null
          const status = errorStatus(cause)
          if (status === 401 || status === 403) {
            diagnostics.unavailable = true
            diagnostics.job = null
            return null
          }
          // A brief 404 right after acceptance can be a propagation gap; retry.
          if (status !== 404 || attempt >= 2) throw cause
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      return diagnostics.job
    } catch (cause: unknown) {
      if (generations[slot] === generation) {
        diagnostics.error = errorMessage(cause, 'The diagnostic status could not be read.')
      }
      return null
    } finally {
      if (generations[slot] === generation) diagnostics.polling = false
      if (controllers.get(slot) === controller) controllers.delete(slot)
    }
  }

  /**
   * Request cancellation of the current diagnostic job, then continue polling so
   * the UI observes the job resolve to `cancelled`. Sends the CSRF header +
   * idempotency key on a same-origin POST.
   */
  async function cancelDiagnostic(jobId: string): Promise<OAuthDiagnosticJob | null> {
    diagnostics.error = null
    try {
      const token = await getCsrfToken()
      const idempotencyKey = crypto.randomUUID()
      const response = await $fetch<OAuthEnvelope<OAuthDiagnosticJob>>(
        `/api/admin/oauth/diagnostics/${encodeURIComponent(jobId)}/cancel`,
        {
          method: 'POST',
          headers: { 'X-CSRF-Token': token },
          body: { idempotencyKey, reason: 'Cancelled by administrator' }
        }
      )
      diagnostics.job = response.data
      // Keep polling: the worker resolves the job to `cancelled` between steps.
      if (!DIAGNOSTIC_TERMINAL.has(response.data.state)) return await pollDiagnostic(jobId)
      return response.data
    } catch (cause: unknown) {
      const status = errorStatus(cause)
      if (status === 401 || status === 403) {
        diagnostics.unavailable = true
        diagnostics.job = null
      } else {
        diagnostics.error = errorMessage(cause, 'The diagnostic could not be cancelled.')
      }
      return null
    }
  }

  /** Reset the diagnostics control (abort polling and clear state). */
  function resetDiagnostics() {
    supersede('diagnostic-poll')
    diagnostics.creating = false
    diagnostics.polling = false
    diagnostics.job = null
    diagnostics.error = null
    diagnostics.unavailable = false
  }

  // --- Issue investigation update flow (task 11.2) --------------------------

  /** In-memory state for issue investigation updates. */
  const issueUpdate = reactive({
    /** True while an update is submitting. */
    submitting: false,
    /** A safe error message when the update fails. */
    error: null as string | null,
    /** True when the last failure was a 409 revision/idempotency conflict. */
    conflict: false,
    /** True when the last failure was a 401/403 (access denied). */
    unavailable: false
  })

  /** The investigation fields an administrator may change. */
  interface IssueInvestigationUpdate {
    owner?: string
    notes?: string
    mitigation?: string
    disposition?: OAuthIssue['disposition']
  }

  /**
   * Apply a revision-checked investigation update (owner/notes/mitigation/
   * disposition) to an issue. Sends the CSRF header, a fresh idempotency key,
   * and the required `expectedRevision` (If-Match) on a same-origin PATCH. A
   * 409 surfaces the conflict state so the caller can reload; the returned issue
   * (on success) already carries the bumped revision. Disposition never changes
   * the evidence-derived recovery verification (enforced server-side, Req 10.6).
   */
  async function updateIssue(
    groupId: string,
    changes: IssueInvestigationUpdate,
    expectedRevision: string,
    reason: string
  ): Promise<OAuthIssue | null> {
    issueUpdate.submitting = true
    issueUpdate.error = null
    issueUpdate.conflict = false
    issueUpdate.unavailable = false
    try {
      const token = await getCsrfToken()
      const idempotencyKey = crypto.randomUUID()
      const response = await $fetch<OAuthEnvelope<{ operationId: string, state: string, issue: OAuthIssue }>>(
        `/api/admin/oauth/issues/${encodeURIComponent(groupId)}`,
        {
          method: 'PATCH',
          headers: { 'X-CSRF-Token': token },
          body: {
            idempotencyKey,
            reason,
            expectedRevision,
            ...(changes.owner !== undefined ? { owner: changes.owner } : {}),
            ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
            ...(changes.mitigation !== undefined ? { mitigation: changes.mitigation } : {}),
            ...(changes.disposition !== undefined ? { disposition: changes.disposition } : {})
          }
        }
      )
      // Reflect the updated issue into the detail view so the UI stays consistent.
      if (issueDetail.data && issueDetail.data.groupId === response.data.issue.groupId) {
        issueDetail.data = response.data.issue
      }
      return response.data.issue
    } catch (cause: unknown) {
      const status = errorStatus(cause)
      if (status === 409) {
        issueUpdate.conflict = true
        issueUpdate.error = errorMessage(cause, 'This issue changed since it was loaded; reload and retry.')
      } else if (status === 401 || status === 403) {
        issueUpdate.unavailable = true
      } else {
        issueUpdate.error = errorMessage(cause, 'The investigation update could not be applied.')
      }
      return null
    } finally {
      issueUpdate.submitting = false
    }
  }

  return {
    // route-query-driven view + filters
    selectedView,
    filters,
    setView,
    setFilters,

    // per-view state
    overview,
    overviewWindow,
    configuration,
    applications,
    applicationsHealth,
    applicationDetail,
    attempts,
    grants,
    issues,
    issueDetail,
    limits,
    audit,

    // loaders
    loadOverview,
    loadConfiguration,
    loadApplications,
    loadApplicationsHealth,
    loadApplicationDetail,
    loadAttempts,
    loadGrants,
    loadIssues,
    loadIssueDetail,
    loadLimits,
    loadAudit,

    // application creation flow (task 7.3)
    creation,
    getCsrfToken,
    resetCreation,
    fetchApplicationOptions,
    fetchApplicationsHealth,
    previewApplication,
    createApplication,
    pollOperation,
    devSignInTest,

    // inventory reconcile flow (task 6.1)
    reconcile,
    reconcileInventory,

    // diagnostics operation flow (task 11.2)
    diagnostics,
    createDiagnostic,
    pollDiagnostic,
    cancelDiagnostic,
    resetDiagnostics,

    // issue investigation update flow (task 11.2)
    issueUpdate,
    updateIssue,

    // lifecycle + helpers
    cancelAll,
    discardRestricted,
    isEmpty
  }
}

export type UseOAuthAdministration = ReturnType<typeof useOAuthAdministration>
