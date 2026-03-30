/**
 * Background Job Tracker
 *
 * Tracks which background jobs are currently running so the request timing
 * middleware can correlate API latency with background job activity.
 * Also provides structured JSON logging for job completion events.
 */

const activeJobs = new Set<string>()

export function markJobRunning(jobName: string): void {
  activeJobs.add(jobName)
}

export function markJobComplete(jobName: string): void {
  activeJobs.delete(jobName)
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
