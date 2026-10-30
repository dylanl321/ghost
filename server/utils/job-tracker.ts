/**
 * Background Job Tracker
 *
 * Tracks which background jobs are currently running so the request timing
 * middleware can correlate API latency with background job activity.
 * Also provides structured JSON logging for job completion events.
 */

const activeJobs = new Set<string>()
const idleWaiters = new Set<() => void>()

export function markJobRunning(jobName: string): void {
  activeJobs.add(jobName)
}

export function markJobComplete(jobName: string): void {
  activeJobs.delete(jobName)
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
  return Array.from(activeJobs)
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
