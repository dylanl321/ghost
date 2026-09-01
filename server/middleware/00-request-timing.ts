/**
 * Request Timing Middleware
 *
 * Logs structured JSON for every API request with duration and
 * background job correlation. Named 00- to run before other middleware.
 *
 * Output is written directly to stdout so CloudWatch Log Insights
 * metric filters can extract APILatencyMs and backgroundJobActive.
 */

import { defineEventHandler, getRequestURL, getHeader, setHeader } from 'h3'
import { isAnyJobRunning, getActiveJobs } from '../utils/job-tracker'
import { resolveRequestId, extractAuthActor } from '../utils/request-context'

// Normalize dynamic path segments for Log Insights grouping
function normalizePath(path: string): string {
  return path
    // Strip query string
    .split('?')[0]
    // Replace UUIDs (8-4-4-4-12 hex)
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    // Replace long hex strings (8+ chars)
    .replace(/\/[0-9a-f]{8,}/gi, '/:id')
    // Replace pure numeric segments
    .replace(/\/\d+/g, '/:num')
}

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const pathname = url.pathname

  // Only track API routes, skip health checks (ALB polls every 30s)
  if (!pathname.startsWith('/api/') || pathname === '/api/health') {
    return
  }

  const start = performance.now()

  // Establish a request ID for correlation across the request log and API
  // responses. Trust an inbound x-request-id only if bounded and safe.
  const requestId = resolveRequestId(getHeader(event, 'x-request-id'))
  event.context.requestId = requestId
  setHeader(event, 'x-request-id', requestId)

  event.node.res.on('finish', () => {
    const durationMs = Math.round((performance.now() - start) * 100) / 100
    const backgroundJobActive = isAnyJobRunning()

    const entry: Record<string, unknown> = {
      type: 'request',
      requestId,
      method: event.method,
      path: normalizePath(pathname),
      statusCode: event.node.res.statusCode,
      durationMs,
      backgroundJobActive,
    }

    // Low-risk auth correlation (populated by entra-auth middleware).
    const authCorrelation = extractAuthActor(event.context.auth)
    if (authCorrelation) {
      entry.authType = authCorrelation.authType
      if (authCorrelation.actor) {
        entry.actor = authCorrelation.actor
      }
    }

    if (backgroundJobActive) {
      entry.activeJobs = getActiveJobs()
    }

    entry.timestamp = new Date().toISOString()

    process.stdout.write(JSON.stringify(entry) + '\n')
  })
})
