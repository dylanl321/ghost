/**
 * OAuth Administration — validated `oauth.alerts.*` settings (task 13.1).
 *
 * Evidence-based OAuth alerts are configured through the EXISTING site
 * configuration store under the `oauth.alerts.*` keys (design "Diagnostics,
 * maintenance, and alerts": "OAuth settings live under `oauth.alerts.*` in
 * existing site configuration; all update/reset paths need the operations
 * capability. Delivery is disabled without explicitly approved organization
 * recipients and never falls back to an arbitrary caller/developer address").
 *
 * This module owns:
 *   - {@link getOAuthAlertSettings} — reads the three `oauth.alerts.*` keys,
 *     validates them, and applies the design defaults for any unset/invalid
 *     value so a caller always receives a complete, safe settings object.
 *   - {@link updateOAuthAlertSettings} — validates a partial patch (bounded
 *     positive thresholds, sane windows, and a recipients reference that names
 *     an EXISTING approved organization destination — never a free-form
 *     address) and persists ONLY the changed `oauth.alerts.*` keys.
 *   - {@link resetOAuthAlertSettings} — restores the design defaults.
 *
 * SAFETY:
 *   - Recipients NEVER carry a free-form address. `recipientsRef` is a
 *     reference to an existing approved organization notification destination
 *     (`admin-notifications`, resolved from the org-approved
 *     `email.admin.notificationEmails` set) or `none` to disable delivery.
 *     Anything else — including an email address supplied inline — is rejected
 *     (Requirement 15.4 / 18.6).
 *   - Update/reset validate their input and mutate ONLY `oauth.alerts.*` keys.
 *     Non-OAuth provider configuration is never touched. Capability enforcement
 *     lives in the routes and in the generic site-config guard; this module is
 *     the shared validated read/write surface those paths call.
 *
 * The site-config accessors are injected via {@link OAuthAlertSettingsDeps} so
 * focused tests exercise validation and default-application without a live
 * DynamoDB table.
 */

import type { OAuthAdminAccessContext } from './types'
import { oauthAdminErrors } from './access-service'
import {
  getConfigValue as defaultGetConfigValue,
  updateSiteConfig as defaultUpdateSiteConfig,
  resetSiteConfig as defaultResetSiteConfig
} from '../../../utils/site-config'

// ---------------------------------------------------------------------------
// Setting keys and reference values
// ---------------------------------------------------------------------------

/** The `oauth.alerts.*` site-config keys owned by this module. */
export const OAUTH_ALERT_SETTING_KEYS = {
  enabled: 'oauth.alerts.enabled',
  thresholds: 'oauth.alerts.thresholds',
  recipientsRef: 'oauth.alerts.recipientsRef'
} as const

/**
 * The set of `oauth.alerts.*` keys, exported so the generic site-config admin
 * route can reject writes to any of them unless the OAuth operations capability
 * is held (bypass closure, Req 15.3).
 */
export const OAUTH_ALERT_SETTING_KEY_LIST: readonly string[] = Object.values(OAUTH_ALERT_SETTING_KEYS)

/**
 * The supported recipients references. `admin-notifications` names the existing
 * approved organization notification destination (the admin notification set);
 * `none` disables delivery. A free-form email address is NOT a valid value.
 */
export const OAUTH_ALERT_RECIPIENT_REFERENCES = ['admin-notifications', 'none'] as const
export type OAuthAlertRecipientsRef = (typeof OAUTH_ALERT_RECIPIENT_REFERENCES)[number]

/**
 * True when `key` is one of the capability-gated `oauth.alerts.*` settings keys.
 * The generic site-config admin update/reset routes call this to reject a write
 * or reset of these keys unless the OAuth operations capability is held, so the
 * generic route is never a bypass around the operations-gated settings paths
 * (Requirement 15.3).
 */
export function isOAuthAlertSettingKey(key: string): boolean {
  return OAUTH_ALERT_SETTING_KEY_LIST.includes(key)
}

/** True when `value` names an approved organization destination reference. */
export function isApprovedRecipientsRef(value: unknown): value is OAuthAlertRecipientsRef {
  return typeof value === 'string' && (OAUTH_ALERT_RECIPIENT_REFERENCES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Evidence thresholds for OAuth alerts. Every value is a bounded positive
 * number; windows are sane minute counts. These mirror the design defaults and
 * are enforced on every update.
 */
export interface OAuthAlertThresholds {
  /** More than N registration rejections within the window triggers an alert. */
  registrationRejections: number
  /** More than N token-exchange failures within the window triggers an alert. */
  tokenFailures: number
  /** More than N refresh failures within the window triggers an alert. */
  refreshFailures: number
  /** N consecutive fresh discovery failures (gap apart) triggers an alert. */
  consecutiveDiscoveryFailures: number
  /** N consecutive fresh storage failures (gap apart) triggers an alert. */
  consecutiveStorageFailures: number
  /** An explicitly known signing-key deadline within N days triggers an alert. */
  signingKeyDeadlineDays: number
  /** The sliding evaluation window, in minutes. */
  windowMinutes: number
  /** The minimum spacing between consecutive-failure observations, in minutes. */
  consecutiveGapMinutes: number
}

/** The complete, validated OAuth alert settings. */
export interface OAuthAlertSettings {
  enabled: boolean
  thresholds: OAuthAlertThresholds
  recipientsRef: OAuthAlertRecipientsRef
}

/** A partial patch a caller may submit. Only present fields are validated/applied. */
export interface OAuthAlertSettingsPatch {
  enabled?: boolean
  thresholds?: Partial<OAuthAlertThresholds>
  recipientsRef?: string
}

/**
 * The design defaults, applied when a value is unset or fails validation on
 * read. These match the `oauth.alerts.*` entries in DEFAULT_SITE_CONFIG.
 */
export const DEFAULT_OAUTH_ALERT_THRESHOLDS: Readonly<OAuthAlertThresholds> = Object.freeze({
  registrationRejections: 5,
  tokenFailures: 5,
  refreshFailures: 5,
  consecutiveDiscoveryFailures: 2,
  consecutiveStorageFailures: 2,
  signingKeyDeadlineDays: 14,
  windowMinutes: 15,
  consecutiveGapMinutes: 5
})

export const DEFAULT_OAUTH_ALERT_SETTINGS: Readonly<OAuthAlertSettings> = Object.freeze({
  enabled: false,
  thresholds: DEFAULT_OAUTH_ALERT_THRESHOLDS,
  recipientsRef: 'admin-notifications'
})

// ---------------------------------------------------------------------------
// Validation bounds
// ---------------------------------------------------------------------------

/**
 * Per-field bounds for threshold validation. Every threshold is a positive
 * integer; the upper bounds keep a mis-typed value from making alerts
 * effectively unreachable while staying generous enough for real tuning.
 */
const THRESHOLD_BOUNDS: Record<keyof OAuthAlertThresholds, { min: number, max: number }> = {
  registrationRejections: { min: 1, max: 10000 },
  tokenFailures: { min: 1, max: 10000 },
  refreshFailures: { min: 1, max: 10000 },
  consecutiveDiscoveryFailures: { min: 1, max: 100 },
  consecutiveStorageFailures: { min: 1, max: 100 },
  signingKeyDeadlineDays: { min: 1, max: 3650 },
  windowMinutes: { min: 1, max: 1440 },
  consecutiveGapMinutes: { min: 1, max: 1440 }
}

const THRESHOLD_FIELDS = Object.keys(THRESHOLD_BOUNDS) as (keyof OAuthAlertThresholds)[]

/**
 * Validate a single threshold field. A non-finite, non-integer, or out-of-range
 * value (including zero or negative) is a 400 — a threshold must be a bounded
 * positive number and windows must be sane.
 */
function validateThresholdField(field: keyof OAuthAlertThresholds, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw oauthAdminErrors.badRequest({
      message: `Threshold "${field}" must be a positive integer.`,
      data: { field: `thresholds.${field}`, reason: 'INVALID_THRESHOLD' }
    })
  }
  const bounds = THRESHOLD_BOUNDS[field]
  if (value < bounds.min || value > bounds.max) {
    throw oauthAdminErrors.badRequest({
      message: `Threshold "${field}" must be between ${bounds.min} and ${bounds.max}.`,
      data: { field: `thresholds.${field}`, reason: 'OUT_OF_RANGE', min: bounds.min, max: bounds.max }
    })
  }
  return value
}

/**
 * Coerce an arbitrary stored/patched thresholds object into a complete,
 * validated {@link OAuthAlertThresholds}. `strict` controls the missing-field
 * behavior: on READ (`strict=false`) a missing/invalid field falls back to the
 * design default so a partially-written record still yields safe settings; on
 * UPDATE (`strict=true`) every SUPPLIED field is validated and missing fields
 * are filled from `base` (the current effective thresholds) so a partial patch
 * never silently resets untouched fields.
 */
function resolveThresholds(
  raw: unknown,
  base: OAuthAlertThresholds,
  strict: boolean
): OAuthAlertThresholds {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {}
  const resolved = { ...base }
  for (const field of THRESHOLD_FIELDS) {
    if (source[field] === undefined) continue
    if (strict) {
      resolved[field] = validateThresholdField(field, source[field])
    } else {
      // Lenient read: accept a valid stored value, else keep the default.
      const value = source[field]
      resolved[field] = (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
        && value >= THRESHOLD_BOUNDS[field].min && value <= THRESHOLD_BOUNDS[field].max)
        ? value
        : base[field]
    }
  }
  return resolved
}

// ---------------------------------------------------------------------------
// Dependencies (injectable for tests)
// ---------------------------------------------------------------------------

/** Injectable site-config accessors so tests avoid a live DynamoDB table. */
export interface OAuthAlertSettingsDeps {
  getConfigValue: typeof defaultGetConfigValue
  updateSiteConfig: typeof defaultUpdateSiteConfig
  resetSiteConfig: typeof defaultResetSiteConfig
}

const defaultDeps: OAuthAlertSettingsDeps = {
  getConfigValue: defaultGetConfigValue,
  updateSiteConfig: defaultUpdateSiteConfig,
  resetSiteConfig: defaultResetSiteConfig
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Read the current OAuth alert settings from site configuration, validating
 * every value and applying the design defaults for anything unset or invalid.
 * The returned object is always complete and safe to consume by the evaluation
 * loop (task 13.2).
 */
export async function getOAuthAlertSettings(
  deps: OAuthAlertSettingsDeps = defaultDeps
): Promise<OAuthAlertSettings> {
  const [enabledRaw, thresholdsRaw, recipientsRaw] = await Promise.all([
    deps.getConfigValue<unknown>(OAUTH_ALERT_SETTING_KEYS.enabled),
    deps.getConfigValue<unknown>(OAUTH_ALERT_SETTING_KEYS.thresholds),
    deps.getConfigValue<unknown>(OAUTH_ALERT_SETTING_KEYS.recipientsRef)
  ])

  const enabled = typeof enabledRaw === 'boolean' ? enabledRaw : DEFAULT_OAUTH_ALERT_SETTINGS.enabled
  const thresholds = resolveThresholds(thresholdsRaw, { ...DEFAULT_OAUTH_ALERT_THRESHOLDS }, false)
  // An unrecognised or absent stored reference falls back to the approved
  // default; a free-form address that somehow reached storage is NOT honoured.
  const recipientsRef: OAuthAlertRecipientsRef = isApprovedRecipientsRef(recipientsRaw)
    ? recipientsRaw
    : DEFAULT_OAUTH_ALERT_SETTINGS.recipientsRef

  return { enabled, thresholds, recipientsRef }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Validate a partial patch against the current effective settings and return
 * the complete next settings plus the concrete `oauth.alerts.*` writes to make.
 * Exported for direct unit testing of validation without any persistence.
 *
 * A threshold field is validated as a bounded positive integer; the recipients
 * reference must name an approved organization destination (never a free-form
 * address). At least one field must be supplied.
 */
export function validateOAuthAlertSettingsPatch(
  current: OAuthAlertSettings,
  patch: OAuthAlertSettingsPatch
): { next: OAuthAlertSettings, writes: Array<{ key: string, value: unknown }> } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw oauthAdminErrors.badRequest({ message: 'A settings patch object is required.', data: { reason: 'INVALID_PATCH' } })
  }

  const writes: Array<{ key: string, value: unknown }> = []
  const next: OAuthAlertSettings = {
    enabled: current.enabled,
    thresholds: { ...current.thresholds },
    recipientsRef: current.recipientsRef
  }

  let changed = false

  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') {
      throw oauthAdminErrors.badRequest({ message: 'enabled must be a boolean.', data: { field: 'enabled' } })
    }
    next.enabled = patch.enabled
    writes.push({ key: OAUTH_ALERT_SETTING_KEYS.enabled, value: patch.enabled })
    changed = true
  }

  if (patch.thresholds !== undefined) {
    if (!patch.thresholds || typeof patch.thresholds !== 'object' || Array.isArray(patch.thresholds)) {
      throw oauthAdminErrors.badRequest({ message: 'thresholds must be an object.', data: { field: 'thresholds' } })
    }
    // Reject unknown threshold keys so a typo never silently no-ops.
    for (const key of Object.keys(patch.thresholds)) {
      if (!THRESHOLD_FIELDS.includes(key as keyof OAuthAlertThresholds)) {
        throw oauthAdminErrors.badRequest({
          message: `Unknown threshold field: ${key}.`,
          data: { field: `thresholds.${key}`, reason: 'UNKNOWN_THRESHOLD' }
        })
      }
    }
    // Strict validation of every supplied field; untouched fields keep current.
    next.thresholds = resolveThresholds(patch.thresholds, { ...current.thresholds }, true)
    writes.push({ key: OAUTH_ALERT_SETTING_KEYS.thresholds, value: next.thresholds })
    changed = true
  }

  if (patch.recipientsRef !== undefined) {
    if (!isApprovedRecipientsRef(patch.recipientsRef)) {
      // A free-form address or an unknown destination is rejected here — the
      // recipients reference must point at an EXISTING approved organization
      // destination (Req 15.4 / 18.6).
      throw oauthAdminErrors.badRequest({
        message: 'recipientsRef must reference an approved organization destination ("admin-notifications" or "none"). Free-form addresses are not accepted.',
        data: { field: 'recipientsRef', reason: 'UNAPPROVED_RECIPIENT' }
      })
    }
    next.recipientsRef = patch.recipientsRef
    writes.push({ key: OAUTH_ALERT_SETTING_KEYS.recipientsRef, value: patch.recipientsRef })
    changed = true
  }

  if (!changed) {
    throw oauthAdminErrors.badRequest({
      message: 'A settings update must change enabled, thresholds, or recipientsRef.',
      data: { reason: 'EMPTY_PATCH' }
    })
  }

  return { next, writes }
}

/**
 * Validate a patch, persist ONLY the changed `oauth.alerts.*` keys through the
 * existing site configuration, and return the complete next settings. The
 * caller (route) has already enforced `oauth.operations.manage`; `access` is
 * used to attribute the change (safe opaque actor) and is present so the
 * signature matches the design's `updateOAuthAlertSettings(access, patch,
 * updatedBy)` shape.
 */
export async function updateOAuthAlertSettings(
  access: OAuthAdminAccessContext,
  patch: OAuthAlertSettingsPatch,
  updatedBy: string,
  deps: OAuthAlertSettingsDeps = defaultDeps
): Promise<OAuthAlertSettings> {
  const current = await getOAuthAlertSettings(deps)
  const { next, writes } = validateOAuthAlertSettingsPatch(current, patch)

  // Persist ONLY oauth.alerts.* keys — never any non-OAuth configuration.
  for (const write of writes) {
    if (!OAUTH_ALERT_SETTING_KEY_LIST.includes(write.key)) {
      // Defensive: validateOAuthAlertSettingsPatch only ever emits alert keys.
      throw oauthAdminErrors.badRequest({ message: 'Refusing to write a non-OAuth-alert key.', data: { key: write.key } })
    }
    await deps.updateSiteConfig(write.key, write.value, updatedBy)
  }

  // Attribution actor is available for audit at the route layer.
  void access
  return next
}

/**
 * Reset every `oauth.alerts.*` key to its design default through the existing
 * site configuration and return the default settings.
 */
export async function resetOAuthAlertSettings(
  access: OAuthAdminAccessContext,
  updatedBy: string,
  deps: OAuthAlertSettingsDeps = defaultDeps
): Promise<OAuthAlertSettings> {
  for (const key of OAUTH_ALERT_SETTING_KEY_LIST) {
    await deps.resetSiteConfig(key, updatedBy)
  }
  void access
  return {
    enabled: DEFAULT_OAUTH_ALERT_SETTINGS.enabled,
    thresholds: { ...DEFAULT_OAUTH_ALERT_THRESHOLDS },
    recipientsRef: DEFAULT_OAUTH_ALERT_SETTINGS.recipientsRef
  }
}
