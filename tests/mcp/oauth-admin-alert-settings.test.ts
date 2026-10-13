/**
 * Feature: oauth-administration — task 13.1 validated `oauth.alerts.*` settings
 * and operations-capability protection.
 *
 * Focused unit tests for the alert-settings module with INJECTED site-config
 * accessors (no live DynamoDB). Covers Requirements 1.2, 15.3, 18.6 (and 15.4):
 *   - Validation rejects a non-positive / non-integer / out-of-range threshold.
 *   - Validation rejects an arbitrary free-form recipient address and an
 *     unknown destination — recipients must reference an approved organization
 *     destination.
 *   - Unknown threshold keys and empty patches are rejected.
 *   - Defaults are applied when a setting is unset (read path).
 *   - update/reset write ONLY `oauth.alerts.*` keys (never non-OAuth config).
 *   - The generic site-config path cannot change `oauth.alerts.*` without the
 *     OAuth operations capability (bypass-closure predicate).
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getOAuthAlertSettings,
  updateOAuthAlertSettings,
  resetOAuthAlertSettings,
  validateOAuthAlertSettingsPatch,
  isOAuthAlertSettingKey,
  isApprovedRecipientsRef,
  DEFAULT_OAUTH_ALERT_SETTINGS,
  DEFAULT_OAUTH_ALERT_THRESHOLDS,
  OAUTH_ALERT_SETTING_KEYS,
  OAUTH_ALERT_SETTING_KEY_LIST,
  type OAuthAlertSettings,
  type OAuthAlertSettingsDeps
} from '../../server/mcp/oauth/admin/alert-settings'
import type { OAuthAdminAccessContext } from '../../server/mcp/oauth/admin/types'
import type { OAuthDeploymentContext } from '../../shared/types/oauth-administration'
import { OAUTH_CAPABILITIES } from '../../shared/types/oauth-administration'

process.env.GHOST_MCP_REQUEST_STATE_KEY = 'test-oauth-admin-request-state-key-01234567890'
process.env.GHOST_MCP_BASE_URL = 'https://ghost.example.test'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

function access(): OAuthAdminAccessContext {
  return { deployment: ctx, actor: 'act_test', capabilities: ['oauth.operations.manage'] }
}

/**
 * A fake site-config store honouring only the injected accessors the module
 * uses. Seeded with an arbitrary map; unset keys read as null (mirrors real
 * getConfigValue returning null when a key is absent from storage/defaults).
 */
function fakeDeps(seed: Record<string, unknown> = {}): { deps: OAuthAlertSettingsDeps, store: Map<string, unknown> } {
  const store = new Map<string, unknown>(Object.entries(seed))
  const deps: OAuthAlertSettingsDeps = {
    getConfigValue: (async (key: string) => (store.has(key) ? store.get(key) : null)) as OAuthAlertSettingsDeps['getConfigValue'],
    updateSiteConfig: (async (key: string, value: unknown) => {
      store.set(key, value)
      return { key, value } as any
    }) as OAuthAlertSettingsDeps['updateSiteConfig'],
    resetSiteConfig: (async (key: string) => {
      store.delete(key)
      return { key } as any
    }) as OAuthAlertSettingsDeps['resetSiteConfig']
  }
  return { deps, store }
}

const completeSettings: OAuthAlertSettings = {
  enabled: DEFAULT_OAUTH_ALERT_SETTINGS.enabled,
  thresholds: { ...DEFAULT_OAUTH_ALERT_THRESHOLDS },
  recipientsRef: DEFAULT_OAUTH_ALERT_SETTINGS.recipientsRef
}

// --- Defaults applied on read (Req: defaults when unset) --------------------

test('getOAuthAlertSettings applies design defaults when nothing is stored', async () => {
  const { deps } = fakeDeps()
  const settings = await getOAuthAlertSettings(deps)
  assert.equal(settings.enabled, false)
  assert.equal(settings.recipientsRef, 'admin-notifications')
  assert.deepEqual(settings.thresholds, DEFAULT_OAUTH_ALERT_THRESHOLDS)
})

test('getOAuthAlertSettings falls back to defaults for an invalid stored threshold', async () => {
  const { deps } = fakeDeps({
    [OAUTH_ALERT_SETTING_KEYS.thresholds]: { registrationRejections: -3, tokenFailures: 9 }
  })
  const settings = await getOAuthAlertSettings(deps)
  // Invalid value falls back to default; valid stored value is honoured.
  assert.equal(settings.thresholds.registrationRejections, DEFAULT_OAUTH_ALERT_THRESHOLDS.registrationRejections)
  assert.equal(settings.thresholds.tokenFailures, 9)
})

test('getOAuthAlertSettings ignores an unapproved stored recipient reference', async () => {
  const { deps } = fakeDeps({
    [OAUTH_ALERT_SETTING_KEYS.recipientsRef]: 'attacker@evil.example'
  })
  const settings = await getOAuthAlertSettings(deps)
  // A free-form address that somehow reached storage is NOT honoured on read.
  assert.equal(settings.recipientsRef, 'admin-notifications')
})

// --- Validation: thresholds -------------------------------------------------

test('validate rejects a non-positive threshold', () => {
  assert.throws(
    () => validateOAuthAlertSettingsPatch(completeSettings, { thresholds: { registrationRejections: 0 } }),
    (error: any) => error?.statusCode === 400
  )
  assert.throws(
    () => validateOAuthAlertSettingsPatch(completeSettings, { thresholds: { tokenFailures: -1 } }),
    (error: any) => error?.statusCode === 400
  )
})

test('validate rejects a non-integer threshold', () => {
  assert.throws(
    () => validateOAuthAlertSettingsPatch(completeSettings, { thresholds: { windowMinutes: 15.5 } }),
    (error: any) => error?.statusCode === 400
  )
})

test('validate rejects an out-of-range threshold', () => {
  assert.throws(
    () => validateOAuthAlertSettingsPatch(completeSettings, { thresholds: { signingKeyDeadlineDays: 100000 } }),
    (error: any) => error?.statusCode === 400
  )
})

test('validate rejects an unknown threshold field', () => {
  assert.throws(
    () => validateOAuthAlertSettingsPatch(completeSettings, { thresholds: { bogusField: 5 } as any }),
    (error: any) => error?.statusCode === 400
  )
})

test('validate accepts a partial thresholds patch and preserves untouched fields', () => {
  const { next, writes } = validateOAuthAlertSettingsPatch(completeSettings, { thresholds: { tokenFailures: 12 } })
  assert.equal(next.thresholds.tokenFailures, 12)
  // Untouched fields keep their current value.
  assert.equal(next.thresholds.registrationRejections, DEFAULT_OAUTH_ALERT_THRESHOLDS.registrationRejections)
  // Only the thresholds key is written.
  assert.deepEqual(writes.map(w => w.key), [OAUTH_ALERT_SETTING_KEYS.thresholds])
})

// --- Validation: recipients (Req 15.4 / 18.6) ------------------------------

test('validate rejects an arbitrary free-form recipient address', () => {
  assert.throws(
    () => validateOAuthAlertSettingsPatch(completeSettings, { recipientsRef: 'someone@example.com' }),
    (error: any) => error?.statusCode === 400 && error?.data?.reason === 'UNAPPROVED_RECIPIENT'
  )
})

test('validate rejects an unknown destination reference', () => {
  assert.throws(
    () => validateOAuthAlertSettingsPatch(completeSettings, { recipientsRef: 'some-other-queue' }),
    (error: any) => error?.statusCode === 400 && error?.data?.reason === 'UNAPPROVED_RECIPIENT'
  )
})

test('validate accepts the approved organization destination references', () => {
  const approved = validateOAuthAlertSettingsPatch(completeSettings, { recipientsRef: 'admin-notifications' })
  assert.equal(approved.next.recipientsRef, 'admin-notifications')
  const none = validateOAuthAlertSettingsPatch(completeSettings, { recipientsRef: 'none' })
  assert.equal(none.next.recipientsRef, 'none')
})

test('validate rejects an empty patch', () => {
  assert.throws(
    () => validateOAuthAlertSettingsPatch(completeSettings, {}),
    (error: any) => error?.statusCode === 400 && error?.data?.reason === 'EMPTY_PATCH'
  )
})

test('validate rejects a non-boolean enabled', () => {
  assert.throws(
    () => validateOAuthAlertSettingsPatch(completeSettings, { enabled: 'yes' as any }),
    (error: any) => error?.statusCode === 400
  )
})

// --- update writes ONLY oauth.alerts.* keys --------------------------------

test('updateOAuthAlertSettings writes only oauth.alerts.* keys and returns next settings', async () => {
  const { deps, store } = fakeDeps()
  const settings = await updateOAuthAlertSettings(access(), { enabled: true, recipientsRef: 'none' }, 'act_test', deps)

  assert.equal(settings.enabled, true)
  assert.equal(settings.recipientsRef, 'none')

  // Every written key is an oauth.alerts.* key — no non-OAuth config touched.
  for (const key of store.keys()) {
    assert.ok(isOAuthAlertSettingKey(key), `unexpected non-OAuth-alert write: ${key}`)
  }
  assert.equal(store.get(OAUTH_ALERT_SETTING_KEYS.enabled), true)
  assert.equal(store.get(OAUTH_ALERT_SETTING_KEYS.recipientsRef), 'none')
  // A field that was not patched is not written.
  assert.equal(store.has(OAUTH_ALERT_SETTING_KEYS.thresholds), false)
})

test('updateOAuthAlertSettings rejects an invalid patch before any write', async () => {
  const { deps, store } = fakeDeps()
  await assert.rejects(
    () => updateOAuthAlertSettings(access(), { recipientsRef: 'x@evil.example' }, 'act_test', deps),
    (error: any) => error?.statusCode === 400
  )
  assert.equal(store.size, 0)
})

// --- reset restores defaults for the alert keys only ------------------------

test('resetOAuthAlertSettings resets the alert keys and returns defaults', async () => {
  const { deps, store } = fakeDeps({
    [OAUTH_ALERT_SETTING_KEYS.enabled]: true,
    [OAUTH_ALERT_SETTING_KEYS.recipientsRef]: 'none',
    'features.reportScheduler.enabled': true // an unrelated key must be untouched
  })
  const settings = await resetOAuthAlertSettings(access(), 'act_test', deps)

  assert.deepEqual(settings, {
    enabled: DEFAULT_OAUTH_ALERT_SETTINGS.enabled,
    thresholds: { ...DEFAULT_OAUTH_ALERT_THRESHOLDS },
    recipientsRef: DEFAULT_OAUTH_ALERT_SETTINGS.recipientsRef
  })
  // The alert keys were reset (removed from the fake store)…
  for (const key of OAUTH_ALERT_SETTING_KEY_LIST) {
    assert.equal(store.has(key), false, `alert key not reset: ${key}`)
  }
  // …and the unrelated non-OAuth key was left alone.
  assert.equal(store.get('features.reportScheduler.enabled'), true)
})

// --- bypass-closure predicate (Req 15.3) -----------------------------------

test('isOAuthAlertSettingKey identifies exactly the oauth.alerts.* keys', () => {
  assert.equal(isOAuthAlertSettingKey('oauth.alerts.enabled'), true)
  assert.equal(isOAuthAlertSettingKey('oauth.alerts.thresholds'), true)
  assert.equal(isOAuthAlertSettingKey('oauth.alerts.recipientsRef'), true)
  // A non-OAuth key is not protected.
  assert.equal(isOAuthAlertSettingKey('features.reportScheduler.enabled'), false)
  assert.equal(isOAuthAlertSettingKey('ui.siteName'), false)
})

test('the generic site-config guard denies oauth.alerts.* writes without the operations capability', () => {
  // This mirrors the exact decision the generic /api/admin/site-config routes
  // make: an admin without oauth.operations.manage cannot change a protected
  // key through the generic path (the bypass is closed).
  const decideBlocked = (key: string, permissions: Set<string>) =>
    isOAuthAlertSettingKey(key) && !permissions.has(OAUTH_CAPABILITIES.OPERATIONS_MANAGE)

  const adminOnly = new Set<string>(['some.other.capability'])
  const withOps = new Set<string>([OAUTH_CAPABILITIES.OPERATIONS_MANAGE])

  // Protected key + no ops capability → blocked.
  for (const key of OAUTH_ALERT_SETTING_KEY_LIST) {
    assert.equal(decideBlocked(key, adminOnly), true, `expected block for ${key}`)
    // Protected key + ops capability → allowed.
    assert.equal(decideBlocked(key, withOps), false, `expected allow for ${key} with ops`)
  }
  // Non-protected key is never blocked by this guard.
  assert.equal(decideBlocked('ui.siteName', adminOnly), false)
})

test('isApprovedRecipientsRef only accepts approved destination references', () => {
  assert.equal(isApprovedRecipientsRef('admin-notifications'), true)
  assert.equal(isApprovedRecipientsRef('none'), true)
  assert.equal(isApprovedRecipientsRef('someone@example.com'), false)
  assert.equal(isApprovedRecipientsRef(''), false)
  assert.equal(isApprovedRecipientsRef(undefined), false)
})
