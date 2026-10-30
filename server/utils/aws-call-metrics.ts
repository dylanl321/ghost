/**
 * Counts billable AWS API calls made by this process and periodically
 * writes one structured line per service/operation to stdout.
 *
 * Cost Explorer bills $0.01 per request and nothing else in the app shows
 * how many we make. A CloudWatch metric filter on `type = "aws_api_calls"`
 * turns these lines into a metric without any SDK calls or IAM changes.
 */

type CallCounts = Map<string, number>

const FLUSH_INTERVAL_MS = 60_000

const counts = new Map<string, CallCounts>()
let flushTimer: NodeJS.Timeout | null = null

export function recordAwsApiCall(service: string, operation: string): void {
  let byOperation = counts.get(service)
  if (!byOperation) {
    byOperation = new Map()
    counts.set(service, byOperation)
  }
  byOperation.set(operation, (byOperation.get(operation) ?? 0) + 1)
  ensureFlushTimer()
}

/**
 * Returns and resets the counts accumulated since the last flush.
 */
export function drainAwsApiCallCounts(): Array<{ service: string, operation: string, count: number }> {
  const out: Array<{ service: string, operation: string, count: number }> = []
  for (const [service, byOperation] of counts) {
    for (const [operation, count] of byOperation) {
      out.push({ service, operation, count })
    }
  }
  counts.clear()
  return out
}

export function flushAwsApiCallCounts(): void {
  const timestamp = new Date().toISOString()
  for (const { service, operation, count } of drainAwsApiCallCounts()) {
    process.stdout.write(JSON.stringify({
      timestamp,
      level: 'info',
      type: 'aws_api_calls',
      service,
      operation,
      count,
      intervalMs: FLUSH_INTERVAL_MS,
    }) + '\n')
  }
}

function ensureFlushTimer(): void {
  if (flushTimer) return
  flushTimer = setInterval(flushAwsApiCallCounts, FLUSH_INTERVAL_MS)
  // Metrics must never be the reason a process stays alive.
  flushTimer.unref?.()
}

/**
 * SDK middleware that records one call per logical command (retries are not
 * double counted). Attach with client.middlewareStack.add(...).
 */
export function awsApiCallCounterMiddleware(service: string) {
  return (next: (args: any) => Promise<any>, context: { commandName?: string }) =>
    async (args: any) => {
      recordAwsApiCall(service, context.commandName?.replace(/Command$/, '') || 'unknown')
      return next(args)
    }
}
