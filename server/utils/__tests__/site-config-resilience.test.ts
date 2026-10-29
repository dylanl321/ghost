import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  SingleFlightInit,
  getSiteConfigDependencyDiagnostic
} from '../site-config'

// --- Single-flight -----------------------------------------------------------

test('single-flight shares one in-flight attempt across concurrent callers', async () => {
  const guard = new SingleFlightInit<string>(1000)
  let calls = 0
  let resolveFactory: ((value: string) => void) | undefined
  const factory = () => {
    calls++
    return new Promise<string>((resolve) => {
      resolveFactory = resolve
    })
  }

  const p1 = guard.run(factory)
  const p2 = guard.run(factory)
  resolveFactory!('client')

  const [r1, r2] = await Promise.all([p1, p2])
  assert.equal(calls, 1, 'factory should run exactly once for concurrent callers')
  assert.equal(r1, 'client')
  assert.equal(r2, 'client')
})

// --- Failure cooldown --------------------------------------------------------

test('a failed attempt opens a bounded cooldown that fails fast without new attempts', async () => {
  let clock = 1_000_000
  const guard = new SingleFlightInit<string>(30_000, () => clock)
  let calls = 0
  let failures = 0
  const failing = () => {
    calls++
    return Promise.reject(new Error('connect ETIMEDOUT'))
  }

  const r1 = await guard.run(failing, () => { failures++ })
  assert.equal(r1, null, 'failed attempt returns null (fall back to defaults)')
  assert.equal(calls, 1)
  assert.equal(failures, 1, 'onFailure runs once per actual failed attempt')
  assert.equal(guard.isCoolingDown(), true)

  // Within the cooldown window: fail fast, factory is NOT invoked again and no
  // additional failure callback fires (no per-caller log amplification).
  const r2 = await guard.run(failing, () => { failures++ })
  assert.equal(r2, null)
  assert.equal(calls, 1)
  assert.equal(failures, 1)

  // Once the cooldown elapses a fresh attempt is permitted again.
  clock += 30_000
  assert.equal(guard.isCoolingDown(), false)
  const r3 = await guard.run(failing, () => { failures++ })
  assert.equal(r3, null)
  assert.equal(calls, 2)
  assert.equal(failures, 2)
})

test('a successful attempt clears any prior cooldown and is not cached as failed', async () => {
  let clock = 0
  const guard = new SingleFlightInit<string>(30_000, () => clock)

  await guard.run(() => Promise.reject(new Error('boom')))
  assert.equal(guard.isCoolingDown(), true)

  clock += 30_000
  const r = await guard.run(() => Promise.resolve('ok'))
  assert.equal(r, 'ok')
  assert.equal(guard.retryAfter, 0, 'success resets the cooldown')
  assert.equal(guard.isCoolingDown(), false)
})

// --- Diagnostic --------------------------------------------------------------

function withGovCloudCreds<T>(present: boolean, fn: () => T): T {
  const savedKey = process.env.AWS_GOVCLOUD_ACCESS_KEY_ID
  const savedSecret = process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY
  if (present) {
    process.env.AWS_GOVCLOUD_ACCESS_KEY_ID = 'AKIA_TEST'
    process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY = 'secret_test'
  } else {
    delete process.env.AWS_GOVCLOUD_ACCESS_KEY_ID
    delete process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY
  }
  try {
    return fn()
  } finally {
    if (savedKey === undefined) delete process.env.AWS_GOVCLOUD_ACCESS_KEY_ID
    else process.env.AWS_GOVCLOUD_ACCESS_KEY_ID = savedKey
    if (savedSecret === undefined) delete process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY
    else process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY = savedSecret
  }
}

test('diagnostic reports unconfigured without error fields when base credentials are absent', () => {
  withGovCloudCreds(false, () => {
    const diag = getSiteConfigDependencyDiagnostic()
    assert.equal(diag.status, 'unconfigured')
    assert.equal(diag.errorName, null)
    assert.equal(diag.errorCode, null)
    assert.equal(diag.retryAfter, null)
  })
})

test('diagnostic reports healthy when credentials are present and no failure cooldown is active', () => {
  withGovCloudCreds(true, () => {
    const diag = getSiteConfigDependencyDiagnostic()
    assert.equal(diag.status, 'healthy')
  })
})
