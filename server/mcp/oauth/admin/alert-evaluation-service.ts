/**
 * OAuth Administration — five-minute locked alert evaluation (task 13.2).
 *
 * Evidence-based OAuth alerts (design "Diagnostics, maintenance, and alerts"
 * alert paragraph; Requirements 15.1, 15.2, 15.4, 15.5, 15.6). Evaluation runs
 * under the OAuth-specific DEPLOYMENT maintenance lock so concurrent workers do
 * not double-evaluate, reads the validated alert settings (task 13.1), and for
 * each condition:
 *   - crosses the design-default thresholds over a BOUNDED recent event window
 *     (registration rejections, token-exchange/refresh failures per stage,
 *     consecutive fresh discovery/storage failures, and a signing-key deadline
 *     only when an EXPLICITLY KNOWN date exists);
 *   - DEDUPLICATES by an active deployment/condition/resource/client GROUP, so a
 *     still-crossing condition keeps the SINGLE existing active alert (updating
 *     its lastEvaluatedAt/evidence) rather than creating a duplicate
 *     (Requirement 15.1 "deduplicated");
 *   - RECOVERS only from FRESH evidence: an active alert whose condition clears
 *     in a fresh window transitions to `recovered` and produces a recovery
 *     notice; missing/stale/absent observations NEVER produce a recovery
 *     (Requirement 15.5);
 *   - attaches SAFE evidence references only (event/observation refs, no raw
 *     content);
 *   - delivers only to an APPROVED organization destination and otherwise marks
 *     delivery `unavailable` with NO fallback to a developer/arbitrary address
 *     (Requirement 15.4).
 *
 * SIGNING-KEY DEADLINE (Requirement 15.6): a JWK carries no certificate-style
 * validity window, so a signing-key deadline is only KNOWN when a deployment
 * explicitly supplies it (`GHOST_OAUTH_SIGNING_KEY_DEADLINE`, an ISO date).
 * When it is absent the check is labelled `unknown` and NEVER alerts.
 *
 * REFRESH-ALARM COMPATIBILITY (Requirement 15.2 wording "preserve existing
 * refresh alarms without duplicate default notification"): this evaluator reads
 * only the admin telemetry/evidence (collected OAuth events / health
 * observations). It never invokes, re-emits, or duplicates the legacy
 * `recordRefreshEvent` alarm's own notification path; the legacy alarm keeps its
 * own behaviour untouched.
 *
 * The condition evaluation is a PURE, unit-testable transform
 * ({@link evaluateAlertConditions}); the service wraps it with the lock,
 * settings read, repository dedup/recovery upserts, and delivery.
 */

import type {
  IsoDateTime,
  OAuthAlert,
  OAuthAlertCondition,
  OAuthAlertDeliveryStatus,
  OAuthDeploymentContext,
  OAuthEvent,
  OAuthListQuery,
  OAuthStage,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRedactor, OAuthAdminRepository } from './types'
import { getOAuthAdminRepository } from './index'
import { oauthAdminRedactor } from './redactor'
import { getOAuthMaintenanceLockStore, maintenanceLockKey, type OAuthMaintenanceLockStore } from './oauth-maintenance-lock'
import { getOAuthAlertSettings, type OAuthAlertSettings, type OAuthAlertSettingsDeps } from './alert-settings'
import { MAX_LIMIT, logicalExpiryFor } from './repository-support'
import { getConfigValue as defaultGetConfigValue } from '../../../utils/site-config'
import {
  sendAdminNotification as defaultSendAdminNotification,
  NotificationType,
  type SendNotificationOptions
} from '../../../utils/admin-notifications'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** A placeholder token used in the dedup group key when a dimension is absent. */
const UNOBSERVED = '-'

/**
 * The lock scope for the alert evaluation loop, namespaced separately from the
 * diagnostics `worker` scope so the two maintenance loops never contend on the
 * same lock row.
 */
export const ALERT_EVALUATION_LOCK_SCOPE = 'alerts'

/** A short lease so a crashed evaluator frees the lock quickly. */
export const ALERT_EVALUATION_LEASE_MS = 60 * 1000

/** Cap the number of safe evidence references attached to an alert. */
const MAX_EVIDENCE_REFS = 20

/**
 * The explicit signing-key deadline environment variable. A JWK has no expiry,
 * so a deadline is only KNOWN when a deployment supplies this ISO date; absent
 * or unparseable values mean the check is `unknown` and never alerts (15.6).
 */
export const SIGNING_KEY_DEADLINE_ENV = 'GHOST_OAUTH_SIGNING_KEY_DEADLINE'

// ---------------------------------------------------------------------------
// Condition → group key
// ---------------------------------------------------------------------------

/**
 * Build the dedup group key from the active deployment/condition/resource/client
 * group (Requirement 15.1). Absent dimensions use a stable placeholder so
 * absence is itself stable and a per-stage condition still yields one group.
 */
export function alertGroupKey(
  deploymentId: string,
  condition: OAuthAlertCondition,
  resource?: string,
  client?: string,
  stage?: string
): string {
  return [
    deploymentId,
    condition,
    stage || UNOBSERVED,
    resource || UNOBSERVED,
    client || UNOBSERVED
  ].join('|')
}

// ---------------------------------------------------------------------------
// Pure condition evaluation
// ---------------------------------------------------------------------------

/** The outcome of evaluating one condition group over the fresh window. */
export interface AlertConditionEvaluation {
  condition: OAuthAlertCondition
  groupKey: string
  /** The specific stage this evaluation is scoped to, when applicable. */
  stage?: OAuthStage
  resource?: OpaqueReference
  client?: OpaqueReference
  /** Whether the condition crosses its threshold in the fresh window. */
  crossed: boolean
  /**
   * Whether the window contained FRESH evidence for this condition (at least
   * one observation inside the window). Recovery is only produced when
   * `!crossed` AND `hasFreshEvidence` — a window with NO evidence never recovers
   * (Requirement 15.5).
   */
  hasFreshEvidence: boolean
  threshold: number
  windowSeconds: number
  /** Safe references to the evidence that crossed (or was considered). */
  evidenceReferences: OpaqueReference[]
}

/** Inputs to the pure condition evaluator. */
export interface AlertEvaluationInputs {
  ctx: OAuthDeploymentContext
  settings: OAuthAlertSettings
  /** The bounded window of recent events (already retention-filtered). */
  events: readonly OAuthEvent[]
  /** Explicitly known signing-key deadline (ISO), or undefined when unknown. */
  signingKeyDeadline?: IsoDateTime
  now: number
}

/** Only failure/denied outcomes count toward a failure threshold. */
function isFailure(event: OAuthEvent): boolean {
  return event.outcome === 'failure' || event.outcome === 'denied'
}

/** Registration rejections are registration-stage failures (typically 429). */
function isRegistrationRejection(event: OAuthEvent): boolean {
  return event.stage === 'registration' && isFailure(event)
}

/**
 * Evaluate every alert condition over the fresh window using the design
 * defaults from `settings`. PURE and deterministic: the same inputs always
 * yield the same evaluations. Produces one evaluation per condition GROUP
 * (per-stage where the design scopes the threshold per stage).
 */
export function evaluateAlertConditions(inputs: AlertEvaluationInputs): AlertConditionEvaluation[] {
  const { ctx, settings, events, signingKeyDeadline, now } = inputs
  const { thresholds } = settings
  const windowMs = thresholds.windowMinutes * 60 * 1000
  const windowStartMs = now - windowMs
  const windowSeconds = thresholds.windowMinutes * 60
  const gapMs = thresholds.consecutiveGapMinutes * 60 * 1000

  // Only events inside the fresh sliding window are considered.
  const windowed = events.filter((event) => {
    const ts = new Date(event.timestamp).getTime()
    return Number.isFinite(ts) && ts >= windowStartMs && ts <= now
  })

  const evaluations: AlertConditionEvaluation[] = []

  // --- Sustained registration rejections (>threshold in window) ----------
  {
    const matches = windowed.filter(isRegistrationRejection)
    evaluations.push({
      condition: 'sustained-throttling',
      groupKey: alertGroupKey(ctx.deploymentId, 'sustained-throttling', undefined, undefined, 'registration'),
      stage: 'registration',
      crossed: matches.length > thresholds.registrationRejections,
      // Registration telemetry is present when any registration event (success
      // or failure) exists in the window — that is fresh evidence the stage was
      // exercised, which lets a cleared window recover.
      hasFreshEvidence: windowed.some(e => e.stage === 'registration'),
      threshold: thresholds.registrationRejections,
      windowSeconds,
      evidenceReferences: matches.slice(0, MAX_EVIDENCE_REFS).map(e => e.eventId)
    })
  }

  // --- Token-exchange failures per stage (>threshold in window) ----------
  evaluations.push(buildStageFailureEvaluation(
    ctx, windowed, 'token-failure', 'token-exchange', thresholds.tokenFailures, windowSeconds
  ))

  // --- Refresh failures per stage (>threshold in window) -----------------
  // Evaluated from admin telemetry only; the legacy refresh alarm is untouched.
  evaluations.push(buildStageFailureEvaluation(
    ctx, windowed, 'refresh-failure', 'refresh', thresholds.refreshFailures, windowSeconds
  ))

  // --- Two consecutive fresh discovery failures five minutes apart -------
  evaluations.push(buildConsecutiveFailureEvaluation(
    ctx, windowed, 'discovery-mismatch',
    ['protected-resource-discovery', 'authorization-server-discovery'],
    thresholds.consecutiveDiscoveryFailures, gapMs, windowSeconds
  ))

  // --- Two consecutive fresh storage failures five minutes apart ---------
  evaluations.push(buildConsecutiveFailureEvaluation(
    ctx, windowed, 'storage-failure', ['provider-storage'],
    thresholds.consecutiveStorageFailures, gapMs, windowSeconds
  ))

  // --- Signing-key deadline within N days (ONLY when explicitly known) ----
  {
    const groupKey = alertGroupKey(ctx.deploymentId, 'signing-key-deadline')
    const deadlineMs = signingKeyDeadline ? new Date(signingKeyDeadline).getTime() : NaN
    const known = Boolean(signingKeyDeadline) && Number.isFinite(deadlineMs)
    const withinDays = known
      && (deadlineMs - now) <= thresholds.signingKeyDeadlineDays * 24 * 60 * 60 * 1000
    evaluations.push({
      condition: 'signing-key-deadline',
      groupKey,
      // Unknown deadline: no fresh evidence, never crosses (15.6). A known
      // deadline IS fresh evidence, so a subsequently-extended deadline recovers.
      crossed: known ? withinDays : false,
      hasFreshEvidence: known,
      threshold: thresholds.signingKeyDeadlineDays,
      windowSeconds,
      evidenceReferences: known ? [`signing-key-deadline:${signingKeyDeadline}`] : []
    })
  }

  return evaluations
}

/**
 * Build a per-stage failure evaluation: crossed when strictly more than
 * `threshold` failures for `stage` occur in the window. Fresh evidence exists
 * when the stage was exercised at all in the window (success or failure).
 */
function buildStageFailureEvaluation(
  ctx: OAuthDeploymentContext,
  windowed: readonly OAuthEvent[],
  condition: OAuthAlertCondition,
  stage: OAuthStage,
  threshold: number,
  windowSeconds: number
): AlertConditionEvaluation {
  const stageEvents = windowed.filter(e => e.stage === stage)
  const failures = stageEvents.filter(isFailure)
  return {
    condition,
    groupKey: alertGroupKey(ctx.deploymentId, condition, undefined, undefined, stage),
    stage,
    crossed: failures.length > threshold,
    hasFreshEvidence: stageEvents.length > 0,
    threshold,
    windowSeconds,
    evidenceReferences: failures.slice(0, MAX_EVIDENCE_REFS).map(e => e.eventId)
  }
}

/**
 * Build a consecutive-failure evaluation: crossed when at least `required`
 * failures for the given stages occur with each successive failure at least
 * `gapMs` after the previous counted one (design "two consecutive fresh
 * failures five minutes apart"). Fresh evidence exists when any of the stages
 * was exercised in the window.
 */
function buildConsecutiveFailureEvaluation(
  ctx: OAuthDeploymentContext,
  windowed: readonly OAuthEvent[],
  condition: OAuthAlertCondition,
  stages: readonly OAuthStage[],
  required: number,
  gapMs: number,
  windowSeconds: number
): AlertConditionEvaluation {
  const stageSet = new Set<OAuthStage>(stages)
  const scoped = windowed.filter(e => stageSet.has(e.stage))
  const failures = scoped
    .filter(isFailure)
    .map(e => ({ event: e, ts: new Date(e.timestamp).getTime() }))
    .filter(x => Number.isFinite(x.ts))
    .sort((a, b) => a.ts - b.ts)

  // Count a maximal chain where each counted failure is >= gapMs after the last.
  const counted: OAuthEvent[] = []
  let lastCountedTs = -Infinity
  for (const { event, ts } of failures) {
    if (counted.length === 0 || ts - lastCountedTs >= gapMs) {
      counted.push(event)
      lastCountedTs = ts
    }
  }

  return {
    condition,
    groupKey: alertGroupKey(ctx.deploymentId, condition, undefined, undefined, stages.join('+')),
    crossed: counted.length >= required,
    hasFreshEvidence: scoped.length > 0,
    threshold: required,
    windowSeconds,
    evidenceReferences: counted.slice(0, MAX_EVIDENCE_REFS).map(e => e.eventId)
  }
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * Resolve whether an APPROVED organization destination exists for delivery.
 * Only the org-approved `email.admin.notificationEmails` set counts; the
 * env-var / hardcoded developer fallback used elsewhere is NOT honoured here so
 * an alert never falls back to a developer address (Requirement 15.4).
 */
export async function resolveApprovedRecipients(
  settings: OAuthAlertSettings,
  getConfigValue: typeof defaultGetConfigValue
): Promise<string[]> {
  if (settings.recipientsRef === 'none') return []
  // `admin-notifications` names the approved organization destination.
  const emails = await getConfigValue<string[]>('email.admin.notificationEmails')
  if (!Array.isArray(emails)) return []
  return emails.filter(e => typeof e === 'string' && e.trim().length > 0).map(e => e.trim())
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Injectable dependencies so tests avoid live DynamoDB / SES / site-config. */
export interface OAuthAlertEvaluationDeps {
  repository: OAuthAdminRepository
  lockStore: OAuthMaintenanceLockStore
  redactor: OAuthAdminRedactor
  getConfigValue: typeof defaultGetConfigValue
  sendAdminNotification: typeof defaultSendAdminNotification
  settingsDeps?: OAuthAlertSettingsDeps
  /** Explicit signing-key deadline resolver (defaults to the env var). */
  resolveSigningKeyDeadline: () => IsoDateTime | undefined
}

/** Outcome of one evaluation run (for the loop / tests). */
export interface OAuthAlertEvaluationResult {
  /** True when the deployment lock was acquired and evaluation ran. */
  ran: boolean
  /** Alerts newly created or kept active this run. */
  active: OAuthAlert[]
  /** Alerts transitioned to recovered this run. */
  recovered: OAuthAlert[]
}

function defaultSigningKeyDeadline(): IsoDateTime | undefined {
  const raw = process.env[SIGNING_KEY_DEADLINE_ENV]
  if (!raw) return undefined
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

/**
 * Evidence-based, deduplicated OAuth alert evaluation service. Runs under the
 * deployment maintenance lock; reads validated settings; evaluates conditions
 * over a bounded fresh window; dedups by active group; recovers only from fresh
 * evidence; and delivers only to approved organization destinations.
 */
export class OAuthAlertEvaluationService {
  private readonly repository: OAuthAdminRepository
  private readonly lockStore: OAuthMaintenanceLockStore
  private readonly redactor: OAuthAdminRedactor
  private readonly getConfigValue: typeof defaultGetConfigValue
  private readonly sendAdminNotification: typeof defaultSendAdminNotification
  private readonly settingsDeps?: OAuthAlertSettingsDeps
  private readonly resolveSigningKeyDeadline: () => IsoDateTime | undefined

  constructor(deps?: Partial<OAuthAlertEvaluationDeps>) {
    this.repository = deps?.repository ?? getOAuthAdminRepository()
    this.lockStore = deps?.lockStore ?? getOAuthMaintenanceLockStore()
    this.redactor = deps?.redactor ?? oauthAdminRedactor
    this.getConfigValue = deps?.getConfigValue ?? defaultGetConfigValue
    this.sendAdminNotification = deps?.sendAdminNotification ?? defaultSendAdminNotification
    this.settingsDeps = deps?.settingsDeps
    this.resolveSigningKeyDeadline = deps?.resolveSigningKeyDeadline ?? defaultSigningKeyDeadline
  }

  /**
   * Evaluate alerts for the deployment under the deployment lock. When the lock
   * is already held by another worker this run is a no-op (`ran: false`),
   * preventing double-evaluation. When alerts are disabled this run is also a
   * no-op. Returns the active/recovered alerts touched this run.
   */
  async evaluate(
    access: OAuthAdminAccessContext,
    now: number = Date.now()
  ): Promise<OAuthAlertEvaluationResult> {
    const ctx = access.deployment
    const lockKey = maintenanceLockKey(ctx, ALERT_EVALUATION_LOCK_SCOPE)
    const lease = await this.lockStore.claim(lockKey, ALERT_EVALUATION_LEASE_MS, now)
    // Another worker holds the deployment lock — skip to avoid double-eval.
    if (!lease) return { ran: false, active: [], recovered: [] }

    try {
      const settings = await getOAuthAlertSettings(this.settingsDeps)
      if (!settings.enabled) return { ran: true, active: [], recovered: [] }

      // Bounded, retention-filtered recent event window (the repository applies
      // logical expiry and caps the page). The evaluator then slices to the
      // configured sliding window.
      const windowMs = settings.thresholds.windowMinutes * 60 * 1000
      const query: OAuthListQuery = {
        from: new Date(now - windowMs).toISOString(),
        to: new Date(now).toISOString(),
        limit: MAX_LIMIT,
        order: 'asc'
      }
      const page = await this.repository.queryEvents(ctx, query)

      const evaluations = evaluateAlertConditions({
        ctx,
        settings,
        events: page.items,
        signingKeyDeadline: this.resolveSigningKeyDeadline(),
        now
      })

      const approvedRecipients = await resolveApprovedRecipients(settings, this.getConfigValue)
      const recipientApproved = approvedRecipients.length > 0

      const active: OAuthAlert[] = []
      const recovered: OAuthAlert[] = []

      for (const evaluation of evaluations) {
        const existing = await this.repository.getActiveAlert(ctx, evaluation.groupKey)

        if (evaluation.crossed) {
          const alert = await this.raiseOrKeep(ctx, evaluation, existing, recipientApproved, approvedRecipients, now)
          active.push(alert)
          continue
        }

        // Not crossing. Only recover an EXISTING active alert, and ONLY when the
        // window carried fresh evidence that the condition cleared. Missing/
        // stale/absent evidence must not recover (Requirement 15.5).
        if (existing && evaluation.hasFreshEvidence) {
          const recoveredAlert = await this.recover(ctx, evaluation, existing, approvedRecipients, now)
          recovered.push(recoveredAlert)
        }
      }

      return { ran: true, active, recovered }
    } finally {
      await this.lockStore.release(lease)
    }
  }

  /**
   * Raise a new active alert or KEEP the single existing one (dedup). A still-
   * crossing condition updates `lastEvaluatedAt`/evidence on the existing active
   * alert rather than creating a duplicate (Requirement 15.1). A newly-crossed
   * condition creates one active alert and delivers a notice.
   */
  private async raiseOrKeep(
    ctx: OAuthDeploymentContext,
    evaluation: AlertConditionEvaluation,
    existing: OAuthAlert | null,
    recipientApproved: boolean,
    approvedRecipients: string[],
    now: number
  ): Promise<OAuthAlert> {
    const nowIso = new Date(now).toISOString()

    if (existing) {
      // Dedup: keep the SAME active alert, refresh its evaluation time/evidence.
      const updated: OAuthAlert = {
        ...existing,
        lastEvaluatedAt: nowIso,
        evidenceReferences: evaluation.evidenceReferences,
        threshold: evaluation.threshold,
        windowSeconds: evaluation.windowSeconds,
        recipientApproved
      }
      await this.repository.upsertAlert(ctx, this.redactor.redact(updated))
      return updated
    }

    // First crossing: create one active alert and attempt delivery.
    const deliveryStatus = await this.deliver(evaluation, recipientApproved, approvedRecipients, false)
    const created: OAuthAlert = withExpiry({
      alertId: `alert_${randomId()}`,
      groupKey: evaluation.groupKey,
      condition: evaluation.condition,
      state: 'active',
      threshold: evaluation.threshold,
      windowSeconds: evaluation.windowSeconds,
      evidenceReferences: evaluation.evidenceReferences,
      deliveryStatus,
      recipientApproved,
      firstEvaluatedAt: nowIso,
      lastEvaluatedAt: nowIso
    }, now)
    await this.repository.upsertAlert(ctx, this.redactor.redact(created))
    return created
  }

  /**
   * Transition an active alert to `recovered` and produce a recovery notice.
   * Only called with FRESH evidence that the condition cleared (Requirement
   * 15.2 / 15.5). The recovery-notice delivery status is recorded too.
   */
  private async recover(
    ctx: OAuthDeploymentContext,
    evaluation: AlertConditionEvaluation,
    existing: OAuthAlert,
    approvedRecipients: string[],
    now: number
  ): Promise<OAuthAlert> {
    const nowIso = new Date(now).toISOString()
    const deliveryStatus = await this.deliver(evaluation, existing.recipientApproved, approvedRecipients, true)
    const recovered: OAuthAlert = withExpiry({
      ...existing,
      state: 'recovered',
      lastEvaluatedAt: nowIso,
      recoveredAt: nowIso,
      deliveryStatus
    }, now)
    await this.repository.upsertAlert(ctx, this.redactor.redact(recovered))
    return recovered
  }

  /**
   * Deliver a notice to the approved organization destination and return the
   * resulting delivery status. With no approved recipient, delivery is
   * `unavailable` and NO notification is sent (no fallback — Requirement 15.4).
   */
  private async deliver(
    evaluation: AlertConditionEvaluation,
    recipientApproved: boolean,
    approvedRecipients: string[],
    isRecovery: boolean
  ): Promise<OAuthAlertDeliveryStatus> {
    if (!recipientApproved || approvedRecipients.length === 0) return 'unavailable'

    const options: SendNotificationOptions = {
      type: NotificationType.SYSTEM_ALERT,
      subject: isRecovery
        ? `OAuth alert recovered: ${evaluation.condition}`
        : `OAuth alert: ${evaluation.condition}`,
      // Only safe, non-raw fields are included in the notification body.
      data: {
        condition: evaluation.condition,
        stage: evaluation.stage ?? 'n/a',
        threshold: evaluation.threshold,
        windowSeconds: evaluation.windowSeconds,
        evidenceCount: evaluation.evidenceReferences.length,
        state: isRecovery ? 'recovered' : 'active'
      },
      metadata: {
        trigger: isRecovery ? 'oauth_alert_recovery' : 'oauth_alert',
        environment: 'oauth-administration'
      },
      // Deliver ONLY to the resolved approved organization destination.
      recipients: approvedRecipients
    }

    try {
      const result = await this.sendAdminNotification(options)
      return result.success ? 'delivered' : 'failed'
    } catch {
      // A delivery failure is recorded, never thrown — evaluation must not fail.
      return 'failed'
    }
  }
}

/** Apply the 90-day logical expiry fields to an alert (retention alignment). */
function withExpiry(alert: Omit<OAuthAlert, 'logicalExpiresAt' | 'ttl'>, now: number): OAuthAlert {
  const expiry = logicalExpiryFor(new Date(now).toISOString(), now)
  return { ...alert, ...expiry }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 12)
}

/**
 * Shared alert evaluation service, constructed lazily so the repository factory
 * in `./index` resolves on first use rather than at module load.
 */
let sharedAlertEvaluationService: OAuthAlertEvaluationService | undefined

/** Resolve the shared {@link OAuthAlertEvaluationService}. */
export function getOAuthAlertEvaluationService(): OAuthAlertEvaluationService {
  if (!sharedAlertEvaluationService) sharedAlertEvaluationService = new OAuthAlertEvaluationService()
  return sharedAlertEvaluationService
}
