import assert from 'node:assert/strict'
import test from 'node:test'

import { markJobComplete, markJobRunning, waitForActiveJobs } from '../job-tracker'

test('waitForActiveJobs resolves immediately when nothing is running', async () => {
  assert.deepEqual(await waitForActiveJobs(1000), { drained: true, remaining: [] })
})

test('waitForActiveJobs resolves when the last running job completes', async () => {
  markJobRunning('report-scheduler')
  markJobRunning('email-digest')

  const waiting = waitForActiveJobs(5000)
  setTimeout(() => markJobComplete('report-scheduler'), 5)
  setTimeout(() => markJobComplete('email-digest'), 10)

  assert.deepEqual(await waiting, { drained: true, remaining: [] })
})

test('waitForActiveJobs gives up after the timeout and names what is still running', async () => {
  markJobRunning('security-summary-nightly')

  const result = await waitForActiveJobs(20)
  assert.deepEqual(result, { drained: false, remaining: ['security-summary-nightly'] })

  markJobComplete('security-summary-nightly')
})
