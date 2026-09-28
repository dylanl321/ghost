/**
 * Request Timing Middleware
 *
 * Logs structured JSON for every API request with duration and
 * background job correlation. Named 00- to run before other middleware.
 *
 * Output is written directly to stdout so CloudWatch Log Insights
 * metric filters can extract APILatencyMs and backgroundJobActive.
 */

import { defineEventHandler, getRequestURL, getRequestHeader, setResponseHeader } from 'h3'
import { isAnyJobRunning, getActiveJobs } from '../utils/job-tracker'
import { normalizeRequestId } from '../utils/request-id'

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

  // Correlation id: reuse a safe inbound token or generate one, and echo it back.
  const requestId = normalizeRequestId(getRequestHeader(event, 'x-request-id'))
  setResponseHeader(event, 'x-request-id', requestId)

  event.node.res.on('finish', () => {
    const durationMs = Math.round((performance.now() - start) * 100) / 100
    const backgroundJobActive = isAnyJobRunning()

    const entry: Record<string, unknown> = {
      type: 'request',
      method: event.method,
      path: normalizePath(pathname),
      statusCode: event.node.res.statusCode,
      durationMs,
      backgroundJobActive,
      requestId,
    }

    // Attach an authenticated user id when a prior handler populated it.
    // Prefer stable identifiers; never log email/name/groups/tokens. No auth
    // calls here — timing middleware only reads context set upstream.
    const auth = event.context.auth as { user?: Record<string, unknown> } | undefined
    const user = auth?.user
    if (user) {
      const rawId = user.id ?? user.oid ?? user.sub
      if (typeof rawId === 'string' || typeof rawId === 'number') {
        entry.userId = String(rawId).slice(0, 128)
      }
    }

    if (backgroundJobActive) {
      entry.activeJobs = getActiveJobs()
    }

    entry.timestamp = new Date().toISOString()

    process.stdout.write(JSON.stringify(entry) + '\n')
  })
})
