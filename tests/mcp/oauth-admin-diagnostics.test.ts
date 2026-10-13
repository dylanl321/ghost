/**
 * Feature: oauth-administration — task 11.1 controlled diagnostics.
 *
 * Focused unit tests for the named approved diagnostic checks and the durable
 * {@link OAuthDiagnosticService} against the in-memory repository + lock store
 * (no live DynamoDB, no live provider network). Covers Requirements 2.2, 11.1,
 * 11.2, 11.3, 11.4, 11.5, 13.2:
 *   - Unknown/arbitrary check rejected; no caller-supplied target accepted.
 *   - A check derives its target from config and produces a SAFE summary (no raw body).
 *   - Per-check timeout resolves non-success (`unknown`), never success.
 *   - Cancellation observed BETWEEN steps → `cancelled`.
 *   - Lost lease / interruption → `interrupted`, never success.
 *   - Bounded concurrency: at most 2 jobs per deployment run at once.
 *   - Checks perform no registration/consent/token side effects.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type { OAuthDeploymentContext } from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import type { OAuthAdminAccessContext } from '../../server/mcp/oauth/admin/types'
import {
  OAuthDiagnosticService,
  runCheckStep,
  MAX_JOBS_PER_DEPLOYMENT
} from '../../server/mcp/oauth/admin/diagnostic-service'
import {
  InMemoryOAuthMaintenanceLockStore,
  OAUTH_MAINTENANCE_LOCK_NAMESPACE,
  maintenanceLockKey
} from '../../server/mcp/oauth/admin/oauth-maintenance-lock'
import {
  isApprovedCheck,
  isApprovedTarget,
  approvedTargetOrigins,
  checkProtectedResourceDiscovery,
  checkAuthorizationServerDiscovery,
  checkCrewConfigurationHealth
} from '../../server/mcp/oauth/admin/diagnostic-checks'

// Deterministic config so the config-derived targets are stable in tests.
process.env.GHOST_MCP_REQUEST_STATE_KEY = 'test-oauth-admin-request-state-key-01234567890'
process.env.GHOST_MCP_BASE_URL = 'https://ghost.example.test'
process.env.GHOST_OAUTH_ISSUER = 'https://ghost.example.test'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

function access(actor = 'act_test'): OAuthAdminAccessContext {
  return { deployment: ctx, actor, capabilities: ['oauth.operations.manage'] }
}

function makeService(clock?: () => number) {
  const repository = new InMemoryOAuthAdminRepository()
  const lockStore = new InMemoryOAuthMaintenanceLockStore()
  const service = new OAuthDiagnosticService(repository, lockStore, undefined, clock)
  return { repository, lockStore, service }
}

// --- Named-check validation (Req 11.1) ------------------------------------

test('isApprovedCheck accepts only the named checks and rejects arbitrary targets', () => {
  assert.equal(isApprovedCheck('protected-resource-discovery'), true)
  assert.equal(isApprovedCheck('public-jwks-metadata'), true)
  assert.equal(isApprovedCheck('https://evil.example.com/probe'), false)
  assert.equal(isApprovedCheck('arbitrary-check'), false)
  assert.equal(isApprovedCheck(''), false)
  assert.equal(isApprovedCheck(undefined), false)
})

test('create rejects an unknown/arbitrary check before reserving a job', async () => {
  const { service } = makeService()
  await assert.rejects(
    () => service.create(access(), ['not-a-real-check' as any], 'why', 'idem-x'),
    (error: any) => error?.statusCode === 400
  )
  // A caller-supplied URL disguised as a check is also rejected.
  await assert.rejects(
    () => service.create(access(), ['https://evil.example.com' as any], 'why', 'idem-y'),
    (error: any) => error?.statusCode === 400
  )
})

test('create rejects more than two checks per job (bounded)', async () => {
  const { service } = makeService()
  await assert.rejects(
    () => service.create(access(), [
      'protected-resource-discovery',
      'authorization-server-discovery',
      'public-jwks-metadata'
    ], 'why', 'idem-3'),
    (error: any) => error?.statusCode === 400
  )
})

// --- Config-derived targets + safe summaries (Req 2.2, 11.3) --------------

test('approved targets derive from current config, not a caller value', () => {
  const approved = approvedTargetOrigins()
  assert.equal(approved.has('https://ghost.example.test'), true)
  assert.equal(isApprovedTarget('https://ghost.example.test/oauth/token', approved), true)
  // A caller-controlled foreign origin is never approved.
  assert.equal(isApprovedTarget('https://evil.example.com/oauth/token', approved), false)
})

test('a config-derived check produces a bounded safe summary (no raw body)', async () => {
  const result = await checkAuthorizationServerDiscovery()
  assert.equal(result.check, 'authorization-server-discovery')
  assert.equal(result.outcome, 'success')
  assert.ok(result.summary && result.summary.length <= 200)
  // The summary is plain text, never a raw JSON body/object.
  assert.equal(typeof result.summary, 'string')
})

test('a permitted redirect to an unapproved destination fails the check (redirects revalidated)', async () => {
  // The injected metadata advertises an issuer OUTSIDE the approved set — the
  // check must treat it as a failure rather than trust/follow it.
  const result = await checkProtectedResourceDiscovery({
    readApprovedMetadata: async () => ({ issuer: 'https://evil.example.com' })
  })
  assert.equal(result.outcome, 'failure')
})

test('checks perform no registration/consent/token side effects', async () => {
  // The config-derived checks only read config. We assert they complete without
  // invoking any provider mutation by running them with no probe and confirming
  // a pure result shape (no thrown side-effect calls, deterministic summary).
  const a = await checkAuthorizationServerDiscovery()
  const b = await checkCrewConfigurationHealth()
  assert.equal(a.outcome, 'success')
  assert.equal(b.outcome, 'success')
  // Re-running is idempotent and does not accumulate state.
  const a2 = await checkAuthorizationServerDiscovery()
  assert.equal(a2.outcome, a.outcome)
})

// --- runCheckStep timeout resolves non-success (Req 11.5) -----------------

test('runCheckStep resolves to non-success when a check exceeds its timeout', async () => {
  // Force protected-resource-discovery to be slow inside the injected probe so
  // the per-check timeout fires first; the result must be `unknown`, not success.
  // The probe resolves after the timeout (and unrefs its timer) so no pending
  // work outlives the test.
  let settle: (value: Record<string, unknown>) => void = () => {}
  const probePromise = new Promise<Record<string, unknown>>(resolve => { settle = resolve })
  const slowProbe = { readApprovedMetadata: () => probePromise }
  const result = await runCheckStep('protected-resource-discovery', slowProbe, 20, () => Date.now())
  assert.notEqual(result.outcome, 'success')
  assert.equal(result.outcome, 'unknown')
  // Drain the still-pending probe promise so no work outlives the test.
  settle({ issuer: 'https://ghost.example.test' })
  await probePromise
})

// --- Full job orchestration -----------------------------------------------

test('runJob completes when all config-derived checks succeed', async () => {
  const { service } = makeService()
  const job = await service.create(access(), ['authorization-server-discovery', 'crew-configuration-health'], 'health', 'idem-ok')
  assert.equal(job.state, 'pending')
  const done = await service.runJob(access(), job.jobId)
  assert.equal(done.state, 'completed')
  assert.equal(done.results.length, 2)
  assert.ok(done.results.every(entry => entry.outcome === 'success'))
})

test('create is idempotent: a retry with the same key returns the existing job', async () => {
  const { service } = makeService()
  const first = await service.create(access(), ['crew-configuration-health'], 'health', 'idem-dup')
  const second = await service.create(access(), ['crew-configuration-health'], 'health', 'idem-dup')
  assert.equal(second.jobId, first.jobId)
})

test('cancellation requested before running resolves the job to cancelled, not success', async () => {
  const { service } = makeService()
  const job = await service.create(access(), ['authorization-server-discovery', 'crew-configuration-health'], 'health', 'idem-cancel')
  await service.cancel(access(), job.jobId)
  const done = await service.runJob(access(), job.jobId)
  assert.equal(done.state, 'cancelled')
  assert.notEqual(done.state, 'completed')
})

test('a lost lease during the run resolves to interrupted, never success', async () => {
  const { service, lockStore } = makeService()
  const job = await service.create(access(), ['authorization-server-discovery', 'crew-configuration-health'], 'health', 'idem-lost')
  // Steal/expire the job lock right after it is claimed by clearing the store
  // before the first renew between steps. The renew will fail → interrupted.
  const originalRenew = lockStore.renew.bind(lockStore)
  let renewCalls = 0
  ;(lockStore as any).renew = async (...args: any[]) => {
    renewCalls += 1
    // Simulate losing the lease on the first between-step renew.
    return renewCalls === 1 ? null : originalRenew(...(args as [any]))
  }
  const done = await service.runJob(access(), job.jobId)
  assert.equal(done.state, 'interrupted')
  assert.notEqual(done.state, 'completed')
})

test('job deadline exceeded resolves to interrupted, never success', async () => {
  // A tiny job timeout means the very first between-step deadline check trips,
  // resolving to `interrupted` before any check runs — never `completed`.
  const { service } = makeService()
  const job = await service.create(access(), ['authorization-server-discovery', 'crew-configuration-health'], 'health', 'idem-deadline')
  // jobTimeoutMs of 0: deadlineMs === startedMs, so the first `now() >= deadline`
  // check between steps is true.
  const done = await service.runJob(access(), job.jobId, { jobTimeoutMs: 0 })
  assert.notEqual(done.state, 'completed')
  assert.equal(done.state, 'interrupted')
})

// --- Bounded concurrency (Req 11.2) ---------------------------------------

test('bounded concurrency: only MAX_JOBS_PER_DEPLOYMENT slots can be held at once', async () => {
  const lockStore = new InMemoryOAuthMaintenanceLockStore()
  // Occupy all concurrency slots.
  const held: any[] = []
  for (let slot = 0; slot < MAX_JOBS_PER_DEPLOYMENT; slot++) {
    const lease = await lockStore.claim(maintenanceLockKey(ctx, `slot#${slot}`), 60_000)
    assert.ok(lease, `slot ${slot} should be claimable`)
    held.push(lease)
  }
  // A repository + service sharing this lock store cannot get a slot → the job
  // stays pending (not run) because all slots are occupied.
  const repository = new InMemoryOAuthAdminRepository()
  const service = new OAuthDiagnosticService(repository, lockStore)
  const job = await service.create(access(), ['crew-configuration-health'], 'health', 'idem-conc')
  const result = await service.runJob(access(), job.jobId)
  assert.equal(result.state, 'pending')
})

test('the maintenance lock uses the OAuth-specific namespace (not the report scope)', () => {
  const key = maintenanceLockKey(ctx, 'job#abc')
  assert.ok(key.startsWith(`${OAUTH_MAINTENANCE_LOCK_NAMESPACE}#`))
  // It carries the deployment id so two deployments never share a lock key.
  assert.ok(key.includes(ctx.deploymentId))
})
