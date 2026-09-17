/**
 * Feature: oauth-administration — task 13.2 five-minute locked alert evaluation.
 *
 * Focused unit tests for the evidence-based OAuth alert evaluator. These run
 * against the in-memory repository fixture and the in-memory maintenance lock
 * (no live DynamoDB / SES / site-config). They cover:
 *   - threshold crossing creates exactly ONE active alert;
 *   - a second evaluation while still crossing does NOT duplicate (same group);
 *   - a condition clearing with FRESH evidence produces a recovery notice;
 *   - stale/absent evidence does NOT produce a recovery (Requirement 15.5);
 *   - no approved recipient => deliveryStatus 'unavailable' with NO fallback;
 *   - an unknown signing-key deadline does not alert (Requirement 15.6);
 *   - the deployment lock prevents double-evaluation.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  OAuthDeploymentContext,
  OAuthEvent,
  OAuthStage
} from '../../shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRepository } from '../../server/mcp/oauth/admin/types'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import { InMemoryOAuthMaintenanceLockStore } from '../../server/mcp/oauth/admin/oauth-maintenance-lock'
import { oauthAdminRedactor } from '../../server/mcp/oauth/admin/redactor'
import {
  OAuthAlertEvaluationService,
  evaluateAlertConditions,
  alertGroupKey,
  resolveApprovedRecipients,
  type OAuthAlertEvaluationDeps
} from '../../server/mcp/oauth/admin/alert-evaluation-service'
import {
  DEFAULT_OAUTH_ALERT_THRESHOLDS,
  type OAuthAlertSettings,
  type OAuthAlertSettingsDeps
} from '../../server/mcp/oauth/admin/alert-settings'

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

const NOW = new Date('2026-08-14T15:07:00.000Z').getTime()

function event(overrides: Partial<OAuthEvent> = {}): OAuthEvent {
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date(NOW - 60_000).toISOString(),
    deployment: 'development',
    stage: 'token-exchange',
    attemptState: 'failed',
    outcome: 'failure',
    ...overrides
  }
}

/**
 * Build injectable settings deps that report the given enabled/recipients and
 * default thresholds. `email.admin.notificationEmails` is what
 * resolveApprovedRecipients reads for the approved organization destination.
 */
function settingsDeps(
  settings: Partial<OAuthAlertSettings>,
  approvedEmails: string[] | null
): { settingsDeps: OAuthAlertSettingsDeps, getConfigValue: OAuthAlertEvaluationDeps['getConfigValue'] } {
  const enabled = settings.enabled ?? true
  const recipientsRef = settings.recipientsRef ?? 'admin-notifications'
  const thresholds = { ...DEFAULT_OAUTH_ALERT_THRESHOLDS, ...(settings.thresholds ?? {}) }
  const store: Record<string, unknown> = {
    'oauth.alerts.enabled': enabled,
    'oauth.alerts.thresholds': thresholds,
    'oauth.alerts.recipientsRef': recipientsRef,
    'email.admin.notificationEmails': approvedEmails
  }
  const getConfigValue = (async <T = any>(key: string): Promise<T | null> => {
    return (store[key] ?? null) as T | null
  }) as OAuthAlertEvaluationDeps['getConfigValue']
  return {
    settingsDeps: { getConfigValue, updateSiteConfig: async () => {}, resetSiteConfig: async () => {} } as unknown as OAuthAlertSettingsDeps,
    getConfigValue
  }
}

/** Capture sent notifications and control their success. */
function fakeNotifier(success = true) {
  const sent: any[] = []
  const send = (async (options: any) => {
    sent.push(options)
    return { success, notificationId: 'n1' }
  }) as OAuthAlertEvaluationDeps['sendAdminNotification']
  return { sent, send }
}

function buildService(
  repository: OAuthAdminRepository,
  opts: {
    enabled?: boolean
    recipientsRef?: 'admin-notifications' | 'none'
    approvedEmails?: string[] | null
    thresholds?: Partial<OAuthAlertSettings['thresholds']>
    signingKeyDeadline?: string
    notifierSuccess?: boolean
    lockStore?: InMemoryOAuthMaintenanceLockStore
  } = {}
) {
  const { settingsDeps: sd, getConfigValue } = settingsDeps(
    { enabled: opts.enabled, recipientsRef: opts.recipientsRef, thresholds: opts.thresholds },
    opts.approvedEmails === undefined ? ['ops@org.example'] : opts.approvedEmails
  )
  const notifier = fakeNotifier(opts.notifierSuccess ?? true)
  const lockStore = opts.lockStore ?? new InMemoryOAuthMaintenanceLockStore()
  const service = new OAuthAlertEvaluationService({
    repository,
    lockStore,
    redactor: oauthAdminRedactor,
    getConfigValue,
    sendAdminNotification: notifier.send,
    settingsDeps: sd,
    resolveSigningKeyDeadline: () => opts.signingKeyDeadline
  })
  return { service, notifier, lockStore }
}

/** Seed N failing token-exchange events inside the window. */
async function seedTokenFailures(repository: OAuthAdminRepository, n: number) {
  for (let i = 0; i < n; i++) {
    await repository.putEvent(ctx, event({ eventId: `tok_${i}`, timestamp: new Date(NOW - (i + 1) * 1000).toISOString() }))
  }
}

// --- Pure transform -------------------------------------------------------

test('pure: token failures over threshold cross; unknown signing deadline never crosses', () => {
  const events: OAuthEvent[] = []
  for (let i = 0; i < 6; i++) events.push(event({ eventId: `t${i}`, timestamp: new Date(NOW - (i + 1) * 1000).toISOString() }))
  const settings: OAuthAlertSettings = {
    enabled: true,
    recipientsRef: 'admin-notifications',
    thresholds: DEFAULT_OAUTH_ALERT_THRESHOLDS
  }
  const evals = evaluateAlertConditions({ ctx, settings, events, signingKeyDeadline: undefined, now: NOW })

  const token = evals.find(e => e.condition === 'token-failure')
  assert.ok(token)
  assert.equal(token?.crossed, true) // 6 > 5

  const signing = evals.find(e => e.condition === 'signing-key-deadline')
  assert.ok(signing)
  assert.equal(signing?.crossed, false)
  assert.equal(signing?.hasFreshEvidence, false) // unknown => never alerts (15.6)
})

test('pure: known signing deadline within N days crosses', () => {
  const settings: OAuthAlertSettings = {
    enabled: true,
    recipientsRef: 'admin-notifications',
    thresholds: DEFAULT_OAUTH_ALERT_THRESHOLDS
  }
  const deadline = new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days out
  const evals = evaluateAlertConditions({ ctx, settings, events: [], signingKeyDeadline: deadline, now: NOW })
  const signing = evals.find(e => e.condition === 'signing-key-deadline')
  assert.equal(signing?.crossed, true)
  assert.equal(signing?.hasFreshEvidence, true)
})

test('pure: consecutive discovery failures require the configured gap', () => {
  const settings: OAuthAlertSettings = {
    enabled: true,
    recipientsRef: 'admin-notifications',
    thresholds: DEFAULT_OAUTH_ALERT_THRESHOLDS // 2 consecutive, 5 min gap
  }
  const stage: OAuthStage = 'authorization-server-discovery'
  // Two failures only 1 second apart -> NOT counted as consecutive (gap too small).
  const close = [
    event({ eventId: 'd1', stage, timestamp: new Date(NOW - 2000).toISOString() }),
    event({ eventId: 'd2', stage, timestamp: new Date(NOW - 1000).toISOString() })
  ]
  const closeEval = evaluateAlertConditions({ ctx, settings, events: close, signingKeyDeadline: undefined, now: NOW })
    .find(e => e.condition === 'discovery-mismatch')
  assert.equal(closeEval?.crossed, false)

  // Two failures 6 minutes apart -> counted as consecutive.
  const spaced = [
    event({ eventId: 'd3', stage, timestamp: new Date(NOW - 7 * 60 * 1000).toISOString() }),
    event({ eventId: 'd4', stage, timestamp: new Date(NOW - 1 * 60 * 1000).toISOString() })
  ]
  const spacedEval = evaluateAlertConditions({ ctx, settings, events: spaced, signingKeyDeadline: undefined, now: NOW })
    .find(e => e.condition === 'discovery-mismatch')
  assert.equal(spacedEval?.crossed, true)
})

// --- Service: create + dedup ---------------------------------------------

test('threshold crossing creates exactly one active alert', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await seedTokenFailures(repository, 6) // > 5
  const { service, notifier } = buildService(repository)

  const result = await service.evaluate(access(), NOW)
  assert.equal(result.ran, true)
  const tokenAlerts = result.active.filter(a => a.condition === 'token-failure')
  assert.equal(tokenAlerts.length, 1)
  assert.equal(tokenAlerts[0]?.state, 'active')
  assert.equal(tokenAlerts[0]?.deliveryStatus, 'delivered')
  assert.equal(notifier.sent.length >= 1, true)

  const groupKey = alertGroupKey(ctx.deploymentId, 'token-failure', undefined, undefined, 'token-exchange')
  const stored = await repository.getActiveAlert(ctx, groupKey)
  assert.ok(stored)
})

test('a second evaluation while still crossing does not duplicate the group', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await seedTokenFailures(repository, 6)
  const { service } = buildService(repository)

  const first = await service.evaluate(access(), NOW)
  const firstAlert = first.active.find(a => a.condition === 'token-failure')
  assert.ok(firstAlert)

  // Second run, still crossing: keep the SAME alert (same alertId), refresh time.
  const second = await service.evaluate(access(), NOW + 60_000)
  const secondAlert = second.active.find(a => a.condition === 'token-failure')
  assert.ok(secondAlert)
  assert.equal(secondAlert?.alertId, firstAlert?.alertId)
  assert.notEqual(secondAlert?.lastEvaluatedAt, firstAlert?.lastEvaluatedAt)
})

// --- Service: recovery ----------------------------------------------------

test('condition clearing with fresh evidence produces a recovery notice', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await seedTokenFailures(repository, 6)
  const { service, notifier } = buildService(repository)

  await service.evaluate(access(), NOW) // create active alert
  notifier.sent.length = 0

  // Clear failures but leave FRESH evidence the stage was exercised (successes).
  const cleared = new InMemoryOAuthAdminRepository()
  for (let i = 0; i < 3; i++) {
    await cleared.putEvent(ctx, event({ eventId: `ok_${i}`, outcome: 'success', attemptState: 'succeeded', timestamp: new Date(NOW - 1000).toISOString() }))
  }
  // Carry the active alert into the cleared repository.
  const groupKey = alertGroupKey(ctx.deploymentId, 'token-failure', undefined, undefined, 'token-exchange')
  const active = await repository.getActiveAlert(ctx, groupKey)
  assert.ok(active)
  await cleared.upsertAlert(ctx, active!)

  const { service: service2, notifier: notifier2 } = buildService(cleared)
  const result = await service2.evaluate(access(), NOW + 120_000)
  const recovered = result.recovered.find(a => a.condition === 'token-failure')
  assert.ok(recovered)
  assert.equal(recovered?.state, 'recovered')
  assert.ok(recovered?.recoveredAt)
  assert.equal(notifier2.sent.some(n => n.metadata.trigger === 'oauth_alert_recovery'), true)
})

test('stale/absent evidence does not produce a recovery', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  // Create an active alert directly (as if a prior window crossed).
  const groupKey = alertGroupKey(ctx.deploymentId, 'token-failure', undefined, undefined, 'token-exchange')
  await repository.upsertAlert(ctx, {
    alertId: 'alert_pre',
    groupKey,
    condition: 'token-failure',
    state: 'active',
    threshold: 5,
    windowSeconds: 900,
    evidenceReferences: [],
    deliveryStatus: 'delivered',
    recipientApproved: true,
    firstEvaluatedAt: new Date(NOW - 3_600_000).toISOString(),
    lastEvaluatedAt: new Date(NOW - 3_600_000).toISOString(),
    // Far-future logical expiry so retention never drops the row regardless of
    // the machine's wall clock relative to NOW.
    logicalExpiresAt: new Date(NOW + 90 * 24 * 60 * 60 * 1000).toISOString(),
    ttl: Math.floor((NOW + 90 * 24 * 60 * 60 * 1000) / 1000)
  })
  // No token-exchange events in the current window at all => NO fresh evidence.
  const { service } = buildService(repository)
  const result = await service.evaluate(access(), NOW)
  assert.equal(result.recovered.length, 0)
  // The active alert remains active (not falsely recovered).
  const still = await repository.getActiveAlert(ctx, groupKey)
  assert.equal(still?.state, 'active')
})

// --- Service: delivery ----------------------------------------------------

test('no approved recipient => deliveryStatus unavailable with no fallback', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await seedTokenFailures(repository, 6)
  // No approved organization emails configured.
  const { service, notifier } = buildService(repository, { approvedEmails: [] })

  const result = await service.evaluate(access(), NOW)
  const alert = result.active.find(a => a.condition === 'token-failure')
  assert.ok(alert)
  assert.equal(alert?.deliveryStatus, 'unavailable')
  assert.equal(alert?.recipientApproved, false)
  // NO notification was sent (no fallback address).
  assert.equal(notifier.sent.length, 0)
})

test('recipientsRef none => unavailable and no delivery', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await seedTokenFailures(repository, 6)
  const { service, notifier } = buildService(repository, { recipientsRef: 'none', approvedEmails: ['ops@org.example'] })

  const result = await service.evaluate(access(), NOW)
  const alert = result.active.find(a => a.condition === 'token-failure')
  assert.equal(alert?.deliveryStatus, 'unavailable')
  assert.equal(notifier.sent.length, 0)
})

test('resolveApprovedRecipients returns [] for none and for absent emails', async () => {
  const noneOk = await resolveApprovedRecipients(
    { enabled: true, recipientsRef: 'none', thresholds: DEFAULT_OAUTH_ALERT_THRESHOLDS },
    (async () => ['ops@org.example']) as any
  )
  assert.deepEqual(noneOk, [])
  const absent = await resolveApprovedRecipients(
    { enabled: true, recipientsRef: 'admin-notifications', thresholds: DEFAULT_OAUTH_ALERT_THRESHOLDS },
    (async () => null) as any
  )
  assert.deepEqual(absent, [])
})

// --- Service: disabled + signing-key ------------------------------------

test('disabled settings are a no-op that still acquires and releases the lock', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await seedTokenFailures(repository, 6)
  const { service } = buildService(repository, { enabled: false })
  const result = await service.evaluate(access(), NOW)
  assert.equal(result.ran, true)
  assert.equal(result.active.length, 0)
  assert.equal(result.recovered.length, 0)
})

test('unknown signing-key deadline does not alert', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service } = buildService(repository, { signingKeyDeadline: undefined })
  const result = await service.evaluate(access(), NOW)
  assert.equal(result.active.some(a => a.condition === 'signing-key-deadline'), false)
})

test('known signing-key deadline within window creates one alert', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const deadline = new Date(NOW + 2 * 24 * 60 * 60 * 1000).toISOString()
  const { service } = buildService(repository, { signingKeyDeadline: deadline })
  const result = await service.evaluate(access(), NOW)
  const alert = result.active.find(a => a.condition === 'signing-key-deadline')
  assert.ok(alert)
  assert.equal(alert?.evidenceReferences.length, 1)
})

// --- Service: lock --------------------------------------------------------

test('deployment lock prevents double-evaluation', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await seedTokenFailures(repository, 6)
  const lockStore = new InMemoryOAuthMaintenanceLockStore()
  const { service } = buildService(repository, { lockStore })

  // Pre-hold the deployment 'alerts' lock as another worker.
  const { maintenanceLockKey } = await import('../../server/mcp/oauth/admin/oauth-maintenance-lock')
  const held = await lockStore.claim(maintenanceLockKey(ctx, 'alerts'), 60_000, NOW)
  assert.ok(held)

  const result = await service.evaluate(access(), NOW)
  assert.equal(result.ran, false) // lock held => no evaluation
  assert.equal(result.active.length, 0)
})
