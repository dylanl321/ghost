/**
 * Background Job Tracker
 *
 * Tracks which background jobs are currently running so the request timing
 * middleware can correlate API latency with background job activity.
 * Also provides structured JSON logging for job completion events.
 */

// Count per job name: two runs of the same job can overlap (two export
// messages, or a slow run still going when the next tick starts), and with a
// Set the first to finish marked the job idle while the other was mid-send.
const activeJobs = new Map<string, number>()
const idleWaiters = new Set<() => void>()

export function markJobRunning(jobName: string): void {
  activeJobs.set(jobName, (activeJobs.get(jobName) || 0) + 1)
}

export function markJobComplete(jobName: string): void {
  const remaining = (activeJobs.get(jobName) || 0) - 1
  if (remaining > 0) activeJobs.set(jobName, remaining)
  else activeJobs.delete(jobName)

  if (activeJobs.size === 0) {
    for (const notify of idleWaiters) notify()
    idleWaiters.clear()
  }
}

/**
 * Resolve once no job is running, or after timeoutMs. Used on shutdown so a
 * deploy does not kill a report or digest halfway through sending.
 */
export function waitForActiveJobs(timeoutMs: number): Promise<{ drained: boolean, remaining: string[] }> {
  if (activeJobs.size === 0) {
    return Promise.resolve({ drained: true, remaining: [] })
  }

  return new Promise((resolve) => {
    const onIdle = () => {
      clearTimeout(timer)
      resolve({ drained: true, remaining: [] })
    }
    const timer = setTimeout(() => {
      idleWaiters.delete(onIdle)
      resolve({ drained: false, remaining: getActiveJobs() })
    }, timeoutMs)
    idleWaiters.add(onIdle)
  })
}

export function isAnyJobRunning(): boolean {
  return activeJobs.size > 0
}

export function getActiveJobs(): string[] {
  return Array.from(activeJobs.keys())
}

/**
 * Log a structured job completion event directly to stdout.
 * Written as raw JSON (not through Consola) to guarantee the exact shape
 * that CloudWatch metric filters expect.
 */
export function logJobCompletion(
  jobName: string,
  status: 'success' | 'error',
  durationMs: number,
  details?: Record<string, unknown>,
): void {
  const entry: Record<string, unknown> = {
    type: 'job',
    job: jobName,
    status,
    durationMs: Math.round(durationMs),
    timestamp: new Date().toISOString(),
  }

  if (details) {
    entry.details = details
  }

  process.stdout.write(JSON.stringify(entry) + '\n')
}
